import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { UpdateParticipantInput } from './participants.schema.js';

export interface ParticipantView {
  displayName: string | null;
  grammaticalForm: string;
  language: string;
  consentVersion: string | null;
  consentAt: Date | null;
}

@Injectable()
export class ParticipantsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Crea o actualiza el perfil del participante autenticado (se crea la primera vez). */
  async updateMine(userId: string, input: UpdateParticipantInput): Promise<ParticipantView> {
    const data = {
      displayName: input.displayName,
      grammaticalForm: input.grammaticalForm,
      ...(input.consentVersion ? { consentVersion: input.consentVersion, consentAt: new Date() } : {}),
    };
    const p = await this.prisma.participant.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
    return {
      displayName: p.displayName,
      grammaticalForm: p.grammaticalForm,
      language: p.language,
      consentVersion: p.consentVersion,
      consentAt: p.consentAt,
    };
  }

  /** Devuelve el participante del usuario o null si aún no tiene perfil. */
  findByUser(userId: string) {
    return this.prisma.participant.findUnique({ where: { userId } });
  }
}
