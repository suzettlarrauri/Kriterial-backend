/**
 * Rellena el sha256 de entradas nuevas del manifiesto (las que tienen "sha256": "").
 * Nunca reescribe un hash existente: los prompts versionados son inmutables.
 *   npm run prompts:hash
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env['PROMPTS_DIR'] ?? 'prompts';
const manifestPath = join(dir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
  prompts: { id: string; version: string; path: string; sha256: string }[];
};
let filled = 0;
for (const p of manifest.prompts) {
  if (p.sha256) continue;
  p.sha256 = createHash('sha256').update(readFileSync(join(dir, p.path))).digest('hex');
  console.log(`${p.id}@${p.version}: ${p.sha256}`);
  filled++;
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(filled ? `${filled} hash(es) añadidos` : 'Sin entradas nuevas');
