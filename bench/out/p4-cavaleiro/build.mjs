import {PARTS,PAL} from "./parts.mjs";
import fs from "fs";import {execSync} from "child_process";
const A="node /home/user/anima-o/bin/anima.mjs";
const proj=process.argv[2]||"k.anima.json";
const arms=JSON.parse(process.env.ARMS||"{}");
const base=[
 {key:"0",hex:"#14101a",name:"contorno"},
 {key:"7",hex:"#6f1b31",name:"pano-sombra"},{key:"8",hex:"#a8322e",name:"pano"},{key:"9",hex:"#cf6a52",name:"pano-luz"},
 {key:"a",hex:"#2f3446",name:"malha-sombra"},{key:"b",hex:"#4a5470",name:"malha"},{key:"c",hex:"#66749a",name:"malha-luz"},
 {key:"d",hex:"#2a1a1a",name:"bota-sombra"},{key:"e",hex:"#5a3a28",name:"couro"},{key:"f",hex:"#8a6040",name:"couro-luz"},
 {key:"g",hex:"#7585ad",name:"aco-sombra"},{key:"h",hex:"#a9b8cf",name:"aco"},{key:"i",hex:"#e0ebf0",name:"aco-luz"},
 {key:"j",hex:"#a8501e",name:"ouro-sombra"},{key:"k",hex:"#dcae3c",name:"ouro"},{key:"l",hex:"#f0d98a",name:"ouro-luz"},
 ...PAL];
const cmds=[
 {name:"set_palette",input:{colors:base}},
 {name:"add_frames",input:{count:7}},
 {name:"add_layer",input:{name:"chao",position:"bottom"}},
 {name:"rig_create",input:{template:"humanoide",height:50,style:"estilizado",ground:57,x:30,auto_art:false}},
 {name:"rig_bone",input:{name:"espada",parent:"antebraco_tras",length:17,mode:"absolute",rest:180,sign:-1,min:22,max:22}},
 {name:"rig_bone",input:{name:"braco_frente",min:0,max:0}},
 {name:"rig_bone",input:{name:"antebraco_frente",min:0,max:0}},
 {name:"rig_bone",input:{name:"braco_tras",min:14,max:32}},
 {name:"rig_bone",input:{name:"antebraco_tras",min:55,max:75}},
];
for(const [n,p] of Object.entries(PARTS)) cmds.push({name:"rig_part",input:{name:n,...p}});
fs.writeFileSync("chao.json",JSON.stringify([]));
cmds.push(...JSON.parse(fs.readFileSync(process.env.EXTRA||"extra.json","utf8")));
fs.writeFileSync("cmds.json",JSON.stringify(cmds));
execSync(`rm -f ${proj}; ${A} new ${proj} 64x64 10`,{stdio:"ignore"});
console.log(execSync(`${A} run ${proj} cmds.json 2>&1 | grep -E '^(ok|ERRO|erro|aviso|!)|rror' `).toString());
