# Документация REST API

## Адрес и контракт

Локальный HTTP API после `adb reverse tcp:3000 tcp:3000`: `http://127.0.0.1:3000/api/v1`. Swagger UI: `http://127.0.0.1:3000/api/docs`, JSON: `http://127.0.0.1:3000/api/openapi.json`; эти два маршрута документации включены вне production. Сохранённый контракт находится в `apps/server/openapi.json`, типы клиента — в `packages/api-client/src/schema.d.ts`.

Справочник ниже построен из существующего OpenAPI и дополнен правилами авторизации из контроллеров и сервисов. Его HTML-копия `api-reference.html` открывается без запуска сервера и без внешних библиотек. Swagger остаётся исполняемой формой документации при работающем API.

## Общие правила запросов

Тела обычных запросов имеют `Content-Type: application/json`. UUID передаются строками; даты календаря — `YYYY-MM-DD`, локальное время — `HH:mm`, абсолютные сроки — ISO 8601 с `Z` или явным часовым смещением. День недели — 1–7, начиная с понедельника.

Большинство списков использует `page` от 1 до 10 000 и `limit` от 1 до 100; значения по умолчанию — 1 и 100. Ответ — `{items, total}`. Календарь, история личного задания, список вложений и входящие имеют собственные форматы и не получают пагинацию автоматически. Диапазон календаря задают обязательные `from` и `to`.

PATCH-методы передают поля согласно своему DTO. Это не универсальный JSON Merge Patch: например, профиль требует имя и часовой пояс, личное задание — название, описание и срок, а групповой PATCH не допускает смену режима выполнения. Неизвестные поля отклоняются глобальной валидацией.

## Передача сессии и права

Без сессии доступны health, регистрация, вход, запрос письма и установка нового пароля. При входе Android передаёт `x-uniflow-client: native`. Ответ `{user, token}` содержит непрозрачный токен, который клиент сохраняет в Expo SecureStore. Защищённые запросы используют `Authorization: Bearer <token>`.

`GET /auth/session` возвращает профиль текущего пользователя; повторно секрет не выдаётся. Владелец личного ресурса определяется по сессии. Членство, роль и авторство проверяет сервер.

Справочник представляет профиль контракта для Android. Показаны используемые клиентом поля и транспорт `ANDROID`; сервер может возвращать дополнительные поля. Все 77 операций и 61 имя DTO сохранены. Исходный OpenAPI остаётся без изменений.

## Формат ошибок

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Недостаточно прав для этого действия.",
    "requestId": "example-request-id"
  }
}
```

Коды исполнения: `400` — валидация или недействительная операция; `401` — нет действующей сессии или неверный вход; `403` — запрещённое действие; `404` — отсутствующий или скрытый ресурс; `409` — конфликт уникальности, связи или владения; `413` — превышение лимита загрузки; `429` — ограничение частоты; `500` — безопасное сообщение о внутреннем сбое; `503` — неготовность зависимостей. Перечень в OpenAPI у каждого метода может быть уже фактических ошибок guard и сервисов. Таблица ответов метода ниже дословно сохраняет объявленные контрактом коды и не обещает, что других ответов исполнения не бывает.

## Примеры обмена

Регистрация создаёт аккаунт, а не сессию. В интерфейсе за ней выполняется отдельный вход.

```json
{
  "email": "student@example.com",
  "password": "example-password-2026",
  "displayName": "Алексей",
  "timeZone": "Asia/Novosibirsk"
}
```

Тело `POST /auth/register` выше. Ответ `200`: `{"message":"Аккаунт создан. Можно войти."}`. Запрос входа содержит email и пароль; Android получает `{user, token}`.

Пример тела `POST /tasks`:

```json
{
  "title": "Лабораторная работа № 3",
  "description": "Подготовить SQL-запросы и отчёт",
  "dueAt": "2026-11-25T18:00:00+07:00",
  "subjectId": null
}
```

Ответ `200` имеет тип `TaskDto`, включая созданный UUID, `completedAt: null`, `deadlineAtCompletion: null`, `deadlineRevision` и вычисленный `status`. Повторное выполнение `POST /tasks/{id}/complete` возвращает то же текущее состояние без второй записи события. Создание нового задания не имеет общей защиты от дублирования по idempotency key.

Для `POST /groups/{groupId}/tasks` тело аналогично, но вместо личного `subjectId` при создании передаётся `mode: "INDIVIDUAL"` либо `"SHARED"`; ответ — `201 GroupTaskDto`. Сводный маршрут `/groups/tasks` возвращает видимые задания всех действующих групп.

Пример `PUT /schedule/entries/{id}/exceptions/{date}` для отмены: `{"cancelled":true}`. Для переноса: `{"cancelled":false,"replacementDate":"2026-11-26","startTime":"11:00","endTime":"12:30"}`. Исходная и новая даты должны относиться к допустимому занятию/семестру.

Загрузка `POST /files/targets/{kind}/{parentId}` использует multipart/form-data с обязательным бинарным полем `file` и необязательным `name` до 240 символов. `kind` принимает `task`, `group-task`, `material`. Заголовок multipart с boundary формирует HTTP-клиент. Ответ `201` содержит `AttachmentDto`; байты выдаёт `GET /files/{id}/content`. Разрешены PDF, TXT UTF-8, JPEG, PNG, WebP, не более 10 МиБ на файл.

Пример настройки `PATCH /notifications/settings`: `{"enabled":true,"minutesBefore":60}`. Входящие содержат последние 30 доступных записей и счётчик непрочитанных среди них. Подписки внешних каналов требуют настроенного провайдера и разрешения устройства.

## Ограничения предметных данных

Регистрация: пароль 12–128 символов, имя 2–80, email до 254. Задание: название 1–200 символов, описание до 5000. Группа: название и предмет 1–100, описание до 1000. Приглашение: 20 символов секрета, срок 1–720 часов и лимит 1–250 вступлений. Настройки напоминаний: целое смещение 1–10 080 минут.

Некоторые ограничения class-validator не представлены в Swagger-декораторах. Таблицы схем ниже показывают сведения сохранённого OpenAPI, а проверка DTO и сервисов остаётся обязательной. Особые правила: `weekStartDate` — понедельник не позднее начала семестра, семестр — от 1 до 367 дней; конец пары позже начала в пределах суток; режим опубликованного группового задания неизменяем.


## Полный каталог методов

Контракт содержит 77 HTTP-операций и 61 именованную схему. Префикс `/api/v1` в таблице сохранён.

| Метод | Путь | Назначение |
| --- | --- | --- |
| GET | `/api/v1/health/live` | Проверить HTTP-процесс |
| GET | `/api/v1/health/ready` | Проверить готовность зависимостей |
| POST | `/api/v1/auth/register` | Зарегистрировать аккаунт |
| POST | `/api/v1/auth/login` | Войти и создать сессию |
| GET | `/api/v1/auth/session` | Получить текущую сессию |
| POST | `/api/v1/auth/logout` | Завершить текущую сессию |
| POST | `/api/v1/auth/forgot-password` | Запросить письмо восстановления |
| POST | `/api/v1/auth/reset-password` | Установить новый пароль |
| PATCH | `/api/v1/users/me` | Обновить имя и часовой пояс |
| GET | `/api/v1/subjects` | Получить личные предметы |
| POST | `/api/v1/subjects` | Создать личные предметы |
| PATCH | `/api/v1/subjects/{id}` | Изменить личные предметы |
| DELETE | `/api/v1/subjects/{id}` | Удалить личные предметы |
| GET | `/api/v1/teachers` | Получить личные преподаватели |
| POST | `/api/v1/teachers` | Создать личные преподаватели |
| PATCH | `/api/v1/teachers/{id}` | Изменить личные преподаватели |
| DELETE | `/api/v1/teachers/{id}` | Удалить личные преподаватели |
| GET | `/api/v1/schedule/entries` | Получить шаблоны пар |
| POST | `/api/v1/schedule/entries` | Создать шаблоны пар |
| PATCH | `/api/v1/schedule/entries/{id}` | Изменить шаблоны пар |
| DELETE | `/api/v1/schedule/entries/{id}` | Удалить шаблоны пар |
| GET | `/api/v1/schedule/occurrences` | Получить конкретные занятия периода |
| PUT | `/api/v1/schedule/entries/{id}/exceptions/{date}` | Сохранить отмену или перенос |
| DELETE | `/api/v1/schedule/entries/{id}/exceptions/{date}` | Восстановить исходное занятие |
| GET | `/api/v1/semesters` | Получить семестры |
| POST | `/api/v1/semesters` | Создать семестры |
| PATCH | `/api/v1/semesters/{id}` | Изменить семестры |
| DELETE | `/api/v1/semesters/{id}` | Удалить семестры |
| GET | `/api/v1/tasks` | Получить задания |
| POST | `/api/v1/tasks` | Создать задания |
| GET | `/api/v1/tasks/{id}` | Получить задания |
| PATCH | `/api/v1/tasks/{id}` | Изменить задания |
| DELETE | `/api/v1/tasks/{id}` | Удалить задания |
| POST | `/api/v1/tasks/{id}/complete` | Отметить выполнение задания |
| POST | `/api/v1/tasks/{id}/reopen` | Вернуть задание в работу |
| GET | `/api/v1/tasks/{id}/history` | Получить историю выполнения |
| GET | `/api/v1/statistics/me` | Получить личный прогресс |
| GET | `/api/v1/groups/tasks` | Задания всех действующих групп |
| GET | `/api/v1/groups` | Получить группы |
| POST | `/api/v1/groups` | Создать группы |
| POST | `/api/v1/groups/join` | Принять приглашение |
| GET | `/api/v1/groups/{groupId}` | Получить группы |
| PATCH | `/api/v1/groups/{groupId}` | Изменить группы |
| DELETE | `/api/v1/groups/{groupId}` | Архивировать группу |
| PUT | `/api/v1/groups/{groupId}/subject` | Связать группу с личным предметом |
| GET | `/api/v1/groups/{groupId}/members` | Получить участники группы |
| PATCH | `/api/v1/groups/{groupId}/members/{userId}` | Назначить или снять роль модератора |
| DELETE | `/api/v1/groups/{groupId}/members/{userId}` | Исключить и заблокировать участника |
| POST | `/api/v1/groups/{groupId}/members/{userId}/unblock` | Снять блокировку вступления |
| POST | `/api/v1/groups/{groupId}/leave` | Выйти из группы |
| POST | `/api/v1/groups/{groupId}/transfer-ownership` | Передать владение группой |
| GET | `/api/v1/groups/{groupId}/invitations` | Получить приглашения |
| POST | `/api/v1/groups/{groupId}/invitations` | Создать приглашения |
| DELETE | `/api/v1/groups/{groupId}/invitations/{id}` | Отозвать приглашение |
| GET | `/api/v1/groups/{groupId}/tasks` | Получить задания |
| POST | `/api/v1/groups/{groupId}/tasks` | Создать задания |
| GET | `/api/v1/groups/{groupId}/tasks/{id}` | Получить задания |
| PATCH | `/api/v1/groups/{groupId}/tasks/{id}` | Изменить задания |
| DELETE | `/api/v1/groups/{groupId}/tasks/{id}` | Удалить задания |
| POST | `/api/v1/groups/{groupId}/tasks/{id}/complete` | Отметить выполнение задания |
| POST | `/api/v1/groups/{groupId}/tasks/{id}/reopen` | Вернуть задание в работу |
| GET | `/api/v1/groups/{groupId}/tasks/{id}/history` | Получить историю выполнения |
| GET | `/api/v1/groups/{groupId}/statistics` | Получить прогресс общих заданий группы |
| GET | `/api/v1/files/targets/{kind}/{parentId}` | Получить список готовых вложений |
| POST | `/api/v1/files/targets/{kind}/{parentId}` | Загрузить файл в публикацию |
| GET | `/api/v1/files/{id}/content` | Скачать байты вложения |
| DELETE | `/api/v1/files/{id}` | Удалить вложения |
| GET | `/api/v1/groups/{groupId}/materials` | Получить материалы группы |
| POST | `/api/v1/groups/{groupId}/materials` | Создать материалы группы |
| PATCH | `/api/v1/groups/{groupId}/materials/{id}` | Изменить материалы группы |
| DELETE | `/api/v1/groups/{groupId}/materials/{id}` | Удалить материалы группы |
| GET | `/api/v1/notifications/settings` | Получить настройки и доступность каналов |
| PATCH | `/api/v1/notifications/settings` | Сохранить настройки напоминаний |
| POST | `/api/v1/notifications/subscriptions` | Зарегистрировать подписку текущей сессии |
| DELETE | `/api/v1/notifications/subscriptions/{transport}` | Отключить подписки текущей сессии и платформы |
| GET | `/api/v1/notifications/inbox` | Получить последние 30 входящих напоминаний |
| POST | `/api/v1/notifications/inbox/{id}/read` | Пометить напоминание прочитанным |

## Параметры тела и ответы методов

### GET /api/v1/health/live

Проверить HTTP-процесс.

**Доступ:** Без сессии.

Параметры пути и query отсутствуют.

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: HealthDto |

### GET /api/v1/health/ready

Проверить готовность зависимостей.

**Доступ:** Без сессии.

Параметры пути и query отсутствуют.

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: HealthDto |
| 503 | application/json: ApiErrorDto |

### POST /api/v1/auth/register

Зарегистрировать аккаунт.

**Доступ:** Без сессии.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `RegisterDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: MessageDto |
| 400 | application/json: ApiErrorDto |

### POST /api/v1/auth/login

Войти и создать сессию.

**Доступ:** Без сессии.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `LoginDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: SessionDto |
| 400 | application/json: ApiErrorDto |
| 401 | application/json: ApiErrorDto |

### GET /api/v1/auth/session

Получить текущую сессию.

**Доступ:** Активная сессия; данные текущего пользователя.

Параметры пути и query отсутствуют.

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: SessionDto |
| 400 | application/json: ApiErrorDto |

### POST /api/v1/auth/logout

Завершить текущую сессию.

**Доступ:** Активная сессия; данные текущего пользователя.

Параметры пути и query отсутствуют.

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: MessageDto |
| 400 | application/json: ApiErrorDto |

### POST /api/v1/auth/forgot-password

Запросить письмо восстановления.

**Доступ:** Без сессии.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `EmailDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: MessageDto |
| 400 | application/json: ApiErrorDto |

### POST /api/v1/auth/reset-password

Установить новый пароль.

**Доступ:** Без сессии.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `ResetPasswordDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: MessageDto |
| 400 | application/json: ApiErrorDto |

### PATCH /api/v1/users/me

Обновить имя и часовой пояс.

**Доступ:** Активная сессия; данные текущего пользователя.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `ProfileDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: UserDto |

### GET /api/v1/subjects

Получить личные предметы.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| page | query | Нет | number; minimum=1; default=1 |
| limit | query | Нет | number; minimum=1; maximum=100; default=100 |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: SubjectsPageDto |

### POST /api/v1/subjects

Создать личные предметы.

**Доступ:** Активная сессия; данные текущего пользователя.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `SubjectInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: SubjectDto |

### PATCH /api/v1/subjects/{id}

Изменить личные предметы.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

**Тело:** `application/json`, схема `SubjectInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: SubjectDto |

### DELETE /api/v1/subjects/{id}

Удалить личные предметы.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### GET /api/v1/teachers

Получить личные преподаватели.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| page | query | Нет | number; minimum=1; default=1 |
| limit | query | Нет | number; minimum=1; maximum=100; default=100 |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: TeachersPageDto |

### POST /api/v1/teachers

Создать личные преподаватели.

**Доступ:** Активная сессия; данные текущего пользователя.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `TeacherInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: TeacherDto |

### PATCH /api/v1/teachers/{id}

Изменить личные преподаватели.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

**Тело:** `application/json`, схема `TeacherInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: TeacherDto |

### DELETE /api/v1/teachers/{id}

Удалить личные преподаватели.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### GET /api/v1/schedule/entries

Получить шаблоны пар.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| page | query | Нет | number; minimum=1; default=1 |
| limit | query | Нет | number; minimum=1; maximum=100; default=100 |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: EntriesPageDto |

### POST /api/v1/schedule/entries

Создать шаблоны пар.

**Доступ:** Активная сессия; данные текущего пользователя.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `EntryInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: EntryDto |

### PATCH /api/v1/schedule/entries/{id}

Изменить шаблоны пар.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

**Тело:** `application/json`, схема `EntryInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: EntryDto |

### DELETE /api/v1/schedule/entries/{id}

Удалить шаблоны пар.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### GET /api/v1/schedule/occurrences

Получить конкретные занятия периода.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| from | query | Да | string / date; — |
| to | query | Да | string / date; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: OccurrencesDto |

### PUT /api/v1/schedule/entries/{id}/exceptions/{date}

Сохранить отмену или перенос.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |
| date | path | Да | string; — |

**Тело:** `application/json`, схема `ExceptionInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### DELETE /api/v1/schedule/entries/{id}/exceptions/{date}

Восстановить исходное занятие.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |
| date | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### GET /api/v1/semesters

Получить семестры.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| page | query | Нет | number; minimum=1; default=1 |
| limit | query | Нет | number; minimum=1; maximum=100; default=100 |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: SemestersPageDto |

### POST /api/v1/semesters

Создать семестры.

**Доступ:** Активная сессия; данные текущего пользователя.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `SemesterInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: SemesterDto |

### PATCH /api/v1/semesters/{id}

Изменить семестры.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

**Тело:** `application/json`, схема `SemesterInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: SemesterDto |

### DELETE /api/v1/semesters/{id}

Удалить семестры.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### GET /api/v1/tasks

Получить задания.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| page | query | Нет | number; minimum=1; default=1 |
| limit | query | Нет | number; minimum=1; maximum=100; default=100 |
| status | query | Нет | string; default="OPEN"; enum=["ALL", "OPEN", "COMPLETED", "OVERDUE"] |
| subjectId | query | Нет | string / uuid; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: TasksPageDto |

### POST /api/v1/tasks

Создать задания.

**Доступ:** Активная сессия; данные текущего пользователя.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `TaskInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: TaskDto |

### GET /api/v1/tasks/{id}

Получить задания.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: TaskDto |

### PATCH /api/v1/tasks/{id}

Изменить задания.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

**Тело:** `application/json`, схема `TaskInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: TaskDto |

### DELETE /api/v1/tasks/{id}

Удалить задания.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### POST /api/v1/tasks/{id}/complete

Отметить выполнение задания.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: TaskDto |

### POST /api/v1/tasks/{id}/reopen

Вернуть задание в работу.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: TaskDto |

### GET /api/v1/tasks/{id}/history

Получить историю выполнения.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: TaskHistoryDto |

### GET /api/v1/statistics/me

Получить личный прогресс.

**Доступ:** Активная сессия; данные текущего пользователя.

Параметры пути и query отсутствуют.

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: StatisticsDto |

### GET /api/v1/groups/tasks

Задания всех действующих групп.

**Доступ:** Активная сессия; список ограничен действующими членствами.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| page | query | Нет | number; minimum=1; default=1 |
| limit | query | Нет | number; minimum=1; maximum=100; default=100 |
| status | query | Нет | string; default="OPEN"; enum=["ALL", "OPEN", "COMPLETED", "OVERDUE"] |
| mode | query | Нет | string; enum=["INDIVIDUAL", "SHARED"] |
| groupId | query | Нет | string / uuid; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupTasksPageDto |

### GET /api/v1/groups

Получить группы.

**Доступ:** Активная сессия; список ограничен действующими членствами.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| page | query | Нет | number; minimum=1; default=1 |
| limit | query | Нет | number; minimum=1; maximum=100; default=100 |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupsPageDto |

### POST /api/v1/groups

Создать группы.

**Доступ:** Активная сессия; список ограничен действующими членствами.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `GroupInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 201 | application/json: GroupDto |

### POST /api/v1/groups/join

Принять приглашение.

**Доступ:** Активная сессия; список ограничен действующими членствами.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `GroupJoinInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupDto |

### GET /api/v1/groups/{groupId}

Получить группы.

**Доступ:** Действующий участник неархивированной группы.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupDto |

### PATCH /api/v1/groups/{groupId}

Изменить группы.

**Доступ:** Действующий владелец.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |

**Тело:** `application/json`, схема `GroupInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupDto |

### DELETE /api/v1/groups/{groupId}

Архивировать группу.

**Доступ:** Действующий владелец.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### PUT /api/v1/groups/{groupId}/subject

Связать группу с личным предметом.

**Доступ:** Действующий участник неархивированной группы.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |

**Тело:** `application/json`, схема `GroupSubjectInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupDto |

### GET /api/v1/groups/{groupId}/members

Получить участники группы.

**Доступ:** Действующий участник; список заблокированных — только владелец.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| page | query | Нет | number; minimum=1; default=1 |
| limit | query | Нет | number; minimum=1; maximum=100; default=100 |
| status | query | Нет | string; default="ACTIVE"; enum=["ACTIVE", "BLOCKED"] |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupMembersPageDto |

### PATCH /api/v1/groups/{groupId}/members/{userId}

Назначить или снять роль модератора.

**Доступ:** Действующий владелец.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| userId | path | Да | string; — |

**Тело:** `application/json`, схема `GroupRoleInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### DELETE /api/v1/groups/{groupId}/members/{userId}

Исключить и заблокировать участника.

**Доступ:** Модератор — обычного участника; владелец — участника или модератора.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| userId | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### POST /api/v1/groups/{groupId}/members/{userId}/unblock

Снять блокировку вступления.

**Доступ:** Действующий владелец.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| userId | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### POST /api/v1/groups/{groupId}/leave

Выйти из группы.

**Доступ:** Действующий участник или модератор; владелец сначала передаёт владение.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### POST /api/v1/groups/{groupId}/transfer-ownership

Передать владение группой.

**Доступ:** Действующий владелец.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |

**Тело:** `application/json`, схема `TransferGroupInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupDto |

### GET /api/v1/groups/{groupId}/invitations

Получить приглашения.

**Доступ:** Модератор/владелец; отзыв модератором только своего приглашения.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| page | query | Нет | number; minimum=1; default=1 |
| limit | query | Нет | number; minimum=1; maximum=100; default=100 |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupInvitationsPageDto |

### POST /api/v1/groups/{groupId}/invitations

Создать приглашения.

**Доступ:** Модератор/владелец; отзыв модератором только своего приглашения.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |

**Тело:** `application/json`, схема `GroupInvitationInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 201 | application/json: NewGroupInvitationDto |

### DELETE /api/v1/groups/{groupId}/invitations/{id}

Отозвать приглашение.

**Доступ:** Модератор/владелец; отзыв модератором только своего приглашения.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### GET /api/v1/groups/{groupId}/tasks

Получить задания.

**Доступ:** Действующий участник неархивированной группы.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| page | query | Нет | number; minimum=1; default=1 |
| limit | query | Нет | number; minimum=1; maximum=100; default=100 |
| status | query | Нет | string; default="OPEN"; enum=["ALL", "OPEN", "COMPLETED", "OVERDUE"] |
| mode | query | Нет | string; enum=["INDIVIDUAL", "SHARED"] |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupTasksPageDto |

### POST /api/v1/groups/{groupId}/tasks

Создать задания.

**Доступ:** Действующий участник неархивированной группы.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |

**Тело:** `application/json`, схема `NewGroupTaskInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 201 | application/json: GroupTaskDto |

### GET /api/v1/groups/{groupId}/tasks/{id}

Получить задания.

**Доступ:** Действующий участник неархивированной группы.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupTaskDto |

### PATCH /api/v1/groups/{groupId}/tasks/{id}

Изменить задания.

**Доступ:** Действующий участник и автор публикации.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| id | path | Да | string; — |

**Тело:** `application/json`, схема `GroupTaskInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupTaskDto |

### DELETE /api/v1/groups/{groupId}/tasks/{id}

Удалить задания.

**Доступ:** Действующий автор, модератор или владелец.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### POST /api/v1/groups/{groupId}/tasks/{id}/complete

Отметить выполнение задания.

**Доступ:** INDIVIDUAL — собственная отметка; SHARED — действующий автор/модератор/владелец.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupTaskDto |

### POST /api/v1/groups/{groupId}/tasks/{id}/reopen

Вернуть задание в работу.

**Доступ:** INDIVIDUAL — собственная отметка; SHARED — действующий автор/модератор/владелец.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupTaskDto |

### GET /api/v1/groups/{groupId}/tasks/{id}/history

Получить историю выполнения.

**Доступ:** Действующий участник; INDIVIDUAL — только собственная история.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| id | path | Да | string; — |
| page | query | Нет | number; minimum=1; default=1 |
| limit | query | Нет | number; minimum=1; maximum=100; default=100 |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupTaskHistoryDto |

### GET /api/v1/groups/{groupId}/statistics

Получить прогресс общих заданий группы.

**Доступ:** Действующий участник неархивированной группы.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: StatisticsDto |

### GET /api/v1/files/targets/{kind}/{parentId}

Получить список готовых вложений.

**Доступ:** Сессия и доступ к родителю; добавление/удаление — владелец личного задания или автор групповой публикации.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| kind | path | Да | string; enum=["task", "group-task", "material"] |
| parentId | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: AttachmentsDto |

### POST /api/v1/files/targets/{kind}/{parentId}

Загрузить файл в публикацию.

**Доступ:** Сессия и доступ к родителю; добавление/удаление — владелец личного задания или автор групповой публикации.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| kind | path | Да | string; enum=["task", "group-task", "material"] |
| parentId | path | Да | string; — |

**Тело:** `multipart/form-data`, схема `object`. Обязательное поле `file` — binary; необязательное `name` — строка до 240 символов.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 201 | application/json: AttachmentDto |

### GET /api/v1/files/{id}/content

Скачать байты вложения.

**Доступ:** Сессия и доступ к родителю; добавление/удаление — владелец личного задания или автор групповой публикации.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/octet-stream: string / binary |

### DELETE /api/v1/files/{id}

Удалить вложения.

**Доступ:** Сессия и доступ к родителю; добавление/удаление — владелец личного задания или автор групповой публикации.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### GET /api/v1/groups/{groupId}/materials

Получить материалы группы.

**Доступ:** Действующий участник неархивированной группы.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| page | query | Нет | number; minimum=1; default=1 |
| limit | query | Нет | number; minimum=1; maximum=100; default=100 |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupMaterialsPageDto |

### POST /api/v1/groups/{groupId}/materials

Создать материалы группы.

**Доступ:** Действующий участник неархивированной группы.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |

**Тело:** `application/json`, схема `GroupMaterialInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 201 | application/json: GroupMaterialDto |

### PATCH /api/v1/groups/{groupId}/materials/{id}

Изменить материалы группы.

**Доступ:** Действующий участник и автор публикации.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| id | path | Да | string; — |

**Тело:** `application/json`, схема `GroupMaterialInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: GroupMaterialDto |

### DELETE /api/v1/groups/{groupId}/materials/{id}

Удалить материалы группы.

**Доступ:** Действующий автор, модератор или владелец.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| groupId | path | Да | string; — |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### GET /api/v1/notifications/settings

Получить настройки и доступность каналов.

**Доступ:** Активная сессия; данные текущего пользователя.

Параметры пути и query отсутствуют.

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: ReminderSettingsDto |

### PATCH /api/v1/notifications/settings

Сохранить настройки напоминаний.

**Доступ:** Активная сессия; данные текущего пользователя.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `ReminderSettingsInputDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: ReminderSettingsDto |

### POST /api/v1/notifications/subscriptions

Зарегистрировать подписку текущей сессии.

**Доступ:** Активная сессия; данные текущего пользователя.

Параметры пути и query отсутствуют.

**Тело:** `application/json`, схема `RegisterPushDto`.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### DELETE /api/v1/notifications/subscriptions/{transport}

Отключить подписки текущей сессии и платформы.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| transport | path | Да | string; enum=["ANDROID"] |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

### GET /api/v1/notifications/inbox

Получить последние 30 входящих напоминаний.

**Доступ:** Активная сессия; данные текущего пользователя.

Параметры пути и query отсутствуют.

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 200 | application/json: NotificationInboxDto |

### POST /api/v1/notifications/inbox/{id}/read

Пометить напоминание прочитанным.

**Доступ:** Активная сессия; данные текущего пользователя.

| Параметр | Где | Обязателен | Тип и ограничения |
| --- | --- | --- | --- |
| id | path | Да | string; — |

Тело запроса не предусмотрено.

| Объявленный HTTP-код | Тело ответа |
| --- | --- |
| 204 | Без тела |

## Словарь схем для Android

Знак вопроса не используется для nullable: обязательность поля и допустимость null указаны отдельно.

### HealthDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| status | string | Да | enum=["ok"] |
| service | string | Да | — |
| version | string | Да | — |
| timestamp | string / date-time | Да | — |

### ErrorDetailDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| code | string | Да | — |
| message | string | Да | — |
| requestId | string | Да | — |

### ApiErrorDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| error | ErrorDetailDto | Да | — |

### RegisterDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| email | string | Да | example="student@example.com" |
| password | string | Да | minLength=12; maxLength=128 |
| displayName | string | Да | minLength=2; maxLength=80 |
| timeZone | string | Да | example="Asia/Novosibirsk" |

### MessageDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| message | string | Да | — |

### LoginDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| email | string | Да | example="student@example.com" |
| password | string | Да | minLength=1; maxLength=128 |

### UserDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| id | string / uuid | Да | — |
| email | string | Да | — |
| displayName | string | Да | — |
| timeZone | string | Да | — |

### SessionDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| user | UserDto | Да | — |
| token | string | Нет | Only returned at native login; store in SecureStore |

### EmailDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| email | string | Да | example="student@example.com" |

### ResetPasswordDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| token | string | Да | — |
| password | string | Да | minLength=12; maxLength=128 |

### ProfileDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| displayName | string | Да | — |
| timeZone | string | Да | — |

### SubjectDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| name | string | Да | — |
| color | string | Да | example="#6554D9" |
| id | string / uuid | Да | — |

### SubjectsPageDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<SubjectDto> | Да | — |
| total | number | Да | — |

### SubjectInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| name | string | Да | — |
| color | string | Да | example="#6554D9" |

### TeacherDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| name | string | Да | — |
| email | string | Нет | nullable=true |
| phone | string | Нет | nullable=true |
| notes | string | Нет | nullable=true |
| id | string / uuid | Да | — |

### TeachersPageDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<TeacherDto> | Да | — |
| total | number | Да | — |

### TeacherInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| name | string | Да | — |
| email | string | Нет | nullable=true |
| phone | string | Нет | nullable=true |
| notes | string | Нет | nullable=true |

### EntryDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| semesterId | string / uuid | Да | — |
| subjectId | string / uuid | Да | — |
| teacherId | string | Нет | nullable=true |
| dayOfWeek | number | Да | minimum=1; maximum=7 |
| startTime | string | Да | example="09:00" |
| endTime | string | Да | example="10:30" |
| parity | string | Да | enum=["ALL", "EVEN", "ODD"] |
| room | string | Нет | nullable=true |
| id | string / uuid | Да | — |

### EntriesPageDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<EntryDto> | Да | — |
| total | number | Да | — |

### EntryInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| semesterId | string / uuid | Да | — |
| subjectId | string / uuid | Да | — |
| teacherId | string | Нет | nullable=true |
| dayOfWeek | number | Да | minimum=1; maximum=7 |
| startTime | string | Да | example="09:00" |
| endTime | string | Да | example="10:30" |
| parity | string | Да | enum=["ALL", "EVEN", "ODD"] |
| room | string | Нет | nullable=true |

### OccurrenceDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| id | string | Да | — |
| entryId | string / uuid | Да | — |
| semesterId | string / uuid | Да | — |
| subjectName | string | Да | — |
| color | string | Да | — |
| teacherName | string | Да | nullable=true |
| room | string | Да | nullable=true |
| originalDate | string / date | Да | — |
| date | string / date | Да | — |
| startsAt | string / date-time | Да | — |
| endsAt | string / date-time | Да | — |
| cancelled | boolean | Да | — |
| moved | boolean | Да | — |
| weekNumber | number | Да | — |

### OccurrencesDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<OccurrenceDto> | Да | — |

### ExceptionInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| cancelled | boolean | Да | — |
| replacementDate | string / date | Нет | — |
| startTime | string | Нет | — |
| endTime | string | Нет | — |

### SemesterDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| name | string | Да | — |
| startDate | string / date | Да | — |
| endDate | string / date | Да | — |
| weekStartDate | string / date | Да | — |
| timeZone | string | Да | — |
| id | string / uuid | Да | — |

### SemestersPageDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<SemesterDto> | Да | — |
| total | number | Да | — |

### SemesterInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| name | string | Да | — |
| startDate | string / date | Да | — |
| endDate | string / date | Да | — |
| weekStartDate | string / date | Да | — |
| timeZone | string | Да | — |

### TaskDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| id | string / uuid | Да | — |
| title | string | Да | — |
| description | string | Да | — |
| dueAt | string / date-time | Да | — |
| deadlineRevision | number | Да | — |
| subjectId | string / uuid | Да | nullable=true |
| subjectName | string | Да | nullable=true |
| subjectColor | string | Да | nullable=true |
| completedAt | string / date-time | Да | nullable=true |
| deadlineAtCompletion | string / date-time | Да | nullable=true |
| status | string | Да | enum=["OPEN", "OVERDUE", "COMPLETED_ON_TIME", "COMPLETED_LATE"] |

### TasksPageDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<TaskDto> | Да | — |
| total | number | Да | — |

### TaskInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| title | string | Да | — |
| description | string | Да | — |
| dueAt | string / date-time | Да | — |
| subjectId | string / uuid | Нет | nullable=true |

### TaskEventDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| id | string / uuid | Да | — |
| kind | string | Да | enum=["COMPLETED", "REOPENED"] |
| createdAt | string / date-time | Да | — |
| deadlineSnapshot | string / date-time | Да | — |

### TaskHistoryDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<TaskEventDto> | Да | — |

### StatisticsDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| total | number | Да | — |
| open | number | Да | — |
| completedOnTime | number | Да | — |
| completedLate | number | Да | — |
| overdue | number | Да | — |
| completionRate | number | Да | — |

### GroupTaskDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| id | string / uuid | Да | — |
| title | string | Да | — |
| description | string | Да | — |
| dueAt | string / date-time | Да | — |
| deadlineRevision | number | Да | — |
| completedAt | string / date-time | Да | nullable=true |
| deadlineAtCompletion | string / date-time | Да | nullable=true |
| status | string | Да | enum=["OPEN", "OVERDUE", "COMPLETED_ON_TIME", "COMPLETED_LATE"] |
| groupId | string / uuid | Да | — |
| groupName | string | Да | — |
| authorId | string / uuid | Да | nullable=true |
| authorName | string | Да | nullable=true |
| mode | string | Да | enum=["INDIVIDUAL", "SHARED"] |
| canComplete | boolean | Да | — |
| canEdit | boolean | Да | — |
| canDelete | boolean | Да | — |

### GroupTasksPageDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<GroupTaskDto> | Да | — |
| total | number | Да | — |

### GroupDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| id | string / uuid | Да | — |
| ownerId | string / uuid | Да | — |
| name | string | Да | — |
| subjectName | string | Да | — |
| description | string | Да | — |
| role | string | Да | enum=["OWNER", "MODERATOR", "MEMBER"] |
| linkedSubjectId | string / uuid | Да | nullable=true |
| createdAt | string / date-time | Да | — |

### GroupsPageDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<GroupDto> | Да | — |
| total | number | Да | — |

### GroupInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| name | string | Да | — |
| subjectName | string | Да | — |
| description | string | Нет | — |

### GroupJoinInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| code | string | Да | minLength=20; maxLength=20 |

### GroupSubjectInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| subjectId | string / uuid | Да | nullable=true |

### GroupMemberDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| userId | string / uuid | Да | — |
| displayName | string | Да | — |
| role | string | Да | enum=["OWNER", "MODERATOR", "MEMBER"] |
| joinedAt | string / date-time | Да | — |
| blocked | boolean | Да | — |

### GroupMembersPageDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<GroupMemberDto> | Да | — |
| total | number | Да | — |

### GroupRoleInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| role | string | Да | enum=["MEMBER", "MODERATOR"] |

### TransferGroupInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| userId | string / uuid | Да | — |

### GroupInvitationDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| id | string / uuid | Да | — |
| creatorId | string / uuid | Да | nullable=true |
| createdAt | string / date-time | Да | — |
| expiresAt | string / date-time | Да | — |
| revokedAt | string / date-time | Да | nullable=true |
| maxUses | number | Да | — |
| uses | number | Да | — |
| canRevoke | boolean | Да | — |

### GroupInvitationsPageDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<GroupInvitationDto> | Да | — |
| total | number | Да | — |

### GroupInvitationInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| expiresInHours | number | Нет | minimum=1; maximum=720; default=168 |
| maxUses | number | Нет | minimum=1; maximum=250; default=25 |

### NewGroupInvitationDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| id | string / uuid | Да | — |
| creatorId | string / uuid | Да | nullable=true |
| createdAt | string / date-time | Да | — |
| expiresAt | string / date-time | Да | — |
| revokedAt | string / date-time | Да | nullable=true |
| maxUses | number | Да | — |
| uses | number | Да | — |
| canRevoke | boolean | Да | — |
| code | string | Да | — |
| url | string | Да | — |

### NewGroupTaskInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| title | string | Да | — |
| description | string | Да | — |
| dueAt | string / date-time | Да | — |
| mode | string | Да | enum=["INDIVIDUAL", "SHARED"] |

### GroupTaskInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| title | string | Да | — |
| description | string | Да | — |
| dueAt | string / date-time | Да | — |

### GroupTaskEventDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| id | string / uuid | Да | — |
| kind | string | Да | enum=["COMPLETED", "REOPENED"] |
| createdAt | string / date-time | Да | — |
| deadlineSnapshot | string / date-time | Да | — |
| actorName | string | Да | nullable=true |

### GroupTaskHistoryDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<GroupTaskEventDto> | Да | — |
| total | number | Да | — |

### AttachmentDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| id | string / uuid | Да | — |
| name | string | Да | — |
| mimeType | string | Да | — |
| size | number | Да | — |
| createdAt | string / date-time | Да | — |

### AttachmentsDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<AttachmentDto> | Да | — |

### GroupMaterialDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| id | string / uuid | Да | — |
| groupId | string / uuid | Да | — |
| authorId | string / uuid | Да | nullable=true |
| authorName | string | Да | nullable=true |
| title | string | Да | — |
| description | string | Да | — |
| createdAt | string / date-time | Да | — |
| updatedAt | string / date-time | Да | — |
| attachmentCount | number | Да | — |

### GroupMaterialsPageDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<GroupMaterialDto> | Да | — |
| total | number | Да | — |

### GroupMaterialInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| title | string | Да | — |
| description | string | Да | — |

### ReminderSettingsDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| enabled | boolean | Да | — |
| minutesBefore | number | Да | minimum=1; maximum=10080 |
| androidAvailable | boolean | Да | — |
| subscribed | array<string> | Да | — |

### ReminderSettingsInputDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| enabled | boolean | Да | — |
| minutesBefore | number | Да | minimum=1; maximum=10080 |

### RegisterPushDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| transport | string | Да | enum=["ANDROID"] |
| address | string | Да | — |
| refreshOnly | boolean | Нет | Обновляет только активную подписку текущей сессии. |

### NotificationNoticeDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| id | string / uuid | Да | — |
| kind | string | Да | enum=["PERSONAL", "GROUP"] |
| taskId | string / uuid | Да | — |
| groupId | string / uuid | Да | nullable=true |
| scheduledAt | string / date-time | Да | — |
| createdAt | string / date-time | Да | — |
| readAt | string / date-time | Да | nullable=true |

### NotificationInboxDto

| Поле | Тип | Обязательно | Ограничения контракта |
| --- | --- | --- | --- |
| items | array<NotificationNoticeDto> | Да | — |
| unreadCount | number | Да | — |
