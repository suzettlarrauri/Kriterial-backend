import { z } from 'zod';

const questionSeedSchema = z
  .object({
    code: z.string().regex(/^[A-Z0-9-]+$/),
    type: z.enum(['LIKERT_5', 'SCENARIO_SINGLE_CHOICE', 'AUDIO_ADAPTIVE', 'PAUSE']),
    phase: z.string().nullable(),
    domain: z.string().nullable(),
    facetCode: z.string().nullable(),
    scaleCode: z.string().nullable(),
    text: z.string().min(1),
    preInstruction: z.string().nullable(),
    polarity: z.union([z.literal(1), z.literal(-1)]).nullable(),
    followUps: z.array(z.string().min(1)).nullable(),
    evidencePreserves: z.string().nullable(),
    inferenceLimit: z.string().nullable(),
    options: z.array(z.object({ code: z.string().min(1), text: z.string().min(1) })),
  })
  .superRefine((q, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message: `${q.code}: ${message}` });
    if (q.type === 'LIKERT_5' && (!q.scaleCode || !q.facetCode)) fail('LIKERT_5 requiere escala y faceta');
    if (q.type === 'SCENARIO_SINGLE_CHOICE' && q.options.length < 2) fail('escenario requiere ≥2 opciones');
    if (q.type !== 'SCENARIO_SINGLE_CHOICE' && q.options.length) fail('solo los escenarios tienen opciones');
    if (q.type === 'AUDIO_ADAPTIVE' && !q.inferenceLimit) fail('audio requiere limite de inferencia');
  });

export const instrumentSeedSchema = z
  .object({
    blockCode: z.string().regex(/^B[1-5]$/),
    version: z.string().regex(/^\d+\.\d+$/),
    status: z.enum(['draft', 'published', 'retired']),
    notes: z.string().nullable(),
    provenance: z.string().min(1),
    scales: z.array(z.object({ code: z.string().min(1), anchors: z.array(z.string().min(1)).length(5) })),
    facets: z.array(
      z.object({
        code: z.string().min(1),
        domain: z.string().min(1),
        label: z.string().min(1),
        labelApproved: z.boolean(),
      }),
    ),
    questions: z.array(questionSeedSchema).min(1),
  })
  .superRefine((seed, ctx) => {
    const facetCodes = new Set(seed.facets.map((f) => f.code));
    const scaleCodes = new Set(seed.scales.map((s) => s.code));
    const seen = new Set<string>();
    for (const q of seed.questions) {
      if (seen.has(q.code)) ctx.addIssue({ code: 'custom', message: `código duplicado ${q.code}` });
      seen.add(q.code);
      if (q.facetCode && !facetCodes.has(q.facetCode))
        ctx.addIssue({ code: 'custom', message: `${q.code}: faceta inexistente ${q.facetCode}` });
      if (q.scaleCode && !scaleCodes.has(q.scaleCode))
        ctx.addIssue({ code: 'custom', message: `${q.code}: escala inexistente ${q.scaleCode}` });
    }
  });

export type InstrumentSeed = z.infer<typeof instrumentSeedSchema>;
export type QuestionSeed = InstrumentSeed['questions'][number];
