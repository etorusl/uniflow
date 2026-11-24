"""Create the editable Word report from the repository documentation sources."""
from pathlib import Path
import re
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from PIL import Image

BASE = Path(__file__).resolve().parents[1]
OUT = BASE / "deliverables"
DIAGRAMS = {
    "03-interface.md": ["navigation"],
    "04-architecture.md": ["architecture"],
    "05-database.md": ["db-personal", "db-groups", "db-notifications"],
    "06-security.md": ["auth-sequence"],
}


def hyperlink(paragraph, label, target):
    if not target.startswith(("https://", "http://", "#")):
        # Relative repository links stay meaningful when the Word file is moved.
        target = "https://github.com/etorusl/uniflow/blob/main/" + str((BASE / target).resolve().relative_to(BASE.parents[1]))
    link = OxmlElement("w:hyperlink")
    rel = paragraph.part.relate_to(target, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True)
    link.set(qn("r:id"), rel)
    run = OxmlElement("w:r")
    properties = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "333333")
    properties.append(color)
    run.append(properties)
    text = OxmlElement("w:t")
    text.text = label
    run.append(text)
    link.append(run)
    paragraph._p.append(link)


def rich(paragraph, text):
    pattern = r"(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))"
    for token in re.split(pattern, text):
        if not token:
            continue
        if token.startswith("**") and token.endswith("**"):
            paragraph.add_run(token[2:-2]).bold = True
        elif token.startswith("`") and token.endswith("`"):
            run = paragraph.add_run(token[1:-1])
            run.font.name = "Courier New"
            run.font.size = Pt(9)
        elif token.startswith("["):
            match = re.fullmatch(r"\[([^\]]+)\]\(([^)]+)\)", token)
            if match:
                hyperlink(paragraph, match[1], match[2])
            else:
                paragraph.add_run(token)
        else:
            paragraph.add_run(token)


def add_picture(document, name, caption, width=7.0):
    paragraph = document.add_paragraph()
    paragraph.paragraph_format.keep_with_next = True
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    paragraph.add_run().add_picture(str(BASE / "design" / (name + ".png")), width=Inches(width))
    paragraph = document.add_paragraph(caption, style="Caption")
    paragraph.paragraph_format.space_after = Pt(12)


def add_table(document, rows):
    count = len(rows[0])
    table = document.add_table(rows=1, cols=count)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    proportions = {2: [.31, .69], 3: [.24, .31, .45], 4: [.20, .34, .17, .29]}.get(count, [1 / count] * count)
    if rows[0][0] == "Модель и таблица":
        proportions = [.31, .34, .35]
    if rows[0][:2] == ["Токен", "HEX"]:
        proportions = [.25, .20, .55]
    # Matrices use narrow role columns and a wide action column.
    if rows[0][0] in ["Действие в группе", "Действие"] and count == 4:
        proportions = [.43, .19, .19, .19]
    for cell, ratio in zip(table.rows[0].cells, proportions):
        cell.width = Inches(7.0 * ratio)
    for column, ratio in zip(table.columns, proportions):
        column.width = Inches(7.0 * ratio)
    for idx, values in enumerate(rows):
        cells = table.rows[0].cells if idx == 0 else table.add_row().cells
        for col, (cell, value) in enumerate(zip(cells, values)):
            cell.width = Inches(7.0 * proportions[col])
            cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
            paragraph = cell.paragraphs[0]
            paragraph.paragraph_format.space_after = Pt(4)
            paragraph.paragraph_format.space_before = Pt(4)
            paragraph.paragraph_format.line_spacing = 1.05
            rich(paragraph, value)
            for run in paragraph.runs:
                run.font.size = Pt(9.5)
                if idx == 0:
                    run.bold = True
            tcpr = cell._tc.get_or_add_tcPr()
            margins = OxmlElement("w:tcMar")
            for side in ["top", "left", "bottom", "right"]:
                margin = OxmlElement("w:" + side)
                margin.set(qn("w:w"), "90")
                margin.set(qn("w:type"), "dxa")
                margins.append(margin)
            tcpr.append(margins)
            if idx == 0:
                shading = OxmlElement("w:shd")
                shading.set(qn("w:fill"), "F2F4F7")
                tcpr.append(shading)
        trpr = table.rows[idx]._tr.get_or_add_trPr()
        no_split = OxmlElement("w:cantSplit")
        trpr.append(no_split)
        if idx == 0:
            repeat = OxmlElement("w:tblHeader")
            trpr.append(repeat)
    document.add_paragraph().paragraph_format.space_after = Pt(2)


def add_markdown(document, filename):
    source = (BASE / filename).read_text()
    if filename == "07-api.md":
        source = source.split("## Полный каталог методов")[0]
        source = source.replace("Таблицы схем ниже", "Таблицы полного справочника API")
    lines = source.splitlines()
    i, diagram = 0, 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("```"):
            language = line[3:]
            block = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                block.append(lines[i])
                i += 1
            if language == "mermaid":
                name = DIAGRAMS[filename][diagram]
                add_picture(document, name, "Схема " + str(diagram + 1) + "   " + {
                    "navigation": "Основные переходы интерфейса", "architecture": "Компоненты приложения",
                    "db-personal": "Личные учебные данные", "db-groups": "Групповые данные",
                    "db-notifications": "Файлы и уведомления", "auth-sequence": "Создание и проверка сессии",
                }[name])
                diagram += 1
            else:
                for code_line in block:
                    p = document.add_paragraph()
                    p.paragraph_format.space_after = Pt(0)
                    run = p.add_run(code_line)
                    run.font.name = "Courier New"
                    run.font.size = Pt(9)
        elif re.match(r"^#{1,3} ", line):
            level = len(line) - len(line.lstrip("#"))
            title = line[level + 1:]
            # Keep document headings plain while preserving UC identifiers.
            title = title.replace("-", " ").replace("—", " ")
            document.add_heading(title, level=level)
        elif line.startswith("| "):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                values = [v.strip() for v in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?", v) for v in values):
                    rows.append(values)
                i += 1
            add_table(document, rows)
            continue
        else:
            p = document.add_paragraph()
            if re.match(r"^\d+\. ", line):
                p.paragraph_format.left_indent = Inches(.24)
                p.paragraph_format.first_line_indent = Inches(-.24)
            rich(p, line)
        i += 1


def build():
    document = Document()
    section = document.sections[0]
    section.page_width, section.page_height = Inches(8.5), Inches(11)
    section.top_margin = section.bottom_margin = Inches(.65)
    section.left_margin = section.right_margin = Inches(.75)
    normal = document.styles["Normal"]
    normal.font.name = "Arial"
    normal.font.size = Pt(11)
    normal.paragraph_format.line_spacing = 1.08
    normal.paragraph_format.space_after = Pt(5)
    # Page numbers help navigate the substantial specification and its appendix.
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    footer._p.append(field)
    for name, size in [("Title", 28), ("Subtitle", 15), ("Heading 1", 19), ("Heading 2", 14), ("Heading 3", 12), ("Caption", 10)]:
        style = document.styles[name]
        style.font.name = "Arial"
        style.font.size = Pt(size)
        style.font.color.rgb = RGBColor(0, 0, 0)
        style.paragraph_format.space_before = Pt(14 if name.startswith("Heading") else 0)
        style.paragraph_format.space_after = Pt(7)
        if name.startswith("Heading"):
            style.paragraph_format.keep_with_next = True
        if name == "Caption":
            style.font.bold = False
            style.font.italic = False
        # Remove theme border remnants from headings.
        ppr = style.element.find(qn("w:pPr"))
        if ppr is not None:
            for border in list(ppr.findall(qn("w:pBdr"))):
                ppr.remove(border)
    document.core_properties.title = "Проектирование приложения UniFlow"
    document.core_properties.subject = "Функциональное интерфейсное и техническое проектирование"
    document.core_properties.author = "UniFlow"
    document.add_paragraph("Проектирование приложения UniFlow", style="Title")
    document.add_paragraph("Функциональное интерфейсное и техническое проектирование", style="Subtitle")
    document.add_paragraph("Версия приложения 0.1.0\n24 ноября 2026 года")
    document.add_paragraph("UniFlow объединяет личное расписание, задания и закрытые учебные группы. Документ описывает пользовательские алгоритмы, интерфейс, структуру приложения, REST API, модель данных и правила доступа.")
    document.add_paragraph("Материалы интерфейсного проектирования представлены в редактируемом файле Figma. Полный справочник API приложен отдельно и доступен в исходниках документации.")
    p = document.add_paragraph()
    hyperlink(p, "Открыть проект Figma", "https://www.figma.com/design/xhrjwC2FwiIhOd8yTNtP58")
    p = document.add_paragraph()
    hyperlink(p, "Открыть полный справочник API", "https://github.com/etorusl/uniflow/blob/main/docs/technical-spec/07-api.md")
    document.add_heading("Содержание", level=1)
    sections = [
        ("01-overview.md", "Назначение и границы приложения"),
        ("02-functional.md", "Функциональное проектирование и 36 сценариев"),
        ("03-interface.md", "Интерфейс и дизайн система"),
        ("04-architecture.md", "Техническая архитектура"),
        ("05-database.md", "Проектирование базы данных"),
        ("06-security.md", "Аутентификация и авторизация"),
        ("07-api.md", "Документация API и примеры обмена"),
    ]
    for idx, (_, title) in enumerate(sections, 1):
        document.add_paragraph(str(idx) + "   " + title)
    document.add_paragraph("Приложение   Макеты интерфейса")
    document.add_page_break()
    for filename, _ in sections:
        add_markdown(document, filename)
    document.add_page_break()
    document.add_heading("Приложение Макеты интерфейса", level=1)
    document.add_paragraph("Копии экранов из Figma демонстрируют структуру и состояния. Компоненты и текст редактируются в оригинальном файле. Для просмотра деталей используйте увеличение PDF или Figma.")
    for name, label, width in [("ds", "Дизайн система", 6.5), ("today", "Сегодня", 7.0), ("schedule", "Расписание", 7.0), ("tasks", "Личные задания", 7.0), ("group", "Задания группы", 7.0), ("login", "Вход", 7.0), ("mobile", "Сегодня на Android", 2.7)]:
        if name != "ds":
            document.add_page_break()
        document.add_heading(label, level=2)
        add_picture(document, name, label + "   Копия редактируемого макета Figma", width=width)
    OUT.mkdir(exist_ok=True)
    path = OUT / "uniflow-design.docx"
    document.save(path)
    print(path)


if __name__ == "__main__":
    build()
