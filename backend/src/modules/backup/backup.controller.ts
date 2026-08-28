import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { RoleName, BackupType } from '@prisma/client';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize, ROLE_GROUPS } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { recordAudit } from '@/lib/audit';
import { env } from '@/config/env';
import { encryptBuffer, decryptBuffer } from '@/lib/backupCrypto';

export const backupRouter = Router();
backupRouter.use(authenticate);

const execFileAsync = promisify(execFile);
const BACKUP_DIR = path.resolve(process.cwd(), env.uploadDir, 'backups');
fs.mkdirSync(BACKUP_DIR, { recursive: true });

/**
 * Prisma's connection string allows query parameters (e.g. `schema=public`) that libpq tools like
 * pg_dump/psql reject outright. Connection details are passed as discrete arguments instead.
 */
function pgConnArgsFromConnectionString(connectionString: string): { args: string[]; env: NodeJS.ProcessEnv } {
  const url = new URL(connectionString);
  const args = [
    '-h', url.hostname,
    '-p', url.port || '5432',
    '-U', decodeURIComponent(url.username),
    '-d', decodeURIComponent(url.pathname.replace(/^\//, '')),
  ];
  return { args, env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) } };
}

/** Runs pg_dump, encrypts the result at rest, and optionally copies it to the configured offsite path. */
export async function runBackup(type: BackupType, triggeredById: string | null): Promise<{ record: Awaited<ReturnType<typeof prisma.backupRecord.create>> }> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const plainPath = path.join(BACKUP_DIR, `backup-${timestamp}.sql`);
  const filename = `backup-${timestamp}.sql.enc`;
  const encPath = path.join(BACKUP_DIR, filename);

  try {
    const { args, env: childEnv } = pgConnArgsFromConnectionString(env.databaseUrl);
    await execFileAsync('pg_dump', [...args, '--no-owner', '--no-privileges', '-f', plainPath], { timeout: 5 * 60 * 1000, env: childEnv });

    const plaintext = fs.readFileSync(plainPath);
    const encrypted = encryptBuffer(plaintext, env.backupEncryptionKey);
    fs.writeFileSync(encPath, encrypted);
    fs.unlinkSync(plainPath);
  } catch (err) {
    throw ApiError.badRequest(`Backup failed: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  let offsitePath: string | null = null;
  if (env.backupOffsiteDir) {
    try {
      fs.mkdirSync(env.backupOffsiteDir, { recursive: true });
      const dest = path.join(env.backupOffsiteDir, filename);
      fs.copyFileSync(encPath, dest);
      offsitePath = dest;
    } catch {
      // Offsite copy failures never block the primary backup from being recorded.
    }
  }

  const { size } = fs.statSync(encPath);
  const record = await prisma.backupRecord.create({
    data: { filename, sizeBytes: size, type, triggeredById: triggeredById ?? undefined, encrypted: true, offsitePath: offsitePath ?? undefined },
  });
  await recordAudit({ entityType: 'BackupRecord', entityId: record.id, action: 'CREATE', actorId: triggeredById ?? undefined, newValue: { filename, sizeBytes: size, type } });
  return { record };
}

// Backup allowed roles: Super Admin and Academic Admin (per the 4.0 issue log). Restore stays
// Super-Admin-only below — it is destructive (overwrites the live database) and expanding that
// specific action wasn't part of the request.
backupRouter.get(
  '/',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (_req, res) => {
    const records = await prisma.backupRecord.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(records);
  }),
);

/**
 * Computes the next firing time of the configured backup cron expression. Only handles the
 * numeric-or-`*` minute/hour fields the schedule actually uses (day/month/weekday stay `*`),
 * which covers the fixed daily 23:59 default and any similarly simple custom schedule.
 */
function nextCronRun(cronExpr: string, from: Date = new Date()): Date | null {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [minuteField, hourField] = parts;
  if (minuteField === '*' || hourField === '*') return null;
  const minute = Number(minuteField);
  const hour = Number(hourField);
  if (Number.isNaN(minute) || Number.isNaN(hour)) return null;

  const next = new Date(from);
  next.setSeconds(0, 0);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

backupRouter.get(
  '/next-scheduled',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (_req, res) => {
    const enabled = !!env.backupScheduleCron;
    const nextRun = enabled ? nextCronRun(env.backupScheduleCron) : null;
    res.json({ enabled, cron: env.backupScheduleCron || null, nextRun });
  }),
);

backupRouter.post(
  '/run',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const { record } = await runBackup(BackupType.MANUAL, req.auth!.userId);
    res.status(201).json(record);
  }),
);

/** Decrypts on the fly so the download is a normal, usable .sql file — encryption protects the stored artifact, not legitimate admin recovery. */
backupRouter.get(
  '/:id/download',
  authorize(...ROLE_GROUPS.ADMIN_LIKE),
  asyncHandler(async (req, res) => {
    const record = await prisma.backupRecord.findUnique({ where: { id: req.params.id } });
    if (!record) throw ApiError.notFound('Backup record not found');
    const filePath = path.join(BACKUP_DIR, record.filename);
    if (!fs.existsSync(filePath)) throw ApiError.notFound('Backup file is no longer available on disk');

    await recordAudit({ entityType: 'BackupRecord', entityId: record.id, action: 'DOWNLOAD', actorId: req.auth!.userId });

    const encrypted = fs.readFileSync(filePath);
    const plaintext = record.encrypted ? decryptBuffer(encrypted, env.backupEncryptionKey) : encrypted;
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${record.filename.replace(/\.enc$/, '')}"`);
    res.send(plaintext);
  }),
);

const RESTORE_CONFIRMATION = 'RESTORE';

/**
 * Restores the database from a stored snapshot — destructive (overwrites current data), so it
 * requires an exact typed confirmation phrase in addition to the Super-Admin-only route guard.
 */
backupRouter.post(
  '/:id/restore',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const { confirm } = req.body as { confirm?: string };
    if (confirm !== RESTORE_CONFIRMATION) {
      throw ApiError.badRequest(`Restoring overwrites the current database. Pass { "confirm": "${RESTORE_CONFIRMATION}" } to proceed.`);
    }

    const record = await prisma.backupRecord.findUnique({ where: { id: req.params.id } });
    if (!record) throw ApiError.notFound('Backup record not found');
    const filePath = path.join(BACKUP_DIR, record.filename);
    if (!fs.existsSync(filePath)) throw ApiError.notFound('Backup file is no longer available on disk');

    const encrypted = fs.readFileSync(filePath);
    const plaintext = record.encrypted ? decryptBuffer(encrypted, env.backupEncryptionKey) : encrypted;
    const tempPath = path.join(BACKUP_DIR, `restore-${Date.now()}.sql`);
    fs.writeFileSync(tempPath, plaintext);

    try {
      const { args, env: childEnv } = pgConnArgsFromConnectionString(env.databaseUrl);
      await execFileAsync('psql', [...args, '-f', tempPath], { timeout: 10 * 60 * 1000, env: childEnv });
    } catch (err) {
      throw ApiError.badRequest(`Restore failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      fs.unlinkSync(tempPath);
    }

    const updated = await prisma.backupRecord.update({ where: { id: record.id }, data: { restoredAt: new Date(), restoredById: req.auth!.userId } });
    await recordAudit({ entityType: 'BackupRecord', entityId: record.id, action: 'RESTORE', actorId: req.auth!.userId });
    res.json(updated);
  }),
);
