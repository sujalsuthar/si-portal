import { RoleName } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/utils/apiError';
import { AuthContext } from '@/middleware/auth';

/** Batch IDs a faculty member is allowed to operate on (assigned batches + mentored students' batches). */
export async function getFacultyBatchIds(facultyId: string): Promise<string[]> {
  const assignments = await prisma.batchFacultyAssignment.findMany({
    where: { facultyId },
    select: { batchId: true },
  });
  return [...new Set(assignments.map((a) => a.batchId))];
}

/** Student IDs linked to a parent account. */
export async function getParentStudentIds(parentId: string): Promise<string[]> {
  const links = await prisma.studentParent.findMany({ where: { parentId }, select: { studentId: true } });
  return links.map((l) => l.studentId);
}

/**
 * Throws 403 unless the authenticated user is allowed to view/act on the given student.
 * Admin/management roles always pass. Faculty must have the student's current batch assigned
 * (or be the mentor). Parents must be linked. Students may only access themselves.
 */
export async function assertStudentAccess(auth: AuthContext, studentId: string): Promise<void> {
  if (auth.role === RoleName.SUPER_ADMIN || auth.role === RoleName.MANAGEMENT || auth.role === RoleName.ACADEMIC_ADMIN) {
    return;
  }
  if (auth.role === RoleName.STUDENT) {
    if (auth.studentId !== studentId) throw ApiError.forbidden('You may only access your own records');
    return;
  }
  if (auth.role === RoleName.PARENT) {
    if (!auth.parentId) throw ApiError.forbidden();
    const linked = await getParentStudentIds(auth.parentId);
    if (!linked.includes(studentId)) throw ApiError.forbidden('You may only access your linked children');
    return;
  }
  if (auth.role === RoleName.FACULTY) {
    if (!auth.facultyId) throw ApiError.forbidden();
    const student = await prisma.student.findUnique({ where: { id: studentId }, select: { currentBatchId: true, mentorFacultyId: true } });
    if (!student) throw ApiError.notFound('Student not found');
    if (student.mentorFacultyId === auth.facultyId) return;
    if (student.currentBatchId) {
      const batchIds = await getFacultyBatchIds(auth.facultyId);
      if (batchIds.includes(student.currentBatchId)) return;
    }
    throw ApiError.forbidden('You may only access students in your assigned batches');
  }
  throw ApiError.forbidden();
}

/** Throws 403 unless the faculty user is assigned to the given batch (admin/management always pass). */
export async function assertBatchAccess(auth: AuthContext, batchId: string): Promise<void> {
  if (auth.role === RoleName.SUPER_ADMIN || auth.role === RoleName.MANAGEMENT || auth.role === RoleName.ACADEMIC_ADMIN) {
    return;
  }
  if (auth.role === RoleName.FACULTY) {
    if (!auth.facultyId) throw ApiError.forbidden();
    const batchIds = await getFacultyBatchIds(auth.facultyId);
    if (!batchIds.includes(batchId)) throw ApiError.forbidden('You are not assigned to this batch');
    return;
  }
  throw ApiError.forbidden();
}
