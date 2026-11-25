"""Small deterministic renderer for the documentation's Markdown subset."""
import html
import re


def inline(text):
    text = html.escape(text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    return text


def markdown_html(source):
    lines = source.splitlines()
    out = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith("```"):
            code = []
            i += 1
            while i < len(lines) and not lines[i].startswith("```"):
                code.append(lines[i])
                i += 1
            out.append("<pre><code>" + html.escape("\n".join(code)) + "</code></pre>")
        elif re.match(r"^#{1,6} ", line):
            level = len(line) - len(line.lstrip("#"))
            content = line[level + 1:]
            anchor = re.sub(r"[^\w-]", "-", content).strip("-")
            out.append(f'<h{level} id="{anchor}">{inline(content)}</h{level}>')
        elif line.startswith("| "):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                values = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-+:?", v) for v in values):
                    rows.append(values)
                i += 1
            out.append("<table><thead><tr>" + "".join("<th>" + inline(v) + "</th>" for v in rows[0]) + "</tr></thead><tbody>" + "".join("<tr>" + "".join("<td>" + inline(v) + "</td>" for v in row) + "</tr>" for row in rows[1:]) + "</tbody></table>")
            continue
        elif re.match(r"^\d+\. ", line):
            out.append("<ol>")
            while i < len(lines) and re.match(r"^\d+\. ", lines[i]):
                out.append("<li>" + inline(re.sub(r"^\d+\. ", "", lines[i])) + "</li>")
                i += 1
            out.append("</ol>")
            continue
        elif line.startswith("- "):
            out.append("<ul>")
            while i < len(lines) and lines[i].startswith("- "):
                out.append("<li>" + inline(lines[i][2:]) + "</li>")
                i += 1
            out.append("</ul>")
            continue
        else:
            out.append("<p>" + inline(line) + "</p>")
        i += 1
    return "\n".join(out)
