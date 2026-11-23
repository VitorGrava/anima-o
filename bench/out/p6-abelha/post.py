"""pós-processo: clareia o contorno das asas (asa translúcida) direto na paleta"""
import json, sys
p = json.load(open(sys.argv[1]))
pal = p["palette"]
cmds = []
for c in pal:
    if c["name"] == "contorno-asa":
        cmds.append({"key": c["key"], "hex": "#5E7FA6", "name": c["name"]})
    if c["name"] == "contorno-asa-luz":
        cmds.append({"key": c["key"], "hex": "#8FA9C8", "name": c["name"]})
json.dump([{"name": "set_palette", "input": {"colors": cmds}}], open(sys.argv[2], "w"))
