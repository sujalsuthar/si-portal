-- Undo incorrect backfill: projects were marked INTERN for any batch that had interns,
-- which incorrectly included student capstone projects on the same batch.
UPDATE "Project" SET "kind" = 'STUDENT';

-- Faculty (team members) may only create intern projects; restore those as INTERN.
UPDATE "Project" p
SET "kind" = 'INTERN'
FROM "User" u
WHERE p."createdById" = u.id
  AND u.role = 'FACULTY';

-- Capstone seed / admin student projects stay STUDENT even on intern batches.
UPDATE "Project"
SET "kind" = 'STUDENT'
WHERE "name" ILIKE 'Capstone%';
