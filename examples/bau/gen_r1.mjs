// baú 32x32 abrindo — ref: Wooden Treasure Chests (szymon18042, itch.io)
import { writeFileSync } from "node:fs";
const W=32,H=32,N=10;
const pal=[["o","#34223a","contorno"],["q","#c0634a","madeira-luz"],["r","#a04c3e","madeira"],["R","#74302e","madeira-sombra"],
["g","#e8c880","ouro"],["G","#c89860","ouro-sombra"],["w","#e6f0f2","ouro-brilho"],
["S","#b8c4cc","aco-luz"],["s","#7a8a9a","aco"],["d","#4a4a64","aco-sombra"],
["n","#121234","interior"],["y","#ffe066","moeda"],["Y","#d8a020","moeda-sombra"],["z","#fff8cc","brilho"]];
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
const b=(a)=>"ogo"+a+"ogo";
body.push(b(plank(18,"r",[2,3,12])));
body.push(b(plank(18,"r",[0,1,9,10])));
body.push(b(plank(18,"r")));
body.push(b(plank(18,"r",[4,5,13,14])));
body.push(b(plank(18,"R")));
body.push(b(plank(18,"r",[1,2,8,9])));
body.push(b(plank(18,"r")));
body.push(b(plank(18,"r",[6,7,15,16])));
body.push(b(plank(18,"R")));
body.push("ogo"+plank(18,"R",[3,4,12])+"ogo");
body.push("o"+"G"+"o".repeat(21)+"o");
chk(lid,24,"lid");chk(body,24,"body");
const lock=["oSSSSo","oSsssd","osoosd","osoosd","osoosd","oddddo"].map(r=>r.length===6?r:r.padEnd(6,"o"));
chk(lock,6,"lock");
const LY=10;                    // topo da tampa fechada
const BY=LY+8;                  // topo do corpo
const X=4;
// fases: [subida, altura da tampa, estado]
const ph=[[0,8],[1,8],[3,8],[5,7],[7,7],[6,7],[6,7],[6,7],[6,7],[6,7]];
const sample=(rows,h)=>Array.from({length:h},(_,k)=>rows[Math.min(rows.length-1,Math.round(k*(rows.length-1)/(h-1||1)))]);
const coins=(t)=>{
  const rows=[".yyyYyyyYyyyyYyyyyyyy.",".yYyyyyYyyyyyyyyYyyyy."];
  return rows;
};
const names=["interior","corpo","tampa","cadeado"];
function frame(t){
  const L=Object.fromEntries(names.map(n=>[n,grid()]));
  const [rise,h]=ph[t];
  stamp(L.corpo,body,X,BY);
  const open=t>=1;
  if(open){
    // interior escuro entre aro e tampa
    const gap=Math.min(rise,7);
    const iy=BY-gap;
    for(let k=0;k<gap;k++){ stamp(L.interior,["o"+"gg"+"n".repeat(18)+"gg"+"o"],X,iy+k); }
    stamp(L.interior,["o"+"gg"+"n".repeat(18)+"gg"+"o"],X,BY);
    if(t>=5){ // moedas e brilho
      const wob=t%2;
      stamp(L.interior,[".".repeat(5)+"yyYyyyyYyyyyYyy"+".".repeat(4)],X,BY-1);
      stamp(L.interior,[".".repeat(3)+"yYyyyYyyyyyYyyyYy"+".".repeat(4)],X,BY);
      if(t>=6){const k=t-6; const gx=[7,11,15,18][k]; stamp(L.interior,[Array(32).fill(".").map((_,i)=>i===X+gx?"z":".").join("")],0,BY-1);
        const py=[1,3,2,0][k]; stamp(L.interior,[Array(32).fill(".").map((_,i)=>i===X+[9,10,12,13][k]?"y":".").join("")],0,BY-2-py);}
    }
  }
  const src=lid;
  const rows=sample(src,h);
  const ly=BY-h-(open?Math.max(0,rise-(8-h)):0)+(open?0:0);
  const topY=BY-h-rise;
  stamp(L.tampa,rows,X,topY);
  stamp(L.cadeado,lock,X+9,topY+h-1);
  return L;
}
const cmds=[{name:"set_palette",input:{colors:pal.map(([key,hex,name])=>({key,hex,name}))}},
 ...names.map(name=>({name:"add_layer",input:{name}})),{name:"add_frames",input:{count:N-1}}];
for(let t=0;t<N;t++){const L=frame(t);for(const l of names)cmds.push({name:"draw_rows",input:{frames:t,layer:l,rows:L[l].map(r=>r.join("")),preview:false}});}
cmds.push({name:"update_layer",input:{layer:"Base",delete:true}});
cmds.push({name:"set_frame_timing",input:{frames:"all",duration_ms:[600,100,90,90,90,110,140,140,140,140]}});
writeFileSync(new URL("./cmds.json",import.meta.url),JSON.stringify(cmds));
