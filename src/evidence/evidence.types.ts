import { z } from 'zod';

/** Metadatos de una pregunta necesarios para interpretar sus respuestas. Nunca salen al participante. */
export interface QuestionMeta {
  code: string;
  type: 'LIKERT_5' | 'SCENARIO_SINGLE_CHOICE' | 'AUDIO_ADAPTIVE' | 'PAUSE';
  text: string;
  domain: string | null;
  facetCode: string | null;
  anchors: string[] | null;
  options: { code: string; text: string }[];
  /** Polaridad respecto a la faceta: 1 directa, -1 inversa, null hasta que la metodóloga la firme (D2). */
  polarity: 1 | -1 | null;
  evidencePreserves: string | null;
  inferenceLimit: string | null;
}

export interface FacetMeta {
  code: string;
  domain: string;
}

/** Respuestas de una evaluación, en la forma que devuelve la captura (F2). */
export interface AnswerSet {
  answers: Record<string, { likertValue: number | null; optionCode: string | null; declined: boolean }>;
  audioTurns: {
    questionCode: string;
    turnIndex: number;
    promptText: string;
    transcript: string | null;
    transcriptStatus: 'pending' | 'ok' | 'partial' | 'failed';
  }[];
}

const evidenceItemSchema = z.object({
  evidenceId: z.string(),
  questionCode: z.string(),
  domain: z.string().nullable(),
  facetCode: z.string().nullable(),
  sourceType: z.enum(['SCALE', 'SCENARIO', 'NARRATIVE']),
  independenceGroup: z.string(),
  content: z.object({
    value: z.number().int().min(1).max(5).nullable(),
    anchor: z.string().nullable(),
    optionCode: z.string().nullable(),
    optionText: z.string().nullable(),
    turnIndex: z.number().int().nullable(),
    promptText: z.string().nullable(),
    transcript: z.string().nullable(),
  }),
  evidencePreserves: z.string().nullable(),
  inferenceLimit: z.string().nullable(),
});

const facetSignalSchema = z.object({
  facetCode: z.string(),
  domain: z.string(),
  items: z.array(
    z.object({
      evidenceId: z.string(),
      sourceType: z.enum(['SCALE', 'SCENARIO']),
      value: z.number().int().nullable(),
      polarity: z.union([z.literal(1), z.literal(-1), z.null()]),
    }),
  ),
  // Solo las escalas con polaridad firmada participan en la divergencia; los escenarios se listan como contexto.
  divergence: z.enum(['NOT_EVALUABLE', 'NONE', 'DIVERGENT', 'INSUFFICIENT']),
  reason: z.string().nullable(),
});

/** Contrato de entrada del Pattern Engine (S1). Determinista y versionado. */
export const patternInputSchema = z.object({
  schemaVersion: z.literal('pattern-input/1'),
  block: z.literal('B1'),
  instrumentVersion: z.string(),
  counts: z.object({
    answerableQuestions: z.number().int(),
    evidenceItems: z.number().int(),
    unavailable: z.number().int(),
    facets: z.number().int(),
  }),
  evidence: z.array(evidenceItemSchema),
  facetSignals: z.array(facetSignalSchema),
  unavailable: z.array(
    z.object({
      questionCode: z.string(),
      reason: z.enum(['NOT_ANSWERED', 'PREFER_NOT_TO_ANSWER', 'TRANSCRIPT_UNAVAILABLE']),
    }),
  ),
  dataQualityFlags: z.array(
    z.object({
      code: z.enum(['UNIFORM_LIKERT', 'SHORT_NARRATIVE', 'TRANSCRIPT_UNAVAILABLE']),
      scope: z.string(),
      detail: z.string(),
    }),
  ),
  sensitiveMentions: z.array(
    z.object({ evidenceId: z.string(), category: z.string(), term: z.string() }),
  ),
});

export type PatternInput = z.infer<typeof patternInputSchema>;
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;
export type FacetSignal = z.infer<typeof facetSignalSchema>;
