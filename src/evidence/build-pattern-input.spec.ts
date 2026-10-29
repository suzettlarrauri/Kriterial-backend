import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../common/canonical-json.js';
import { buildPatternInput, countWords } from './build-pattern-input.js';
import { patternInputSchema, type AnswerSet, type QuestionMeta } from './evidence.types.js';
import { detectSensitiveMentions } from './sensitive-mentions.js';

const LONG_RELATO =
  'Cuando el proyecto se complicó organicé el trabajo por etapas, revisé cada entrega con el equipo y ajusté las fechas cuando fue necesario para cumplir.';

const likert = (code: string, facetCode: string, polarity: 1 | -1 | null = null): QuestionMeta => ({
  code,
  type: 'LIKERT_5',
  text: `Enunciado ${code}`,
  domain: 'Responsabilidad',
  facetCode,
  anchors: ['Nunca', 'Rara vez', 'A veces', 'A menudo', 'Casi siempre'],
  options: [],
  polarity,
  evidencePreserves: null,
  inferenceLimit: null,
});

const audio = (code: string): QuestionMeta => ({
  code,
  type: 'AUDIO_ADAPTIVE',
  text: `Relato ${code}`,
  domain: 'Responsabilidad',
  facetCode: null,
  anchors: null,
  options: [],
  polarity: null,
  evidencePreserves: 'Auto-estructuración',
  inferenceLimit: 'No inferir capacidad de ejecución.',
});

const facets = [{ code: 'R1', domain: 'Responsabilidad' }];

function build(questions: QuestionMeta[], responses: AnswerSet) {
  return buildPatternInput({ instrumentVersion: '1.0', facets, questions, responses });
}

describe('buildPatternInput', () => {
  it('no convierte lo no respondido ni lo marcado como "no responder" en evidencia', () => {
    const questions = [likert('L1', 'R1'), likert('L2', 'R1')];
    const out = build(questions, {
      answers: { L1: { likertValue: null, optionCode: null, declined: true } },
      audioTurns: [],
    });

    expect(out.evidence).toHaveLength(0);
    expect(out.unavailable).toEqual([
      { questionCode: 'L1', reason: 'PREFER_NOT_TO_ANSWER' },
      { questionCode: 'L2', reason: 'NOT_ANSWERED' },
    ]);
    expect(out.facetSignals[0]!.divergence).toBe('INSUFFICIENT');
  });

  it('varios turnos del mismo relato comparten grupo de independencia pero conservan su identidad', () => {
    const out = build([audio('H01')], {
      answers: { H01: { likertValue: null, optionCode: null, declined: false } },
      audioTurns: [
        { questionCode: 'H01', turnIndex: 0, promptText: 'Relato H01', transcript: LONG_RELATO, transcriptStatus: 'ok' },
        { questionCode: 'H01', turnIndex: 1, promptText: 'Seguimiento', transcript: LONG_RELATO, transcriptStatus: 'ok' },
      ],
    });

    expect(out.evidence.map((e) => e.evidenceId)).toEqual(['EV-H01-T0', 'EV-H01-T1']);
    expect(new Set(out.evidence.map((e) => e.independenceGroup))).toEqual(new Set(['IG-H01']));
    expect(out.evidence[0]!.inferenceLimit).toBe('No inferir capacidad de ejecución.');
  });

  it('marca respuestas uniformes como posible respuesta automática', () => {
    const questions = Array.from({ length: 10 }, (_, i) => likert(`L${i}`, 'R1'));
    const answers = Object.fromEntries(
      questions.map((q) => [q.code, { likertValue: 3, optionCode: null, declined: false }]),
    );
    const out = build(questions, { answers, audioTurns: [] });

    expect(out.dataQualityFlags.map((f) => f.code)).toEqual(['UNIFORM_LIKERT']);
  });

  it('un audio sin transcripción utilizable no produce evidencia ni contenido inventado', () => {
    const out = build([audio('H01')], {
      answers: { H01: { likertValue: null, optionCode: null, declined: false } },
      audioTurns: [{ questionCode: 'H01', turnIndex: 0, promptText: 'Relato', transcript: null, transcriptStatus: 'failed' }],
    });

    expect(out.evidence).toHaveLength(0);
    expect(out.unavailable).toEqual([{ questionCode: 'H01', reason: 'TRANSCRIPT_UNAVAILABLE' }]);
    expect(out.dataQualityFlags.map((f) => f.code)).toEqual(['TRANSCRIPT_UNAVAILABLE']);
  });

  it('marca relatos cortos sin tratarlos como ausencia del rasgo', () => {
    const out = build([audio('H01')], {
      answers: { H01: { likertValue: null, optionCode: null, declined: false } },
      audioTurns: [{ questionCode: 'H01', turnIndex: 0, promptText: 'Relato', transcript: 'Sí, lo hice.', transcriptStatus: 'ok' }],
    });

    expect(out.evidence).toHaveLength(1);
    expect(out.dataQualityFlags.map((f) => f.code)).toEqual(['SHORT_NARRATIVE']);
  });

  it('sin polaridad firmada no calcula divergencia; con polaridad la calcula sin promediar', () => {
    const sinPolaridad = build(
      [likert('A', 'R1'), likert('B', 'R1')],
      {
        answers: {
          A: { likertValue: 5, optionCode: null, declined: false },
          B: { likertValue: 1, optionCode: null, declined: false },
        },
        audioTurns: [],
      },
    );
    expect(sinPolaridad.facetSignals[0]!.divergence).toBe('NOT_EVALUABLE');
    expect(sinPolaridad.facetSignals[0]!.reason).toBe('POLARITY_UNAVAILABLE');

    const conPolaridad = build(
      [likert('A', 'R1', 1), likert('B', 'R1', -1)],
      {
        answers: {
          A: { likertValue: 5, optionCode: null, declined: false },
          B: { likertValue: 5, optionCode: null, declined: false },
        },
        audioTurns: [],
      },
    );
    // Con B inversa, un 5 significa 1 en el constructo: A y B apuntan en sentidos opuestos.
    expect(conPolaridad.facetSignals[0]!.divergence).toBe('DIVERGENT');
  });

  it('detecta menciones sensibles solo como anotación, sin cambiar la evidencia', () => {
    const texto =
      'Hubo un periodo de depresión y después revisé traumas que había estudiado, con el apoyo de mi terapeuta. Lo hablé con calma y decidí seguir con el plan que habíamos acordado.';
    const out = build([audio('H01')], {
      answers: { H01: { likertValue: null, optionCode: null, declined: false } },
      audioTurns: [{ questionCode: 'H01', turnIndex: 0, promptText: 'Relato', transcript: texto, transcriptStatus: 'ok' }],
    });

    expect(out.evidence).toHaveLength(1);
    expect(out.sensitiveMentions.map((m) => m.term)).toEqual(['depresion', 'traumas', 'terapeuta']);
    expect(out.dataQualityFlags).toEqual([]);
  });

  it('un relato de audio con faceta asignada no entra en las señales de faceta ni rompe el contrato', () => {
    const out = build(
      [{ ...audio('H01'), facetCode: 'R1' }, likert('L1', 'R1')],
      {
        answers: { L1: { likertValue: 2, optionCode: null, declined: false } },
        audioTurns: [
          { questionCode: 'H01', turnIndex: 0, promptText: 'Relato', transcript: LONG_RELATO, transcriptStatus: 'ok' },
        ],
      },
    );

    expect(out.evidence.map((e) => e.sourceType).sort()).toEqual(['NARRATIVE', 'SCALE']);
    expect(out.facetSignals[0]!.items.map((i) => i.sourceType)).toEqual(['SCALE']);
    expect(patternInputSchema.safeParse(out).success).toBe(true);
  });

  it('produce la misma salida canónica para la misma entrada y cumple el contrato', () => {
    const args = {
      questions: [likert('L1', 'R1', 1), audio('H01')],
      responses: {
        answers: { L1: { likertValue: 4, optionCode: null, declined: false }, H01: { likertValue: null, optionCode: null, declined: false } },
        audioTurns: [{ questionCode: 'H01', turnIndex: 0, promptText: 'Relato', transcript: LONG_RELATO, transcriptStatus: 'ok' as const }],
      },
    };
    const first = build(args.questions, args.responses);
    const second = build(args.questions, args.responses);

    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(patternInputSchema.safeParse(first).success).toBe(true);
    expect(first.counts).toEqual({ answerableQuestions: 2, evidenceItems: 2, unavailable: 0, facets: 1 });
  });
});

describe('detección de menciones sensibles y conteo de palabras', () => {
  it('no marca términos neutros y es insensible a acentos', () => {
    expect(detectSensitiveMentions('Me gusta trabajar en equipo y los proyectos largos.')).toEqual([]);
    expect(detectSensitiveMentions('DEPRESIÓN').map((m) => m.term)).toEqual(['depresion']);
  });

  it('cuenta palabras ignorando espacios repetidos', () => {
    expect(countWords('  uno   dos\ttres  ')).toBe(3);
  });
});
