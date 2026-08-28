-- Session types: LAB/WORKSHOP -> PRACTICE, REVIEW -> LECTURE, OTHER -> TASK.
CREATE TYPE "SessionType_new" AS ENUM ('LECTURE', 'PRACTICE', 'EXAM_THEORY', 'EXAM_PRACTICAL', 'TASK');
ALTER TABLE "Session" ALTER COLUMN "sessionType" DROP DEFAULT;
ALTER TABLE "Session" ALTER COLUMN "sessionType" TYPE "SessionType_new" USING (
  CASE "sessionType"::text
    WHEN 'LAB' THEN 'PRACTICE'
    WHEN 'WORKSHOP' THEN 'PRACTICE'
    WHEN 'REVIEW' THEN 'LECTURE'
    WHEN 'OTHER' THEN 'TASK'
    ELSE "sessionType"::text
  END
)::"SessionType_new";
ALTER TABLE "Session" ALTER COLUMN "sessionType" SET DEFAULT 'LECTURE';
DROP TYPE "SessionType";
ALTER TYPE "SessionType_new" RENAME TO "SessionType";

-- TimetableSlot: optional online-meeting link (meaningful only for the Sunday slot).
ALTER TABLE "TimetableSlot" ADD COLUMN "meetingLink" TEXT;

-- Session: description replaces subject as the mandatory descriptive field.
UPDATE "Session" SET "description" = COALESCE("description", "subject") WHERE "description" IS NULL;
ALTER TABLE "Session" ALTER COLUMN "description" SET NOT NULL;
ALTER TABLE "Session" DROP COLUMN "subject";

-- Leave records: an approved leave neutralises the attendance-percentage denominator.
CREATE TYPE "LeaveRecordStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TABLE "LeaveRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveRecordStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeaveRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LeaveRecord_studentId_idx" ON "LeaveRecord"("studentId");
ALTER TABLE "LeaveRecord" ADD CONSTRAINT "LeaveRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Attendance exception queue: unmatched biometric scans held for manual resolution.
CREATE TABLE "AttendanceExceptionRecord" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT,
    "rawScanId" TEXT,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedAsStudentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AttendanceExceptionRecord_pkey" PRIMARY KEY ("id")
);

-- ScoringConfig: configurable attendance correction window + opt-in retention automation.
ALTER TABLE "ScoringConfig" ADD COLUMN "attendanceCorrectionWindowHours" INTEGER NOT NULL DEFAULT 48;
ALTER TABLE "ScoringConfig" ADD COLUMN "retentionAutoAnonymizeEnabled" BOOLEAN NOT NULL DEFAULT false;
