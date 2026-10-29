import { z } from 'zod';

export const answerBodySchema = z.union([
  z.object({ declined: z.literal(true) }).strict(),
  z.object({ likertValue: z.number().int().min(1).max(5) }).strict(),
  z.object({ optionCode: z.string().trim().min(1).max(20) }).strict(),
]);

export type AnswerInput = z.infer<typeof answerBodySchema>;

export interface AnswerableQuestion {
  type: 'LIKERT_5' | 'SCENARIO_SINGLE_CHOICE' | 'AUDIO_ADAPTIVE' | 'PAUSE';
  optionCodes: string[];
}

export interface ResolvedAnswer {
  likertValue: number | null;
  optionCode: string | null;
  declined: boolean;
}

/**
 * Traduce la entrada de una respuesta a su forma almacenada según el tipo de pregunta.
 * Lanza un Error de validación si la respuesta no corresponde a la pregunta.
 */
export function resolveAnswer(question: AnswerableQuestion, input: AnswerInput): ResolvedAnswer {
  if (question.type === 'PAUSE') {
    throw new Error('Las pantallas de pausa no admiten respuesta');
  }
  if ('declined' in input) {
    return { likertValue: null, optionCode: null, declined: true };
  }
  if (question.type === 'AUDIO_ADAPTIVE') {
    throw new Error('Las preguntas de audio se responden subiendo el audio, o marcando no responder');
  }
  if (question.type === 'LIKERT_5') {
    if (!('likertValue' in input)) throw new Error('Esta pregunta requiere un valor de 1 a 5');
    return { likertValue: input.likertValue, optionCode: null, declined: false };
  }
  if (!('optionCode' in input)) throw new Error('Esta pregunta requiere elegir una opción');
  if (!question.optionCodes.includes(input.optionCode)) {
    throw new Error(`La opción ${input.optionCode} no existe en esta pregunta`);
  }
  return { likertValue: null, optionCode: input.optionCode, declined: false };
}
