-- Restrict question types to MCQ + Long Answer per spec (True/False -> MCQ, Short Answer -> Long Answer).
CREATE TYPE "QuestionType_new" AS ENUM ('MCQ', 'LONG_ANSWER');
ALTER TABLE "Question" ALTER COLUMN "questionType" TYPE "QuestionType_new" USING (
  CASE "questionType"::text
    WHEN 'TRUE_FALSE' THEN 'MCQ'
    WHEN 'SHORT_ANSWER' THEN 'LONG_ANSWER'
    ELSE "questionType"::text
  END
)::"QuestionType_new";
DROP TYPE "QuestionType";
ALTER TYPE "QuestionType_new" RENAME TO "QuestionType";

-- Remove the difficulty field and its enum; add a rubric field for long-answer marking criteria.
DROP INDEX "Question_difficulty_idx";
ALTER TABLE "Question" DROP COLUMN "difficulty";
DROP TYPE "DifficultyLevel";
ALTER TABLE "Question" ADD COLUMN "rubric" JSONB;

-- Introduce Paper (an exam may carry more than one), migrating existing ExamQuestion rows onto a
-- single default paper per exam so no data is lost.
CREATE TABLE "Paper" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "totalMarks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Paper_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Paper_examId_sequence_key" ON "Paper"("examId", "sequence");
ALTER TABLE "Paper" ADD CONSTRAINT "Paper_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Paper" ("id", "examId", "name", "sequence", "totalMarks", "createdAt")
SELECT 'paper_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), "id", 'Paper 1', 1, "totalMarks", now()
FROM "Exam";

ALTER TABLE "ExamQuestion" ADD COLUMN "paperId" TEXT;
UPDATE "ExamQuestion" eq SET "paperId" = p."id"
FROM "Paper" p WHERE p."examId" = eq."examId";
ALTER TABLE "ExamQuestion" ALTER COLUMN "paperId" SET NOT NULL;

ALTER TABLE "ExamQuestion" DROP CONSTRAINT "ExamQuestion_examId_fkey";
DROP INDEX "ExamQuestion_examId_questionId_key";
ALTER TABLE "ExamQuestion" DROP COLUMN "examId";
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "ExamQuestion_paperId_questionId_key" ON "ExamQuestion"("paperId", "questionId");

-- Student exam answers: MCQ auto-marked against the stored key on submission; long-answer marked
-- later against the question's rubric.
CREATE TABLE "StudentAnswer" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "selectedOption" TEXT,
    "answerText" TEXT,
    "isCorrect" BOOLEAN,
    "marksAwarded" DOUBLE PRECISION,
    "rubricScores" JSONB,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "gradedById" TEXT,
    "gradedAt" TIMESTAMP(3),
    CONSTRAINT "StudentAnswer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StudentAnswer_examId_questionId_studentId_key" ON "StudentAnswer"("examId", "questionId", "studentId");
CREATE INDEX "StudentAnswer_studentId_idx" ON "StudentAnswer"("studentId");
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAnswer" ADD CONSTRAINT "StudentAnswer_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
