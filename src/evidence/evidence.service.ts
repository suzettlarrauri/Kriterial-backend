import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { canonicalJson, sha256 } from '../common/canonical-json.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildPatternInput } from './build-pattern-input.js';
import { type AnswerSet, type FacetMeta, patternInputSchema, type PatternInput, type QuestionMeta } from './evidence.types.js';

const ANALYZABLE_STATUSES = ['submitted', 'processing', 'completed'];
const polaritySchema = z.union([z.literal(1), z.literal(-1), z.null()]);
const anchorsSchema = z.array(z.string()).nullable();

export interface PatternInputResult {
  input: PatternInput;
  /** SHA-256 de la forma canónica: identifica exactamente qué se le dará al Pattern Engine. */
  inputHash: string;
}

/** Construye el PATTERN_INPUT de una evaluación enviada a partir de la base de datos. */
@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService) {}

  async buildForAssessment(assessmentId: string): Promise<PatternInputResult> {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: { instrument: true },
    });
    if (!assessment) throw new NotFoundException('Evaluación no encontrada');
    if (!ANALYZABLE_STATUSES.includes(assessment.status)) {
      throw new ConflictException('Solo se analizan evaluaciones enviadas');
    }

    const instrumentId = assessment.instrumentId;
    const [facets, questions, responses] = await Promise.all([
      this.prisma.facet.findMany({ where: { instrumentId }, orderBy: { code: 'asc' } }),
      this.prisma.question.findMany({
        where: { instrumentId },
        orderBy: { position: 'asc' },
        include: { facet: { select: { code: true } }, scale: { select: { anchors: true } }, options: { orderBy: { position: 'asc' } } },
      }),
      this.prisma.response.findMany({
        where: { assessmentId },
        include: {
          question: { select: { code: true } },
          option: { select: { optionCode: true } },
          audioTurns: { orderBy: { turnIndex: 'asc' } },
        },
      }),
    ]);

    const facetMeta: FacetMeta[] = facets.map((f) => ({ code: f.code, domain: f.domain }));
    const questionMeta: QuestionMeta[] = questions.map((q) => ({
      code: q.code,
      type: q.type,
      text: q.text,
      domain: q.domain,
      facetCode: q.facet?.code ?? null,
      anchors: anchorsSchema.parse(q.scale?.anchors ?? null),
      options: q.options.map((o) => ({ code: o.optionCode, text: o.text })),
      polarity: polaritySchema.parse(q.polarity ?? null),
      evidencePreserves: q.evidencePreserves,
      inferenceLimit: q.inferenceLimit,
    }));
    const answerSet: AnswerSet = {
      answers: Object.fromEntries(
        responses.map((r) => [
          r.question.code,
          { likertValue: r.likertValue, optionCode: r.option?.optionCode ?? null, declined: r.declined },
        ]),
      ),
      audioTurns: responses.flatMap((r) =>
        r.audioTurns.map((t) => ({
          questionCode: r.question.code,
          turnIndex: t.turnIndex,
          promptText: t.promptText,
          transcript: t.transcript,
          transcriptStatus: t.transcriptStatus,
        })),
      ),
    };

    const input = patternInputSchema.parse(
      buildPatternInput({
        instrumentVersion: assessment.instrument.version,
        facets: facetMeta,
        questions: questionMeta,
        responses: answerSet,
      }),
    );
    return { input, inputHash: sha256(canonicalJson(input)) };
  }
}
