UPDATE "ScoringConfig" SET "mfaRequiredRoles" = '{}';
UPDATE "User" SET "mustSetupMfa" = false;
SELECT COUNT(*) AS users FROM "User";
SELECT COUNT(*) AS students FROM "Student";
SELECT "mfaRequiredRoles" FROM "ScoringConfig";
