-- CreateEnum
CREATE TYPE "SelfAssessmentApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "SelfAssessment" ADD COLUMN     "approvalStatus" "SelfAssessmentApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decidedById" TEXT,
ADD COLUMN     "link" TEXT,
ADD COLUMN     "platform" TEXT,
ALTER COLUMN "confidenceRating" DROP NOT NULL;
