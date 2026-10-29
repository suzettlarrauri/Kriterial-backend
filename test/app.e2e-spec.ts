import { readFileSync } from 'node:fs';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { TokenService } from '../src/auth/token.service.js';
import { InstrumentSeeder } from '../src/instruments/instrument-seeder.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { PromptRegistry } from '../src/prompts/prompt-registry.service.js';

const seedFile = (name: string) => JSON.parse(readFileSync(`instruments/seeds/${name}`, 'utf8'));

describe('Kriterial API F1 (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();

    const seeder = app.get(InstrumentSeeder);
    await seeder.seed(seedFile('b1@0.9.json'));
    await seeder.seed(seedFile('b1@1.0.json'));

    const user = await app.get(PrismaService).user.create({
      data: { email: 'e2e@kriterial.local', role: 'candidate' },
    });
    token = await app.get(TokenService).sign({ sub: user.id, role: user.role });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health es público e informa base de datos y Redis', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'up', redis: 'up' });
  });

  it('exige token en rutas no públicas', async () => {
    await request(app.getHttpServer()).get('/v1/instruments/B1/current').expect(401);
    await request(app.getHttpServer())
      .get('/v1/instruments/B1/current')
      .set('Authorization', 'Bearer no-es-un-jwt')
      .expect(401);
  });

  it('devuelve la versión publicada de B1 con sus 62 ítems y sin metadatos internos', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/instruments/B1/current')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.version).toBe('1.0');
    expect(res.body.questions).toHaveLength(62);
    const counts = Object.groupBy(res.body.questions as { type: string }[], (q) => q.type);
    expect(counts['LIKERT_5']).toHaveLength(40);
    expect(counts['SCENARIO_SINGLE_CHOICE']).toHaveLength(8);
    expect(counts['AUDIO_ADAPTIVE']).toHaveLength(8);
    expect(counts['PAUSE']).toHaveLength(6);

    for (const q of res.body.questions) {
      for (const hidden of ['domain', 'facet', 'facetCode', 'polarity', 'evidencePreserves', 'inferenceLimit']) {
        expect(q).not.toHaveProperty(hidden);
      }
    }
    const likert = res.body.questions.find((q: { code: string }) => q.code === 'RESP-C01A');
    expect(likert.scale.anchors).toEqual(['Nunca', 'Rara vez', 'A veces', 'A menudo', 'Casi siempre']);
    const scenario = res.body.questions.find((q: { code: string }) => q.code === 'RESP-C04B');
    expect(scenario.options.map((o: { code: string }) => o.code)).toEqual(['OPT_A', 'OPT_B', 'OPT_C', 'OPT_D']);
  });

  it('valida blockCode y responde 404 si no hay versión publicada', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    await request(app.getHttpServer()).get('/v1/instruments/B9/current').set(auth).expect(400);
    await request(app.getHttpServer()).get('/v1/instruments/B2/current').set(auth).expect(404);
  });

  it('el seed es idempotente y rechaza modificar una versión existente', async () => {
    const seeder = app.get(InstrumentSeeder);
    await expect(seeder.seed(seedFile('b1@1.0.json'))).resolves.toBe('unchanged');

    const altered = seedFile('b1@1.0.json');
    altered.questions[1].text += ' (editado)';
    await expect(seeder.seed(altered)).rejects.toThrow(/inmutables/);
  });

  it('solo puede haber un instrumento publicado por bloque', async () => {
    const draft = { ...seedFile('b1@1.0.json'), version: '9.9', status: 'published' };
    await expect(app.get(InstrumentSeeder).seed(draft)).rejects.toThrow();
  });

  it('registra bundles de prompts de forma idempotente', async () => {
    const registry = app.get(PromptRegistry);
    const first = await registry.registerBundle('B1.PATTERN');
    const second = await registry.registerBundle('B1.PATTERN');
    expect(second.id).toBe(first.id);
    expect(first.bundleHash).toBe(registry.compose('B1.PATTERN').bundleHash);
  });
});
