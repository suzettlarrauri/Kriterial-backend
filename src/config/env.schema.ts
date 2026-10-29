import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET debe tener al menos 32 caracteres'),
  JWT_ISSUER: z.string().min(1).default('kriterial-api'),
  JWT_AUDIENCE: z.string().min(1).default('kriterial'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  PROMPTS_DIR: z.string().min(1).default('prompts'),
  // Raíz del almacenamiento local de audios (relativa al directorio del proyecto).
  STORAGE_DIR: z.string().min(1).default('storage'),
  // `fake` solo para desarrollo y pruebas; el proveedor real se añade con la integración de transcripción.
  TRANSCRIPTION_PROVIDER: z.enum(['fake']).default('fake'),
  // `replay` no llama a la API de Anthropic; `live` la usa (requiere ANTHROPIC_API_KEY).
  LLM_MODE: z.enum(['replay', 'live']).default('replay'),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Valida el entorno y falla al arrancar con un mensaje legible. */
export function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema
    .superRefine((env, ctx) => {
      if (env.NODE_ENV === 'production' && env.TRANSCRIPTION_PROVIDER === 'fake') {
        ctx.addIssue({
          code: 'custom',
          path: ['TRANSCRIPTION_PROVIDER'],
          message: 'el proveedor simulado no puede usarse en producción',
        });
      }
      if (env.LLM_MODE === 'live' && !env.ANTHROPIC_API_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['ANTHROPIC_API_KEY'],
          message: 'LLM_MODE=live requiere ANTHROPIC_API_KEY',
        });
      }
    })
    .safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${issues}`);
  }
  return result.data;
}
