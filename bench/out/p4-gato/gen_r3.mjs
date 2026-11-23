// gera comandos para o gato. uso: node gen.mjs > cmds.json
const W=32,H=32;
const PAL=[
 ['o','#3a2018','contorno'],['O','#e8822a','laranja'],['L','#f7b04e','laranja-luz'],['D','#b9531f','laranja-sombra'],
 ['S','#a2431a','listra'],['W','#fde8c4','creme'],['w','#e3c29a','creme-sombra'],['p','#e8828a','nariz'],
 ['g','#8fdc5a','olho'],['e','#1d120c','pupila'],['h','#ffffff','brilho'],['c','#d96a6a','orelha']
];
function render(f){
  const b = [0,0,1,1,1,0][f]; // respiração (0 expira,1 inspira)
  const eyeClosed = f===3;
  const hy = b? -1:0; // cabeça sobe ao inspirar
  const g = Array.from({length:H},()=>Array(W).fill('.'));
  const put=(x,y,c)=>{ if(x>=0&&x<W&&y>=0&&y<H) g[y][x]=c; };
  const span=(y,x0,x1,c='O')=>{for(let x=x0;x<=x1;x++)put(x,y,c);};
  // --- rabo (atrás) : curva com balanço
  const tailT=[-1,-0.3,0.5,1,0.3,-0.6][f];
  const tail=[];
  let x=7,y=27;
  for(let i=0;i<19;i++){
    const t=i/18;
    const ang=Math.PI-(Math.PI/2)*Math.pow(t,0.55)*1.1 - tailT*0.55*t*t;
    x+=Math.cos(ang)*0.9; y-=Math.sin(ang)*0.9;
    tail.push([Math.round(x),Math.round(y)]);
  }
  tail.forEach(([tx,ty],i)=>{ const tip=i>=16; const c=tip?'W':(i%4===3?'S':'O'); put(tx,ty,c); put(tx,ty+1,tip?'w':'D'); put(tx+1,ty,tip?'W':'O'); if(i>6&&!tip)put(tx-1,ty,'L'); });
  // --- corpo
  const body={15:[21,26],16:[19,27],17:[17,27],18:[15,27],19:[13,26],20:[12,26],21:[11,26],22:[10,25],23:[9,25],24:[8,25],25:[8,25],26:[8,25],27:[8,25],28:[8,27],29:[9,27]};
  const bodyMask=new Set();
  for(const [ys,[x0,x1]] of Object.entries(body)){
    const yy=+ys;
    span(yy,x0,x1,'O'); for(let x=x0;x<=x1;x++)bodyMask.add(x+','+yy);
    if(b && yy<=21){ span(yy-1,x0,x1,'O'); for(let x=x0;x<=x1;x++)bodyMask.add(x+','+(yy-1)); }
  }
  // cabeça
  const head={4:[[19,19],[26,26]],5:[[19,20],[25,26]],6:[[19,21],[24,26]],7:[[19,26]],8:[[18,27]],9:[[18,28]],10:[[18,28]],11:[[18,29]],12:[[18,29]],13:[[19,29]],14:[[20,28]],15:[[21,27]]};
  const headMask=new Set();
  for(const [ys,segs] of Object.entries(head)) for(const [x0,x1] of segs){ span(+ys+hy,x0,x1,'O'); for(let x=x0;x<=x1;x++)headMask.add(x+','+(+ys+hy)); }
  // pescoço preenche
  span(15+hy+1,21,27,'O');
  // sombreamento automático: borda superior/esquerda = L, inferior/direita = D
  const all=new Set([...bodyMask,...headMask]);
  const has=(x,y)=>all.has(x+','+y);
  const shaded=g.map(r=>r.slice());
  for(const k of all){const [px,py]=k.split(',').map(Number);
    const up=has(px,py-1), lf=has(px-1,py), dn=has(px,py+1), rt=has(px+1,py);
    let c='O';
    if(!up||(!lf&&!has(px-1,py-1)&&false)) c='L';
    else if(!lf) c='L';
    if(!dn||!rt) c='D';
    shaded[py][px]=c;
  }
  // sombra no interior (nuca sob a cabeça / coxa)
  for(let r=0;r<H;r++)for(let c=0;c<W;c++) if(shaded[r][c]!=='.'&&all.has(c+','+r)) g[r][c]=shaded[r][c];
  // coxa traseira: contorno interno escuro-laranja
  const thigh=[[10,21],[9,22],[8,23],[8,24],[8,25],[9,26],[10,27],[12,27],[14,27],[16,27],[17,26],[18,25],[19,23],[19,21],[18,19],[16,18],[13,19],[11,20]];
  // região da coxa: luz no topo-esq, sombra na borda direita
  const thighFill=[[13,20,17],[12,21,18],[11,22,19],[11,23,19],[10,24,19],[10,25,18],[10,26,17]];
  const bb=(yy)=>yy-(b&&yy<=21?1:0);
  for(let yy=17;yy<=22;yy++){ const x0=yy<19?25:24; for(let xx=x0;xx<=(yy>=22?25:26);xx++) if(all.has(xx+','+bb(yy))) put(xx,bb(yy),(xx===x0&&yy>19)?'w':'W'); }
  for(let yy=23;yy<=29;yy++) for(let xx=23;xx<=27;xx++) if(all.has(xx+','+yy)) put(xx,yy,xx===23?'w':'W');
  for(let yy=24;yy<=27;yy++) put(22,yy,'D');
  put(23,28,'w');put(24,28,'W');
  for(let xx=22;xx<=27;xx++) put(xx,29,'w');
  // coxa: linha de sombra interna
  for(const [xx,yy] of [[19,21],[19,22],[19,23],[18,24],[18,25],[17,26],[16,27],[15,27],[14,27],[13,27],[12,27]]) put(xx,yy,'D');
  for(const [xx,yy] of [[13,19],[12,20],[11,21],[10,22],[10,23]]) put(xx,yy,'L');
  // patinha traseira (pé à frente da coxa)
  span(28,13,20,'O'); span(29,12,21,'D'); span(28,13,13,'L');
  // listras no dorso
  for(const [xx,yy] of [[15,19],[16,20],[17,21],[16,22],[17,23]]) {}
  const st=(xx,yy)=>put(xx,yy-(b&&yy<=21?1:0),'S');
  st(14,19);st(14,20);st(15,21);st(15,22); st(18,17);st(19,18);st(19,19);
  // cabeça: listras na testa
  put(22,7+hy,'S');put(22,8+hy,'S');put(24,7+hy,'S');put(22,8+hy,'S')&&0;put(23,6+hy,'S')&&0;
  // orelhas: interior rosa
  put(20,6+hy,'c');put(20,5+hy,'c')&&0;put(25,6+hy,'c');put(25,5+hy,'c');
  // focinho creme
  for(const [xx,yy] of [[27,12],[28,12],[29,12],[26,13],[27,13],[28,13],[29,13],[27,14],[28,14]]) put(xx,yy+hy,'W');
  put(29,12+hy,'p'); put(28,14+hy,'w');
  if(eyeClosed){ put(24,10+hy,'O');put(25,10+hy,'O'); put(24,11+hy,'e'); put(25,11+hy,'e'); }
  else { put(24,10+hy,'g');put(25,10+hy,'e');put(24,11+hy,'g');put(25,11+hy,'e'); }
  // boca
  // contorno automático (4-viz) + colar
  const solid=(x,y)=>x>=0&&y>=0&&x<W&&y<H&&g[y][x]!=='.';
  const out=g.map(r=>r.slice());
  for(let r=0;r<H;r++)for(let c=0;c<W;c++) if(g[r][c]==='.'&&(solid(c-1,r)||solid(c+1,r)||solid(c,r-1)||solid(c,r+1))) out[r][c]='o';
  return out.map(r=>r.join(''));
}
const frames=[0,1,2,3,4,5].map(render);
const cmds=[
 {name:'set_palette',input:{colors:PAL.map(([key,hex,name])=>({key,hex,name}))}},
 {name:'add_frames',input:{count:5,copy_from:0}},
 {name:'draw_frames',input:{layer:'Base',preview:false,items:frames.map((rows,i)=>({frame:i,x:0,y:0,rows}))}},
 {name:'set_frame_timing',input:{frames:'all',duration_ms:[125,125,125,125,125,125]}},
];
console.log(JSON.stringify(cmds));
