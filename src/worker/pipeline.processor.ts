import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import {
  PIPELINE_QUEUE,
  PipelineJob,
  type TranscribeTurnPayload,
} from '../queue/queue.constants.js';
import { TranscriptionService } from '../transcription/transcription.service.js';

@Processor(PIPELINE_QUEUE)
export class PipelineProcessor extends WorkerHost {
  private readonly logger = new Logger(PipelineProcessor.name);

  constructor(private readonly transcription: TranscriptionService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case PipelineJob.Ping:
        this.logger.log(`ping ${job.id}`);
        return { ok: true, at: new Date().toISOString() };
      case PipelineJob.TranscribeTurn: {
        const { turnId } = job.data as TranscribeTurnPayload;
        await this.transcription.transcribeTurn(turnId);
        return { turnId };
      }
      default:
        // Un trabajo desconocido no se reintenta: es un error de programación.
        throw new UnrecoverableError(`Trabajo desconocido: ${job.name}`);
    }
  }
}
