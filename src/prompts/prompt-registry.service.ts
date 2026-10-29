import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { canonicalJson, sha256 } from '../common/canonical-json.js';
import { AppConfig } from '../config/app-config.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  type PromptEntry,
  type PromptManifest,
  promptManifestSchema,
} from './prompt-manifest.schema.js';

export interface SystemBlock {
  ref: string;
  text: string;
  /** true en el último bloque del prefijo estable: ahí va el breakpoint de caché. */
  cacheBreakpoint: boolean;
}

export interface ComposedPrompt {
  stage: string;
  blocks: SystemBlock[];
  parts: { ref: string; sha256: string }[];
  bundleHash: string;
}

/** Carga y verifica el manifiesto en un directorio de prompts. Sin dependencias de Nest. */
export function loadPromptManifest(promptsDir: string): {
  manifest: PromptManifest;
  texts: Map<string, string>;
} {
  const root = resolve(promptsDir);
  const manifest = promptManifestSchema.parse(
    JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')),
  );

  const texts = new Map<string, string>();
  const errors: string[] = [];
  for (const entry of manifest.prompts) {
    const key = refOf(entry);
    if (texts.has(key)) errors.push(`${key}: entrada duplicada`);
    const text = readFileSync(join(root, entry.path), 'utf8');
    const actual = sha256(text);
    if (actual !== entry.sha256) {
      errors.push(`${key}: el contenido de ${entry.path} no coincide con el hash del manifiesto`);
    }
    texts.set(key, text);
  }
  for (const [stage, def] of Object.entries(manifest.stages)) {
    for (const r of [...def.prefix, def.module]) {
      if (!texts.has(r)) errors.push(`${stage}: referencia inexistente ${r}`);
    }
  }
  if (errors.length) {
    throw new Error(
      `Registro de prompts inválido. Los prompts versionados son inmutables: ` +
        `para cambiar uno, crea una versión nueva.\n  - ${errors.join('\n  - ')}`,
    );
  }
  return { manifest, texts };
}

export function refOf(entry: Pick<PromptEntry, 'id' | 'version'>): string {
  return `${entry.id}@${entry.version}`;
}

@Injectable()
export class PromptRegistry implements OnModuleInit {
  private readonly logger = new Logger(PromptRegistry.name);
  private manifest!: PromptManifest;
  private texts!: Map<string, string>;
  private hashes!: Map<string, string>;

  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  onModuleInit(): void {
    ({ manifest: this.manifest, texts: this.texts } = loadPromptManifest(
      this.config.env.PROMPTS_DIR,
    ));
    this.hashes = new Map(this.manifest.prompts.map((p) => [refOf(p), p.sha256]));
    this.logger.log(
      `Prompts verificados: ${this.manifest.prompts.length}; etapas: ${Object.keys(this.manifest.stages).join(', ')}`,
    );
  }

  stages(): string[] {
    return Object.keys(this.manifest.stages);
  }

  compose(stage: string): ComposedPrompt {
    const def = this.manifest.stages[stage];
    if (!def) throw new Error(`Etapa de prompts desconocida: ${stage}`);

    const refs = [...def.prefix, def.module];
    const blocks = refs.map((ref, i) => ({
      ref,
      text: this.texts.get(ref)!,
      cacheBreakpoint: i === def.prefix.length - 1,
    }));
    const parts = refs.map((ref) => ({ ref, sha256: this.hashes.get(ref)! }));
    return { stage, blocks, parts, bundleHash: sha256(canonicalJson({ stage, parts })) };
  }

  /** Persiste (idempotente) la combinación exacta de prompts usada por una etapa. */
  async registerBundle(stage: string): Promise<{ id: string; bundleHash: string }> {
    const composed = this.compose(stage);
    const [blockCode] = stage.split('.');
    const bundle = await this.prisma.promptBundle.upsert({
      where: { bundleHash: composed.bundleHash },
      update: {},
      create: {
        blockCode: blockCode!,
        stage,
        manifest: { parts: composed.parts },
        bundleHash: composed.bundleHash,
      },
      select: { id: true, bundleHash: true },
    });
    return bundle;
  }
}
