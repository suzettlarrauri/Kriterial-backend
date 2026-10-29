import { BadRequestException } from '@nestjs/common';

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export type AudioFormat = 'webm' | 'ogg' | 'mp4';

const MIME_TO_FORMAT: Record<string, AudioFormat> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'mp4',
};

/** Detecta el contenedor real por sus primeros bytes; el MIME declarado por el cliente no basta. */
export function detectAudioFormat(data: Buffer): AudioFormat | null {
  if (data.length >= 4 && data.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return 'webm';
  }
  if (data.length >= 4 && data.subarray(0, 4).toString('latin1') === 'OggS') return 'ogg';
  if (data.length >= 8 && data.subarray(4, 8).toString('latin1') === 'ftyp') return 'mp4';
  return null;
}

/** Valida tipo declarado, contenido real y tamaño de una subida de audio. Devuelve el formato canónico. */
export function validateAudioUpload(file: { mimetype: string; buffer: Buffer }): AudioFormat {
  const declared = file.mimetype.split(';')[0]!.trim().toLowerCase();
  const expected = MIME_TO_FORMAT[declared];
  if (!expected) {
    throw new BadRequestException('Formato de audio no permitido (usa webm, ogg o mp4)');
  }
  if (file.buffer.length === 0) {
    throw new BadRequestException('El archivo de audio está vacío');
  }
  if (file.buffer.length > MAX_AUDIO_BYTES) {
    throw new BadRequestException('El audio supera el tamaño máximo permitido');
  }
  if (detectAudioFormat(file.buffer) !== expected) {
    throw new BadRequestException('El contenido del archivo no corresponde al formato declarado');
  }
  return expected;
}
