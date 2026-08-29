-- CreateEnum
CREATE TYPE "ProjectKind" AS ENUM ('STUDENT', 'INTERN');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "kind" "ProjectKind" NOT NULL DEFAULT 'STUDENT';

-- Backfill: projects on batches that have at least one intern are treated as intern projects
UPDATE "Project" p
SET "kind" = 'INTERN'
WHERE EXISTS (
  SELECT 1 FROM "Student" s
  WHERE s."currentBatchId" = p."batchId"
    AND s."internStatus" IS NOT NULL
);

CREATE INDEX "Project_kind_idx" ON "Project"("kind");
