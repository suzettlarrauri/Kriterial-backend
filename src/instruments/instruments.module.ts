import { Module } from '@nestjs/common';
import { InstrumentSeeder } from './instrument-seeder.service.js';
import { InstrumentsController } from './instruments.controller.js';
import { InstrumentsService } from './instruments.service.js';

@Module({
  controllers: [InstrumentsController],
  providers: [InstrumentsService, InstrumentSeeder],
  exports: [InstrumentSeeder],
})
export class InstrumentsModule {}
