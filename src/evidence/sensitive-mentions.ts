/**
 * Detector léxico de menciones sensibles (ADN §33A). Solo ANOTA: no bloquea, no escala a revisión humana.
 * La decisión de qué hacer con una mención corresponde al Pattern Engine y al Auditor.
 */
const LEXICON: { category: string; pattern: RegExp }[] = [
  {
    category: 'SALUD_MENTAL',
    pattern:
      /\b(depresi\w*|ansiedad\w*|trauma\w*|psiquiatr\w*|terapeut\w*|terapia\w*|suicid\w*|autolesi\w*|panico|bipolar|tdah|trastorno\w*)\b/gu,
  },
];

export interface SensitiveMention {
  category: string;
  term: string;
}

/** Minúsculas y sin acentos, para que "depresión" y "Depresion" coincidan. */
export function normalizeForScan(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function detectSensitiveMentions(text: string): SensitiveMention[] {
  const found = new Map<string, SensitiveMention>();
  const normalized = normalizeForScan(text);
  for (const { category, pattern } of LEXICON) {
    for (const match of normalized.matchAll(pattern)) {
      const term = match[0];
      found.set(`${category}:${term}`, { category, term });
    }
  }
  return [...found.values()];
}
