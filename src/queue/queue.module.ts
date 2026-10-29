import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { PIPELINE_QUEUE } from './queue.constants.js';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfig],
      useFactory: (config: AppConfig) => ({
        connection: { url: config.env.REDIS_URL, maxRetriesPerRequest: null },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5_000 },
          removeOnComplete: { age: 7 * 24 * 3600 },
          removeOnFail: false,
        },
      }),
    }),
    BullModule.registerQueue({ name: PIPELINE_QUEUE }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
