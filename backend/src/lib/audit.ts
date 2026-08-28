import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

interface RecordAuditInput {
  entityType: string;
  entityId: string;
  action: string;
  actorId?: string;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string;
}

/**
 * Serializes with object keys sorted recursively. Required because Postgres `jsonb` (unlike `json`)
 * does not preserve key insertion order — oldValue/newValue read back from the database can have
 * their keys reordered relative to what was originally passed in, which would otherwise make the
 * recomputed hash differ from the stored one even when the content is unchanged.
 */
function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${canonicalStringify((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(',')}}`;
}

function computeEntryHash(previousHash: string | null, input: RecordAuditInput, createdAt: Date): string {
  const payload = canonicalStringify({
    previousHash,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    actorId: input.actorId ?? null,
    oldValue: input.oldValue ?? null,
    newValue: input.newValue ?? null,
    reason: input.reason ?? null,
    createdAt: createdAt.toISOString(),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Central write path for the system's audit trail (grade changes, attendance corrections, transfers,
 * behaviour, certificates, permissions). Each row's entryHash chains from the previous row's hash, so
 * tampering with (or deleting) any past row is detectable even though the app itself never exposes an
 * edit/delete route for this table — see `auditLogs.controller.ts`'s integrity-check endpoint.
 */
export async function recordAudit(input: RecordAuditInput) {
  const last = await prisma.auditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { entryHash: true } });
  const createdAt = new Date();
  const previousHash = last?.entryHash ?? null;
  const entryHash = computeEntryHash(previousHash, input, createdAt);

  await prisma.auditLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId,
      oldValue: input.oldValue === undefined ? undefined : (input.oldValue as object),
      newValue: input.newValue === undefined ? undefined : (input.newValue as object),
      reason: input.reason,
      createdAt,
      previousHash,
      entryHash,
    },
  });
}

export { computeEntryHash };
