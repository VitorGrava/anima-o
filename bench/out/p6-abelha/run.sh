#!/bin/bash
# uso: ./run.sh 32 r2   -> gera, roda e exporta folha + frame 0
set -e
cd /home/user/anima-o
D=bench/out/p6-abelha; S=$1; R=$2
python3 $D/gen$S.py $D/$R-$S.json > /dev/null
node bin/anima.mjs new $D/abelha-$S.anima.json ${S}x${S} 10 > /dev/null
node bin/anima.mjs run $D/abelha-$S.anima.json $D/$R-$S.json -q > $D/$R-$S.log 2>&1 || { tail -5 $D/$R-$S.log; exit 1; }
python3 $D/post.py $D/abelha-$S.anima.json $D/post-$S.json && node bin/anima.mjs run $D/abelha-$S.anima.json $D/post-$S.json -q >> $D/$R-$S.log 2>&1
grep -iE "aviso|erro" $D/$R-$S.log | head -5
SC=$(( 512 / S ))
node bin/anima.mjs export $D/abelha-$S.anima.json $D/$R-$S-sheet.png --scale $(( SC/2 )) --columns 4 --fundo '#6a8fb0' > /dev/null
node bin/anima.mjs export $D/abelha-$S.anima.json $D/$R-$S-f0.png --frame 0 --scale $SC --fundo '#6a8fb0' > /dev/null
echo ok
