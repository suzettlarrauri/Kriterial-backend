import {
  type AnswerSet,
  type EvidenceItem,
  type FacetMeta,
  type FacetSignal,
  type PatternInput,
  type QuestionMeta,
} from './evidence.types.js';
import { detectSensitiveMentions } from './sensitive-mentions.js';

/** Un relato más corto que esto no permite afirmar nada: se marca, no se interpreta como ausencia. */
export const SHORT_NARRATIVE_WORDS = 20;
/** Con menos escalas no hay patrón de uniformidad que valorar. */
const UNIFORM_MIN_SCALES = 10;

export interface BuildInput {
  instrumentVersion: string;
  facets: FacetMeta[];
  /** Preguntas en el orden del instrumento. */
  questions: QuestionMeta[];
  responses: AnswerSet;
}

type Unavailable = PatternInput['unavailable'][number];
type Flag = PatternInput['dataQualityFlags'][number];

/**
 * Etapa 0 (determinista, sin LLM): convierte las respuestas en evidencia identificada y trazable.
 * Reglas:
 * - Lo no respondido o marcado como "no responder" es dato no disponible, nunca evidencia en contra.
 * - Cada audio es un turno con su propio evidence_id; los turnos del mismo relato comparten grupo de independencia.
 * - Las señales por faceta no promedian: solo marcan divergencia cuando la polaridad está firmada.
 */
export function buildPatternInput(input: BuildInput): PatternInput {
  const evidence: EvidenceItem[] = [];
  const unavailable: Unavailable[] = [];
  const flags: Flag[] = [];
  const answerable = input.questions.filter((q) => q.type !== 'PAUSE');
  const byCode = new Map(answerable.map((q) => [q.code, q]));

  for (const q of answerable) {
    const answer = input.responses.answers[q.code];

    if (q.type === 'AUDIO_ADAPTIVE') {
      const turns = input.responses.audioTurns
        .filter((t) => t.questionCode === q.code)
        .sort((a, b) => a.turnIndex - b.turnIndex);
      if (answer?.declined) {
        unavailable.push({ questionCode: q.code, reason: 'PREFER_NOT_TO_ANSWER' });
        continue;
      }
      if (turns.length === 0) {
        unavailable.push({ questionCode: q.code, reason: 'NOT_ANSWERED' });
        continue;
      }
      for (const turn of turns) {
        const evidenceId = `EV-${q.code}-T${turn.turnIndex}`;
        const transcript = turn.transcript?.trim() ?? '';
        const usable = (turn.transcriptStatus === 'ok' || turn.transcriptStatus === 'partial') && transcript !== '';
        if (!usable) {
          unavailable.push({ questionCode: q.code, reason: 'TRANSCRIPT_UNAVAILABLE' });
          flags.push({
            code: 'TRANSCRIPT_UNAVAILABLE',
            scope: evidenceId,
            detail: 'El audio no tiene transcripción utilizable; no se infiere contenido.',
          });
          continue;
        }
        if (countWords(transcript) < SHORT_NARRATIVE_WORDS) {
          flags.push({
            code: 'SHORT_NARRATIVE',
            scope: evidenceId,
            detail: `El relato tiene menos de ${SHORT_NARRATIVE_WORDS} palabras; la ausencia de detalle no indica ausencia del rasgo.`,
          });
        }
        evidence.push({
          evidenceId,
          questionCode: q.code,
          domain: q.domain,
          facetCode: q.facetCode,
          sourceType: 'NARRATIVE',
          independenceGroup: `IG-${q.code}`,
          content: {
            value: null,
            anchor: null,
            optionCode: null,
            optionText: null,
            turnIndex: turn.turnIndex,
            promptText: turn.promptText,
            transcript,
          },
          evidencePreserves: q.evidencePreserves,
          inferenceLimit: q.inferenceLimit,
        });
      }
      continue;
    }

    if (!answer) {
      unavailable.push({ questionCode: q.code, reason: 'NOT_ANSWERED' });
      continue;
    }
    if (answer.declined) {
      unavailable.push({ questionCode: q.code, reason: 'PREFER_NOT_TO_ANSWER' });
      continue;
    }

    if (q.type === 'LIKERT_5' && answer.likertValue !== null) {
      evidence.push({
        evidenceId: `EV-${q.code}`,
        questionCode: q.code,
        domain: q.domain,
        facetCode: q.facetCode,
        sourceType: 'SCALE',
        independenceGroup: `IG-${q.code}`,
        content: {
          value: answer.likertValue,
          anchor: q.anchors?.[answer.likertValue - 1] ?? null,
          optionCode: null,
          optionText: null,
          turnIndex: null,
          promptText: null,
          transcript: null,
        },
        evidencePreserves: q.evidencePreserves,
        inferenceLimit: q.inferenceLimit,
      });
    } else if (q.type === 'SCENARIO_SINGLE_CHOICE' && answer.optionCode !== null) {
      const option = q.options.find((o) => o.code === answer.optionCode);
      evidence.push({
        evidenceId: `EV-${q.code}`,
        questionCode: q.code,
        domain: q.domain,
        facetCode: q.facetCode,
        sourceType: 'SCENARIO',
        independenceGroup: `IG-${q.code}`,
        content: {
          value: null,
          anchor: null,
          optionCode: answer.optionCode,
          optionText: option?.text ?? null,
          turnIndex: null,
          promptText: null,
          transcript: null,
        },
        evidencePreserves: q.evidencePreserves,
        inferenceLimit: q.inferenceLimit,
      });
    } else {
      unavailable.push({ questionCode: q.code, reason: 'NOT_ANSWERED' });
    }
  }

  const likertValues = answerable
    .filter((q) => q.type === 'LIKERT_5')
    .map((q) => input.responses.answers[q.code]?.likertValue)
    .filter((v): v is number => typeof v === 'number');
  if (likertValues.length >= UNIFORM_MIN_SCALES && new Set(likertValues).size === 1) {
    flags.push({
      code: 'UNIFORM_LIKERT',
      scope: 'SCALE',
      detail: `Las ${likertValues.length} escalas tienen el mismo valor (${likertValues[0]}); puede ser respuesta automática.`,
    });
  }

  const facetSignals: FacetSignal[] = input.facets.map((facet) => {
    // Los relatos de audio no pertenecen a una faceta: solo escalas y escenarios.
    const linked = evidence.filter(
      (e): e is EvidenceItem & { sourceType: 'SCALE' | 'SCENARIO' } =>
        e.facetCode === facet.code && e.sourceType !== 'NARRATIVE',
    );
    const polarityOf = (e: EvidenceItem) => byCode.get(e.questionCode)?.polarity ?? null;
    // La divergencia solo compara escalas con valor y polaridad firmada; los escenarios no tienen valor numérico.
    const scales = linked.flatMap((e) => (e.sourceType === 'SCALE' && e.content.value !== null ? [{ e, value: e.content.value }] : []));
    let divergence: FacetSignal['divergence'];
    let reason: string | null = null;

    if (scales.length < 2) {
      divergence = 'INSUFFICIENT';
      reason = `Solo ${scales.length} escala(s) disponibles para esta faceta`;
    } else if (scales.some(({ e }) => polarityOf(e) === null)) {
      divergence = 'NOT_EVALUABLE';
      reason = 'POLARITY_UNAVAILABLE';
    } else {
      const normalized = scales.map(({ e, value }) => (polarityOf(e) === 1 ? value : 6 - value));
      divergence = normalized.some((v) => v >= 4) && normalized.some((v) => v <= 2) ? 'DIVERGENT' : 'NONE';
    }

    return {
      facetCode: facet.code,
      domain: facet.domain,
      items: linked.map((e) => ({
        evidenceId: e.evidenceId,
        sourceType: e.sourceType,
        value: e.content.value,
        polarity: polarityOf(e),
      })),
      divergence,
      reason,
    };
  });

  const sensitiveMentions = evidence
    .filter((e) => e.sourceType === 'NARRATIVE')
    .flatMap((e) =>
      detectSensitiveMentions(e.content.transcript ?? '').map((m) => ({
        evidenceId: e.evidenceId,
        category: m.category,
        term: m.term,
      })),
    );

  return {
    schemaVersion: 'pattern-input/1',
    block: 'B1',
    instrumentVersion: input.instrumentVersion,
    counts: {
      answerableQuestions: answerable.length,
      evidenceItems: evidence.length,
      unavailable: unavailable.length,
      facets: input.facets.length,
    },
    evidence,
    facetSignals,
    unavailable,
    dataQualityFlags: flags,
    sensitiveMentions,
  };
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
