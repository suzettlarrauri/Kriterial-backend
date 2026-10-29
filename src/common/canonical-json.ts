import { createHash } from 'node:crypto';

/**
 * Serialización JSON con claves ordenadas: el mismo contenido produce siempre
 * los mismos bytes, condición para hashes estables y prompt caching.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}
