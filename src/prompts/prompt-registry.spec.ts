import { cpSync, mkdtempSync, appendFileSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppConfig } from '../config/app-config.js';
import { parseEnv } from '../config/env.schema.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { loadPromptManifest, PromptRegistry } from './prompt-registry.service.js';

const registryFor = (dir: string) => {
  const config = new AppConfig(
    parseEnv({
      DATABASE_URL: 'postgresql://u:p@localhost/db',
      REDIS_URL: 'redis://localhost',
      JWT_SECRET: 'x'.repeat(32),
      PROMPTS_DIR: dir,
    }),
  );
  const registry = new PromptRegistry(config, {} as PrismaService);
  registry.onModuleInit();
  return registry;
};

describe('PromptRegistry', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'prompts-'));
    cpSync('prompts', tmp, { recursive: true });
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('verifica el manifiesto real del repositorio', () => {
    const { manifest } = loadPromptManifest('prompts');
    expect(Object.keys(manifest.stages)).toEqual(['B1.PATTERN', 'B1.WRITER', 'B1.AUDIT']);
  });

  it('compone prefijo común + módulo con el breakpoint de caché al final del prefijo', () => {
    const composed = registryFor(tmp).compose('B1.PATTERN');
    expect(composed.blocks.map((b) => b.ref)).toEqual([
      'common.master-context@1.0',
      'b1.constitution@2.2',
      'b1.pattern-engine@2.2',
    ]);
    expect(composed.blocks.map((b) => b.cacheBreakpoint)).toEqual([false, true, false]);
    expect(composed.blocks[1]!.text).toContain('KRITERIAL B1 — CONSTITUCIÓN METODOLÓGICA CANÓNICA');
  });

  it('el bundleHash es estable y distinto por etapa', () => {
    const r = registryFor(tmp);
    expect(r.compose('B1.AUDIT').bundleHash).toBe(registryFor(tmp).compose('B1.AUDIT').bundleHash);
    expect(r.compose('B1.AUDIT').bundleHash).not.toBe(r.compose('B1.PATTERN').bundleHash);
  });

  it('se niega a arrancar si un prompt versionado fue modificado', () => {
    appendFileSync(join(tmp, 'b1/v2.2/constitution.md'), '\nregla añadida a escondidas\n');
    expect(() => registryFor(tmp)).toThrow(/b1\.constitution@2\.2.*no coincide/s);
  });

  it('detecta referencias de etapa inexistentes', () => {
    const path = join(tmp, 'manifest.json');
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    manifest.stages['B1.WRITER'].module = 'b1.report-writer@3.0';
    writeFileSync(path, JSON.stringify(manifest));
    expect(() => registryFor(tmp)).toThrow(/referencia inexistente b1\.report-writer@3\.0/);
  });

  it('rechaza etapas desconocidas', () => {
    expect(() => registryFor(tmp).compose('B1.NOPE')).toThrow(/desconocida/);
  });
});
