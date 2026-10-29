import { Module } from '@nestjs/common';
import { AssessmentsModule } from './assessments/assessments.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AppConfigModule } from './config/app-config.js';
import { HealthModule } from './health/health.module.js';
import { InstrumentsModule } from './instruments/instruments.module.js';
import { LoggingModule } from './logging/logging.module.js';
import { ParticipantsModule } from './participants/participants.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PromptsModule } from './prompts/prompts.module.js';
import { QueueModule } from './queue/queue.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    AppConfigModule,
    LoggingModule,
    PrismaModule,
    QueueModule,
    StorageModule,
    AuthModule,
    PromptsModule,
    HealthModule,
    InstrumentsModule,
    ParticipantsModule,
    AssessmentsModule,
  ],
})
export class AppModule {}
