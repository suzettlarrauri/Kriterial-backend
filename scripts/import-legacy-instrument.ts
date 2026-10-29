/**
 * Genera los seeds del instrumento B1 a partir del banco heredado del prototipo PHP.
 *
 *   npm run instruments:import
 *
 * Entradas (instruments/sources/):
 *   - legacy-preguntas-b1.json      banco original (audios/preguntas.json)
 *   - b1.facet-labels.json          etiquetas de faceta propuestas (no aprobadas, D2)
 *   - b1@0.9.audio-prompts.json     enunciados de audio de la versión anterior
 * Salidas (instruments/seeds/): b1@1.0.json, b1@0.9.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type InstrumentSeed, instrumentSeedSchema, type QuestionSeed } from '../src/instruments/instrument-seed.schema.js';

const SOURCES = 'instruments/sources';
const SEEDS = 'instruments/seeds';

// Anclas de escala definidas en el frontend heredado (old-sistem/audios/app.js).
const SCALES = [
  { code: 'SCALE-FREQ-5', anchors: ['Nunca', 'Rara vez', 'A veces', 'A menudo', 'Casi siempre'] },
  { code: 'SCALE-FIT-5', anchors: ['No me describe', 'Me describe poco', 'Me describe algo', 'Me describe bastante', 'Me describe mucho'] },
];

const TYPE_MAP: Record<string, QuestionSeed['type']> = {
  LIKERT_5: 'LIKERT_5',
  SCENARIO_SINGLE_CHOICE: 'SCENARIO_SINGLE_CHOICE',
  audio_adaptativo: 'AUDIO_ADAPTIVE',
  pausa_descanso: 'PAUSE',
};

interface LegacyQuestion {
  id: string;
  fase?: string;
  tipo: string;
  dominio?: string;
  constructo?: string;
  escala?: string;
  texto: string;
  instrucciones?: string;
  instruccion_previa?: string;
  opciones?: { option_id: string; texto: string }[];
  seguimientos?: string[];
  evidencia_preserva?: string;
  limite_inferencia?: string;
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(join(SOURCES, file), 'utf8')) as T;

const legacy = readJson<LegacyQuestion[]>('legacy-preguntas-b1.json');
const labels = readJson<{ facets: Record<string, string> }>('b1.facet-labels.json').facets;
const oldAudio = readJson<{ questions: Record<string, { text: string; subQuestions: string[] }> }>(
  'b1@0.9.audio-prompts.json',
).questions;

const questions: QuestionSeed[] = legacy.map((q) => {
  const type = TYPE_MAP[q.tipo];
  if (!type) throw new Error(`${q.id}: tipo desconocido ${q.tipo}`);
  return {
    code: q.id,
    type,
    phase: q.fase ?? null,
    domain: q.dominio ?? null,
    facetCode: q.constructo ?? null,
    scaleCode: q.escala ?? null,
    text: q.texto,
    preInstruction: q.instruccion_previa ?? q.instrucciones ?? null,
    polarity: null, // pendiente de la clave firmada por la metodóloga (D2)
    followUps: q.seguimientos ?? null,
    evidencePreserves: q.evidencia_preserva ?? null,
    inferenceLimit: q.limite_inferencia ?? null,
    options: (q.opciones ?? []).map((o) => ({ code: o.option_id, text: o.texto })),
  };
});

const facetDomains = new Map<string, string>();
for (const q of questions) {
  if (q.facetCode && q.domain) facetDomains.set(q.facetCode, q.domain);
}
const facets = [...facetDomains].map(([code, domain]) => {
  const label = labels[code];
  if (!label) throw new Error(`Falta etiqueta para la faceta ${code}`);
  return { code, domain, label, labelApproved: false };
});

const current: InstrumentSeed = {
  blockCode: 'B1',
  version: '1.0',
  status: 'published',
  notes: 'Preguntas de audio simplificadas con seguimientos adaptativos (Kriterial_B1_Preguntas_Audio_Simplificadas_v1.0). Polaridades y etiquetas de faceta pendientes de aprobación (D2).',
  provenance: 'old-sistem/audios/preguntas.json + anclas de old-sistem/audios/app.js',
  scales: SCALES,
  facets,
  questions,
};

// b1@0.9: mismos ítems cerrados; audios con el enunciado largo anterior,
// subpreguntas mostradas a la vez y sin seguimientos adaptativos.
const previous: InstrumentSeed = {
  ...current,
  version: '0.9',
  status: 'retired',
  notes: 'Versión con la que se generó el reporte canónico (caso de referencia #1): preguntas de audio largas, sin seguimientos adaptativos.',
  provenance: `${current.provenance}; enunciados de audio de instruments/sources/b1@0.9.audio-prompts.json`,
  questions: questions.map((q) => {
    if (q.type !== 'AUDIO_ADAPTIVE') return q;
    const old = oldAudio[q.code];
    if (!old) throw new Error(`Falta enunciado b1@0.9 para ${q.code}`);
    const text = [old.text, ...old.subQuestions.map((s) => `- ${s}`)].join('\n');
    return { ...q, text, preInstruction: null, followUps: null };
  }),
};

for (const seed of [current, previous]) {
  const parsed = instrumentSeedSchema.parse(seed);
  const file = join(SEEDS, `${parsed.blockCode.toLowerCase()}@${parsed.version}.json`);
  writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`);
  console.log(`${file}: ${parsed.questions.length} preguntas, ${parsed.facets.length} facetas`);
}
