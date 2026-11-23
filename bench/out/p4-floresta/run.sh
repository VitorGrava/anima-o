#!/bin/bash
# uso: run.sh N
cd /home/user/anima-o
P=bench/out/p4-floresta
(cd $P && node gen.mjs $1) && node bin/anima.mjs new $P/floresta.anima.json 160x90 1 >/dev/null && node bin/anima.mjs run $P/floresta.anima.json $P/cmd-r$1.json 2>&1 | grep -viE "^ok " | tail -${2:-8}
node bin/anima.mjs export $P/floresta.anima.json $P/r$1.png --frame 0 --scale 6 | tail -1
