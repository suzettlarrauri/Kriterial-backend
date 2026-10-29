import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalJson } from '../common/canonical-json.js';
import { buildPatternInput } from './build-pattern-input.js';
import { patternInputSchema, type AnswerSet, type FacetMeta, type QuestionMeta } from './evidence.types.js';

/**
 * Caso de referencia #1 (plan §7.5): las respuestas originales del reporte canónico.
 * El fixture es privado (ver scripts/import-canonical-case.ts) y no está en git; sin él, la prueba se omite.
 */
const FIXTURE = 'test/fixtures/private/canonical-b1.json';

interface SeedFile {
  scales: { code: string; anchors: string[] }[];
  facets: FacetMeta[];
  questions: {
    code: string;
    type: QuestionMeta['type'];
    text: string;
    domain: string | null;
    facetCode: string | null;
    scaleCode: string | null;
    options: { code: string; text: string }[];
    polarity: 1 | -1 | null;
    evidencePreserves: string | null;
    inferenceLimit: string | null;
  }[];
}

function loadCase() {
  const seed = JSON.parse(readFileSync('instruments/seeds/b1@0.9.json', 'utf8')) as SeedFile;
  const anchors = new Map(seed.scales.map((s) => [s.code, s.anchors]));
  const questions: QuestionMeta[] = seed.questions.map((q) => ({
    code: q.code,
    type: q.type,
    text: q.text,
    domain: q.domain,
    facetCode: q.facetCode,
    anchors: q.scaleCode ? (anchors.get(q.scaleCode) ?? null) : null,
    options: q.options,
    polarity: q.polarity,
    evidencePreserves: q.evidencePreserves,
    inferenceLimit: q.inferenceLimit,
  }));
  const responses = JSON.parse(readFileSync(FIXTURE, 'utf8')) as AnswerSet;
  return { seed, questions, responses };
}

describe.skipIf(!existsSync(FIXTURE))('caso canónico B1 (datos privados)', () => {
  let loaded: ReturnType<typeof loadCase>;
  beforeAll(() => {
    loaded = loadCase();
  });
  const build = () =>
    buildPatternInput({
      instrumentVersion: '0.9',
      facets: loaded.seed.facets,
      questions: loaded.questions,
      responses: loaded.responses,
    });

  it('convierte las 56 respuestas en evidencia sin elementos sin mapear ni no respondidos', () => {
    const out = build();
    expect(patternInputSchema.safeParse(out).success).toBe(true);
    expect(out.counts).toEqual({ answerableQuestions: 56, evidenceItems: 56, unavailable: 0, facets: 24 });
  });

  it('no genera banderas de calidad: las narraciones tienen extensión suficiente y las escalas no son uniformes', () => {
    expect(build().dataQualityFlags).toEqual([]);
  });

  it('detecta exactamente las dos menciones sensibles del caso sin escalar nada', () => {
    const mentions = build().sensitiveMentions;
    expect(mentions.map((m) => [m.evidenceId, m.term])).toEqual([
      ['EV-APER-H01-T0', 'traumas'],
      ['EV-EMOC-H01-T0', 'depresion'],
    ]);
  });

  it('sin polaridad firmada, ninguna faceta muestra divergencia', () => {
    const divergences = new Set(build().facetSignals.map((f) => f.divergence));
    expect([...divergences].every((d) => d === 'NOT_EVALUABLE' || d === 'INSUFFICIENT')).toBe(true);
  });

  it('la misma entrada produce el mismo contenido canónico', () => {
    expect(canonicalJson(build())).toBe(canonicalJson(build()));
  });
});
