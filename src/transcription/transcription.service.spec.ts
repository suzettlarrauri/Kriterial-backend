import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { StorageAdapter } from '../storage/storage.adapter.js';
import { TRANSCRIPTION_FAILED_MARKER, TranscriptionService } from './transcription.service.js';
import type { TranscriptionProvider } from './transcription.provider.js';

const pendingTurn = { id: 'turn-1', transcriptStatus: 'pending', storageKey: 'audio/a/1.webm', mimeType: 'audio/webm' };

function setup(text: string | Error, turn: object | null = pendingTurn) {
  const prisma = {
    audioTurn: {
      findUnique: vi.fn().mockResolvedValue(turn),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const storage: StorageAdapter = {
    put: vi.fn(),
    get: vi.fn().mockResolvedValue(Buffer.from('audio')),
    delete: vi.fn(),
  };
  const provider: TranscriptionProvider = {
    transcribe: vi.fn(async () => {
      if (text instanceof Error) throw text;
      return { text, provider: 'stub', model: 'stub-1' };
    }),
  };
  const service = new TranscriptionService(prisma as unknown as PrismaService, storage, provider);
  return { service, prisma, provider };
}

describe('TranscriptionService', () => {
  it('guarda la transcripción y marca el turno como ok', async () => {
    const { service, prisma } = setup('  Hola, esto es un relato.  ');
    await service.transcribeTurn('turn-1');
    expect(prisma.audioTurn.updateMany).toHaveBeenCalledWith({
      where: { id: 'turn-1', transcriptStatus: 'pending', storageKey: 'audio/a/1.webm' },
      data: {
        transcript: 'Hola, esto es un relato.',
        transcriptionProvider: 'stub',
        transcriptionModel: 'stub-1',
        transcriptStatus: 'ok',
        qualityFlags: [],
      },
    });
  });

  it('marca como fallido un audio sin texto o con el marcador de error, sin inventar contenido', async () => {
    for (const text of ['   ', TRANSCRIPTION_FAILED_MARKER]) {
      const { service, prisma } = setup(text);
      await service.transcribeTurn('turn-1');
      expect(prisma.audioTurn.updateMany.mock.calls[0]![0].data).toMatchObject({
        transcript: null,
        transcriptStatus: 'failed',
        qualityFlags: ['TRANSCRIPT_EMPTY_OR_FAILED'],
      });
    }
  });

  it('un fallo técnico del proveedor se propaga para reintentar y no marca el turno', async () => {
    const { service, prisma } = setup(new Error('timeout'));
    await expect(service.transcribeTurn('turn-1')).rejects.toThrow('timeout');
    expect(prisma.audioTurn.updateMany).not.toHaveBeenCalled();
  });

  it('es idempotente: un turno que ya no está pendiente no se vuelve a transcribir', async () => {
    const { service, provider } = setup('texto', { ...pendingTurn, transcriptStatus: 'ok' });
    await service.transcribeTurn('turn-1');
    expect(provider.transcribe).not.toHaveBeenCalled();
  });
});
