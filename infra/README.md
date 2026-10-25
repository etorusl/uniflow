# Локальная инфраструктура UniFlow

`compose/compose.yaml` запускает PostgreSQL 18.4, SeaweedFS 4.50 с закрытым S3 API и Mailpit 1.32.0. Образы закреплены по версиям. Порты публикуются только на loopback.

Из корня:

```sh
pnpm env:init
pnpm infra:up
pnpm infra:status
pnpm infra:logs
pnpm infra:down
```

`infra:up` ждёт health-проверки каждого сервиса. Скрипт поддерживает Docker Compose plugin и отдельную команду `docker-compose`. На macOS можно использовать Docker Desktop или Colima с Docker CLI.

PostgreSQL, файлы SeaweedFS и база писем Mailpit хранятся в постоянных именованных Docker volumes. `infra:down` не удаляет их. SeaweedFS работает в `/data`, поэтому его filer metadata тоже сохраняются в томе. Параметры и ключи берутся из `.env`; S3-конфигурация создаётся в игнорируемом `.local/` с ограниченными правами доступа и монтируется только для чтения.

Бакет создаётся отдельно через `pnpm storage:init` после сборки сервера. Анонимный доступ к S3 не включается. Внутренние панели SeaweedFS не публикуются на хост.

`proxy/` оставлен для будущей конфигурации HTTPS и маршрутизации при размещении. Локальная конфигурация не считается проверенным публичным развёртыванием.
