import { Module } from '@nestjs/common';
import { AppConfigModule } from '../config/app-config.js';
import { LoggingModule } from '../logging/logging.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { PromptsModule } from '../prompts/prompts.module.js';
import { QueueModule } from '../queue/queue.module.js';
import { PipelineProcessor } from './pipeline.processor.js';

@Module({
  imports: [AppConfigModule, LoggingModule, PrismaModule, QueueModule, PromptsModule],
  providers: [PipelineProcessor],
})
export class WorkerModule {}
