-- CreateTable
CREATE TABLE "StudentCompositeSnapshot" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "batchId" TEXT,
    "composite" DOUBLE PRECISION NOT NULL,
    "attendancePct" DOUBLE PRECISION NOT NULL,
    "taskPct" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentCompositeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentCompositeSnapshot_period_batchId_idx" ON "StudentCompositeSnapshot"("period", "batchId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCompositeSnapshot_period_studentId_key" ON "StudentCompositeSnapshot"("period", "studentId");

-- AddForeignKey
ALTER TABLE "StudentCompositeSnapshot" ADD CONSTRAINT "StudentCompositeSnapshot_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
