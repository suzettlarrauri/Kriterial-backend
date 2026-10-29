import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { AppConfigModule } from './config/app-config.js';
import { HealthModule } from './health/health.module.js';
import { InstrumentsModule } from './instruments/instruments.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PromptsModule } from './prompts/prompts.module.js';
import { QueueModule } from './queue/queue.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    QueueModule,
    AuthModule,
    PromptsModule,
    HealthModule,
    InstrumentsModule,
  ],
})
export class AppModule {}
