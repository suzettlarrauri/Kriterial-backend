import { existsSync } from 'node:fs';

/**
 * Carga .env solo fuera de producción; en producción las variables llegan del
 * entorno de despliegue / secret manager.
 */
export function loadEnvFile(path = '.env'): void {
  if (process.env['NODE_ENV'] === 'production') return;
  if (existsSync(path)) process.loadEnvFile(path);
}
