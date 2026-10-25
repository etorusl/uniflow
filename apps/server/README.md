# Сервер UniFlow

Модульный монолит NestJS с PostgreSQL и Prisma. Два процесса используют одну кодовую базу: HTTP API (`src/main.ts`) и worker (`src/worker.ts`). Worker не запускает HTTP-сервер, а API не забирает работы из очереди.

- `src/modules` — предметные модули: `health`, `auth`/профиль, `catalog`, `schedule`, `tasks` и `statistics`; группы, вложения и уведомления добавляются по плану.
- `src/infrastructure` — валидируемая конфигурация, Prisma, pg-boss, S3 и SMTP.
- `src/common` — формат ошибок и общие серверные механизмы.
- `src/cli` — генерация OpenAPI, создание закрытого бакета и проверка отдельного worker.
- `prisma/` — схема и миграции. Внутренняя таблица `job_probes` проверяет очередь и не содержит пользовательских заданий; CLI удаляет свои записи после проверки.
- `test/unit` — проверки конфигурации, паролей, календарных правил и статусов заданий; `test/integration` — настоящие БД, хранилище, SMTP, HTTP, отдельный worker, права доступа и переходы состояний.

Из корня: `pnpm build:server`, `pnpm dev:server`, `pnpm db:migrate`, `pnpm storage:init`, `pnpm queue:probe`. `pnpm api:generate` обновляет `openapi.json` и пакет API-клиента после сборки сервера.

Проверки готовности: `/api/v1/health/live` и `/api/v1/health/ready`. Swagger UI и JSON доступны только вне production-режима по `/api/docs` и `/api/openapi.json`. Ошибки имеют форму `{ error: { code, message, requestId } }`; стек и секреты клиенту не отправляются.

Полная инструкция — в [README](../../README.md), границы модулей — в [архитектуре](../../docs/architecture.md).
