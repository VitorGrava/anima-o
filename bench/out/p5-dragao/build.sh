#!/bin/bash
# uso: build.sh <prefixo-da-rodada>
cd /home/user/anima-o
D=bench/out/p5-dragao
node bin/anima.mjs new $D/dragao.anima.json 32x32 8 >/dev/null
node $D/gen.mjs > $D/cmds.json || exit 1
node bin/anima.mjs run $D/dragao.anima.json $D/cmds.json 2>&1 | grep -iE "erro|error|aviso|✗|fail" | head -20
for f in 0 1 2 3; do node bin/anima.mjs export $D/dragao.anima.json $D/$1_f$f.png --frame $f --scale 12 >/dev/null; done
node bin/anima.mjs export $D/dragao.anima.json $D/$1_folha.png --scale 8 --columns 4 >/dev/null
