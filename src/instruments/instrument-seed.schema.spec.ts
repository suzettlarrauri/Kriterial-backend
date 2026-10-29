import { readFileSync } from 'node:fs';
import { instrumentSeedSchema } from './instrument-seed.schema.js';

const load = (v: string) =>
  instrumentSeedSchema.parse(JSON.parse(readFileSync(`instruments/seeds/b1@${v}.json`, 'utf8')));

describe('seeds del instrumento B1', () => {
  const current = load('1.0');
  const previous = load('0.9');

  it('b1@1.0 contiene 62 ítems, 24 facetas en 6 dominios y está publicado', () => {
    expect(current.status).toBe('published');
    expect(current.questions).toHaveLength(62);
    expect(current.facets).toHaveLength(24);
    expect(new Set(current.facets.map((f) => f.domain)).size).toBe(6);
  });

  it('las etiquetas de faceta y las polaridades siguen pendientes de la metodóloga (D2)', () => {
    expect(current.facets.every((f) => !f.labelApproved)).toBe(true);
    expect(current.questions.every((q) => q.polarity === null)).toBe(true);
  });

  it('b1@0.9 comparte los 48 ítems cerrados y solo difiere en los 8 audios', () => {
    expect(previous.status).toBe('retired');
    const byCode = new Map(previous.questions.map((q) => [q.code, q]));
    const differing = current.questions.filter((q) => byCode.get(q.code)!.text !== q.text);
    expect(differing.map((q) => q.type)).toEqual(Array(8).fill('AUDIO_ADAPTIVE'));
    for (const q of previous.questions.filter((x) => x.type === 'AUDIO_ADAPTIVE')) {
      expect(q.followUps).toBeNull();
      expect(q.text.startsWith('Piensa en')).toBe(true);
    }
  });

  it('rechaza referencias a facetas inexistentes', () => {
    const broken = structuredClone(current);
    broken.questions[1]!.facetCode = 'ZZ9';
    expect(() => instrumentSeedSchema.parse(broken)).toThrow(/faceta inexistente ZZ9/);
  });
});
