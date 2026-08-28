-- AlterTable
ALTER TABLE "InstitutionProfile" ADD COLUMN     "internManagerId" TEXT;

-- AddForeignKey
ALTER TABLE "InstitutionProfile" ADD CONSTRAINT "InstitutionProfile_internManagerId_fkey" FOREIGN KEY ("internManagerId") REFERENCES "Faculty"("id") ON DELETE SET NULL ON UPDATE CASCADE;
