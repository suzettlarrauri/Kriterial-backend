import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { STORAGE, type StorageAdapter } from '../storage/storage.adapter.js';
import { TRANSCRIPTION_PROVIDER, type TranscriptionProvider } from './transcription.provider.js';

/** Marcador que la interfaz guarda cuando el audio no pudo transcribirse: no es contenido. */
export const TRANSCRIPTION_FAILED_MARKER = '[Audio guardado pero no se pudo transcribir]';

@Injectable()
export class TranscriptionService {
  private readonly logger = new Logger(TranscriptionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    @Inject(TRANSCRIPTION_PROVIDER) private readonly provider: TranscriptionProvider,
  ) {}

  /**
   * Transcribe un turno de audio pendiente. Idempotente: si el turno ya no está pendiente no hace nada.
   * Un fallo técnico del proveedor se propaga para que BullMQ reintente; no marca el turno como fallido.
   */
  async transcribeTurn(turnId: string): Promise<void> {
    const turn = await this.prisma.audioTurn.findUnique({ where: { id: turnId } });
    if (!turn || turn.transcriptStatus !== 'pending' || !turn.storageKey) return;

    const buffer = await this.storage.get(turn.storageKey);
    const result = await this.provider.transcribe({
      buffer,
      mimeType: turn.mimeType ?? 'application/octet-stream',
      language: 'es',
    });

    const text = result.text.trim();
    const failed = text.length === 0 || text.includes(TRANSCRIPTION_FAILED_MARKER);
    const qualityFlags = failed ? ['TRANSCRIPT_EMPTY_OR_FAILED'] : [];

    // Solo se escribe si el turno sigue siendo el mismo audio: una re-subida durante la transcripción
    // deja obsoleto este resultado y no debe sobrescribir al nuevo.
    const updated = await this.prisma.audioTurn.updateMany({
      where: { id: turn.id, transcriptStatus: 'pending', storageKey: turn.storageKey },
      data: {
        transcript: failed ? null : text,
        transcriptionProvider: result.provider,
        transcriptionModel: result.model,
        transcriptStatus: failed ? 'failed' : 'ok',
        qualityFlags,
      },
    });
    if (updated.count === 0) {
      this.logger.log(`turno ${turn.id}: resultado descartado (el audio cambió durante la transcripción)`);
      return;
    }
    this.logger.log(`turno ${turn.id} transcrito: ${failed ? 'fallido' : 'ok'}`);
  }
}
