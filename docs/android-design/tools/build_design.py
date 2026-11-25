"""Build the Android scene and an editable native Figma import script."""
from pathlib import Path
import json,copy,math
from PIL import Image,ImageDraw,ImageFont
from html import escape
B=Path(__file__).resolve().parents[1]; D=B/'design'; P=B/'figma-plugin'
C={'background':'#F5F6FA','surface':'#FFFFFF','ink':'#17223B','muted':'#737B8E','border':'#E5E8EF','primary':'#6554D9','primarySoft':'#EFECFC','green':'#16876C','greenSoft':'#E7F5EE','danger':'#B63E4A','dangerSoft':'#FFF0EF','amber':'#A77522','inputBorder':'#DCE0E9','placeholder':'#989EAE'}
T={'Title':[30,40,800],'Heading':[18,26,700],'Body':[15,24,400],'Label':[13,20,600],'Button':[14,22,700],'Caption':[12,20,400],'Metric':[29,36,800],'Brand':[21,26,800]}
COMP={}
def text(s,style='Body',color='ink',w=None,name=None):return dict(type='text',text=s,style=style,color=color,w=w,name=name or s[:45])
def box(name,children,w=350,gap=18,pad=0,bg=None,radius=0,row=False,border=False,h=None):return dict(type='frame',name=name,children=children,w=w,gap=gap,pad=pad,bg=bg,radius=radius,row=row,border=border,h=h)
def inst(key,props=None,w=None,name=None):return dict(type='instance',key=key,props=props or {},w=w,name=name or key)
def button(s,primary=False,w=None,name=None):return inst('Button/'+('Primary' if primary else 'Secondary')+'/Default',{'Label':s},w,name)
def row(name,children,w=350,gap=12):return box(name,children,w,gap,row=True)
def heading(s,sub=None):return box('Заголовок', [text(s,'Title',w=350)]+([text(sub,'Body','muted',350)] if sub else []),gap=6)
for tone in ['Primary','Secondary']:
 for state in ['Default','Disabled','Loading']:
  k=f'Button/{tone}/{state}';COMP[k]=box(k,[text('Сохранить' if state!='Loading' else 'Сохранение…','Button','surface' if tone=='Primary' else 'primary',name='Label')],w=None,gap=8,pad=[12,18],bg='primary' if tone=='Primary' else 'primarySoft',radius=10,row=True,h=46)
  COMP[k]['opacity']=1 if state=='Default' else .6
COMP['Field']=box('Field',[text('Email','Label',name='Label'),box('Input',[text('student@example.com','Body',name='Value')],w=350,gap=0,pad=[12,13],bg='surface',radius=10,border=True,h=48)],w=350,gap=8)
for selected in [False,True]:
 COMP['Nav/'+str(selected)]=box('Nav/'+str(selected),[text('◷','Heading','primary' if selected else 'muted',name='Icon'),text('Сегодня','Caption','primary' if selected else 'muted',name='Label')],w=84,gap=3,pad=[7,0],bg='primarySoft' if selected else None,radius=10)
 COMP['Nav/'+str(selected)]['center']=True
for tone in ['primary','green','amber','danger']:
 COMP['Statistic/'+tone]=box('Statistic/'+tone,[text('12','Metric',tone,name='Value'),text('Всего заданий','Caption','muted',133,name='Label')],w=169,gap=4,pad=18,bg='surface',radius=16,border=True)
COMP['Header']=row('Header',[box('Бренд',[text('UniFlow','Brand','primary'),text('Пространство для учёбы','Caption','muted')],w=171,gap=3),text('● На связи','Caption','green',72),text('Алексей','Label','primary',59,name='Name')],390,gap=12)
COMP['Header'].update(pad=[18,20],bg='surface',h=88)
COMP['Lesson']=box('Lesson',[text('09:00–10:30','Label','primary',name='Time'),text('Базы данных','Heading',w=302,name='Title'),text('А. Иванов · Ауд. 304','Body','muted',302,name='Meta')],w=350,gap=6,pad=24,bg='surface',radius=20,border=True)
COMP['Deadline']=box('Deadline',[text('Лабораторная работа № 3','Heading',w=302,name='Title'),text('25 нояб., 18:00 · Базы данных','Body','muted',302,name='Meta')],w=350,gap=6,pad=24,bg='surface',radius=20,border=True)
COMP['Task']=box('Task',[text('Лабораторная работа № 3','Heading',w=302,name='Title'),text('25 нояб., 18:00 · Базы данных · В работе','Body','muted',302,name='Meta'),text('Подготовить SQL-запросы и отчёт по работе.','Body',w=302,name='Description'),button('Отметить выполненным',True),row('Действия',[button('История'),button('Вложения')],302),row('Изменение',[button('Изменить'),button('Удалить')],302)],gap=18,pad=24,bg='surface',radius=20,border=True)
COMP['GroupTask']=copy.deepcopy(COMP['Task']);COMP['GroupTask']['name']='GroupTask';COMP['GroupTask']['children'].insert(1,text('Общее выполнение · Автор: Алексей','Label','primary',302,name='Mode'))
COMP['Notice/Error']=box('Notice/Error',[text('Не удалось сохранить. Проверьте соединение и повторите попытку.','Body','danger',322,name='Message')],350,0,14,'dangerSoft',10)
COMP['Notice/Success']=box('Notice/Success',[text('Профиль сохранён.','Body','green',322,name='Message')],350,0,14,'greenSoft',10)
COMP['EmptyState']=box('EmptyState',[text('Заданий пока нет','Heading',w=302),text('Добавьте первое задание с дедлайном.','Body','muted',302),button('Добавить задание',True)],350,18,24,'surface',20, border=True)
menus=[('◷','Сегодня','today'),('▦','Расписание','schedule'),('☑','Задания','tasks'),('◎','Группы','group')]
def nav(active):return box('Нижняя навигация',[inst('Nav/'+str(k==active),{'Icon':i,'Label':s},name='Go/'+k) for i,s,k in menus],390,10,[6,6],'surface',row=True,border=True)
def metrics(shared=False):
 vals=[('primary','3' if shared else '12','Всего заданий'),('green','1' if shared else '7','Выполнено вовремя'),('amber','0' if shared else '1','С опозданием'),('danger','0' if shared else '1','Просрочено')]
 return box('Общий прогресс' if shared else 'Личная статистика',[row('Показатели 1',[inst('Statistic/'+a,{'Value':b,'Label':c}) for a,b,c in vals[:2]]),row('Показатели 2',[inst('Statistic/'+a,{'Value':b,'Label':c}) for a,b,c in vals[2:]]),text('33% завершено · 2 в работе' if shared else '67% завершено · 4 в работе','Body','muted')],gap=12)
def screen(key,name,children,active=None,guest=False):return box(name,[inst('Header',{'Name':'Войти' if guest else 'Алексей'},name='Go/'+('login' if guest else 'profile')),box('Прокручиваемое содержимое',children,390,18,20),nav(active or key)],390,0,bg='background')
S={}
S['today']=screen('today','01 Сегодня',[
 heading('Ваш день, Алексей','среда, 25 ноября'),button('+ Добавить задание',name='Go/tasks'),
 row('Быстрые переходы',[text('Предметы и преподаватели','Button','primary'),text('Расписание →','Button','primary')]),metrics(),
 text('Сегодня в расписании','Heading'),inst('Lesson'),text('Ближайшие дедлайны','Heading'),inst('Deadline')])
S['schedule']=screen('schedule','02 Расписание',[
 heading('Расписание','Занятия, чётность недель и переносы.'),row('Создание',[button('Добавить пару',True),button('Семестры')]),button('Шаблоны пар'),row('Период',[button('← Неделя'),button('Сегодня'),button('Неделя →')]),text('23.11 — 29.11.2026','Heading'),text('Время: Asia/Novosibirsk','Caption','muted'),row('Вид',[button('День',True),button('Неделя')]),
 row('Дни недели',[box('День '+s,[text(s,'Label','primary' if s=='Ср' else 'muted')],w=38,gap=0,pad=[8,0],bg='primarySoft' if s=='Ср' else 'surface',radius=10) for s in ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']],gap=12),
 text('Среда · 25.11','Heading'),inst('Lesson'),row('Занятие 1',[button('Отменить'),button('Перенести')]),inst('Lesson',{'Time':'10:45–12:15','Title':'Проектирование систем','Meta':'Е. Петрова · Ауд. 215'}),row('Занятие 2',[button('Отменить'),button('Перенести')])])
S['tasks']=screen('tasks','03 Личные задания',[
 heading('Задания','Личные дедлайны и учебный прогресс.'),metrics(),button('Добавить задание',True),row('Фильтры',[button('В работе',True),button('Все'),button('Выполненные')]),button('Просроченные'),inst('Field',{'Label':'Фильтр по предмету','Value':'Все предметы'}),inst('Task'),inst('Task',{'Title':'Конспект по архитектуре','Meta':'27 нояб., 20:00 · В работе','Description':'Составить схему модулей приложения.'})])
S['group']=screen('group','04 Задания группы',[
 button('К списку групп'),heading('Проектная группа','Проектирование систем · Владелец'),text('Общие задания и материалы проекта.','Body','muted',350),button('Связать с личным предметом'),row('Управление',[button('Настройки группы'),button('Архивировать')]),row('Разделы',[button('Задания',True),button('Материалы')]),row('Участие',[button('Участники'),button('Приглашения')]),text('Прогресс общих заданий','Heading'),metrics(True),button('Добавить задание группы',True),row('Фильтр',[button('В работе',True),button('Все'),button('Выполненные')]),inst('GroupTask',{'Title':'Общий отчёт команды','Meta':'26 нояб., 18:00 · В работе','Description':'Подготовить итоговый отчёт по проекту.'})],active='group')
S['login']=screen('login','05 Вход',[
 box('Форма входа',[text('Рады видеть вас','Title',w=302),text('Расписание и задания ждут вас в UniFlow.','Body','muted',302),inst('Field',{'Label':'Email','Value':'student@example.com'},302),inst('Field',{'Label':'Пароль','Value':'••••••••••••'},302),button('Войти',True,302,name='Go/today'),row('Авторизация',[text('Вход','Button','primary'),text('Регистрация','Button','primary')],302),text('Забыли пароль?','Button','primary')],350,18,24,'surface',20,border=True)
],guest=True)
S['profile']=screen('profile','06 Профиль',[
 box('Профиль',[text('Мой профиль','Title',w=302),text('student@example.com','Body','muted',302),inst('Field',{'Label':'Ваше имя','Value':'Алексей'},302),inst('Field',{'Label':'Часовой пояс','Value':'Asia/Novosibirsk'},302),button('Сохранить профиль',True,302),button('Выйти из аккаунта',w=302,name='Go/login')],350,18,24,'surface',20,border=True),
 box('Настройки напоминаний',[text('Напоминания','Heading',w=302),text('Входящие работают при подключении к API.','Body','muted',302),button('Включить напоминания',True,302),inst('Field',{'Label':'За сколько минут','Value':'60'},302),button('Сохранить настройки',True,302),text('FCM не настроен на сервере.','Caption','muted',302)],350,18,24,'surface',20,border=True),
 box('Входящие',[text('Входящие напоминания','Heading',w=302),text('Лабораторная работа № 3','Button',w=302),text('25 нояб., 18:00 · Базы данных','Body','muted',302),button('Открыть задание',True,name='Go/tasks')],350,18,24,'surface',20,border=True)
],active='none')
# Design system presentation uses the same component instances as the screens.
swatches=[]
for name in list(C)[:12]:swatches.append(box(name,[box('Образец',[],166,0,0,name,10,h=54),text(name,'Label'),text(C[name],'Caption','muted')],166,6))
ds=box('Дизайн система Android',[
 text('UniFlow Android','Title'),text('Цвета, типографика, геометрия и компоненты приложения','Body','muted'),
 text('01 Цвета','Heading'),row('Цвета 1',swatches[:6],1056,gap=12),row('Цвета 2',swatches[6:],1056,gap=12),
 text('02 Типографика','Heading'),text('Roboto — системный шрифт Android','Body','muted'),row('Шрифты',[box('Заголовки',[text('Заголовок экрана 30 / 40','Title'),text('Заголовок раздела 18 / 26','Heading')],560,12),box('Основной текст',[text('Основной текст 15 / 24','Body'),text('Кнопка 14 / 22','Button'),text('Подпись 13 / 20','Label'),text('Пояснение 12 / 20','Caption')],480,6)],1056),
 text('03 Геометрия','Heading'),text('Ширина телефона 390 dp · поля страницы 20 · шапка 88 · карточка 24 / R20','Body'),text('Кнопки ≥ 46 · поля ≥ 46 · радиусы 3, 10, 12, 16, 20 · сетка статистики 2×2','Body'),text('Отступы: 4, 6, 8, 10, 12, 13, 14, 16, 18, 20, 24, 26, 32, 40 dp','Body'),
 text('04 Компоненты и состояния','Heading'),row('Кнопки',[inst('Button/Primary/Default'),inst('Button/Primary/Disabled'),inst('Button/Primary/Loading'),button('Отмена')],1056),row('Поля',[inst('Field'),inst('Field',{'Label':'Часовой пояс','Value':'Asia/Novosibirsk'})],1056),row('Карточки',[inst('Lesson'),inst('Deadline'),inst('EmptyState')],1074),row('Обратная связь',[inst('Notice/Error'),inst('Notice/Success')],1056),nav('today'),text('Источники: theme.ts, forms.tsx, app-shell.tsx, statistics-cards.tsx. Светлая тема.','Caption','muted')
],w=1160,gap=24,pad=40,bg='background')
# A layout pass provides deterministic fallback previews and native text wrapping.
fontdir=Path('/System/Library/Fonts/Supplemental')
def font(style):
 size,line,weight=T[style];return ImageFont.truetype(str(fontdir/('Arial Bold.ttf' if weight>=600 else 'Arial.ttf')),size)
def wrap(s,width,f):
 lines=[]
 for para in s.split('\n'):
  words=para.split(' '); line=''
  for word in words:
   cand=(line+' '+word).strip()
   if line and f.getlength(cand)>width:lines.append(line);line=word
   else:line=cand
  lines.append(line)
 return lines
def expanded(n):
 n=copy.deepcopy(n)
 if n['type']=='instance':
  w=n.get('w'); label=n['name']; n0=copy.deepcopy(COMP[n['key']]);n0['instanceKey']=n['key'];n0['props']=n['props'];n0['name']=label
  if w:n0['w']=w
  def override(v):
   if v.get('name') in n['props'] and v['type']=='text':v['text']=n['props'][v['name']]
   for ch in v.get('children',[]):override(ch)
  override(n0);n=n0
 n['children']=[expanded(c) for c in n.get('children',[])]
 return n
def layout(n,available=None):
 if n['type']=='text':
  f=font(n['style']);w=n.get('w') or min(available or 2000,math.ceil(f.getlength(n['text']))+2)
  n['lines']=wrap(n['text'],w,f);n['W']=w;n['H']=len(n['lines'])*T[n['style']][1];return
 p=n.get('pad',0);py,px=p if isinstance(p,list) else [p,p];w=n.get('w') or available
 kids=n.get('children',[])
 for c in kids:
  cw=(w-2*px) if w and not n.get('row') else None
  # Narrow form instances inherit the available column width.
  if cw and c.get('instanceKey')=='Field':
   c['w']=cw;c['children'][1]['w']=cw
   c['children'][1]['children'][0]['w']=cw-26
  layout(c,cw)
 gap=n.get('gap',0);gapcount=max(0,len(kids)-1)
 if n.get('row'):
  n['W']=w or sum(c['W'] for c in kids)+gap*gapcount+2*px;n['H']=n.get('h') or max([c['H'] for c in kids]+[0])+2*py
  x=px
  for c in kids:c['x']=(n['W']-c['W'])/2 if n['name'].startswith('Button/') and len(kids)==1 else x;c['y']=(n['H']-c['H'])/2;x+=c['W']+gap
 else:
  n['W']=w or max([c['W'] for c in kids]+[0])+2*px;n['H']=n.get('h') or sum(c['H'] for c in kids)+gap*gapcount+2*py
  y=py
  for c in kids:c['x']=(n['W']-c['W'])/2 if n.get('center') else px;c['y']=y;y+=c['H']+gap
 if n.get('h') and len(kids)==1 and n.get('row'):kids[0]['y']=(n['H']-kids[0]['H'])/2

def preview(name,n):
 n=expanded(n);layout(n)
 scale=2;im=Image.new('RGB',(int(n['W']*scale),int(n['H']*scale)),C['background']);d=ImageDraw.Draw(im)
 svg=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{n["W"]}" height="{n["H"]}" viewBox="0 0 {n["W"]} {n["H"]}">']
 def draw(v,x=0,y=0,opacity=1):
  x+=v.get('x',0);y+=v.get('y',0);opacity*=v.get('opacity',1)
  def ink(key):
   h=C[key];base=C['background'];return tuple(round(int(h[i:i+2],16)*opacity+int(base[i:i+2],16)*(1-opacity)) for i in [1,3,5])
  if v['type']=='text':
   sz,lh,wt=T[v['style']];f=ImageFont.truetype(str((Path('/System/Library/Fonts/Apple Symbols.ttf') if v['name']=='Icon' else fontdir/('Arial Bold.ttf' if wt>=600 else 'Arial.ttf'))),sz*scale)
   for i,l in enumerate(v['lines']):
    d.text((x*scale,(y+i*lh+2)*scale),l,font=f,fill=ink(v['color']))
    svg.append(f'<text x="{x}" y="{y+i*lh+sz}" font-family="Arial,sans-serif" font-size="{sz}" font-weight="{wt}" fill="{C[v["color"]]}">{escape(l)}</text>')
  else:
   if v.get('bg') or v.get('border'):
    bounds=(x*scale,y*scale,(x+v['W'])*scale,(y+v['H'])*scale)
    d.rounded_rectangle(bounds,radius=v.get('radius',0)*scale,fill=ink(v['bg']) if v.get('bg') else ink('surface'),outline=C['border'] if v.get('border') else None,width=scale)
    svg.append(f'<rect x="{x}" y="{y}" width="{v["W"]}" height="{v["H"]}" rx="{v.get("radius",0)}" fill="{C[v["bg"]] if v.get("bg") else C["surface"]}" stroke="{C["border"] if v.get("border") else "none"}"/>')
   for child in v.get('children',[]):draw(child,x,y,opacity)
 draw(n);im.save(D/(name+'.png'));(D/(name+'.svg')).write_text('\n'.join(svg+['</svg>']));return n
D.mkdir(exist_ok=True);P.mkdir(exist_ok=True)
scene={'colors':C,'styles':T,'components':COMP,'screens':S,'system':ds}
for name,n in [('ds',ds),*S.items()]:
 target=D/(name+'.png')
 if target.exists() and name!='ds' and (B/'figma.json').exists() and json.loads((B/'figma.json').read_text()).get('status')=='created_and_visually_reviewed':
  print(name,'kept verified Figma export');continue
 p=preview(name,n);print(name,p['W'],p['H'])
(D/'android-scene.json').write_text(json.dumps(scene,ensure_ascii=False,indent=2)+'\n')
existing=json.loads((B/'figma.json').read_text()) if (B/'figma.json').exists() else {}
metadata={'fileKey':'G5td2BUaPyTcOFqbkGbQQR','url':'https://www.figma.com/design/G5td2BUaPyTcOFqbkGbQQR','status':'prepared_locally','pages':['01 Дизайн-система Android','02 Экраны Android'],'screens':list(S),'previewFont':'Arial','figmaFont':'Roboto'}
metadata.update({k:v for k,v in existing.items() if k not in ['previewFont','figmaFont']})
(B/'figma.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
# Native import implementation is kept separately for review and also embedded for Scripter.
runner=(P/'runtime.js').read_text()
(P/'code.js').write_text('const SCENE='+json.dumps(scene,ensure_ascii=False,separators=(',',':'))+';\n'+runner)
(P/'manifest.json').write_text(json.dumps({'name':'UniFlow Android Design Import','id':'uniflow-android-design-local','api':'1.0.0','main':'code.js','editorType':['figma'],'documentAccess':'dynamic-page','networkAccess':{'allowedDomains':['none']}},indent=2)+'\n')
