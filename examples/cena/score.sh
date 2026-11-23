#!/bin/sh
# imprime a nota e os achados do avaliar (tipo cena) da cena atual
cd "$(dirname "$0")/../.."
echo '[{"name":"avaliar","input":{"tipo":"cena"}}]' > /tmp/av.json
node bin/anima.mjs run examples/cena/cena.anima.json /tmp/av.json 2>&1 | sed -n 1,40p | grep -v "^Projeto\|^Paleta\|^Camadas\|^Dura\|^$\|✓\|heurística"
