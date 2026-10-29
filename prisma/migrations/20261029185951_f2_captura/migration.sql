-- CreateEnum
CREATE TYPE "assessment_status" AS ENUM ('in_progress', 'submitted', 'processing', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "transcript_status" AS ENUM ('pending', 'ok', 'partial', 'failed');

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "block_code" TEXT NOT NULL,
    "status" "assessment_status" NOT NULL DEFAULT 'in_progress',
    "submitted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responses" (
    "id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "likert_value" SMALLINT,
    "option_id" UUID,
    "declined" BOOLEAN NOT NULL DEFAULT false,
    "answered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audio_turns" (
    "id" UUID NOT NULL,
    "response_id" UUID NOT NULL,
    "turn_index" SMALLINT NOT NULL,
    "prompt_text" TEXT NOT NULL,
    "storage_key" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "transcript" TEXT,
    "transcription_provider" TEXT,
    "transcription_model" TEXT,
    "transcript_status" "transcript_status" NOT NULL DEFAULT 'pending',
    "quality_flags" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "audio_turns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "responses_assessment_id_question_id_key" ON "responses"("assessment_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "audio_turns_response_id_turn_index_key" ON "audio_turns"("response_id", "turn_index");

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "question_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audio_turns" ADD CONSTRAINT "audio_turns_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Una sola evaluación activa por participante y bloque (índice parcial; Prisma no lo modela).
CREATE UNIQUE INDEX "one_active_assessment_per_block" ON "assessments"("participant_id", "block_code") WHERE "status" IN ('in_progress', 'submitted', 'processing');
