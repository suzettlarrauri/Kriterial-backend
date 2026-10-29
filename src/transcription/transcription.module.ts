import { Module } from '@nestjs/common';
import { AppConfig } from '../config/app-config.js';
import { FakeTranscriptionProvider, TRANSCRIPTION_PROVIDER, type TranscriptionProvider } from './transcription.provider.js';
import { TranscriptionService } from './transcription.service.js';

@Module({
  providers: [
    TranscriptionService,
    {
      provide: TRANSCRIPTION_PROVIDER,
      inject: [AppConfig],
      useFactory: (config: AppConfig): TranscriptionProvider => {
        switch (config.env.TRANSCRIPTION_PROVIDER) {
          case 'fake':
            return new FakeTranscriptionProvider();
        }
      },
    },
  ],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
