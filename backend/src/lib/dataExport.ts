import fs from 'fs';
import path from 'path';
import { prisma } from '@/lib/prisma';
import { env } from '@/config/env';

const EXPORT_DIR = path.resolve(process.cwd(), env.uploadDir, 'exports');
fs.mkdirSync(EXPORT_DIR, { recursive: true });

/** Generates a machine-readable (JSON) export of a student's core records for a data-access request. */
export async function generateStudentDataExport(studentId: string, requestId: string | undefined, generatedById: string) {
  const [student, attendance, grades, submissions, behaviour, certificates, feeAccount, consents] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, include: { user: { select: { email: true } }, course: true, currentBatch: true } }),
    prisma.attendance.findMany({ where: { studentId } }),
    prisma.grade.findMany({ where: { studentId, status: 'PUBLISHED' } }),
    prisma.taskSubmission.findMany({ where: { studentId } }),
    prisma.behaviourEvent.findMany({ where: { studentId } }),
    prisma.certificate.findMany({ where: { studentId } }),
    prisma.feeAccount.findUnique({ where: { studentId }, include: { payments: true, instalments: true } }),
    prisma.consentRecord.findMany({ where: { studentId } }),
  ]);
  if (!student) throw new Error('Student not found');

  const payload = {
    exportedAt: new Date().toISOString(),
    profile: { name: `${student.firstName} ${student.lastName}`, studentCode: student.studentCode, email: student.user.email, course: student.course?.name, batch: student.currentBatch?.name },
    attendance,
    grades,
    taskSubmissions: submissions,
    behaviourEvents: behaviour,
    certificates,
    feeAccount,
    consents,
  };

  const filename = `export-${studentId}-${Date.now()}.json`;
  fs.writeFileSync(path.join(EXPORT_DIR, filename), JSON.stringify(payload, null, 2));

  const record = await prisma.dataExportRecord.create({ data: { studentId, requestId, filename, generatedById } });
  return record;
}

export function exportFilePath(filename: string): string {
  return path.join(EXPORT_DIR, filename);
}
