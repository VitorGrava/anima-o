// gera comandos.json da cena; uso: node gen.mjs [rodada]
import fs from 'fs';
const W=160,H=90;
let s=12345; const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
function ridge(x0,x1,base,amp,rough,seed,step=2){ s=seed; // deslocamento do ponto médio
  const n=Math.ceil((x1-x0)/step)+1; const a=new Array(n).fill(0); let N=1; while(N<n-1)N*=2;
  const arr=new Array(N+1).fill(0); arr[0]=(rnd()-.5)*amp; arr[N]=(rnd()-.5)*amp; let d=amp;
  for(let st=N;st>1;st/=2){for(let i=st/2;i<N;i+=st){arr[i]=(arr[i-st/2]+arr[i+st/2])/2+(rnd()-.5)*d;} d*=rough;}
  const pts=[]; for(let i=0;i<n;i++){const x=Math.min(x1,x0+i*step); pts.push([x,Math.round(base+arr[Math.min(i,N)])]);} return pts;}
const poly=(pts,bottom,color)=>({type:'polygon',color,points:[...pts,[pts[pts.length-1][0],bottom],[pts[0][0],bottom]]});
const HOR=48, SHORE=58;
const pal=[
 ['a','#241f4d','ceu0'],['b','#3b2f6b','ceu1'],['c','#6a4a8c','ceu2'],['d','#b0638e','ceu3'],['e','#ec8a78','ceu4'],['f','#f8b878','ceu5'],['g','#ffdc9a','ceu6'],['h','#fff2c4','sol'],
 ['i','#8d78a8','col3'],['j','#6b6a96','col2'],['k','#3f5a6e','col1'],
 ['l','#2a3f55','pinho1'],['m','#1d3040','pinho2'],
 ['n','#f2b78a','agua0'],['o','#c98a96','agua1'],['p','#7f6a9c','agua2'],['q','#4a4f84','agua3'],['r','#33396b','agua4'],
 ['s','#f9d49a','brilho'],['t','#fff0c0','brilho2'],
 ['u','#3c6a45','campo'],['v','#264a3c','campo2'],['w','#6c9a52','campoluz'],['x','#142a2a','sombra'],
 ['y','#ffe9c0','nevoa'],['Y','#e6b4a6','nevoa2'],['z','#f3a6b0','flor1'],['A','#fff4e0','flor2'],['B','#f7c64a','flor3'],
 ['C','#2b1f2e','tronco'],['D','#3a2a3a','tronco2'],['E','#1f3a30','folha'],['F','#5a8a4a','folhaluz'],
 ['G','#8fb065','capimluz'],
];
const C=[];
const add=(name,input)=>C.push({name,input});
add('set_palette',{colors:pal.map(([key,hex,name])=>({key,hex,name}))});
for(const n of ['ceu','sol','colinas3','colinas2','arvores2','colinas1','arvores1','lago','reflexo','brilho','nevoa','campo','detalhes','flores','arvore_frente','vinheta']) add('add_layer',{name:n});
// camada Base (já existe) -> usamos como fundo
export {C,add,ridge,poly,W,H,HOR,SHORE,rnd};
const R=process.argv[2]||'1';
// ---- céu
add('draw_shapes',{layer:'ceu',shapes:[{type:'gradient',x:0,y:0,w:W,h:HOR+2,colors:['a','b','c','d','e','f','g'],direction:'vertical',dither:'bayer4',suavidade:0.7,ondas:2}]});
// sol baixo: radial que dissolve
add('draw_shapes',{layer:'sol',shapes:[{type:'gradient',x:55,y:8,w:80,h:80,cx:96,cy:HOR-2,r:34,colors:['h','h','g','f','.'],direction:'radial',dither:'bayer4',suavidade:0.7}]});
// colinas longe
const yAt=(pts,x)=>{for(let i=0;i<pts.length-1;i++){if(x>=pts[i][0]&&x<=pts[i+1][0]){const f=(x-pts[i][0])/(pts[i+1][0]-pts[i][0]||1);return Math.round(pts[i][1]+f*(pts[i+1][1]-pts[i][1]));}}return pts[pts.length-1][1];};
function pines(pts,hMin,hMax,seed,color,gap,sink=2){ s=seed; const shapes=[]; let x=2; while(x<W){ const yBase=yAt(pts,x)+sink; const h=Math.round(hMin+rnd()*(hMax-hMin)); const w=Math.max(2,Math.round(h*0.36)); const cx=x;
  const pts2=[[cx,yBase-h]]; const tiers=h>9?3:2; for(let t=1;t<=tiers;t++){const yy=yBase-h+Math.round(h*t/tiers); const ww=Math.round(w*t/tiers)+(t<tiers?0:0); pts2.push([cx+ww,yy-(t<tiers?1:0)]); if(t<tiers) pts2.push([cx+Math.max(1,Math.round(ww*.5)),yy-(t<tiers?1:0)]);}
  const right=pts2.slice(1); const left=right.slice().reverse().map(([a,b])=>[2*cx-a,b]);
  shapes.push({type:'polygon',color,points:[pts2[0],...right,...left]}); x+=gap+Math.round(rnd()*gap*1.5);} return shapes;}
const r3=ridge(0,W,38,12,.6,7,3), r2=ridge(0,W,45,10,.55,21,3), r1=ridge(0,W,51,6,.55,33,3);
add('draw_shapes',{layer:'colinas3',shapes:[poly(r3,SHORE,'i')]});
add('draw_shapes',{layer:'colinas2',shapes:[poly(r2,SHORE,'j')]});
add('draw_shapes',{layer:'arvores2',shapes:pines(r2,5,10,3,'j',3,1)});
add('draw_shapes',{layer:'colinas1',shapes:[poly(r1,SHORE,'k')]});
add('draw_shapes',{layer:'arvores1',shapes:pines(r1,8,16,9,'l',4,2)});
add('draw_shapes',{layer:'colinas1',shapes:[{type:'rect',x:0,y:SHORE-1,w:W,h:1,color:'m'}]});
// lago
add('draw_shapes',{layer:'lago',shapes:[{type:'gradient',x:0,y:SHORE,w:W,h:22,colors:['n','o','p','q','r'],direction:'vertical',dither:'bayer4',suavidade:0.5,ondas:1}]});
// reflexo
add('transform',{layer:'reflexo',op:'reflect',fonte:['colinas2','arvores2','colinas1','arvores1'],y:SHORE,alto:20,onda:1.2,mistura:0.5,agua:'q'});
// brilho do sol na água (acima do reflexo)
add('draw_shapes',{layer:'brilho',shapes:[{type:'gradient',x:60,y:SHORE,w:70,h:22,cx:96,cy:SHORE-3,r:24,colors:['t','s','n','.'],direction:'radial',dither:'bayer4',suavidade:0.7},
  {type:'scatter',x:72,y:SHORE+1,w:48,h:16,colors:['t','s','s'],densidade:0.1,forma:'onda',distancia:3,seed:5},
  {type:'scatter',x:0,y:SHORE+3,w:W,h:16,colors:['p','q','o'],densidade:0.06,forma:'onda',distancia:4,seed:8}]});
// campo (primeiro plano)
const edge=ridge(0,W,74,3,.5,41,4);
add('draw_shapes',{layer:'campo',shapes:[poly(edge,H,'u')]});
add('draw_shapes',{layer:'campo',shapes:[{type:'gradient',x:0,y:70,w:W,h:20,colors:['w','u','v','v'],direction:'vertical',dither:'bayer4',suavidade:0.7,only:'u'}]});
add('draw_shapes',{layer:'detalhes',shapes:[
 {type:'scatter',x:0,y:77,w:W,h:13,colors:['G','w','u'],densidade:0.2,forma:'tufo',distancia:3,seed:3,ponta:'G'},
 {type:'scatter',x:0,y:82,w:W,h:8,colors:['x','v'],densidade:0.14,forma:'tufo',distancia:3,seed:4}]});
add('draw_shapes',{layer:'flores',shapes:[
 {type:'scatter',x:0,y:78,w:W,h:12,colors:['z','A','B','z'],densidade:0.12,forma:'cruz',distancia:5,seed:11}]});
// névoa sobre lago
add('draw_shapes',{layer:'nevoa',shapes:[{type:'gradient',x:0,y:SHORE-4,w:W,h:10,colors:['.','Y','Y','.'],direction:'vertical',dither:'bayer4',suavidade:1,ondas:2},
 {type:'scatter',x:0,y:SHORE-3,w:W,h:8,colors:['Y','y','Y'],densidade:0.09,forma:'onda',distancia:4,seed:17}]});
// árvore da frente à esquerda
add('draw_shapes',{layer:'arvore_frente',shapes:[
 {type:'polygon',color:'C',points:[[10,90],[14,74],[15,52],[16,20],[21,20],[22,52],[24,74],[28,90]]},
 {type:'line',x1:15,y1:22,x2:13,y2:72,color:'D'},{type:'line',x1:16,y1:22,x2:15,y2:60,color:'D'},
 {type:'blob',x:-8,y:-8,w:46,h:30,outline:'m',base:'E',light:'F',shadow:'x',squareness:2.6},
 {type:'blob',x:14,y:-4,w:30,h:22,outline:'m',base:'E',light:'F',shadow:'x',squareness:2.6},
 {type:'blob',x:-4,y:12,w:24,h:14,outline:'m',base:'E',light:'F',shadow:'x',squareness:2.6},
 {type:'scatter',x:-12,y:-6,w:52,h:34,colors:['F','E','E','E'],densidade:0.07,forma:'tufo',distancia:3,seed:2}]});
// vinheta leve
add('draw_shapes',{layer:'vinheta',shapes:[{type:'gradient',x:0,y:0,w:W,h:H,cx:80,cy:46,r:112,colors:['.','.','.','.','a'],direction:'radial',dither:'bayer4',suavidade:0.8}]});
// haze
add('transform',{layer:'colinas3',op:'haze',color:'g',quantidade:0.4});
add('transform',{layer:'colinas2',op:'haze',color:'f',quantidade:0.3});
add('transform',{layer:'arvores2',op:'haze',color:'f',quantidade:0.3});
add('transform',{layer:'colinas1',op:'haze',color:'e',quantidade:0.22});
add('transform',{layer:'arvores1',op:'haze',color:'e',quantidade:0.2});
add('reduce_colors',{cores:48});
fs.writeFileSync(`cmd-r${R}.json`,JSON.stringify(C));
