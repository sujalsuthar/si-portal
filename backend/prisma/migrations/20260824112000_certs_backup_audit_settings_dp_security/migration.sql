-- AuditLog hash chain. Existing rows predate the chain and are backfilled with a placeholder
-- entryHash derived from their own id (not a real chain link) — the integrity-check endpoint only
-- validates the chain from the first row created after this migration onward.
ALTER TABLE "AuditLog" ADD COLUMN     "entryHash" TEXT,
ADD COLUMN     "previousHash" TEXT;
UPDATE "AuditLog" SET "entryHash" = 'legacy-' || md5("id") WHERE "entryHash" IS NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "entryHash" SET NOT NULL;

-- BackupRecord: encryption/offsite/restore tracking.
ALTER TABLE "BackupRecord" ADD COLUMN     "encrypted" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "offsitePath" TEXT,
ADD COLUMN     "restoredAt" TIMESTAMP(3),
ADD COLUMN     "restoredById" TEXT;

-- RefreshToken: session family for reuse-detection revocation. Existing tokens each become their
-- own single-token family (their real lineage predates this column and cannot be reconstructed).
ALTER TABLE "RefreshToken" ADD COLUMN     "familyId" TEXT;
UPDATE "RefreshToken" SET "familyId" = "id" WHERE "familyId" IS NULL;
ALTER TABLE "RefreshToken" ALTER COLUMN "familyId" SET NOT NULL;

-- CreateTable
CREATE TABLE "AuditChainAnchor" (
    "id" TEXT NOT NULL,
    "anchorDate" TIMESTAMP(3) NOT NULL,
    "lastHash" TEXT NOT NULL,
    "entryCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditChainAnchor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstitutionProfile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "logoUrl" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstitutionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationTemplate" (
    "id" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subjectTemplate" TEXT NOT NULL,
    "bodyTemplate" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataExportRecord" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "requestId" TEXT,
    "filename" TEXT NOT NULL,
    "generatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataExportRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreachRecord" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "affectedCount" INTEGER NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "containedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "reportedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BreachRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AuditChainAnchor_anchorDate_key" ON "AuditChainAnchor"("anchorDate");

-- CreateIndex
CREATE UNIQUE INDEX "Holiday_date_key" ON "Holiday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationTemplate_category_channel_key" ON "NotificationTemplate"("category", "channel");

-- CreateIndex
CREATE INDEX "DataExportRecord_studentId_idx" ON "DataExportRecord"("studentId");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- AddForeignKey
ALTER TABLE "DataExportRecord" ADD CONSTRAINT "DataExportRecord_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
