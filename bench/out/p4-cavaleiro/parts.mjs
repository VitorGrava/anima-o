// Arte das partes do cavaleiro (pose de repouso). Chaves: g h i aço | 7 8 9 pano vermelho | j k l ouro | d e f couro | a b c malha | A B aço fundo | C D E azul escudo
export const PAL=[
 {key:"A",hex:"#2e3550",name:"aco-fundo"},
 {key:"B",hex:"#566489",name:"aco-sombra2"},
 {key:"C",hex:"#27427a",name:"azul-sombra"},
 {key:"D",hex:"#3b66b0",name:"azul"},
 {key:"E",hex:"#6c97d8",name:"azul-luz"},
];
const chk=(n,rows)=>{const w=rows[0].length;rows.forEach((r,i)=>{if(r.length!==w)throw new Error(n+" linha "+i+" larg "+r.length+" != "+w)});return rows};
const pad=(rows,w,h,ox,oy)=>{const out=[];for(let y=0;y<h;y++){let r="";for(let x=0;x<w;x++){const ry=y-oy,rx=x-ox;r+=(ry>=0&&ry<rows.length&&rx>=0&&rx<rows[0].length)?rows[ry][rx]:".";}out.push(r)}return out};

// cabeça: elmo de perfil virado p/ direita + pluma para trás. pivô = base do crânio
const head=[
"........9.............",
"......799888..........",
"....7799988888........",
"..7778899888888.......",
".7788899888888hh......",
"..778889998iiihhhg....",
"....7788..iiihhhhhg...",
"......77.iihhhhhhhgg..",
".........iihhhhhhhhg..",
".........ihAAAAAAAAg..",
".........ihhhhhghhhgg.",
".........ihhhhhghhAgg.",
".........ihhhhhghAggg.",
"..........hhhhhhhgg...",
"..........ghhhhhgg....",
"...........gggggg.....",
"......................",
];
// tronco: gola/ombro de aço, sobrecota vermelha, cinto, saia (abaixo do pivô, y=11)
const torso=[
"..iihhhhg...",
".iiihhhhgg..",
".iihhhhhggg.",
".99888888777",
".98888888777",
".98888888877",
".98888888877",
".99888888877",
".99888888877",
"..eefkfeeee.",
"..eeeeeeeee.",
"..998888877.",
"..998888877.",
"..99888877..",
"..98888877..",
"..8888887...",
];
const neck=[ "..gg..","..hg..","..hg.." ];
// braço: ombreira + manga de aço
const arm=[
".iihg..",
"iihhhg.",
"iihhhgg",
".ihhhg.",
"..ihgg.",
"..hhg..",
"..hhg..",
"..hhg..",
"..hhg..",
"..ihg..",
".ihhgg.",
"..hhg..",
"..hhg..",
"..hg...",
];
const fore=[
".ihhg..",
"..hhg..",
"..hhg..",
"..hhg..",
"..ggg..",
"..eee..",
".eeeee.",
".eeeee.",
"..eee..",
];
// perna: coxa (malha) + joelheira
const thigh=[
"..cbba..",
"..cbba..",
"..cbba..",
"..cbba..",
"..cbba..",
"..cbba..",
"..cbba..",
"..cbba..",
"..cbba..",
"..cbba..",
"..cbba..",
"..cbba..",
"..cbba..",
"..ihgg..",
".iihhgg.",
"..hhgg..",
];
const shin=[
"..ihgg..",
"..hhgg..",
"..hhgg..",
"..hhgg..",
"..ihgg..",
"..hhgg..",
"..hhgg..",
"..hhgg..",
"..hgg...",
];
const foot=[
"..hhhhh.....",
".hhhhhhhhh..",
".eeeeeeeeee.",
".dddddddddd.",
];
const shield=[
"kkkkkkkkkk",
"kEEE98DDCk",
"k98888887k",
"k98888887k",
"kEEE98DDCk",
".kEE98DCk.",
".kDD98DCk.",
"..kD98Ck..",
"....kk....",
];
const sword=[
"..h..",
"..h..",
"..h..",
"..h..",
"..h..",
"..h..",
"..h..",
"..h..",
"..h..",
"..h..",
"..h..",
"..h..",
"..h..",
"..h..",
"..h..",
"..e..",
"kkkkk",
"..e..",
"..j..",
];
export const PARTS={
 cabeca:{bone:"cabeca",rows:chk("cabeca",head),pivot:{x:10,y:16},layer:"cabeca",z:1},
 tronco:{bone:"tronco",rows:chk("tronco",torso),pivot:{x:5,y:11},layer:"tronco",z:0},
 pescoco:{bone:"pescoco",rows:chk("pescoco",neck),pivot:{x:2,y:2},layer:"tronco",z:2},
 braco_tras:{bone:"braco_tras",rows:chk("arm",arm),pivot:{x:3,y:2},layer:"braco-tras",z:0},
 antebraco_tras:{bone:"antebraco_tras",rows:chk("fore",fore),pivot:{x:3,y:0},layer:"braco-tras",z:1},
 braco_frente:{bone:"braco_frente",rows:chk("arm",arm),pivot:{x:3,y:2},layer:"braco-frente",z:0},
 antebraco_frente:{bone:"antebraco_frente",rows:chk("fore",fore),pivot:{x:3,y:0},layer:"braco-frente",z:1},
 coxa_tras:{bone:"coxa_tras",rows:chk("thigh",thigh),pivot:{x:4,y:0},layer:"perna-tras",z:0},
 canela_tras:{bone:"canela_tras",rows:chk("shin",shin),pivot:{x:4,y:0},layer:"perna-tras",z:1},
 pe_tras:{bone:"pe_tras",rows:chk("foot",foot),pivot:{x:2,y:1},layer:"perna-tras",z:2},
 coxa_frente:{bone:"coxa_frente",rows:chk("thigh",thigh),pivot:{x:4,y:0},layer:"perna-frente",z:0},
 canela_frente:{bone:"canela_frente",rows:chk("shin",shin),pivot:{x:4,y:0},layer:"perna-frente",z:1},
 pe_frente:{bone:"pe_frente",rows:chk("foot",foot),pivot:{x:2,y:1},layer:"perna-frente",z:2},
 escudo:{bone:"antebraco_frente",rows:chk("shield",shield),pivot:{x:3,y:1},layer:"braco-frente",z:3},
 espada:{bone:"espada",rows:chk("sword",sword),pivot:{x:2,y:16},layer:"arma",z:0},
};

const tint={h:"g",i:"h",g:"B",c:"b",b:"a",a:"A",f:"e",e:"d",k:"j",l:"k"};
for(const n of ["braco_tras","antebraco_tras","coxa_tras","canela_tras","pe_tras"]){
  PARTS[n].rows=PARTS[n].rows.map(r=>[...r].map(ch=>tint[ch]||ch).join(""));
}

// pré-gira a arte (em graus, horário na tela) em torno do pivô; o osso a gira de volta no bake
export function prerot(p,deg,W=24,H=24){
  const a=deg*Math.PI/180,c=Math.cos(a),sn=Math.sin(a);
  const ox=Math.floor(W/2),oy=4; // pivô no novo grid
  const rows=[];
  for(let y=0;y<H;y++){let r="";for(let x=0;x<W;x++){
    // inverso: de destino para origem
    const dx=x-ox,dy=y-oy;
    const sx=dx*c+dy*sn+p.pivot.x, sy=-dx*sn+dy*c+p.pivot.y;
    const ix=Math.round(sx-0.0),iy=Math.round(sy-0.0);
    r+=(iy>=0&&iy<p.rows.length&&ix>=0&&ix<p.rows[0].length)?p.rows[iy][ix]:".";
  }rows.push(r)}
  return {...p,rows,pivot:{x:ox,y:oy}};
}
PARTS.escudo=prerot(PARTS.escudo,Number(process.env.SH||-38));
