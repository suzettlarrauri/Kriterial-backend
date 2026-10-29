import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { TokenService } from '../src/auth/token.service.js';
import { InstrumentSeeder } from '../src/instruments/instrument-seeder.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { TranscriptionModule } from '../src/transcription/transcription.module.js';
import { TranscriptionService } from '../src/transcription/transcription.service.js';

const seedFile = (name: string) => JSON.parse(readFileSync(`instruments/seeds/${name}`, 'utf8'));
const WEBM = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(256, 1)]);

describe('Kriterial F2 · captura de la evaluación B1 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storageRoot: string;
  let owner: string;
  let other: string;
  let assessmentId: string;
  let published: {
    questions: {
      code: string;
      type: string;
      text: string;
      followUps: string[] | null;
      options: { code: string }[];
    }[];
  };

  const api = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const byType = (type: string) => published.questions.filter((q) => q.type === type);

  beforeAll(async () => {
    storageRoot = mkdtempSync(join(tmpdir(), 'kriterial-f2-'));
    process.env['STORAGE_DIR'] = storageRoot;

    // El worker de transcripción no forma parte de la API; se incluye aquí para simular su trabajo.
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, TranscriptionModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    prisma = app.get(PrismaService);
    const seeder = app.get(InstrumentSeeder);
    await seeder.seed(seedFile('b1@0.9.json'));
    await seeder.seed(seedFile('b1@1.0.json'));

    const tokens = app.get(TokenService);
    const a = await prisma.user.create({ data: { email: 'f2-owner@kriterial.local' } });
    const b = await prisma.user.create({ data: { email: 'f2-other@kriterial.local' } });
    owner = await tokens.sign({ sub: a.id, role: a.role });
    other = await tokens.sign({ sub: b.id, role: b.role });

    published = (await api().get('/v1/instruments/B1/current').set(as(owner))).body;
  });

  afterAll(async () => {
    await app.close();
    rmSync(storageRoot, { recursive: true, force: true });
  });

  it('registra el perfil del participante', async () => {
    const res = await api()
      .put('/v1/participants/me')
      .set(as(owner))
      .send({ grammaticalForm: 'feminine', displayName: 'Prueba' })
      .expect(200);
    expect(res.body).toMatchObject({ grammaticalForm: 'feminine', displayName: 'Prueba', consentAt: null });

    await api().put('/v1/participants/me').set(as(owner)).send({ rol: 'admin' }).expect(400);
  });

  it('no crea la evaluación sin consentimiento', async () => {
    await api().post('/v1/assessments').set(as(owner)).send({ blockCode: 'B1' }).expect(403);
  });

  it('registra el consentimiento y crea la evaluación con 56 preguntas respondibles', async () => {
    const consent = await api()
      .put('/v1/participants/me')
      .set(as(owner))
      .send({ consentVersion: 'borrador-D7' })
      .expect(200);
    expect(consent.body.consentAt).not.toBeNull();

    const res = await api().post('/v1/assessments').set(as(owner)).send({ blockCode: 'B1' }).expect(201);
    assessmentId = res.body.id;
    expect(res.body).toMatchObject({
      status: 'in_progress',
      instrumentVersion: '1.0',
      progress: { answered: 0, total: 56 },
    });
  });

  it('permite una sola evaluación activa por bloque', async () => {
    const res = await api().post('/v1/assessments').set(as(owner)).send({ blockCode: 'B1' }).expect(409);
    expect(res.body.assessmentId).toBe(assessmentId);
    await api().post('/v1/assessments').set(as(owner)).send({ blockCode: 'B9' }).expect(400);
  });

  it('valida cada respuesta según el tipo de pregunta', async () => {
    const likert = byType('LIKERT_5')[0]!.code;
    const scenario = byType('SCENARIO_SINGLE_CHOICE')[0]!.code;
    const pause = byType('PAUSE')[0]!.code;
    const url = (code: string) => `/v1/assessments/${assessmentId}/responses/${code}`;

    await api().put(url(likert)).set(as(owner)).send({ likertValue: 6 }).expect(400);
    await api().put(url(likert)).set(as(owner)).send({ optionCode: 'OPT_A' }).expect(400);
    await api().put(url(scenario)).set(as(owner)).send({ optionCode: 'OPT_Z' }).expect(400);
    await api().put(url(pause)).set(as(owner)).send({ declined: true }).expect(400);
    await api().put(url('NO-EXISTE')).set(as(owner)).send({ declined: true }).expect(404);
  });

  it('guarda las respuestas de forma idempotente y las reanuda desde el servidor', async () => {
    const code = byType('LIKERT_5')[0]!.code;
    const url = `/v1/assessments/${assessmentId}/responses/${code}`;
    await api().put(url).set(as(owner)).send({ likertValue: 2 }).expect(200);
    await api().put(url).set(as(owner)).send({ likertValue: 4 }).expect(200);

    const res = await api().get(`/v1/assessments/${assessmentId}`).set(as(owner)).expect(200);
    expect(res.body.answers[code]).toEqual({ likertValue: 4, optionCode: null, declined: false });
    expect(res.body.progress.answered).toBe(1);
  });

  it('no permite enviar mientras falten respuestas', async () => {
    const res = await api().post(`/v1/assessments/${assessmentId}/submit`).set(as(owner)).expect(409);
    expect(res.body.missingCount).toBe(55);
  });

  it('acepta audios válidos, rechaza los inválidos y registra seguimientos en orden', async () => {
    const [mainAudio, secondAudio] = byType('AUDIO_ADAPTIVE');
    const upload = (code: string, turnIndex: number, buffer: Buffer, mimetype = 'audio/webm') =>
      api()
        .post(`/v1/assessments/${assessmentId}/responses/${code}/audio`)
        .set(as(owner))
        .field('turnIndex', String(turnIndex))
        .attach('file', buffer, { filename: 'relato.webm', contentType: mimetype });

    await upload(secondAudio!.code, 1, WEBM).expect(400);
    await upload(mainAudio!.code, 0, Buffer.from('esto no es audio')).expect(400);
    await upload(mainAudio!.code, 0, WEBM, 'application/pdf').expect(400);

    const main = await upload(mainAudio!.code, 0, WEBM, 'audio/webm;codecs=opus').expect(201);
    expect(main.body).toMatchObject({ turnIndex: 0, transcriptStatus: 'pending', promptText: mainAudio!.text });

    const follow = await upload(mainAudio!.code, 1, WEBM).expect(201);
    expect(follow.body.promptText).toBe(mainAudio!.followUps![0]);

    await upload(mainAudio!.code, 99, WEBM).expect(400);
  });

  it('completa el resto de preguntas y registra el audio de cada una', async () => {
    for (const q of byType('LIKERT_5').slice(1)) {
      await api()
        .put(`/v1/assessments/${assessmentId}/responses/${q.code}`)
        .set(as(owner))
        .send({ likertValue: 3 })
        .expect(200);
    }
    for (const q of byType('SCENARIO_SINGLE_CHOICE')) {
      await api()
        .put(`/v1/assessments/${assessmentId}/responses/${q.code}`)
        .set(as(owner))
        .send({ optionCode: q.options[0]!.code })
        .expect(200);
    }
    for (const q of byType('AUDIO_ADAPTIVE').slice(1)) {
      await api()
        .post(`/v1/assessments/${assessmentId}/responses/${q.code}/audio`)
        .set(as(owner))
        .field('turnIndex', '0')
        .attach('file', WEBM, { filename: 'relato.webm', contentType: 'audio/webm' })
        .expect(201);
    }
  }, 60_000);

  it('bloquea el envío mientras haya transcripciones pendientes', async () => {
    const res = await api().post(`/v1/assessments/${assessmentId}/submit`).set(as(owner)).expect(409);
    expect(res.body.transcriptsPending).toBe(9);
  });

  it('transcribe los turnos pendientes (lo hace el worker en producción) y permite el envío', async () => {
    const transcription = app.get(TranscriptionService, { strict: false });
    const pending = await prisma.audioTurn.findMany({ where: { transcriptStatus: 'pending' } });
    for (const turn of pending) await transcription.transcribeTurn(turn.id);

    const status = await api().get(`/v1/assessments/${assessmentId}/status`).set(as(owner)).expect(200);
    expect(status.body.transcriptsPending).toBe(0);

    const submitted = await api().post(`/v1/assessments/${assessmentId}/submit`).set(as(owner)).expect(201);
    expect(submitted.body).toMatchObject({
      status: 'submitted',
      progress: { answered: 56, total: 56 },
    });
    expect(submitted.body.submittedAt).not.toBeNull();
  });

  it('una evaluación enviada ya no admite cambios', async () => {
    const code = byType('LIKERT_5')[0]!.code;
    await api()
      .put(`/v1/assessments/${assessmentId}/responses/${code}`)
      .set(as(owner))
      .send({ likertValue: 1 })
      .expect(409);
    await api()
      .post(`/v1/assessments/${assessmentId}/responses/${byType('AUDIO_ADAPTIVE')[0]!.code}/audio`)
      .set(as(owner))
      .field('turnIndex', '0')
      .attach('file', WEBM, { filename: 'x.webm', contentType: 'audio/webm' })
      .expect(409);
    await api().post(`/v1/assessments/${assessmentId}/submit`).set(as(owner)).expect(409);
  });

  it('aísla las evaluaciones entre participantes', async () => {
    const url = `/v1/assessments/${assessmentId}`;
    await api().get(url).set(as(other)).expect(404);
    await api().get(`${url}/status`).set(as(other)).expect(404);
    await api()
      .put(`${url}/responses/${byType('LIKERT_5')[0]!.code}`)
      .set(as(other))
      .send({ likertValue: 1 })
      .expect(404);
  });
});
