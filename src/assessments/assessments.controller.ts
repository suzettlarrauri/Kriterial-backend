import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { parseOrThrow } from '../common/parse.js';
import { MAX_AUDIO_BYTES } from '../media/audio-validation.js';
import { type AnswerInput, answerBodySchema } from './answer-rules.js';
import { AssessmentsService } from './assessments.service.js';

const createSchema = z.object({ blockCode: z.enum(['B1']) }).strict();
const audioFormSchema = z.object({ turnIndex: z.coerce.number().int().min(0).max(20) });

interface UploadedAudio {
  mimetype: string;
  buffer: Buffer;
}

@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly assessments: AssessmentsService) {}

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const { blockCode } = parseOrThrow(createSchema, body);
    return this.assessments.create(user.userId, blockCode);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.get(user.userId, id);
  }

  @Get(':id/status')
  status(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.status(user.userId, id);
  }

  @Put(':id/responses/:questionCode')
  answer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionCode') questionCode: string,
    @Body() body: unknown,
  ) {
    const input: AnswerInput = parseOrThrow(answerBodySchema, body);
    return this.assessments.answer(user.userId, id, questionCode, input);
  }

  @Post(':id/responses/:questionCode/audio')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } }))
  uploadAudio(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('questionCode') questionCode: string,
    @UploadedFile() file: UploadedAudio | undefined,
    @Body() body: unknown,
  ) {
    if (!file) throw new BadRequestException('Falta el archivo de audio (campo "file")');
    const { turnIndex } = parseOrThrow(audioFormSchema, body);
    return this.assessments.uploadAudio(user.userId, id, questionCode, turnIndex, file);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.assessments.submit(user.userId, id);
  }
}
