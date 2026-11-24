"""Render documentation diagrams as PNG and editable SVG without network access."""
from pathlib import Path
from html import escape
import math
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "design"
FONT_ROOT = Path("/System/Library/Fonts/Supplemental")


class Diagram:
    def __init__(self, name, width, height, title):
        self.name, self.width, self.height = name, width, height
        self.image = Image.new("RGB", (width, height), "white")
        self.draw = ImageDraw.Draw(self.image)
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}"><rect width="100%" height="100%" fill="white"/>']
        self.text(40, 24, title, 32, True)

    def text(self, x, y, text, size=24, bold=False, color="#17223B"):
        font = ImageFont.truetype(str(FONT_ROOT / ("Arial Bold.ttf" if bold else "Arial.ttf")), size)
        self.draw.text((x, y), text, font=font, fill=color)
        self.svg.append(f'<text x="{x}" y="{y + size}" font-family="Arial,sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{escape(text)}</text>')

    def box(self, x, y, title, subtitle="", width=320, height=100):
        self.draw.rounded_rectangle((x, y, x + width, y + height), radius=14, fill="#F5F6FA", outline="#737B8E", width=2)
        self.svg.append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="14" fill="#F5F6FA" stroke="#737B8E" stroke-width="2"/>')
        self.text(x + 18, y + 15, title, 25, True)
        if subtitle:
            self.text(x + 18, y + 56, subtitle, 20)

    def arrow(self, points, label=None):
        self.draw.line(points, fill="#6554D9", width=3)
        x, y = points[-1]
        px, py = points[-2]
        angle = math.atan2(y - py, x - px)
        head = [(x, y), (x - 12 * math.cos(angle - .45), y - 12 * math.sin(angle - .45)), (x - 12 * math.cos(angle + .45), y - 12 * math.sin(angle + .45))]
        self.draw.polygon(head, fill="#6554D9")
        self.svg.append('<polyline points="' + ' '.join(f'{a},{b}' for a, b in points) + '" fill="none" stroke="#6554D9" stroke-width="3"/>')
        self.svg.append('<polygon points="' + ' '.join(f'{a},{b}' for a, b in head) + '" fill="#6554D9"/>')
        if label:
            start, end = max(zip(points, points[1:]), key=lambda pair: math.dist(*pair))
            a, b = (start[0] + end[0]) / 2, (start[1] + end[1]) / 2
            font = ImageFont.truetype(str(FONT_ROOT / "Arial.ttf"), 20)
            width = self.draw.textlength(label, font=font)
            if abs(end[0] - start[0]) >= abs(end[1] - start[1]):
                self.text(a - width / 2, b - 30, label, 20)
            else:
                self.text(a + 8, b - 10, label, 20)

    def save(self):
        OUT.mkdir(exist_ok=True)
        self.image.save(OUT / (self.name + ".png"))
        (OUT / (self.name + ".svg")).write_text("\n".join(self.svg + ["</svg>"]))


def build():
    d = Diagram("architecture", 1500, 750, "Компоненты UniFlow")
    for x, y, title, sub in [(40, 130, "Веб и Android", "Общий клиент Expo"), (540, 130, "NestJS REST API", "Контроллеры и сервисы"), (1040, 130, "PostgreSQL", "Данные и pg-boss"), (540, 420, "Worker", "Почта и напоминания"), (1040, 420, "S3 хранилище", "Закрытый бакет"), (40, 420, "SMTP и Push", "Внешние адаптеры")]:
        d.box(x, y, title, sub)
    d.arrow([(360, 180), (540, 180)], "HTTPS / API")
    d.arrow([(860, 180), (1040, 180)])
    d.arrow([(860, 470), (950, 470), (950, 230), (1040, 230)])
    d.arrow([(860, 205), (990, 205), (990, 470), (1040, 470)])
    d.arrow([(860, 470), (1040, 470)])
    d.arrow([(540, 470), (360, 470)])
    d.text(40, 650, "Очередь использует PostgreSQL. API и worker запускаются отдельными процессами.", 25)
    d.save()

    d = Diagram("db-personal", 1500, 890, "Связи личных учебных данных")
    for x, y, title, sub in [(540, 100, "User", "id, email, timeZone"), (40, 300, "Session", "userId → User"), (540, 300, "Subject", "userId → User"), (1040, 300, "Semester", "userId → User"), (40, 500, "ActionToken", "userId → User"), (540, 500, "Task", "subjectId может быть null"), (1040, 500, "ScheduleEntry", "semesterId, subjectId"), (40, 700, "Teacher", "userId → User"), (540, 700, "TaskEvent", "taskId → Task"), (1040, 700, "ScheduleException", "entryId + originalDate")]:
        d.box(x, y, title, sub)
    d.arrow([(540, 150), (200, 150), (200, 300)], "1 : N")
    d.arrow([(700, 200), (700, 300)], "1 : N")
    d.arrow([(860, 150), (1200, 150), (1200, 300)], "1 : N")
    d.arrow([(700, 400), (700, 500)], "0..1 : N")
    d.arrow([(1200, 400), (1200, 500)], "1 : N")
    d.arrow([(860, 350), (930, 350), (930, 550), (1040, 550)], "1 : N")
    d.arrow([(700, 600), (700, 700)], "1 : N")
    d.arrow([(1200, 600), (1200, 700)], "1 : N")
    d.arrow([(540, 150), (20, 150), (20, 550), (40, 550)])
    d.arrow([(540, 150), (10, 150), (10, 750), (40, 750)])
    d.text(40, 842, "Дополнительные связи владельца и преподавателя перечислены в словаре и полной ER-схеме.", 22)
    d.save()

    d = Diagram("db-groups", 1500, 890, "Связи групповых данных")
    for x, y, title, sub in [(40, 120, "User", "Владелец и участник"), (540, 120, "StudyGroup", "ownerId; archivedAt"), (1040, 120, "GroupMember", "PK groupId + userId"), (40, 370, "GroupInvitation", "tokenHash; maxUses"), (540, 370, "GroupTask", "INDIVIDUAL / SHARED"), (1040, 370, "GroupMaterial", "Название и описание"), (40, 650, "GroupAuditEvent", "Действия в группе"), (540, 650, "GroupTaskCompletion", "PK taskId + userId"), (1040, 650, "GroupTaskEvent", "История выполнения")]:
        d.box(x, y, title, sub)
    d.arrow([(360, 170), (540, 170)], "1 : N")
    d.arrow([(860, 170), (1040, 170)], "1 : N")
    d.arrow([(540, 200), (450, 200), (450, 300), (200, 300), (200, 370)], "1 : N")
    d.arrow([(700, 220), (700, 370)], "1 : N")
    d.arrow([(860, 200), (980, 200), (980, 420), (1040, 420)], "1 : N")
    d.arrow([(700, 470), (700, 650)], "1 : N")
    d.arrow([(860, 420), (970, 420), (970, 700), (1040, 700)], "1 : N")
    d.arrow([(540, 200), (400, 200), (400, 610), (200, 610), (200, 650)])
    d.text(40, 820, "Отметки INDIVIDUAL хранятся отдельно. Состояние SHARED хранится в GroupTask.", 24)
    d.save()

    d = Diagram("db-notifications", 1500, 820, "Связи файлов и уведомлений")
    for x, y, title, sub in [(40, 120, "Task / GroupTask", "Родитель задания"), (540, 120, "Attachment", "Не более одного родителя"), (1040, 120, "GroupMaterial", "Родитель материала"), (40, 380, "User", "Получатель"), (540, 380, "PushSubscription", "Ссылка на User и Session"), (1040, 380, "ReminderDelivery", "Ключ подписки и поколения"), (40, 620, "ReminderPreference", "userId — уникален"), (540, 620, "ReminderNotice", "userId; kind; taskId"), (1040, 620, "ReminderRevision", "key; version")]:
        d.box(x, y, title, sub)
    d.arrow([(360, 170), (540, 170)], "1 : N")
    d.arrow([(1040, 170), (860, 170)], "1 : N")
    d.arrow([(360, 430), (540, 430)], "1 : N")
    d.arrow([(860, 430), (1040, 430)], "1 : N")
    d.arrow([(200, 480), (200, 620)], "1 : 0..1")
    d.arrow([(360, 460), (450, 460), (450, 670), (540, 670)], "1 : N")
    d.text(40, 770, "kind + taskId — полиморфная ссылка на задание, без прямого внешнего ключа.", 24)
    d.save()

    d = Diagram("auth-sequence", 1500, 770, "Создание и проверка сессии")
    for x, title in [(40, "Студент и клиент"), (580, "NestJS API"), (1100, "PostgreSQL")]:
        d.box(x, 110, title, "", width=300, height=80)
        d.draw.line([(x + 150, 190), (x + 150, 700)], fill="#E5E8EF", width=3)
        d.svg.append(f'<line x1="{x+150}" y1="190" x2="{x+150}" y2="700" stroke="#E5E8EF" stroke-width="3"/>')
    for y, start, end, label in [(270, 190, 730, "POST auth/login"), (350, 730, 1250, "Проверить пароль"), (430, 730, 1250, "Сохранить хеш токена"), (510, 730, 190, "Cookie + CSRF / native token"), (590, 190, 730, "Защищённый запрос"), (670, 730, 1250, "Проверить сессию и права")]:
        d.arrow([(start, y), (end, y)])
        d.text(min(start, end) + 20, y - 34, label, 24)
    d.save()

    d = Diagram("navigation", 1500, 660, "Основные переходы интерфейса")
    for x, y, title in [(40, 120, "Вход и регистрация"), (540, 120, "Сегодня"), (1040, 120, "Профиль"), (40, 400, "Расписание"), (540, 400, "Задания"), (1040, 400, "Группы")]:
        d.box(x, y, title)
    d.arrow([(360, 170), (540, 170)])
    d.arrow([(860, 170), (1040, 170)])
    d.arrow([(600, 220), (600, 300), (200, 300), (200, 400)])
    d.arrow([(700, 220), (700, 400)])
    d.arrow([(800, 220), (800, 300), (1200, 300), (1200, 400)])
    d.text(40, 580, "Вложения доступны из заданий и материалов; входящие и настройки — из профиля.", 24)
    d.save()
    print("Rendered six diagrams as SVG and PNG")


if __name__ == "__main__":
    build()
