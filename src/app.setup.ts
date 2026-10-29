import type { INestApplication } from '@nestjs/common';
import helmet from 'helmet';
import { AppConfig } from './config/app-config.js';

/** Configuración HTTP compartida por main.ts y las pruebas e2e. */
export function configureApp(app: INestApplication): void {
  const config = app.get(AppConfig);
  app.use(helmet());
  app.enableCors({ origin: config.env.CORS_ORIGINS, credentials: true });
  app.setGlobalPrefix('v1', { exclude: ['health'] });
  app.enableShutdownHooks();
}
