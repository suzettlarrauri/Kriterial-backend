-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('candidate', 'analyst', 'admin');

-- CreateEnum
CREATE TYPE "grammatical_form" AS ENUM ('feminine', 'masculine', 'neutral');

-- CreateEnum
CREATE TYPE "instrument_status" AS ENUM ('draft', 'published', 'retired');

-- CreateEnum
CREATE TYPE "question_type" AS ENUM ('LIKERT_5', 'SCENARIO_SINGLE_CHOICE', 'AUDIO_ADAPTIVE', 'PAUSE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'candidate',
    "external_auth_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "display_name" TEXT,
    "grammatical_form" "grammatical_form" NOT NULL DEFAULT 'neutral',
    "language" TEXT NOT NULL DEFAULT 'es',
    "consent_at" TIMESTAMPTZ,
    "consent_version" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instruments" (
    "id" UUID NOT NULL,
    "block_code" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" "instrument_status" NOT NULL,
    "source_hash" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scales" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "anchors" JSONB NOT NULL,

    CONSTRAINT "scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facets" (
    "id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "label_approved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "facets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "instrument_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "question_type" NOT NULL,
    "phase" TEXT,
    "domain" TEXT,
    "facet_id" UUID,
    "scale_id" UUID,
    "text" TEXT NOT NULL,
    "pre_instruction" TEXT,
    "polarity" SMALLINT,
    "follow_ups" JSONB,
    "evidence_preserves" TEXT,
    "inference_limit" TEXT,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "option_code" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_bundles" (
    "id" UUID NOT NULL,
    "block_code" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "bundle_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "details" JSONB,
    "at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_external_auth_id_key" ON "users"("external_auth_id");

-- CreateIndex
CREATE UNIQUE INDEX "participants_user_id_key" ON "participants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "instruments_block_code_version_key" ON "instruments"("block_code", "version");

-- CreateIndex
CREATE UNIQUE INDEX "scales_code_key" ON "scales"("code");

-- CreateIndex
CREATE UNIQUE INDEX "facets_instrument_id_code_key" ON "facets"("instrument_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "questions_instrument_id_code_key" ON "questions"("instrument_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "questions_instrument_id_position_key" ON "questions"("instrument_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "question_options_question_id_option_code_key" ON "question_options"("question_id", "option_code");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_bundles_bundle_hash_key" ON "prompt_bundles"("bundle_hash");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facets" ADD CONSTRAINT "facets_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_instrument_id_fkey" FOREIGN KEY ("instrument_id") REFERENCES "instruments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_facet_id_fkey" FOREIGN KEY ("facet_id") REFERENCES "facets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_scale_id_fkey" FOREIGN KEY ("scale_id") REFERENCES "scales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restricciones que Prisma no expresa en el esquema:
-- un único instrumento publicado por bloque (define cuál es el "actual").
CREATE UNIQUE INDEX "instruments_one_published_per_block"
  ON "instruments" ("block_code") WHERE "status" = 'published';

-- polaridad de ítems: 1 (directa), -1 (inversa) o NULL (pendiente de D2).
ALTER TABLE "questions"
  ADD CONSTRAINT "questions_polarity_check" CHECK ("polarity" IN (-1, 1));
