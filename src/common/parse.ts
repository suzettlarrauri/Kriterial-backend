import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** Valida con Zod y convierte los errores en una respuesta 400 legible. */
export function parseOrThrow<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.') || '(cuerpo)'}: ${i.message}`);
    throw new BadRequestException({ message: 'Datos no válidos', issues });
  }
  return result.data;
}
