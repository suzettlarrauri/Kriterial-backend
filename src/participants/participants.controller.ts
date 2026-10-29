import { Body, Controller, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { parseOrThrow } from '../common/parse.js';
import { ParticipantsService, type ParticipantView } from './participants.service.js';
import { type UpdateParticipantInput, updateParticipantSchema } from './participants.schema.js';

@Controller('participants')
export class ParticipantsController {
  constructor(private readonly participants: ParticipantsService) {}

  @Put('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<ParticipantView> {
    const input: UpdateParticipantInput = parseOrThrow(updateParticipantSchema, body);
    return this.participants.updateMine(user.userId, input);
  }
}
