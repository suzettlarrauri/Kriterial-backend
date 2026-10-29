import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PIPELINE_QUEUE, PipelineJob, type TranscribeTurnPayload } from '../queue/queue.constants.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ParticipantsService } from '../participants/participants.service.js';
import { validateAudioUpload, type AudioFormat } from '../media/audio-validation.js';
import { STORAGE, type StorageAdapter } from '../storage/storage.adapter.js';
import { type AnswerInput, type AnswerableQuestion, resolveAnswer } from './answer-rules.js';

const ACTIVE_STATUSES = ['in_progress', 'submitted', 'processing'] as const;

export interface AnswerView {
  likertValue: number | null;
  optionCode: string | null;
  declined: boolean;
}

export interface AudioTurnView {
  questionCode: string;
  turnIndex: number;
  promptText: string;
  transcriptStatus: string;
}

export interface AssessmentView {
  id: string;
  blockCode: string;
  instrumentVersion: string;
  status: string;
  submittedAt: Date | null;
  progress: { answered: number; total: number };
  answers: Record<string, AnswerView>;
  audioTurns: AudioTurnView[];
}

type AnswerState = Pick<AssessmentView, 'answers' | 'audioTurns'>;

type QuestionRow = Prisma.QuestionGetPayload<{ include: { options: true } }>;

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly participants: ParticipantsService,
    @Inject(STORAGE) private readonly storage: StorageAdapter,
    @InjectQueue(PIPELINE_QUEUE) private readonly queue: Queue,
  ) {}

  async create(userId: string, blockCode: string): Promise<AssessmentView> {
    const participant = await this.participants.findByUser(userId);
    if (!participant?.consentAt) {
      throw new ForbiddenException('Debes aceptar el consentimiento antes de iniciar la evaluación');
    }

    const active = await this.prisma.assessment.findFirst({
      where: { participantId: participant.id, blockCode, status: { in: [...ACTIVE_STATUSES] } },
      select: { id: true },
    });
    if (active) {
      throw new ConflictException({
        message: 'Ya tienes una evaluación activa para este bloque',
        assessmentId: active.id,
      });
    }

    const instrument = await this.prisma.instrument.findFirst({
      where: { blockCode, status: 'published' },
    });
    if (!instrument) throw new NotFoundException(`No hay instrumento publicado para ${blockCode}`);

    try {
      const created = await this.prisma.assessment.create({
        data: { participantId: participant.id, instrumentId: instrument.id, blockCode },
      });
      return this.load(created.id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Ya tienes una evaluación activa para este bloque');
      }
      throw error;
    }
  }

  async get(userId: string, assessmentId: string): Promise<AssessmentView> {
    await this.owned(userId, assessmentId);
    return this.load(assessmentId);
  }

  async status(userId: string, assessmentId: string) {
    const assessment = await this.owned(userId, assessmentId);
    const transcriptsPending = await this.prisma.audioTurn.count({
      where: { response: { assessmentId }, transcriptStatus: 'pending' },
    });
    return { id: assessment.id, status: assessment.status, transcriptsPending };
  }

  async answer(
    userId: string,
    assessmentId: string,
    questionCode: string,
    body: AnswerInput,
  ): Promise<AnswerView & { questionCode: string }> {
    const assessment = await this.owned(userId, assessmentId);
    this.assertOpen(assessment.status);
    const question = await this.questionByCode(assessment.instrumentId, questionCode);

    const answerable: AnswerableQuestion = {
      type: question.type,
      optionCodes: question.options.map((o) => o.optionCode),
    };
    let resolved;
    try {
      resolved = resolveAnswer(answerable, body);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }

    if (resolved.declined && question.type === 'AUDIO_ADAPTIVE') {
      const hasAudio = await this.prisma.audioTurn.count({
        where: { response: { assessmentId, questionId: question.id } },
      });
      if (hasAudio > 0) throw new ConflictException('Ya subiste audio para esta pregunta');
    }

    const optionId = resolved.optionCode
      ? question.options.find((o) => o.optionCode === resolved.optionCode)!.id
      : null;

    await this.prisma.response.upsert({
      where: { assessmentId_questionId: { assessmentId, questionId: question.id } },
      create: {
        assessmentId,
        questionId: question.id,
        likertValue: resolved.likertValue,
        optionId,
        declined: resolved.declined,
      },
      update: {
        likertValue: resolved.likertValue,
        optionId,
        declined: resolved.declined,
        answeredAt: new Date(),
      },
    });

    return { questionCode, ...resolved };
  }

  async uploadAudio(
    userId: string,
    assessmentId: string,
    questionCode: string,
    turnIndex: number,
    file: { mimetype: string; buffer: Buffer },
  ): Promise<AudioTurnView> {
    const assessment = await this.owned(userId, assessmentId);
    this.assertOpen(assessment.status);
    const question = await this.questionByCode(assessment.instrumentId, questionCode);
    if (question.type !== 'AUDIO_ADAPTIVE') {
      throw new BadRequestException('Esta pregunta no admite audio');
    }

    const followUps = (question.followUps as string[] | null) ?? [];
    if (turnIndex > followUps.length) {
      throw new BadRequestException(`La pregunta solo tiene ${followUps.length} seguimientos`);
    }

    const response = await this.prisma.response.findUnique({
      where: { assessmentId_questionId: { assessmentId, questionId: question.id } },
      include: { audioTurns: true },
    });
    if (response?.declined) throw new ConflictException('Marcaste esta pregunta como no respondida');
    if (turnIndex > 0 && !response?.audioTurns.some((t) => t.turnIndex === 0 && t.storageKey)) {
      throw new BadRequestException('Primero responde la pregunta principal antes de sus seguimientos');
    }

    const format: AudioFormat = validateAudioUpload(file);
    const key = `audio/${assessmentId}/${randomUUID()}.${format}`;
    await this.storage.put(key, file.buffer);

    const promptText = turnIndex === 0 ? question.text : followUps[turnIndex - 1]!;
    const previous = response?.audioTurns.find((t) => t.turnIndex === turnIndex);

    const turn = await this.prisma.$transaction(async (tx) => {
      const parent = await tx.response.upsert({
        where: { assessmentId_questionId: { assessmentId, questionId: question.id } },
        create: { assessmentId, questionId: question.id, declined: false },
        update: {},
        select: { id: true },
      });
      return tx.audioTurn.upsert({
        where: { responseId_turnIndex: { responseId: parent.id, turnIndex } },
        create: {
          responseId: parent.id,
          turnIndex,
          promptText,
          storageKey: key,
          mimeType: file.mimetype.split(';')[0]!,
          sizeBytes: file.buffer.length,
        },
        update: {
          storageKey: key,
          mimeType: file.mimetype.split(';')[0]!,
          sizeBytes: file.buffer.length,
          transcript: null,
          transcriptionProvider: null,
          transcriptionModel: null,
          transcriptStatus: 'pending',
          qualityFlags: [],
        },
      });
    });

    if (previous?.storageKey) await this.storage.delete(previous.storageKey);
    await this.queue.add(
      PipelineJob.TranscribeTurn,
      { turnId: turn.id } satisfies TranscribeTurnPayload,
      { jobId: `transcribe-${turn.id}-${randomUUID()}` },
    );

    return { questionCode, turnIndex, promptText, transcriptStatus: turn.transcriptStatus };
  }

  async submit(userId: string, assessmentId: string): Promise<AssessmentView> {
    const assessment = await this.owned(userId, assessmentId);
    this.assertOpen(assessment.status);

    const view = await this.load(assessmentId);
    const questions = await this.answerableQuestions(assessment.instrumentId);
    const missing = questions.filter((q) => !this.isComplete(view, q.code)).map((q) => q.code);
    if (missing.length > 0) {
      throw new ConflictException({
        message: 'Faltan respuestas por completar',
        missing: missing.slice(0, 20),
        missingCount: missing.length,
      });
    }

    const pending = await this.prisma.audioTurn.count({
      where: { response: { assessmentId }, transcriptStatus: 'pending' },
    });
    if (pending > 0) {
      throw new ConflictException({
        message: 'Hay audios pendientes de transcribir; intenta de nuevo en unos minutos',
        transcriptsPending: pending,
      });
    }

    const result = await this.prisma.assessment.updateMany({
      where: { id: assessmentId, status: 'in_progress' },
      data: { status: 'submitted', submittedAt: new Date() },
    });
    if (result.count === 0) throw new ConflictException('La evaluación ya fue enviada');

    return this.load(assessmentId);
  }

  private async owned(userId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, participant: { userId } },
    });
    if (!assessment) throw new NotFoundException('Evaluación no encontrada');
    return assessment;
  }

  private assertOpen(status: string): void {
    if (status !== 'in_progress') throw new ConflictException('La evaluación ya fue enviada');
  }

  private async questionByCode(instrumentId: string, code: string): Promise<QuestionRow> {
    const question = await this.prisma.question.findUnique({
      where: { instrumentId_code: { instrumentId, code } },
      include: { options: true },
    });
    if (!question) throw new NotFoundException(`Pregunta ${code} no encontrada`);
    return question;
  }

  private answerableQuestions(instrumentId: string) {
    return this.prisma.question.findMany({
      where: { instrumentId, NOT: { type: 'PAUSE' } },
      select: { id: true, code: true, type: true },
      orderBy: { position: 'asc' },
    });
  }

  private isComplete(state: AnswerState, code: string): boolean {
    const answer = state.answers[code];
    if (!answer) return false;
    if (answer.declined) return true;
    if (answer.likertValue !== null || answer.optionCode !== null) return true;
    return state.audioTurns.some((t) => t.questionCode === code && t.turnIndex === 0);
  }

  /** Vista completa, reconstruida desde la base de datos (sirve también para reanudar). */
  private async load(assessmentId: string): Promise<AssessmentView> {
    const assessment = await this.prisma.assessment.findUniqueOrThrow({
      where: { id: assessmentId },
      include: { instrument: true },
    });
    const questions = await this.prisma.question.findMany({
      where: { instrumentId: assessment.instrumentId, NOT: { type: 'PAUSE' } },
      select: { id: true, code: true },
    });
    const responses = await this.prisma.response.findMany({
      where: { assessmentId },
      include: {
        question: { select: { code: true } },
        option: { select: { optionCode: true } },
        audioTurns: true,
      },
    });

    const state: AnswerState = { answers: {}, audioTurns: [] };
    for (const r of responses) {
      state.answers[r.question.code] = {
        likertValue: r.likertValue,
        optionCode: r.option?.optionCode ?? null,
        declined: r.declined,
      };
      for (const t of r.audioTurns) {
        state.audioTurns.push({
          questionCode: r.question.code,
          turnIndex: t.turnIndex,
          promptText: t.promptText,
          transcriptStatus: t.transcriptStatus,
        });
      }
    }
    state.audioTurns.sort((a, b) => a.questionCode.localeCompare(b.questionCode) || a.turnIndex - b.turnIndex);

    const answered = questions.filter((q) => this.isComplete(state, q.code)).length;

    return {
      id: assessment.id,
      blockCode: assessment.blockCode,
      instrumentVersion: assessment.instrument.version,
      status: assessment.status,
      submittedAt: assessment.submittedAt,
      progress: { answered, total: questions.length },
      answers: state.answers,
      audioTurns: state.audioTurns,
    };
  }
}
