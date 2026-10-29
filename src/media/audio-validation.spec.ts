import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { detectAudioFormat, MAX_AUDIO_BYTES, validateAudioUpload } from './audio-validation.js';

const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64)]);
const OGG = Buffer.concat([Buffer.from('OggS'), Buffer.alloc(64)]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftyp'), Buffer.alloc(64)]);

describe('validación de audio', () => {
  it('reconoce webm, ogg y mp4 por su firma binaria', () => {
    expect(detectAudioFormat(WEBM)).toBe('webm');
    expect(detectAudioFormat(OGG)).toBe('ogg');
    expect(detectAudioFormat(MP4)).toBe('mp4');
    expect(detectAudioFormat(Buffer.from('texto plano'))).toBeNull();
  });

  it('acepta el MIME con parámetros de códec', () => {
    expect(validateAudioUpload({ mimetype: 'audio/webm;codecs=opus', buffer: WEBM })).toBe('webm');
  });

  it('rechaza un MIME declarado que no coincide con el contenido', () => {
    expect(() => validateAudioUpload({ mimetype: 'audio/ogg', buffer: WEBM })).toThrow(BadRequestException);
  });

  it('rechaza tipos no permitidos, archivos vacíos y tamaños excesivos', () => {
    expect(() => validateAudioUpload({ mimetype: 'application/pdf', buffer: WEBM })).toThrow(BadRequestException);
    expect(() => validateAudioUpload({ mimetype: 'audio/webm', buffer: Buffer.alloc(0) })).toThrow(
      BadRequestException,
    );
    const huge = Buffer.alloc(MAX_AUDIO_BYTES + 1);
    huge.set([0x1a, 0x45, 0xdf, 0xa3]);
    expect(() => validateAudioUpload({ mimetype: 'audio/webm', buffer: huge })).toThrow(/tamaño/);
  });
});
