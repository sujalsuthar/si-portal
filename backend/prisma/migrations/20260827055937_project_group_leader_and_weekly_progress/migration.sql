-- AlterTable
ALTER TABLE "ProjectGroup" ADD COLUMN     "leaderId" TEXT,
ADD COLUMN     "name" TEXT;

-- CreateTable
CREATE TABLE "ProjectProgressUpdate" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "weekNumber" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "link" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectProgressUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectProgressUpdate_groupId_weekNumber_idx" ON "ProjectProgressUpdate"("groupId", "weekNumber");

-- AddForeignKey
ALTER TABLE "ProjectGroup" ADD CONSTRAINT "ProjectGroup_leaderId_fkey" FOREIGN KEY ("leaderId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectProgressUpdate" ADD CONSTRAINT "ProjectProgressUpdate_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProjectGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
