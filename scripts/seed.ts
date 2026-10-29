/** Siembra en la base de datos todos los seeds de instruments/seeds/ (idempotente). */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvFile } from '../src/config/load-env-file.js';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { AppConfigModule } from '../src/config/app-config.js';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { InstrumentSeeder } from '../src/instruments/instrument-seeder.service.js';

loadEnvFile();


@Module({ imports: [AppConfigModule, PrismaModule], providers: [InstrumentSeeder] })
class SeedModule {}

const app = await NestFactory.createApplicationContext(SeedModule, { logger: ['log', 'error'] });
try {
  const seeder = app.get(InstrumentSeeder);
  const dir = 'instruments/seeds';
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const outcome = await seeder.seed(JSON.parse(readFileSync(join(dir, file), 'utf8')));
    console.log(`${file}: ${outcome}`);
  }
} finally {
  await app.close();
}
