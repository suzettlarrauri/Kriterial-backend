import { z } from 'zod';

const ref = z.string().regex(/^[a-z0-9.-]+@\d+\.\d+$/, 'formato esperado: id@versión');

export const promptEntrySchema = z.object({
  id: z.string().regex(/^[a-z0-9.-]+$/),
  version: z.string().regex(/^\d+\.\d+$/),
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  source: z.string().min(1),
  status: z.enum(['active', 'legacy']).default('active'),
  note: z.string().optional(),
});

export const stageSchema = z.object({
  /** Prefijo estable compartido entre etapas (candidato a prompt caching). */
  prefix: z.array(ref).min(1),
  /** Instrucciones específicas de la etapa. */
  module: ref,
});

export const promptManifestSchema = z.object({
  prompts: z.array(promptEntrySchema).min(1),
  stages: z.record(z.string().regex(/^B[1-5]\.[A-Z_]+$/), stageSchema),
});

export type PromptEntry = z.infer<typeof promptEntrySchema>;
export type PromptManifest = z.infer<typeof promptManifestSchema>;
