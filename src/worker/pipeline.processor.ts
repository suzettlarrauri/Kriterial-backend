import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job, UnrecoverableError } from 'bullmq';
import { PIPELINE_QUEUE, PipelineJob } from '../queue/queue.constants.js';

@Processor(PIPELINE_QUEUE)
export class PipelineProcessor extends WorkerHost {
  private readonly logger = new Logger(PipelineProcessor.name);

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case PipelineJob.Ping:
        this.logger.log(`ping ${job.id}`);
        return { ok: true, at: new Date().toISOString() };
      default:
        // Un trabajo desconocido no se reintenta: es un error de programación.
        throw new UnrecoverableError(`Trabajo desconocido: ${job.name}`);
    }
  }
}
