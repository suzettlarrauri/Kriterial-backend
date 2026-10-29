import { describe, expect, it } from 'vitest';
import { answerBodySchema, resolveAnswer } from './answer-rules.js';

const likert = { type: 'LIKERT_5' as const, optionCodes: [] };
const scenario = { type: 'SCENARIO_SINGLE_CHOICE' as const, optionCodes: ['OPT_A', 'OPT_B'] };
const audio = { type: 'AUDIO_ADAPTIVE' as const, optionCodes: [] };

describe('reglas de respuesta', () => {
  it('acepta una escala Likert de 1 a 5 y rechaza valores fuera de rango', () => {
    expect(answerBodySchema.safeParse({ likertValue: 3 }).success).toBe(true);
    expect(answerBodySchema.safeParse({ likertValue: 6 }).success).toBe(false);
    expect(answerBodySchema.safeParse({ likertValue: 2.5 }).success).toBe(false);
    expect(resolveAnswer(likert, { likertValue: 4 })).toEqual({
      likertValue: 4,
      optionCode: null,
      declined: false,
    });
  });

  it('acepta solo opciones que existen en el escenario', () => {
    expect(resolveAnswer(scenario, { optionCode: 'OPT_B' }).optionCode).toBe('OPT_B');
    expect(() => resolveAnswer(scenario, { optionCode: 'OPT_Z' })).toThrow(/no existe/);
  });

  it('no permite un tipo de respuesta distinto al de la pregunta', () => {
    expect(() => resolveAnswer(likert, { optionCode: 'OPT_A' })).toThrow(/valor de 1 a 5/);
    expect(() => resolveAnswer(scenario, { likertValue: 2 })).toThrow(/elegir una opción/);
  });

  it('las preguntas de audio solo admiten no responder por texto', () => {
    expect(resolveAnswer(audio, { declined: true })).toEqual({
      likertValue: null,
      optionCode: null,
      declined: true,
    });
    expect(() => resolveAnswer(audio, { likertValue: 1 })).toThrow(/subiendo el audio/);
  });

  it('las pausas no admiten respuesta', () => {
    expect(() => resolveAnswer({ type: 'PAUSE', optionCodes: [] }, { declined: true })).toThrow(/pausa/);
  });

  it('cualquier pregunta puede marcarse como no respondida', () => {
    expect(resolveAnswer(scenario, { declined: true }).declined).toBe(true);
  });
});
