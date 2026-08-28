UPDATE "User" SET
  "mfaEnabled" = false,
  "mustSetupMfa" = false,
  "mfaSecret" = NULL,
  "mfaBackupCodeHashes" = '{}',
  "mfaEnabledAt" = NULL;
UPDATE "ScoringConfig" SET "mfaRequiredRoles" = '{}';
SELECT email, role, "mfaEnabled", "mustSetupMfa" FROM "User" ORDER BY role, email;
