import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { useTestDatabase } from './e2e-env.js';

/** Crea (si falta) y migra la base de datos de pruebas, y la deja vacía. */
export default async function setup(): Promise<void> {
  const testUrl = useTestDatabase();
  const admin = new URL(testUrl);
  admin.pathname = '/postgres';

  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = 'kriterial_test'");
  if (!rowCount) await client.query('CREATE DATABASE kriterial_test');
  await client.end();

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: testUrl },
    stdio: 'pipe',
  });

  const db = new pg.Client({ connectionString: testUrl });
  await db.connect();
  await db.query(`TRUNCATE audio_turns, responses, assessments, question_options, questions, facets,
                  instruments, scales, prompt_bundles, participants, users, audit_log RESTART IDENTITY CASCADE`);
  await db.end();
}
