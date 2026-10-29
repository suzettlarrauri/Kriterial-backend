import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { ParticipantsService } from '../participants/participants.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PIPELINE_QUEUE, PipelineJob, type TranscribeTurnPayload } from '../queue/queue.constants.js';
import { type AudioFormat, validateAudioUpload } from '../media/audio-validation.js';
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
type Db = Prisma.TransactionClient;

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

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
    const question = await this.questionByCode(assessment.instrumentId, questionCode);
    const resolved = this.resolve(question, body);
    const optionId = resolved.optionCode
      ? question.options.find((o) => o.optionCode === resolved.optionCode)!.id
      : null;

    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, assessmentId);
      await this.assertOpen(tx, assessmentId);

      if (resolved.declined && question.type === 'AUDIO_ADAPTIVE') {
        const hasAudio = await tx.audioTurn.count({
          where: { response: { assessmentId, questionId: question.id } },
        });
        if (hasAudio > 0) throw new ConflictException('Ya subiste audio para esta pregunta');
      }

      await tx.response.upsert({
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
    const question = await this.questionByCode(assessment.instrumentId, questionCode);
    if (question.type !== 'AUDIO_ADAPTIVE') {
      throw new BadRequestException('Esta pregunta no admite audio');
    }

    const followUps = (question.followUps as string[] | null) ?? [];
    if (turnIndex > followUps.length) {
      throw new BadRequestException(`La pregunta solo tiene ${followUps.length} seguimientos`);
    }

    const format: AudioFormat = validateAudioUpload(file);
    const key = `audio/${assessmentId}/${randomUUID()}.${format}`;
    const mimeType = file.mimetype.split(';')[0]!.trim().toLowerCase();
    const promptText = turnIndex === 0 ? question.text : followUps[turnIndex - 1]!;

    await this.storage.put(key, file.buffer);
    let turn: { id: string; transcriptStatus: string };
    let previousKey: string | null;
    try {
      ({ turn, previousKey } = await this.prisma.$transaction(async (tx) => {
        await this.lock(tx, assessmentId);
        await this.assertOpen(tx, assessmentId);

        const response = await tx.response.findUnique({
          where: { assessmentId_questionId: { assessmentId, questionId: question.id } },
          include: { audioTurns: true },
        });
        if (response?.declined) throw new ConflictException('Marcaste esta pregunta como no respondida');
        if (turnIndex > 0 && !response?.audioTurns.some((t) => t.turnIndex === 0 && t.storageKey)) {
          throw new BadRequestException('Primero responde la pregunta principal antes de sus seguimientos');
        }
        const previous = response?.audioTurns.find((t) => t.turnIndex === turnIndex);

        const parent = await tx.response.upsert({
          where: { assessmentId_questionId: { assessmentId, questionId: question.id } },
          create: { assessmentId, questionId: question.id, declined: false },
          update: {},
          select: { id: true },
        });
        const saved = await tx.audioTurn.upsert({
          where: { responseId_turnIndex: { responseId: parent.id, turnIndex } },
          create: {
            responseId: parent.id,
            turnIndex,
            promptText,
            storageKey: key,
            mimeType,
            sizeBytes: file.buffer.length,
          },
          update: {
            promptText,
            storageKey: key,
            mimeType,
            sizeBytes: file.buffer.length,
            transcript: null,
            transcriptionProvider: null,
            transcriptionModel: null,
            transcriptStatus: 'pending',
            qualityFlags: [],
          },
        });
        return { turn: saved, previousKey: previous?.storageKey ?? null };
      }));
    } catch (error) {
      // La transacción no se confirmó: el archivo nuevo no debe quedar huérfano.
      await this.deleteQuietly(key);
      throw error;
    }

    if (previousKey) await this.deleteQuietly(previousKey);
    await this.queue.add(
      PipelineJob.TranscribeTurn,
      { turnId: turn.id } satisfies TranscribeTurnPayload,
      { jobId: `transcribe-${turn.id}-${randomUUID()}` },
    );

    return { questionCode, turnIndex, promptText, transcriptStatus: turn.transcriptStatus };
  }

  async submit(userId: string, assessmentId: string): Promise<AssessmentView> {
    const assessment = await this.owned(userId, assessmentId);

    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, assessmentId);
      await this.assertOpen(tx, assessmentId);

      const state = await this.load(assessmentId, tx);
      const questions = await tx.question.findMany({
        where: { instrumentId: assessment.instrumentId, NOT: { type: 'PAUSE' } },
        select: { code: true },
        orderBy: { position: 'asc' },
      });
      const missing = questions.filter((q) => !this.isComplete(state, q.code)).map((q) => q.code);
      if (missing.length > 0) {
        throw new ConflictException({
          message: 'Faltan respuestas por completar',
          missing: missing.slice(0, 20),
          missingCount: missing.length,
        });
      }

      const pending = await tx.audioTurn.count({
        where: { response: { assessmentId }, transcriptStatus: 'pending' },
      });
      if (pending > 0) {
        throw new ConflictException({
          message: 'Hay audios pendientes de transcribir; intenta de nuevo en unos minutos',
          transcriptsPending: pending,
        });
      }

      await tx.assessment.update({
        where: { id: assessmentId },
        data: { status: 'submitted', submittedAt: new Date() },
      });
      return this.load(assessmentId, tx);
    });
  }

  private async owned(userId: string, assessmentId: string) {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, participant: { userId } },
    });
    if (!assessment) throw new NotFoundException('Evaluación no encontrada');
    return assessment;
  }

  /** Serializa las operaciones de una evaluación: envío, subidas y respuestas no pueden intercalarse. */
  private async lock(tx: Db, assessmentId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM assessments WHERE id = ${assessmentId}::uuid FOR UPDATE`;
  }

  private async assertOpen(tx: Db, assessmentId: string): Promise<void> {
    const { status } = await tx.assessment.findUniqueOrThrow({
      where: { id: assessmentId },
      select: { status: true },
    });
    if (status !== 'in_progress') throw new ConflictException('La evaluación ya fue enviada');
  }

  private resolve(question: QuestionRow, body: AnswerInput) {
    const answerable: AnswerableQuestion = {
      type: question.type,
      optionCodes: question.options.map((o) => o.optionCode),
    };
    try {
      return resolveAnswer(answerable, body);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  private async questionByCode(instrumentId: string, code: string): Promise<QuestionRow> {
    const question = await this.prisma.question.findUnique({
      where: { instrumentId_code: { instrumentId, code } },
      include: { options: true },
    });
    if (!question) throw new NotFoundException(`Pregunta ${code} no encontrada`);
    return question;
  }

  private isComplete(state: AnswerState, code: string): boolean {
    const answer = state.answers[code];
    if (!answer) return false;
    if (answer.declined) return true;
    if (answer.likertValue !== null || answer.optionCode !== null) return true;
    return state.audioTurns.some((t) => t.questionCode === code && t.turnIndex === 0);
  }

  private async deleteQuietly(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch (error) {
      this.logger.warn(`No se pudo borrar el archivo ${key}: ${(error as Error).message}`);
    }
  }

  /** Vista completa, reconstruida desde la base de datos (sirve también para reanudar). */
  private async load(assessmentId: string, db: Db = this.prisma): Promise<AssessmentView> {
    const assessment = await db.assessment.findUniqueOrThrow({
      where: { id: assessmentId },
      include: { instrument: true },
    });
    const questions = await db.question.findMany({
      where: { instrumentId: assessment.instrumentId, NOT: { type: 'PAUSE' } },
      select: { id: true, code: true },
    });
    const responses = await db.response.findMany({
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
