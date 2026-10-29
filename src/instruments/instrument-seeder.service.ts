import { Injectable, Logger } from '@nestjs/common';
import { canonicalJson, sha256 } from '../common/canonical-json.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type InstrumentSeed, instrumentSeedSchema } from './instrument-seed.schema.js';

export type SeedOutcome = 'created' | 'unchanged';

/**
 * Siembra versiones de instrumento. Las versiones son inmutables: si ya existe
 * la misma versión con distinto contenido, falla en lugar de sobrescribir.
 */
@Injectable()
export class InstrumentSeeder {
  private readonly logger = new Logger(InstrumentSeeder.name);

  constructor(private readonly prisma: PrismaService) {}

  async seed(raw: unknown): Promise<SeedOutcome> {
    const seed = instrumentSeedSchema.parse(raw);
    const sourceHash = sha256(canonicalJson(seed));
    const label = `${seed.blockCode}@${seed.version}`;

    const existing = await this.prisma.instrument.findUnique({
      where: { blockCode_version: { blockCode: seed.blockCode, version: seed.version } },
    });
    if (existing) {
      if (existing.sourceHash !== sourceHash) {
        throw new Error(
          `${label} ya existe con contenido distinto. Las versiones son inmutables: crea una versión nueva.`,
        );
      }
      this.logger.log(`${label} sin cambios`);
      return 'unchanged';
    }

    await this.prisma.$transaction(async (tx) => this.insert(tx, seed, sourceHash));
    this.logger.log(`${label} creado (${seed.questions.length} preguntas)`);
    return 'created';
  }

  private async insert(tx: Prisma.TransactionClient, seed: InstrumentSeed, sourceHash: string) {
    const scaleIds = new Map<string, string>();
    for (const s of seed.scales) {
      const scale = await tx.scale.upsert({
        where: { code: s.code },
        update: {},
        create: { code: s.code, anchors: s.anchors },
      });
      if (canonicalJson(scale.anchors) !== canonicalJson(s.anchors)) {
        throw new Error(`La escala ${s.code} ya existe con anclas distintas`);
      }
      scaleIds.set(s.code, scale.id);
    }

    const instrument = await tx.instrument.create({
      data: {
        blockCode: seed.blockCode,
        version: seed.version,
        status: seed.status,
        sourceHash,
        notes: seed.notes,
      },
    });

    const facetIds = new Map<string, string>();
    for (const f of seed.facets) {
      const facet = await tx.facet.create({ data: { instrumentId: instrument.id, ...f } });
      facetIds.set(f.code, facet.id);
    }

    for (const [index, q] of seed.questions.entries()) {
      await tx.question.create({
        data: {
          instrumentId: instrument.id,
          code: q.code,
          position: index + 1,
          type: q.type,
          phase: q.phase,
          domain: q.domain,
          facetId: q.facetCode ? facetIds.get(q.facetCode) : null,
          scaleId: q.scaleCode ? scaleIds.get(q.scaleCode) : null,
          text: q.text,
          preInstruction: q.preInstruction,
          polarity: q.polarity,
          followUps: q.followUps ?? Prisma.DbNull,
          evidencePreserves: q.evidencePreserves,
          inferenceLimit: q.inferenceLimit,
          options: {
            create: q.options.map((o, i) => ({ optionCode: o.code, position: i + 1, text: o.text })),
          },
        },
      });
    }
  }
}
