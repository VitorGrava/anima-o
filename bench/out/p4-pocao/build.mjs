import fs from 'fs';
const base = [
"................",
".....000000.....",
".....077780.....",
".....088880.....",
".....055560.....",
"......0560......",
"....05555560....",
"...0422222110...",
"..042222221110..",
"..042222211110..",
"..022222111130..",
"..022221111330..",
"..022111133330..",
"...0111133330...",
"....01133330....",
".....000000.....",
];
const bad = base.findIndex(r=>r.length!==16); if(bad>=0) throw new Error('row '+bad);
const pal = [
 ["0","#261a3d","contorno"],["1","#6b3fa0","roxo"],["2","#9b5fd0","roxo-luz"],["3","#43276e","roxo-sombra"],
 ["4","#e8d4ff","brilho"],["5","#a8c8e0","vidro"],["6","#7a95b8","vidro-sombra"],["7","#c08a50","rolha"],
 ["8","#7d5530","rolha-sombra"],["9","#ffe680","faisca"],["a","#fff2ff","bolha"]
].map(([key,hex,name])=>({key,hex,name}));
const px=(frames,layer,pts)=>({name:"draw_shapes",input:{type:"pixels",frames,layer,pixels:pts}});
const cmds=[
 {name:"set_palette",input:{colors:pal}},
 {name:"draw_rows",input:{frames:0,layer:"Base",x:0,y:0,rows:base}},
 {name:"add_layer",input:{name:"Fx"}},
 {name:"add_frames",input:{count:3,copy_from:0}},
];
fs.writeFileSync('cmds1.json',JSON.stringify(cmds));
function fx(f){
  const g=Array.from({length:16},()=>Array(16).fill('.'));
  const s=(x,y,c)=>{g[y][x]=c};
  const plus=(x,y)=>{s(x,y,'9');s(x-1,y,'9');s(x+1,y,'9');s(x,y-1,'9');s(x,y+1,'9')};
  const A=['plus','dot','none','dot'][f], B=['none','dot','plus','dot'][f];
  const sp=(x,y,k)=>{if(k==='plus')plus(x,y);else if(k==='dot')s(x,y,'9')};
  sp(2,3,A); sp(13,5,B);
  const [gx,gy]=[[5,8],[5,9],[6,10],[5,9]][f]; s(gx,gy,"4"); const [hx,hy]=[[6,7],[7,7],[8,7],[6,7]][f]; s(hx,hy,"4");
  const [bx,by]=[[7,12],[8,10],[8,8],[9,7]][f]; s(bx,by,'a');
  return g.map(r=>r.join(''));
}
const c2=[0,1,2,3].map(f=>({name:"draw_rows",input:{frames:f,layer:"Fx",x:0,y:0,rows:fx(f)}}));
c2.push({name:"set_frame_timing",input:{frames:"all",duration_ms:167}});
fs.writeFileSync('cmds2.json',JSON.stringify(c2));
