-- AlterTable: add projectId as nullable first so we can backfill existing rows
ALTER TABLE "ProjectMember" ADD COLUMN     "projectId" TEXT;

-- Backfill from the existing group -> project relationship
UPDATE "ProjectMember" pm
SET "projectId" = pg."projectId"
FROM "ProjectGroup" pg
WHERE pm."groupId" = pg.id;

-- Now that every row is backfilled, enforce NOT NULL
ALTER TABLE "ProjectMember" ALTER COLUMN "projectId" SET NOT NULL;

-- CreateTable
CREATE TABLE "ReceiptSequence" (
    "financialYear" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReceiptSequence_pkey" PRIMARY KEY ("financialYear")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_studentId_key" ON "ProjectMember"("projectId", "studentId");

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
