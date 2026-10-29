# kriterial-api

API y worker del pipeline de diagnóstico de Kriterial (NestJS 12 + PostgreSQL 16 + BullMQ).
Diseño completo: [`../PLAN_ARQUITECTURA_BLOQUE_1.md`](../PLAN_ARQUITECTURA_BLOQUE_1.md).

**Estado:** fases **F1 (fundaciones)**, **F2 (captura)** y **F3 (evidencia)** completadas. El pipeline LLM (F4–F6) aún no existe.

## Requisitos

- Node.js ≥ 22 (desarrollado con 24)
- Docker (PostgreSQL y Redis locales)

## Puesta en marcha

```bash
cp .env.example .env          # y generar JWT_SECRET (comando dentro del archivo)
npm install                   # ejecuta también `prisma generate`
npm run db:up                 # PostgreSQL :55432 y Redis :56379 (solo 127.0.0.1)
npm run db:migrate            # aplica migraciones
npm run db:seed               # siembra instrumentos B1@0.9 y B1@1.0 (idempotente)

npm run start:dev             # API en http://localhost:3000
npm run start:worker:dev      # worker de colas (otro terminal)
```

Probar:

```bash
curl localhost:3000/health
TOKEN=$(npm run -s dev:token -- persona@ejemplo.test candidate | tail -1)
curl -H "Authorization: Bearer $TOKEN" localhost:3000/v1/instruments/B1/current
```

## Scripts

| Script | Qué hace |
|---|---|
| `start:dev` / `start:worker:dev` | API / worker con recarga |
| `build`, `start:prod`, `start:worker` | compilación y ejecución desde `dist/` |
| `test` / `test:e2e` | pruebas unitarias / e2e (las e2e usan la base `kriterial_test`, que crean y migran solas) |
| `typecheck`, `lint` | `tsc --noEmit` y oxlint |
| `db:up`, `db:migrate`, `db:deploy`, `db:generate`, `db:seed` | infraestructura y datos |
| `instruments:import` | regenera `instruments/seeds/` desde `instruments/sources/` |
| `prompts:hash` | rellena hashes de prompts nuevos en el manifiesto (nunca reescribe existentes) |
| `dev:token -- <email> [rol]` | emite un token de desarrollo (no disponible en producción) |

Los scripts de `scripts/` se compilan con `tsc` (`tsconfig.scripts.json`) porque la inyección de
dependencias de Nest necesita los metadatos de decoradores que esbuild/tsx no emiten.

## Estructura

```
prompts/               Registro de prompts versionados e inmutables (ver prompts/README.md)
instruments/sources/   Fuentes del instrumento (banco heredado, etiquetas propuestas, audios v0.9)
instruments/seeds/     Seeds validados: b1@1.0 (publicado) y b1@0.9 (retirado, caso de referencia #1)
prisma/                Esquema y migraciones
scripts/               Seed, importación de instrumento, hashes de prompts, token de desarrollo
src/
  config/              Variables de entorno validadas con Zod (falla al arrancar si son inválidas)
  auth/                Guard global JWT: todo exige token salvo @Public(); roles con @Roles()
  prisma/              Cliente Prisma 7 con adaptador pg
  instruments/         Instrumentos versionados; vista pública sin metadatos internos
  participants/       Perfil, forma gramatical y consentimiento del participante
  assessments/        Evaluación B1: respuestas, reglas por tipo de pregunta, envío
  media/               Validación de audios (MIME, tamaño y firma binaria)
  storage/             Almacenamiento privado de objetos (disco local en desarrollo)
  transcription/       Proveedor de transcripción y servicio que procesa turnos
  prompts/             PromptRegistry: verifica hashes, compone etapas, registra bundles
  queue/, worker/      BullMQ: cola `pipeline` y su processor
  health/              /health (base de datos y Redis)
  logging/             pino; nunca registra cabeceras de autorización
  main.ts, worker.ts   Puntos de entrada: API y worker (mismo código, procesos separados)
test/                  Pruebas e2e
```

## Flujo de captura (F2)

| Método | Ruta | Qué hace |
|---|---|---|
| `PUT` | `/v1/participants/me` | Perfil, forma gramatical y consentimiento (`consentVersion`) |
| `POST` | `/v1/assessments` | Crea la evaluación B1; exige consentimiento y una sola activa por bloque |
| `GET` | `/v1/assessments/:id` | Estado completo para reanudar (respuestas, audios, progreso) |
| `PUT` | `/v1/assessments/:id/responses/:questionCode` | Respuesta idempotente: `likertValue`, `optionCode` o `declined` |
| `POST` | `/v1/assessments/:id/responses/:questionCode/audio` | Subida multipart (`file`, `turnIndex`); valida formato real y tamaño |
| `GET` | `/v1/assessments/:id/status` | Estado y transcripciones pendientes |
| `POST` | `/v1/assessments/:id/submit` | Congela la evaluación; falla si faltan respuestas o transcripciones |

Notas:
- Cada participante solo ve y modifica sus evaluaciones; ajenas responden `404`.
- Los audios se transcriben en el worker (trabajo `transcription.turn`). El proveedor real aún no existe:
  `TRANSCRIPTION_PROVIDER=fake` y el arranque falla si se usa en producción.
- El envío queda bloqueado mientras haya audios pendientes o fallidos (`409` con `transcriptsFailed`):
  la persona debe volver a grabar esa pregunta. Pendiente de confirmación de la clienta.
- Los audios se guardan en `STORAGE_DIR` (por defecto `storage/`, ignorado por git).
- `LLM_MODE=replay` (por defecto) no llama a la API de Anthropic. `live` exige `ANTHROPIC_API_KEY`.

## Evidencia (F3)

`EvidenceService.buildForAssessment(id)` construye el `PATTERN_INPUT` (contrato `pattern-input/1`) de una
evaluación enviada: registro de evidencia con `evidence_id` estables, grupos de independencia, señales por
faceta, datos no disponibles, banderas de calidad y menciones sensibles (solo anotadas). Es determinista y
no usa IA. Aún no se persiste: la persistencia llega con los `pipeline_runs` de F4.

Caso de referencia (datos privados, fuera de git hasta tener consentimiento, D1):

```bash
npm run fixtures:canonical   # convierte old-sistem/Pasted markdown(2).md a test/fixtures/private/
npm test                     # la prueba del caso canónico se omite si el fixture no existe
```

## Reglas que el código hace cumplir

- **Prompts inmutables:** si un archivo de `prompts/` no coincide con el SHA-256 del manifiesto, la
  aplicación no arranca. Cambiar un prompt = crear una versión nueva.
- **Instrumentos inmutables:** sembrar una versión existente con contenido distinto falla. Solo puede
  haber una versión `published` por bloque (índice único parcial en la base de datos).
- **Metadatos internos ocultos:** la API pública del instrumento no expone dominio, faceta, polaridad,
  evidencia que preserva ni límite de inferencia.
- **Secretos fuera del repositorio:** `.env`, claves y `api-key*.txt` están en `.gitignore`.

## Pendiente de decisión (bloquea fases posteriores)

- **D2:** etiquetas de las 24 facetas (propuestas, `labelApproved=false`) y polaridad de cada ítem
  (`null` hasta que la metodóloga firme la clave).
- **D6:** Firebase Auth o auth propio. Hoy: JWT HS256; si se adopta Firebase solo cambia
  `TokenService.verify()`.
