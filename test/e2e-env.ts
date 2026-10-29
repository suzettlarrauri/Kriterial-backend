import { loadEnvFile } from '../src/config/load-env-file.js';

/** Las pruebas e2e usan una base de datos propia, derivada de DATABASE_URL. */
export function useTestDatabase(): string {
  loadEnvFile();
  const url = new URL(process.env['DATABASE_URL']!);
  url.pathname = '/kriterial_test';
  process.env['DATABASE_URL'] = url.toString();
  process.env['NODE_ENV'] = 'test';
  process.env['LOG_LEVEL'] = 'silent';
  return url.toString();
}
