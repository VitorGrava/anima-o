// baú 32x32 abrindo — ref: Wooden Treasure Chests (szymon18042, itch.io)
import { writeFileSync } from "node:fs";
const W=32,H=32,N=10;
const pal=[["o","#34223a","contorno"],["q","#c0634a","madeira-luz"],["r","#a04c3e","madeira"],["R","#74302e","madeira-sombra"],
["g","#e8c880","ouro"],["G","#c89860","ouro-sombra"],["w","#e6f0f2","ouro-brilho"],
["S","#b8c4cc","aco-luz"],["s","#7a8a9a","aco"],["d","#4a4a64","aco-sombra"],
["n","#121234","interior"],["y","#ffe066","moeda"],["Y","#d8a020","moeda-sombra"],["z","#fff8cc","brilho"],["k","#6a5670","sombra-chao"],["b","#7a4418","ouro-contorno"],["W","#262658","parede"]];
const grid=()=>Array.from({length:H},()=>Array(W).fill("."));
const stamp=(g,rows,x,y)=>rows.forEach((r,j)=>[...r].forEach((c,i)=>{if(c!=="."&&g[y+j]&&x+i>=0&&x+i<W)g[y+j][x+i]=c;}));
const chk=(rows,w,n)=>rows.forEach((r,i)=>{if([...r].length!==w)throw new Error(`${n} ${i}: ${[...r].length} ${r}`)});
const plank=(n,fill,dashes=[])=>{const a=Array(n).fill(fill);for(const d of dashes)a[d]="R";return a.join("");};
// tampa: orelha(4) esquerda 6 cinta(4) 6 orelha(4) = 24
const EAR="ogwo", STR="ogwo";
const lidRow=(l,r)=>EAR+"o"+l+STR+r+"o"+EAR;
const lid=[
  EAR+"......"+"oggo"+"......"+EAR,
  EAR+"oooooo"+STR+"oooooo"+EAR,
  lidRow(plank(5,"q"),plank(5,"q")),
  lidRow(plank(5,"r",[1,2]),plank(5,"r",[2,3])),
  lidRow(plank(5,"r"),plank(5,"r")),
  lidRow(plank(5,"r",[0,1]),plank(5,"r",[3,4])),
  lidRow(plank(5,"R"),plank(5,"R")),
  "o"+"g".repeat(22)+"o",
];
const _under=lid.map((r,i)=>i<2||i===7?r:[...r].map((c,k)=>("qrR".includes(c)?"u":c)).join(""));
const body=[];
const b=(a,top=false)=>"o"+(top?"wg":"gg")+a+(top?"gw":"gg")+"o";
const row=(base,dash=[])=>plank(18,base,dash);
const pat=[["q",[]],["r",[3,4,13]],["r",[]],["R",[]],["q",[]],["r",[8,9,10]],["r",[1,2,14,15]],["R",[]],["q",[]],["r",[5,6]],["R",[]]];
pat.forEach(([c,d],k)=>body.push(b(row(c,d),k===0)));
body[10]="o"+"G"+"o".repeat(0)+"G"+"R".repeat(18)+"G"+"G"+"o";
chk(lid,24,"lid");chk(body,24,"body");
const lock=["oSSSSo","oSSSsd","osoosd","osoosd","osssdd","osssdd",".osdd.","..oo.."].map(r=>r.length===6?r:r.padEnd(6,"o"));
chk(lock,6,"lock");
const LY=10;                    // topo da tampa fechada
const BY=LY+8;                  // topo do corpo
const X=4;
// fases: [subida, altura da tampa, estado]
const ph=[[0,8],[-1,8],[2,8],[4,7],[6,6],[8,5],[7,5],[6,5],[6,5],[6,5]];
const sample=(rows,h)=>Array.from({length:h},(_,k)=>rows[Math.min(rows.length-1,Math.round(k*(rows.length-1)/(h-1||1)))]);
const coins=(t)=>{
  const rows=[".yyyYyyyYyyyyYyyyyyyy.",".yYyyyyYyyyyyyyyYyyyy."];
  return rows;
};
const names=["sombra","interior","corpo","tampa","cadeado"];
function frame(t){
  const L=Object.fromEntries(names.map(n=>[n,grid()]));
  const [rise,h]=ph[t];
  stamp(L.sombra,["k".repeat(22),".".repeat(1)+"k".repeat(20)],X+1,BY+11);
  const open=t>=2;
  if(open){
    const gap=Math.max(rise,0);
    const edge=(r)=>"og"+r+"go";
    for(let k=0;k<gap;k++) stamp(L.interior,["o"+(k<2?"n":"W").repeat(22)+"o"],X,BY-gap+k);
    
    if(t>=4){
      const heap=[[18],[15],[10],[4]];
      stamp(L.interior,["b".repeat(20)],X+2,BY-2);
      heap.forEach(([w],k)=>{ let r=""; for(let i=0;i<w;i++) r+=(i===0||i===w-1)?"b":(k===0&&i%4===2)?"Y":"y"; stamp(L.interior,[r],X+2+((20-w)>>1),BY-3-k); });
      stamp(L.interior,["b".repeat(4)],X+2+8,BY-7);
      if(t>=6){const k=t-6; {const cx=X+[8,12,16,19][k]; stamp(L.interior,["y","zzz","y"].map((r,j)=>Array(32).fill(".").map((_,i)=>(j===1?Math.abs(i-cx)<=1:i===cx)?(r[0]):".").join("")),0,BY-5);}
        stamp(L.interior,[Array(32).fill(".").map((_,i)=>i===X+[10,12,14,13][k]?"y":".").join("")],0,BY-7-[1,3,2,0][k]);}
    }
  }
  stamp(L.corpo,body,X,BY);
  if(t>=3){ stamp(L.corpo,["o"+"g".repeat(22)+"o"],X,BY-1); stamp(L.corpo,["oSSo","osdo"],X+10,BY-1); }
  const src=(t>=3)?lid.map((r,i)=>i===1?EAR+"o"+"qqqqq"+STR+"qqqqq"+"o"+EAR:r):lid;
  const rows=sample(src,h);
  const ly=BY-h-(open?Math.max(0,rise-(8-h)):0)+(open?0:0);
  const topY=BY-h-rise;
  stamp(L.tampa,rows,X,topY);
  stamp(L.cadeado,t>=3?lock.slice(0,3):lock,X+9,topY+h-1);
  return L;
}
const cmds=[{name:"set_palette",input:{colors:pal.map(([key,hex,name])=>({key,hex,name}))}},
 ...names.map(name=>({name:"add_layer",input:{name}})),{name:"add_frames",input:{count:N-1}}];
for(let t=0;t<N;t++){const L=frame(t);for(const l of names)cmds.push({name:"draw_rows",input:{frames:t,layer:l,rows:L[l].map(r=>r.join("")),preview:false}});}
cmds.push({name:"update_layer",input:{layer:"Base",delete:true}});
cmds.push({name:"set_frame_timing",input:{frames:"all",duration_ms:[600,100,90,90,90,110,140,140,140,140]}});
writeFileSync(new URL("./cmds.json",import.meta.url),JSON.stringify(cmds));
