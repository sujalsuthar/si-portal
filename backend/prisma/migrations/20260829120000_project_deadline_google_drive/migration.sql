-- AlterTable
ALTER TABLE "Project" ADD COLUMN "deadline" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "InstitutionProfile" ADD COLUMN "googleDriveUrl" TEXT;

-- Normalize demo question marks to spec defaults (MCQ=1, LONG_ANSWER=10)
UPDATE "Question" SET "marks" = 1 WHERE "questionType" = 'MCQ' AND "marks" != 1;
UPDATE "Question" SET "marks" = 10 WHERE "questionType" = 'LONG_ANSWER' AND "marks" != 10;
