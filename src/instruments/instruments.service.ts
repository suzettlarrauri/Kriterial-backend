import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Vista pública del instrumento para el participante. Excluye a propósito los
 * metadatos internos (dominio, faceta, polaridad, evidencia que preserva,
 * límite de inferencia): son para el análisis, no para quien responde.
 */
export interface PublicQuestion {
  code: string;
  position: number;
  type: string;
  phase: string | null;
  text: string;
  preInstruction: string | null;
  scale: { code: string; anchors: string[] } | null;
  options: { code: string; text: string }[];
  followUps: string[] | null;
}

export interface PublicInstrument {
  blockCode: string;
  version: string;
  questions: PublicQuestion[];
}

@Injectable()
export class InstrumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrent(blockCode: string): Promise<PublicInstrument> {
    const instrument = await this.prisma.instrument.findFirst({
      where: { blockCode, status: 'published' },
      include: {
        questions: {
          orderBy: { position: 'asc' },
          include: { scale: true, options: { orderBy: { position: 'asc' } } },
        },
      },
    });
    if (!instrument) throw new NotFoundException(`No hay instrumento publicado para ${blockCode}`);

    return {
      blockCode: instrument.blockCode,
      version: instrument.version,
      questions: instrument.questions.map((q) => ({
        code: q.code,
        position: q.position,
        type: q.type,
        phase: q.phase,
        text: q.text,
        preInstruction: q.preInstruction,
        scale: q.scale ? { code: q.scale.code, anchors: q.scale.anchors as string[] } : null,
        options: q.options.map((o) => ({ code: o.optionCode, text: o.text })),
        followUps: (q.followUps as string[] | null) ?? null,
      })),
    };
  }
}
