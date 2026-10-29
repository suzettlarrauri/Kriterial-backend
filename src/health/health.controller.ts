import { InjectQueue } from '@nestjs/bullmq';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Public } from '../auth/auth.decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PIPELINE_QUEUE } from '../queue/queue.constants.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(PIPELINE_QUEUE) private readonly queue: Queue,
  ) {}

  @Public()
  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => 'up' as const, () => 'down' as const),
      withTimeout(this.queue.getJobCounts('waiting')).then(() => 'up' as const, () => 'down' as const),
    ]);
    const body = { status: database === 'up' && redis === 'up' ? 'ok' : 'error', database, redis };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}

function withTimeout<T>(promise: Promise<T>, ms = 2_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms).unref()),
  ]);
}
