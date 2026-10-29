# kriterial-api

API y worker del pipeline de diagnóstico de Kriterial (NestJS 12 + PostgreSQL 16 + BullMQ).
Diseño completo: [`../PLAN_ARQUITECTURA_BLOQUE_1.md`](../PLAN_ARQUITECTURA_BLOQUE_1.md).

**Estado:** fase **F1 (fundaciones)** completada. El pipeline LLM (F3–F6) aún no existe.

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
  prompts/             PromptRegistry: verifica hashes, compone etapas, registra bundles
  queue/, worker/      BullMQ: cola `pipeline` y su processor
  health/              /health (base de datos y Redis)
  logging/             pino; nunca registra cabeceras de autorización
  main.ts, worker.ts   Puntos de entrada: API y worker (mismo código, procesos separados)
test/                  Pruebas e2e
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
