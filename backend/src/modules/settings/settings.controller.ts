import { Router } from 'express';
import { RoleName, NotificationCategory, NotificationChannel } from '@prisma/client';
import { z } from 'zod';
import { asyncHandler } from '@/utils/asyncHandler';
import { authenticate, authorize } from '@/middleware/auth';
import { prisma } from '@/lib/prisma';
import { getScoringConfig } from '@/lib/scoring';
import { recordAudit } from '@/lib/audit';
import { ApiError } from '@/utils/apiError';
import { runRetentionSweep } from '@/lib/retention';

export const settingsRouter = Router();
settingsRouter.use(authenticate);

settingsRouter.get(
  '/scoring',
  asyncHandler(async (_req, res) => {
    res.json(await getScoringConfig());
  }),
);

const weightsSchema = z.object({
  attendanceWeight: z.number().min(0).max(100),
  examWeight: z.number().min(0).max(100),
  taskWeight: z.number().min(0).max(100),
  behaviourWeight: z.number().min(0).max(100),
  presentationWeight: z.number().min(0).max(100),
  certificationWeight: z.number().min(0).max(100),
  selfAssessmentWeight: z.number().min(0).max(100),
  projectWeight: z.number().min(0).max(100),
  attendanceThreshold: z.number().min(0).max(100).optional(),
  internPerformanceThreshold: z.number().min(0).max(100).optional(),
  batchRetentionYears: z.number().int().positive().optional(),
  mfaRequiredRoles: z.array(z.nativeEnum(RoleName)).optional(),
  attendanceCorrectionWindowHours: z.number().int().positive().optional(),
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
  loginLockoutThreshold: z.number().int().positive().optional(),
  loginLockoutMinutes: z.number().int().positive().optional(),
  retentionAutoAnonymizeEnabled: z.boolean().optional(),
});

settingsRouter.put(
  '/scoring',
  authorize(RoleName.SUPER_ADMIN, RoleName.MANAGEMENT),
  asyncHandler(async (req, res) => {
    const data = weightsSchema.parse(req.body);
    const current = await getScoringConfig();
    const updated = await prisma.scoringConfig.update({ where: { id: current.id }, data: { ...data, updatedById: req.auth!.userId } });
    await recordAudit({ entityType: 'ScoringConfig', entityId: updated.id, action: 'UPDATE', actorId: req.auth!.userId, oldValue: current, newValue: data });
    res.json(updated);
  }),
);

settingsRouter.get(
  '/roles',
  authorize(RoleName.SUPER_ADMIN, RoleName.MANAGEMENT, RoleName.ACADEMIC_ADMIN),
  asyncHandler(async (_req, res) => {
    res.json([
      { role: RoleName.SUPER_ADMIN, description: 'System configuration, roles, permissions, audit logs, backups, full fee section access, master data.' },
      { role: RoleName.MANAGEMENT, description: 'Institute-wide dashboards, KPIs, reports, quality monitoring, strategic oversight.' },
      { role: RoleName.ACADEMIC_ADMIN, description: 'Students, parents, batches, transfers, schedules, exams, certificates, fee accounts, academic operations.' },
      { role: RoleName.FACULTY, description: 'Sessions, attendance, topics, tasks, evaluations, behaviour, presentations, projects, intern mentoring, remarks.' },
      { role: RoleName.ACCOUNTS, description: 'Fee accounts, payments, receipts, refunds/write-off initiation, reconciliation. No academic access.' },
      { role: RoleName.STUDENT, description: 'Personal progress, attendance, exams, tasks, points, presentations, self-assessments, certifications.' },
      { role: RoleName.PARENT, description: 'Child attendance, academic performance, behaviour, tasks, alerts, faculty remarks, fees, certificates.' },
    ]);
  }),
);

/**
 * Duplicate-record monitoring: hard duplicates on email/enrolment code are already prevented by
 * unique constraints, so this scans for the softer cases those constraints can't catch — the same
 * phone number, or the same name and date of birth, attached to more than one record — for staff
 * review rather than automatic action.
 */
settingsRouter.get(
  '/duplicates',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const [students, faculty, parents] = await Promise.all([
      prisma.student.findMany({ select: { id: true, firstName: true, lastName: true, studentCode: true, phone: true, dateOfBirth: true } }),
      prisma.faculty.findMany({ select: { id: true, firstName: true, lastName: true, employeeCode: true, phone: true } }),
      prisma.parentGuardian.findMany({ select: { id: true, firstName: true, lastName: true, phone: true } }),
    ]);

    function groupByPhone<T extends { phone: string | null }>(rows: T[]) {
      const groups = new Map<string, T[]>();
      for (const row of rows) {
        if (!row.phone) continue;
        const key = row.phone.replace(/\D/g, '');
        if (!key) continue;
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      return [...groups.values()].filter((g) => g.length > 1);
    }

    const studentNameDupes = (() => {
      const groups = new Map<string, typeof students>();
      for (const s of students) {
        const key = `${s.firstName.trim().toLowerCase()}|${s.lastName.trim().toLowerCase()}|${s.dateOfBirth?.toISOString().slice(0, 10) ?? ''}`;
        groups.set(key, [...(groups.get(key) ?? []), s]);
      }
      return [...groups.values()].filter((g) => g.length > 1);
    })();

    res.json({
      studentsSharingPhone: groupByPhone(students),
      facultySharingPhone: groupByPhone(faculty),
      parentsSharingPhone: groupByPhone(parents),
      studentsSharingNameAndDob: studentNameDupes,
    });
  }),
);

// ---------------------------------------------------------------------------
// Institution profile — singleton, shown on certificates/receipts/public pages.
// ---------------------------------------------------------------------------

async function getInstitutionProfile() {
  const existing = await prisma.institutionProfile.findFirst({ orderBy: { createdAt: 'desc' }, include: { internManager: { select: { id: true, firstName: true, lastName: true } } } });
  if (existing) return existing;
  return prisma.institutionProfile.create({ data: { name: 'SI Portal' }, include: { internManager: { select: { id: true, firstName: true, lastName: true } } } });
}

settingsRouter.get(
  '/institution',
  asyncHandler(async (_req, res) => {
    res.json(await getInstitutionProfile());
  }),
);

const institutionSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  logoUrl: z.string().optional(),
  contactEmail: z.string().email().optional(),
  contactPhone: z.string().optional(),
  googleDriveUrl: z.string().url().optional().or(z.literal('')),
  internManagerId: z.string().nullable().optional(),
});

settingsRouter.put(
  '/institution',
  authorize(RoleName.SUPER_ADMIN, RoleName.MANAGEMENT),
  asyncHandler(async (req, res) => {
    const data = institutionSchema.partial().parse(req.body);
    const current = await getInstitutionProfile();
    const updated = await prisma.institutionProfile.update({ where: { id: current.id }, data: { ...data, updatedById: req.auth!.userId } });
    res.json(updated);
  }),
);

// ---------------------------------------------------------------------------
// Holidays / academic calendar.
// ---------------------------------------------------------------------------

settingsRouter.get(
  '/holidays',
  asyncHandler(async (_req, res) => {
    const holidays = await prisma.holiday.findMany({ orderBy: { date: 'asc' } });
    res.json(holidays);
  }),
);

const holidaySchema = z.object({ date: z.coerce.date(), name: z.string().min(1) });

settingsRouter.post(
  '/holidays',
  authorize(RoleName.SUPER_ADMIN, RoleName.ACADEMIC_ADMIN),
  asyncHandler(async (req, res) => {
    const data = holidaySchema.parse(req.body);
    const holiday = await prisma.holiday.create({ data });
    res.status(201).json(holiday);
  }),
);

settingsRouter.delete(
  '/holidays/:id',
  authorize(RoleName.SUPER_ADMIN, RoleName.ACADEMIC_ADMIN),
  asyncHandler(async (req, res) => {
    await prisma.holiday.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Notification templates — editable copy per category+channel; notify() falls back to hardcoded
// text when none is configured.
// ---------------------------------------------------------------------------

settingsRouter.get(
  '/notification-templates',
  authorize(RoleName.SUPER_ADMIN, RoleName.MANAGEMENT),
  asyncHandler(async (_req, res) => {
    const templates = await prisma.notificationTemplate.findMany({ orderBy: [{ category: 'asc' }, { channel: 'asc' }] });
    res.json(templates);
  }),
);

const templateSchema = z.object({
  category: z.nativeEnum(NotificationCategory),
  channel: z.nativeEnum(NotificationChannel),
  subjectTemplate: z.string().min(1),
  bodyTemplate: z.string().min(1),
});

settingsRouter.put(
  '/notification-templates',
  authorize(RoleName.SUPER_ADMIN, RoleName.MANAGEMENT),
  asyncHandler(async (req, res) => {
    const data = templateSchema.parse(req.body);
    const template = await prisma.notificationTemplate.upsert({
      where: { category_channel: { category: data.category, channel: data.channel } },
      create: { ...data, updatedById: req.auth!.userId },
      update: { subjectTemplate: data.subjectTemplate, bodyTemplate: data.bodyTemplate, updatedById: req.auth!.userId },
    });
    res.json(template);
  }),
);

settingsRouter.delete(
  '/notification-templates/:id',
  authorize(RoleName.SUPER_ADMIN, RoleName.MANAGEMENT),
  asyncHandler(async (req, res) => {
    const template = await prisma.notificationTemplate.findUnique({ where: { id: req.params.id } });
    if (!template) throw ApiError.notFound('Template not found');
    await prisma.notificationTemplate.delete({ where: { id: template.id } });
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------------------
// Breach register — Super Admin only.
// ---------------------------------------------------------------------------

settingsRouter.get(
  '/breaches',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const breaches = await prisma.breachRecord.findMany({ orderBy: { detectedAt: 'desc' } });
    res.json(breaches);
  }),
);

const breachSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  affectedCount: z.number().int().min(0),
  detectedAt: z.coerce.date(),
  containedAt: z.coerce.date().optional(),
  notifiedAt: z.coerce.date().optional(),
});

settingsRouter.post(
  '/breaches',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const data = breachSchema.parse(req.body);
    const breach = await prisma.breachRecord.create({ data: { ...data, reportedById: req.auth!.userId } });
    await recordAudit({ entityType: 'BreachRecord', entityId: breach.id, action: 'CREATE', actorId: req.auth!.userId, newValue: { title: data.title, affectedCount: data.affectedCount } });
    res.status(201).json(breach);
  }),
);

settingsRouter.put(
  '/breaches/:id',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const data = breachSchema.partial().parse(req.body);
    const breach = await prisma.breachRecord.update({ where: { id: req.params.id }, data });
    res.json(breach);
  }),
);

/** On-demand run of the retention sweep — a no-op unless retentionAutoAnonymizeEnabled is on. */
settingsRouter.post(
  '/retention-sweep/run',
  authorize(RoleName.SUPER_ADMIN),
  asyncHandler(async (_req, res) => {
    const result = await runRetentionSweep();
    res.json(result);
  }),
);
