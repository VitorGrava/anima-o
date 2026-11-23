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
  let x=9,y=27,ang=Math.PI; 
  for(let i=0;i<20;i++){
    const s=i/19;
    ang=Math.PI - (Math.PI/2+ tailT*0.5)*Math.pow(s,0.8)*1.15 - 0.0;
    x+=Math.cos(ang); y-=Math.sin(ang)*-1*-1; // y sobe quando sin>0
    tail.push([Math.round(x),Math.round(y)]);
  }
  tail.forEach(([tx,ty],i)=>{ const c= i>14?'S':'O'; put(tx,ty,c); put(tx,ty+1,c==='S'?'S':'D'); if(i<17) put(tx,ty-1,i<16?'L':'O'); if(i>=18){put(tx,ty,'W');put(tx,ty-1,'W');} });
  // --- corpo
  const body={ // y:[x0,x1]
   15:[21,27],16:[19,27],17:[17,27],18:[15,27],19:[13,27],20:[12,27],21:[11,27],22:[10,27],23:[9,27],24:[9,27],25:[8,27],26:[8,27],27:[8,27],28:[8,27],29:[9,27]};
  const bodyMask=new Set();
  for(const [ys,[x0,x1]] of Object.entries(body)){
    const yy=+ys;
    span(yy,x0,x1,'O'); for(let x=x0;x<=x1;x++)bodyMask.add(x+','+yy);
    if(b && yy<=21){ span(yy-1,x0,x1,'O'); for(let x=x0;x<=x1;x++)bodyMask.add(x+','+(yy-1)); }
  }
  // cabeça
  const head={5:[[19,19],[26,26]],6:[[19,20],[25,26]],7:[[19,26]],8:[[18,27]],9:[[18,28]],10:[[18,28]],11:[[18,29]],12:[[18,29]],13:[[19,29]],14:[[20,28]],15:[[21,27]]};
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
  // peito/barriga creme
  const cream=[[16,24,27],[17,24,27],[18,25,27],[19,25,27],[20,25,27],[21,25,27],[22,25,27],[23,25,27],[24,24,27],[25,24,27],[26,24,27],[27,24,27],[28,24,27],[29,24,27]];
  for(const [yy,x0,x1] of cream) for(let xx=x0;xx<=x1;xx++) if(all.has(xx+','+(yy-(b&&yy<=21?1:0)))) put(xx,yy-(b&&yy<=21?1:0),xx===x0&&yy>=22?'w':'W');
  // patas dianteiras: separação
  for(let yy=25;yy<=28;yy++) put(23,yy,'w');
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
  put(22,7+hy,'S');put(22,8+hy,'S');put(24,7+hy,'S');put(24,8+hy,'S');put(23,6+hy,'S')&&0;
  // orelhas: interior rosa
  put(19,6+hy,'c');put(26,6+hy,'c'); put(20,7+hy,'c')&&0;
  // focinho creme
  for(const [xx,yy] of [[27,11],[28,11],[26,12],[27,12],[28,12],[29,12],[26,13],[27,13],[28,13],[27,14]]) put(xx,yy+hy,'W');
  put(29,11+hy,'p'); put(29,12+hy,'p')&&0;
  put(28,13+hy,'w'); put(27,14+hy,'w');
  // olho (perfil, olhando para a direita)
  if(eyeClosed){ put(24,10+hy,'e'); put(25,10+hy,'e'); put(26,10+hy,'e'); }
  else { put(24,9+hy,'g');put(25,9+hy,'g');put(24,10+hy,'g');put(25,10+hy,'e');put(24,10+hy,'e');put(25,9+hy,'e'); put(24,9+hy,'h'); put(25,10+hy,'g'); }
  // boca
  put(27,13+hy,'w'); 
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
