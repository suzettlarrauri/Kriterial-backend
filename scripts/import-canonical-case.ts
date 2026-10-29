/**
 * Convierte la exportación del caso canónico (respuestas originales del reporte de referencia)
 * en un fixture de respuestas con la misma forma que guarda la captura (F2).
 *
 *   npm run fixtures:canonical [ruta-a-la-exportacion.md]
 *
 * Salida: test/fixtures/private/canonical-b1.json. Esa carpeta está ignorada por git: son respuestas
 * de una persona real y su uso como caso de prueba está pendiente de consentimiento (D1).
 * El script se detiene si algún elemento no coincide con el instrumento b1@0.9.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const SOURCE = process.argv[2] ?? '../old-sistem/Pasted markdown(2).md';
const OUT = 'test/fixtures/private/canonical-b1.json';
const EXPECTED_ITEMS = 56;

interface SeedQuestion {
  code: string;
  type: string;
  text: string;
  options: { code: string; text: string }[];
}

const seed = JSON.parse(readFileSync('instruments/seeds/b1@0.9.json', 'utf8')) as { questions: SeedQuestion[] };
const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, ' ').trim();
const byType = (type: string) => seed.questions.filter((q) => q.type === type);
const likert = new Map(byType('LIKERT_5').map((q) => [norm(q.text), q.code]));
const scenarios = byType('SCENARIO_SINGLE_CHOICE');
const audios = byType('AUDIO_ADAPTIVE');

const answers: Record<string, { likertValue: number | null; optionCode: string | null; declined: boolean }> = {};
const audioTurns: {
  questionCode: string;
  turnIndex: number;
  promptText: string;
  transcript: string;
  transcriptStatus: 'ok';
}[] = [];
const unmapped: string[] = [];

let lastStatement = '';
let lastPrompt = '';

for (const raw of readFileSync(SOURCE, 'utf8').split('\n')) {
  const line = raw.trim();
  if (!line) continue;

  const score = /^\*\*\((\d)\/5\)\*\*/.exec(line);
  if (score) {
    const code = likert.get(norm(lastStatement));
    if (code) answers[code] = { likertValue: Number(score[1]), optionCode: null, declined: false };
    else unmapped.push(`escala: ${lastStatement.slice(0, 80)}`);
    continue;
  }

  if (line.startsWith('**Opción Elegida:**')) {
    const choice = norm(line.replace('**Opción Elegida:**', '').replace(/\*+$/, ''));
    const question = scenarios.find((q) => norm(q.text) === norm(lastStatement));
    const option = question?.options.find((o) => norm(o.text) === choice);
    if (question && option) answers[question.code] = { likertValue: null, optionCode: option.code, declined: false };
    else unmapped.push(`escenario: ${lastStatement.slice(0, 80)} → ${choice.slice(0, 60)}`);
    continue;
  }

  if (line.startsWith('**Texto procesado por IA:**')) {
    const transcript = line
      .replace('**Texto procesado por IA:**', '')
      .trim()
      .replace(/^\*?"/, '')
      .replace(/"\*?$/, '')
      .trim();
    const question = audios.find((q) => norm(lastPrompt).startsWith(norm(q.text).slice(0, 60)));
    if (question && transcript) {
      audioTurns.push({
        questionCode: question.code,
        turnIndex: 0,
        promptText: question.text,
        transcript,
        transcriptStatus: 'ok',
      });
    } else {
      unmapped.push(`audio: ${lastPrompt.slice(0, 80)}`);
    }
    continue;
  }

  if (line.startsWith('**') && !line.startsWith('**🎤')) {
    lastStatement = norm(line.replace(/^\*\*/, '').replace(/\*\*$/, ''));
    if (lastStatement.startsWith('Piensa')) lastPrompt = lastStatement;
  }
}

const total = Object.keys(answers).length + audioTurns.length;
if (unmapped.length > 0 || total !== EXPECTED_ITEMS) {
  console.error(`No se pudo convertir el caso: ${total}/${EXPECTED_ITEMS} elementos.`);
  for (const u of unmapped) console.error(`  - sin mapear: ${u}`);
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(
  OUT,
  `${JSON.stringify({ source: 'caso canónico B1 (privado)', instrumentVersion: '0.9', answers, audioTurns }, null, 2)}\n`,
);
console.log(`Caso canónico convertido: ${Object.keys(answers).length} escalas/escenarios, ${audioTurns.length} audios → ${OUT}`);
