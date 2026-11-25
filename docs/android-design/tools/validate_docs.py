"""Validate the independent Android documentation without changing the app."""
from pathlib import Path
import re,json,hashlib,sys
from zipfile import ZipFile
B=Path(__file__).resolve().parents[1];R=B.parents[1]
errors=[]
for p in B.rglob('*.md'):
 text=p.read_text()
 if re.search(r'веб|браузер|\bweb\b|cookie|csrf|VAPID',text,re.I):errors.append('Unexpected platform mention: '+str(p.relative_to(B)))
 for target in re.findall(r'\[[^\]]*\]\(([^)]+)\)',text):
  if target.startswith(('http://','https://','#')):continue
  if not (p.parent/target.split('#')[0]).exists():errors.append('Missing link: '+target)
f=(B/'02-functional.md').read_text()
if re.findall(r'^### UC-(\d{2}) ',f,re.M)!=[f'{n:02}' for n in range(1,37)]:errors.append('UC coverage')
for case in re.split(r'^### UC-\d{2} ',f,flags=re.M)[1:]:
 for marker in ['**Актор:**','**Триггер:**','**Альтернативы:**','**Результат:**']:
  if marker not in case:errors.append('UC field '+marker)
 if not re.search(r'^1\. ',case,re.M):errors.append('Missing algorithm')
spec=json.loads((R/'apps/server/openapi.json').read_text());idx=json.loads((B/'api-index.json').read_text())
ops={(m.upper(),p) for p,ms in spec['paths'].items() for m in ms if m in ['get','post','put','patch','delete']}
if ops!={(o['method'],o['path']) for o in idx['operations']}:errors.append('API coverage')
if idx['openapiSha256']!=hashlib.sha256((R/'apps/server/openapi.json').read_bytes()).hexdigest():errors.append('Stale API')
if idx['schemaCount']!=len(spec['components']['schemas']):errors.append('Schema coverage')
if re.search(r'веб|браузер|\bweb\b|cookie|csrf|VAPID',(B/'api-reference.html').read_text(),re.I):errors.append('HTML platform mention')
scene=json.loads((B/'design/android-scene.json').read_text())
if len(scene['screens'])!=6 or any(s['w']!=390 for s in scene['screens'].values()):errors.append('Android frame sizes')
for name in ['ds','today','schedule','tasks','group','login','profile','architecture','navigation','auth-sequence','db-personal','db-groups','db-notifications']:
 for ext in ['svg','png']:
  if not (B/'design'/f'{name}.{ext}').is_file():errors.append('Missing visual '+name+'.'+ext)
for ext in ['docx','pdf']:
 if not (B/'deliverables'/f'uniflow-android-design.{ext}').is_file():errors.append('Missing report '+ext)
with ZipFile(B/'deliverables/uniflow-android-design.docx') as z:
 xml=z.read('word/document.xml').decode()
 if re.search(r'веб|браузер|cookie|csrf|VAPID',xml,re.I):errors.append('Report platform mention')
models=set(re.findall(r'^model (\w+)',(R/'apps/server/prisma/schema.prisma').read_text(),re.M))
database=(B/'05-database.md').read_text()
if any('`'+model+'` /' not in database for model in models):errors.append('Database model coverage')
from pypdf import PdfReader
pdf=PdfReader(B/'deliverables/uniflow-android-design.pdf')
if any(re.fullmatch(r'\s*\d+\s*',page.extract_text() or '') for page in pdf.pages):errors.append('Blank report page')
metadata=json.loads((B/'figma.json').read_text())
print(json.dumps({'useCases':36,'operations':len(ops),'schemas':len(spec['components']['schemas']),'androidScreens':6,'figmaStatus':metadata['status'],'errors':errors},ensure_ascii=False,indent=2))
sys.exit(bool(errors))
