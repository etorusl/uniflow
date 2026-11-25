"""Build the offline API reference from the repository's existing OpenAPI."""
import hashlib
import html
import json
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE.parents[1]
SOURCE = ROOT / "apps/server/openapi.json"
SPEC = json.loads(SOURCE.read_text())
# This reference shows the contract fields used by the Android client.
for name, fields in {
    "SessionDto": ["csrfToken"],
    "ReminderSettingsDto": ["webAvailable", "webPublicKey"],
    "RegisterPushDto": ["p256dh", "auth"],
}.items():
    schema = SPEC["components"]["schemas"].get(name, {})
    for field in fields:
        schema.get("properties", {}).pop(field, None)
        if field in schema.get("required", []):
            schema["required"].remove(field)
def android_profile(value):
    if isinstance(value, dict):
        if isinstance(value.get("enum"), list) and "ANDROID" in value["enum"]:
            value["enum"] = [v for v in value["enum"] if v != "WEB"]
        for child in value.values():
            android_profile(child)
    elif isinstance(value, list):
        for child in value:
            android_profile(child)
android_profile(SPEC)



def schema_type(s):
    if "$ref" in s:
        return s["$ref"].rsplit("/", 1)[-1]
    if s.get("type") == "array":
        return "array<" + schema_type(s.get("items", {})) + ">"
    return s.get("type", "object") + (" / " + s["format"] if s.get("format") else "")


def constraints(s):
    parts = []
    for k in ["minimum", "maximum", "minLength", "maxLength", "pattern", "default", "enum", "nullable", "example"]:
        if k in s:
            parts.append(k + "=" + json.dumps(s[k], ensure_ascii=False))
    if s.get("description"):
        parts.append(s["description"])
    return "; ".join(parts).replace("|", " / ") or "—"


def purpose(method, path):
    short = path.removeprefix("/api/v1")
    exact = {
        "health/live": "Проверить HTTP-процесс", "health/ready": "Проверить готовность зависимостей",
        "auth/register": "Зарегистрировать аккаунт", "auth/login": "Войти и создать сессию",
        "auth/session": "Получить текущую сессию", "auth/logout": "Завершить текущую сессию",
        "auth/forgot-password": "Запросить письмо восстановления", "auth/reset-password": "Установить новый пароль",
        "users/me": "Обновить имя и часовой пояс", "statistics/me": "Получить личный прогресс",
        "groups/join": "Принять приглашение", "groups/tasks": "Задания всех действующих групп",
        "schedule/occurrences": "Получить конкретные занятия периода",
    }
    if short.strip("/") in exact:
        return exact[short.strip("/")]
    if short.endswith("/complete"):
        return "Отметить выполнение задания"
    if short.endswith("/reopen"):
        return "Вернуть задание в работу"
    if short.endswith("/history"):
        return "Получить историю выполнения"
    if "/exceptions/" in short:
        return "Сохранить отмену или перенос" if method == "put" else "Восстановить исходное занятие"
    if short.endswith("/unblock"):
        return "Снять блокировку вступления"
    if short.endswith("/leave"):
        return "Выйти из группы"
    if short.endswith("/transfer-ownership"):
        return "Передать владение группой"
    if short.endswith("/subject"):
        return "Связать группу с личным предметом"
    if short.endswith("/statistics"):
        return "Получить прогресс общих заданий группы"
    if short.endswith("/content"):
        return "Скачать байты вложения"
    if short.endswith("/read"):
        return "Пометить напоминание прочитанным"
    if "/files/targets/" in short:
        return "Получить список готовых вложений" if method == "get" else "Загрузить файл в публикацию"
    if short.startswith("/notifications/"):
        return {
            ("get", "/notifications/settings"): "Получить настройки и доступность каналов",
            ("patch", "/notifications/settings"): "Сохранить настройки напоминаний",
            ("post", "/notifications/subscriptions"): "Зарегистрировать подписку текущей сессии",
            ("delete", "/notifications/subscriptions/{transport}"): "Отключить подписки текущей сессии и платформы",
            ("get", "/notifications/inbox"): "Получить последние 30 входящих напоминаний",
        }.get((method, short), "Операция уведомлений")
    noun = next((n for key, n in [
        ("materials", "материалы группы"), ("invitations", "приглашения"), ("members", "участники группы"),
        ("subjects", "личные предметы"), ("teachers", "личные преподаватели"), ("semesters", "семестры"),
        ("entries", "шаблоны пар"), ("tasks", "задания"), ("files", "вложения"), ("groups", "группы"),
    ] if key in short.split("/")), "ресурс")
    verb = {"get": "Получить", "post": "Создать", "put": "Сохранить", "patch": "Изменить", "delete": "Удалить"}[method]
    if short == "/groups/{groupId}" and method == "delete":
        return "Архивировать группу"
    if "/invitations/" in short and method == "delete":
        return "Отозвать приглашение"
    if "/members/" in short and method == "delete":
        return "Исключить и заблокировать участника"
    if "/members/" in short and method == "patch":
        return "Назначить или снять роль модератора"
    return verb + " " + noun


def permission(method, path):
    p = path.removeprefix("/api/v1")
    if p.startswith("/health/") or p in ["/auth/register", "/auth/login", "/auth/forgot-password", "/auth/reset-password"]:
        return "Без сессии"
    if "/files/" in p:
        return "Сессия и доступ к родителю; добавление/удаление — владелец личного задания или автор групповой публикации"
    if p.startswith("/groups/{groupId}"):
        if p.endswith("/transfer-ownership") or p.endswith("/unblock") or ("/members/" in p and method == "patch"):
            return "Действующий владелец"
        if p == "/groups/{groupId}" and method in ["patch", "delete"]:
            return "Действующий владелец"
        if p.endswith("/leave"):
            return "Действующий участник или модератор; владелец сначала передаёт владение"
        if "invitations" in p:
            return "Модератор/владелец; отзыв модератором только своего приглашения"
        if "/members/" in p and method == "delete":
            return "Модератор — обычного участника; владелец — участника или модератора"
        if ("/tasks/" in p or "/materials/" in p) and method == "patch":
            return "Действующий участник и автор публикации"
        if ("/tasks/" in p or "/materials/" in p) and method == "delete":
            return "Действующий автор, модератор или владелец"
        if p.endswith("/complete") or p.endswith("/reopen"):
            return "INDIVIDUAL — собственная отметка; SHARED — действующий автор/модератор/владелец"
        if p.endswith("/history"):
            return "Действующий участник; INDIVIDUAL — только собственная история"
        if p.endswith("/members"):
            return "Действующий участник; список заблокированных — только владелец"
        return "Действующий участник неархивированной группы"
    if p.startswith("/groups"):
        return "Активная сессия; список ограничен действующими членствами"
    return "Активная сессия; данные текущего пользователя"


def cell(v):
    return str(v).replace("|", " / ").replace("\n", " ")


def table(headers, rows):
    return "\n".join(["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"] + ["| " + " | ".join(cell(x) for x in row) + " |" for row in rows]) + "\n"


def build():
    ops = [(m, p, o) for p, ps in SPEC["paths"].items() for m, o in ps.items() if m in ["get", "post", "put", "patch", "delete"]]
    text = (BASE / "tools/api-intro.md").read_text() + "\n\n## Полный каталог методов\n\n"
    text += f"Контракт содержит {len(ops)} HTTP-операций и {len(SPEC['components']['schemas'])} именованную схему. Префикс `/api/v1` в таблице сохранён.\n\n"
    text += table(["Метод", "Путь", "Назначение"], [(m.upper(), "`" + p + "`", purpose(m, p)) for m, p, _ in ops])
    text += "\n## Параметры тела и ответы методов\n"
    for method, path, op in ops:
        text += f"\n### {method.upper()} {path}\n\n{purpose(method, path)}.\n\n**Доступ:** {permission(method, path)}.\n\n"
        params = op.get("parameters", [])
        if params:
            text += table(["Параметр", "Где", "Обязателен", "Тип и ограничения"], [(p["name"], p["in"], "Да" if p.get("required") else "Нет", schema_type(p.get("schema", {})) + "; " + constraints(p.get("schema", {}))) for p in params]) + "\n"
        else:
            text += "Параметры пути и query отсутствуют.\n\n"
        content = op.get("requestBody", {}).get("content", {})
        if content:
            for mime, body in content.items():
                text += f"**Тело:** `{mime}`, схема `{schema_type(body.get('schema', {}))}`. "
                if mime == "multipart/form-data":
                    text += "Обязательное поле `file` — binary; необязательное `name` — строка до 240 символов. "
                text += "\n\n"
        else:
            text += "Тело запроса не предусмотрено.\n\n"
        rows = []
        for code, response in op["responses"].items():
            response_content = response.get("content", {})
            rows.append((code, "; ".join(f"{mime}: {schema_type(body.get('schema', {}))}" for mime, body in response_content.items()) or "Без тела"))
        text += table(["Объявленный HTTP-код", "Тело ответа"], rows)
    text += "\n## Словарь схем для Android\n\nЗнак вопроса не используется для nullable: обязательность поля и допустимость null указаны отдельно.\n"
    for name, s in SPEC["components"]["schemas"].items():
        text += "\n### " + name + "\n\n"
        required = s.get("required", [])
        text += table(["Поле", "Тип", "Обязательно", "Ограничения контракта"], [(key, schema_type(prop), "Да" if key in required else "Нет", constraints(prop)) for key, prop in s.get("properties", {}).items()])
    text = "\n".join(line.rstrip() for line in text.splitlines()) + "\n"
    (BASE / "07-api.md").write_text(text)
    index = {"openapiSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(), "operationCount": len(ops), "schemaCount": len(SPEC["components"]["schemas"]), "operations": [{"method": m.upper(), "path": p, "purpose": purpose(m, p), "permission": permission(m, p)} for m, p, _ in ops]}
    (BASE / "api-index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n")
    # This renderer intentionally supports the Markdown subset emitted above.
    from render_markdown import markdown_html
    body = markdown_html(text)
    document = '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UniFlow Android API</title><style>body{font:16px/1.65 system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 24px;color:#17223b}h1,h2,h3{line-height:1.3}h2{margin-top:56px}h3{margin-top:36px;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;margin:20px 0;font-size:14px}th,td{padding:10px 12px;border:1px solid #e5e8ef;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f5f6fa}pre{background:#f5f6fa;padding:20px;overflow:auto}code{font:13px ui-monospace,monospace;overflow-wrap:anywhere}a{color:#6554d9}input{position:sticky;top:12px;width:100%;padding:14px;box-sizing:border-box;border:1px solid #dce0e9;border-radius:10px;background:white}@media print{input{display:none}h2,h3{break-after:avoid}tr{break-inside:avoid}}</style><h1>UniFlow Android API</h1><p>Справочник API Android приложения. Введите название метода или DTO для поиска.</p><input type="search" aria-label="Найти текст" placeholder="Поиск по странице — Enter" onkeydown="if(event.key===\'Enter\')window.find(this.value)">' + body + '</html>'
    (BASE / "api-reference.html").write_text(document)
    print(json.dumps({"operations": len(ops), "schemas": len(SPEC["components"]["schemas"])}))


if __name__ == "__main__":
    build()
