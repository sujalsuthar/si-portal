-- AlterEnum
ALTER TYPE "ExamStatus" ADD VALUE 'REJECTED';

-- AlterEnum
ALTER TYPE "GradeStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN     "rejectionReason" TEXT;

-- AlterTable
ALTER TABLE "Question" ALTER COLUMN "subject" DROP NOT NULL;
