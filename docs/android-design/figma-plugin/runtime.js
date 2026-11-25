/* Reviewed local importer. It creates native editable Figma nodes only.
   It reads no existing user data and makes no network requests. */
(async () => {
  const initial = figma.currentPage;
  if (figma.root.children.some(p => p.name === '01 Дизайн-система Android')) {
    throw new Error('Android design already exists. Stop to avoid duplicate pages.');
  }
  const fontStyle = w => ({400:'Regular',600:'SemiBold',700:'Bold',800:'ExtraBold'}[w]);
  for (const weight of [400,600,700,800]) await figma.loadFontAsync({family:'Roboto',style:fontStyle(weight)});
  const hex = h => ({r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255});
  const primitives=figma.variables.createVariableCollection('UniFlow Android Primitives');
  const semantic=figma.variables.createVariableCollection('UniFlow Android Theme');
  const colors={},nums={},styles={},components={};
  for (const [key,value] of Object.entries(SCENE.colors)) {
    const p=figma.variables.createVariable('palette/'+key,primitives,'COLOR');
    p.setValueForMode(primitives.defaultModeId,hex(value));
    const v=figma.variables.createVariable('color/'+key,semantic,'COLOR');
    v.setValueForMode(semantic.defaultModeId,figma.variables.createVariableAlias(p));
    colors[key]=v;
  }
  for (const n of [0,3,4,6,7,8,10,12,13,14,16,18,20,24,26,32,40]) {
    const v=figma.variables.createVariable('space/'+n,primitives,'FLOAT');
    v.setValueForMode(primitives.defaultModeId,n);nums[n]=v;
  }
  const fill = key => [figma.variables.setBoundVariableForPaint({type:'SOLID',color:hex(SCENE.colors[key])},'color',colors[key])];
  for (const [key,[size,line,weight]] of Object.entries(SCENE.styles)) {
    const s=figma.createTextStyle();s.name='UniFlow Android/'+key;
    s.fontName={family:'Roboto',style:fontStyle(weight)};s.fontSize=size;
    s.lineHeight={unit:'PIXELS',value:line};styles[key]=s;
  }
  const ds = initial.children.length===0 ? initial : figma.createPage();
  ds.name='01 Дизайн-система Android'; await figma.setCurrentPageAsync(ds);
  function numeric(node,key,value) {
    node[key]=value;if(nums[value])node.setBoundVariable(key,nums[value]);
  }
  function override(instance,props) {
    for (const child of instance.findAll(n=>n.type==='TEXT')) {
      if (Object.prototype.hasOwnProperty.call(props,child.name)) child.characters=props[child.name];
    }
  }
  function narrowField(n,width) {
    n.counterAxisSizingMode='FIXED';n.resize(width,n.height);
    for(const label of n.children.filter(c=>c.type==='TEXT')) {label.resize(width,label.height);label.layoutSizingHorizontal='FILL';}
    for (const ch of n.findAll(c=>c.name==='Input')) {
      ch.counterAxisSizingMode='FIXED';ch.layoutSizingHorizontal='FILL';
      ch.resize(width,ch.height);
      for(const t of ch.findAll(c=>c.type==='TEXT')) {t.resize(Math.max(1,width-26),t.height);t.textAutoResize='HEIGHT';t.layoutSizingHorizontal='FILL';}
    }
  }
  async function create(def,parent,available,asComponent=false) {
    if (def.type==='instance') {
      const c=components[def.key];if(!c)throw new Error('Unknown component '+def.key);
      const n=c.createInstance();parent.appendChild(n);n.name=def.name;override(n,def.props||{});
      const width=def.w || ((def.key==='Field'||def.key.startsWith('Button/'))?available:null);
      if(width) {if(def.key==='Field')narrowField(n,width);else n.resize(width,n.height);}
      return n;
    }
    if (def.type==='text') {
      const n=figma.createText();parent.appendChild(n);n.name=def.name;
      n.fontName=styles[def.style].fontName;n.characters=def.text;
      await n.setTextStyleIdAsync(styles[def.style].id);n.fills=fill(def.color);
      const width=def.w || available;
      if(width) {n.resize(Math.max(1,width),n.height);n.textAutoResize='HEIGHT';}
      return n;
    }
    const n=asComponent?figma.createComponent():figma.createFrame();parent.appendChild(n);n.name=def.name;
    n.layoutMode=def.row?'HORIZONTAL':'VERTICAL';n.fills=def.bg?fill(def.bg):[];
    n.primaryAxisSizingMode='AUTO';n.counterAxisSizingMode=def.w?'FIXED':'AUTO';
    const p=def.pad||0,py=Array.isArray(p)?p[0]:p,px=Array.isArray(p)?p[1]:p;
    for(const [k,v] of Object.entries({paddingTop:py,paddingBottom:py,paddingLeft:px,paddingRight:px,itemSpacing:def.gap||0}))numeric(n,k,v);
    if(def.radius) {n.cornerRadius=def.radius;if(nums[def.radius])for(const k of ['topLeftRadius','topRightRadius','bottomLeftRadius','bottomRightRadius'])n.setBoundVariable(k,nums[def.radius]);}
    if(def.border){n.strokes=fill('border');n.strokeWeight=1;}
    if(def.opacity)n.opacity=def.opacity;
    if(def.row)n.counterAxisAlignItems='CENTER';
    if(def.center)n.counterAxisAlignItems='CENTER';
    const width=def.w||available;
    if(width)n.resize(width,1);
    for(const child of def.children||[]) {
      const avail=!def.row&&width?width-px*2:null;
      const item=await create(child,n,avail);
      if(!def.row&&avail&&child.type==='text')item.layoutSizingHorizontal='FILL';
    }
    if(width){n.resize(width,n.height);if(!def.row)n.counterAxisSizingMode='FIXED';else n.primaryAxisSizingMode='FIXED';}
    if(def.h){n.resize(width||n.width,def.h);n.primaryAxisSizingMode=def.row?(width?'FIXED':'AUTO'):'FIXED';if(def.row)n.counterAxisSizingMode='FIXED';}
    if(def.name.startsWith('Button/'))n.primaryAxisAlignItems='CENTER';
    if(def.name==='Нижняя навигация')n.primaryAxisAlignItems='SPACE_BETWEEN';
    if(!def.row&&!def.h)n.primaryAxisSizingMode='AUTO';
    return n;
  }
  let componentY=0;
  for(const [key,def] of Object.entries(SCENE.components)) {
    const c=await create(def,ds,null,true);c.x=1300;c.y=componentY;componentY+=c.height+36;components[key]=c;
    for(const t of c.findAll(n=>{ if(n.type!=='TEXT'||!['Label','Value','Icon','Name','Time','Title','Meta','Description','Mode','Message'].includes(n.name))return false; for(let p=n.parent;p&&p!==c;p=p.parent)if(p.type==='INSTANCE')return false; return true; })) {
      const prop=c.addComponentProperty(t.name,'TEXT',t.characters);t.componentPropertyReferences={characters:prop};
    }
  }
  for(const group of ['Button','Nav','Statistic','Notice']) {
    const entries=Object.entries(components).filter(([key])=>key.startsWith(group+'/'));
    for(const [i,[key,c]] of entries.entries()) {
      c.name=group==='Button'?'Tone='+key.split('/')[1]+', State='+key.split('/')[2]:'Variant='+key.split('/')[1];
      c.x=20+(i%3)*380;c.y=20+Math.floor(i/3)*170;
    }
    const set=figma.combineAsVariants(entries.map(([,v])=>v),ds);set.name='Android/'+group;set.x=1300;set.y=componentY;componentY+=set.height+80;
  }
  const board=await create(SCENE.system,ds);board.x=0;board.y=0;
  const screensPage=figma.createPage();screensPage.name='02 Экраны Android';await figma.setCurrentPageAsync(screensPage);
  const screens={};let i=0;
  for(const [key,def] of Object.entries(SCENE.screens)) {
    const n=await create(def,screensPage);n.x=(i%3)*470;n.y=Math.floor(i/3)*1900;screens[key]=n;i++;
  }
  for(const screen of Object.values(screens)) {
    for(const node of screen.findAll(n=>n.name.startsWith('Go/'))) {
      const dest=screens[node.name.slice(3)];
      if(dest)await node.setReactionsAsync([{trigger:{type:'ON_CLICK'},action:{type:'NODE',destinationId:dest.id,navigation:'NAVIGATE',transition:null,preserveScrollPosition:false}}]);
    }
  }
  screensPage.selection=Object.values(screens);figma.viewport.scrollAndZoomIntoView(Object.values(screens));
  const result={fileKey:figma.fileKey,pages:{system:ds.id,screens:screensPage.id},board:board.id,screens:Object.fromEntries(Object.entries(screens).map(([k,v])=>[k,{id:v.id,width:v.width,height:v.height}]))};
  console.log(JSON.stringify(result));figma.notify('Дизайн-система и 6 экранов Android созданы');
})();
