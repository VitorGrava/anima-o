#!/bin/bash
# uso: build.sh <prefixo>
cd /home/user/anima-o
D=bench/out/p4-gato
node bin/anima.mjs new $D/gato.anima.json 32x32 8 >/dev/null
node $D/gen.mjs > $D/cmds.json
node bin/anima.mjs run $D/gato.anima.json $D/cmds.json 2>&1 | grep -iE "erro|aviso|✗|fail" 
node bin/anima.mjs export $D/gato.anima.json $D/$1_f0.png --frame 0 --scale 14 >/dev/null
node bin/anima.mjs export $D/gato.anima.json $D/$1_sheet.png --scale 6 --columns 6 >/dev/null
