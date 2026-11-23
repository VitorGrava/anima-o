#!/bin/sh
# uso: examples/cena/run.sh rNN   (gera cena.anima.json a partir de rNN.mjs e exporta bench/out/cena/rNN.png)
set -e
cd "$(dirname "$0")/../.."
node --import tsx examples/cena/$1.mjs
node bin/anima.mjs new examples/cena/cena.anima.json 320x180 1 >/dev/null
node bin/anima.mjs run examples/cena/cena.anima.json examples/cena/cmds.json -q 2>&1 | grep -i "erro" | head -3 || true
node bin/anima.mjs export examples/cena/cena.anima.json bench/out/cena/$1.png --scale 4 --frame 0; node bin/anima.mjs export examples/cena/cena.anima.json bench/out/cena/$1.gif --scale 3 >/dev/null 2>&1 || true | tail -1
