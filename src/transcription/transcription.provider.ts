export interface TranscriptionInput {
  buffer: Buffer;
  mimeType: string;
  language: string;
}

export interface TranscriptionResult {
  text: string;
  provider: string;
  model: string;
}

export interface TranscriptionProvider {
  transcribe(input: TranscriptionInput): Promise<TranscriptionResult>;
}

export const TRANSCRIPTION_PROVIDER = Symbol('TRANSCRIPTION_PROVIDER');

/** Proveedor simulado para desarrollo y pruebas. Nunca se permite en producción (ver env.schema). */
export class FakeTranscriptionProvider implements TranscriptionProvider {
  async transcribe(input: TranscriptionInput): Promise<TranscriptionResult> {
    return {
      text: `Transcripción simulada (${input.buffer.length} bytes).`,
      provider: 'fake',
      model: 'fake-1',
    };
  }
}
