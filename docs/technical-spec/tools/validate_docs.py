"""Check documentation links, API coverage, UC numbering and saved artifacts."""
from pathlib import Path
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from zipfile import ZipFile

BASE = Path(__file__).resolve().parents[1]
ROOT = BASE.parents[1]


def validate():
    errors = []
    for path in BASE.rglob('*.md'):
        for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)', path.read_text()):
            if target.startswith(('http://', 'https://', '#')):
                continue
            destination = (path.parent / target.split('#')[0]).resolve()
            if not destination.exists():
                errors.append(f'Missing link: {path.relative_to(BASE)} -> {target}')
    functional = (BASE / '02-functional.md').read_text()
    cases = re.findall(r'^### UC-(\d{2}) ', functional, re.M)
    if cases != [f'{n:02}' for n in range(1, 37)]:
        errors.append('UC identifiers must be unique and sequential from 01 to 36')
    for block in re.split(r'^### UC-\d{2} ', functional, flags=re.M)[1:]:
        for marker in ['**Актор:**', '**Триггер:**', '**Альтернативы:**', '**Результат:**']:
            if marker not in block:
                errors.append(f'Missing UC field {marker}: {block.splitlines()[0]}')
        if not re.search(r'^1\. ', block, re.M):
            errors.append('Missing numbered UC flow')
    source = ROOT / 'apps/server/openapi.json'
    spec = json.loads(source.read_text())
    index = json.loads((BASE / 'api-index.json').read_text())
    expected = {(method.upper(), path) for path, operations in spec['paths'].items() for method in operations if method in ['get', 'post', 'put', 'patch', 'delete']}
    indexed = {(op['method'], op['path']) for op in index['operations']}
    if expected != indexed or index['operationCount'] != len(expected):
        errors.append('API operation coverage differs from OpenAPI')
    if index['openapiSha256'] != hashlib.sha256(source.read_bytes()).hexdigest():
        errors.append('API reference is stale; run build_api.py')
    api_text = (BASE / '07-api.md').read_text()
    for method, path in expected:
        if f'### {method} {path}' not in api_text:
            errors.append(f'Missing detailed API entry: {method} {path}')
    for schema in spec['components']['schemas']:
        if f'### {schema}\n' not in api_text:
            errors.append('Missing API schema: ' + schema)
    models = re.findall(r'^model (\w+) ', (ROOT / 'apps/server/prisma/schema.prisma').read_text(), re.M)
    dictionary = (BASE / '05-database.md').read_text()
    for model in models:
        if f'`{model}`' not in dictionary:
            errors.append('Missing database model: ' + model)
    figma = json.loads((BASE / 'figma.json').read_text())
    if len(figma['pages']) != 2 or len(figma['screens']) < 4:
        errors.append('Expected two Figma pages and at least four screens')
    for name in ['ds', 'today', 'schedule', 'tasks', 'group', 'login', 'mobile']:
        if not (BASE / 'design' / (name + '.png')).is_file():
            errors.append('Missing Figma preview: ' + name)
    for svg in (BASE / 'design').glob('*.svg'):
        ET.parse(svg)
    for extension in ['docx', 'pdf']:
        artifact = BASE / 'deliverables' / ('uniflow-design.' + extension)
        if not artifact.is_file() or artifact.stat().st_size < 1000:
            errors.append('Missing deliverable: ' + artifact.name)
    docx = BASE / 'deliverables/uniflow-design.docx'
    if docx.exists():
        with ZipFile(docx) as z:
            xml = z.read('word/document.xml').decode()
            if 'UC 36' not in xml or 'xhrjwC2FwiIhOd8yTNtP58' not in z.read('word/_rels/document.xml.rels').decode():
                errors.append('Word report is missing final UC or Figma link')
    if errors:
        print('\n'.join(errors))
        raise SystemExit(1)
    print(json.dumps({'localLinks':'ok','useCases':len(cases),'apiOperations':len(expected),'apiSchemas':len(spec['components']['schemas']),'databaseModels':len(models),'figmaPages':len(figma['pages']),'figmaScreens':len(figma['screens']),'deliverables':'present'},ensure_ascii=False))


if __name__ == '__main__':
    validate()
