import { Module } from '@nestjs/common';
import { ParticipantsModule } from '../participants/participants.module.js';
import { AssessmentsController } from './assessments.controller.js';
import { AssessmentsService } from './assessments.service.js';

@Module({
  imports: [ParticipantsModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService],
})
export class AssessmentsModule {}
