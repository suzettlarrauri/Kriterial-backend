import { BadRequestException, Controller, Get, Param } from '@nestjs/common';
import { type PublicInstrument, InstrumentsService } from './instruments.service.js';

@Controller('instruments')
export class InstrumentsController {
  constructor(private readonly instruments: InstrumentsService) {}

  @Get(':blockCode/current')
  getCurrent(@Param('blockCode') blockCode: string): Promise<PublicInstrument> {
    if (!/^B[1-5]$/.test(blockCode)) throw new BadRequestException('blockCode inválido');
    return this.instruments.getCurrent(blockCode);
  }
}
