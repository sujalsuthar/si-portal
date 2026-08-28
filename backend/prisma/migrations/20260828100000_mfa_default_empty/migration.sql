-- MFA is optional by default for demo/production deploys. Super Admin can require roles in Settings.
ALTER TABLE "ScoringConfig" ALTER COLUMN "mfaRequiredRoles" SET DEFAULT ARRAY[]::"RoleName"[];

UPDATE "ScoringConfig" SET "mfaRequiredRoles" = '{}';
UPDATE "User" SET "mustSetupMfa" = false;
