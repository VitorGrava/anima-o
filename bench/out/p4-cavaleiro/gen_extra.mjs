import fs from "fs";
const lean=process.env.LEAN||6, bob=process.env.BOB||1.5, lift=process.env.LIFT||3;
const px=(pts,color)=>({points:pts,color});
const shapes=[
 {type:"rect",x:0,y:58,w:64,h:6,color:"I",filled:true},
 {type:"rect",x:0,y:58,w:64,h:1,color:"G",filled:true},
 {type:"rect",x:0,y:59,w:64,h:1,color:"F",filled:true},
];
const P=[];const Q=[];const T=[];
for(let x0=0;x0<64;x0+=8){
  P.push([x0+1,60],[x0+5,61]);           // pedrinhas claras
  Q.push([x0+3,62],[x0+6,60],[x0+0,63]);  // pedras escuras
  T.push([x0+2,57],[x0+6,57]);           // tufos
}
shapes.push({type:"pixels",points:P,color:"H"});
shapes.push({type:"pixels",points:Q,color:"H"});
shapes.push({type:"pixels",points:P.map(p=>[p[0],p[1]]),color:"H"});
shapes.push({type:"pixels",points:T,color:"G"});
const cmds=[
 {name:"set_palette",input:{colors:[{key:"F",hex:"#3f5f3a",name:"grama-sombra"},{key:"G",hex:"#6c9450",name:"grama"},{key:"H",hex:"#33262e",name:"terra-sombra"},{key:"I",hex:"#54404a",name:"terra"}]}},
 {name:"draw_shapes",input:{layer:"chao",frames:0,shapes,preview:false}},
 {name:"rig_walk",input:{mode:"no_lugar",cycles:1,frames:8,scroll_layer:"chao",lean:Number(lean),bob:Number(bob),lift:Number(lift)}},
 {name:"rig_bake",input:{outline:"auto",preview:false}}];
fs.writeFileSync("extra.json",JSON.stringify(cmds));
