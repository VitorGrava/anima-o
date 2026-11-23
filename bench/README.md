# bench: ciclo de melhoria por animações

Cada animação de `briefs.json` é pedida a um agente **novo** (sem o contexto da conversa), que só recebe o
pedido e o caminho do repositório. O resultado é avaliado (imagens, `check`, princípios de animação) e o que deu
errado vira correção no código da engine ou nas instruções que a IA lê (`server/prompt.ts`, descrições dos comandos).
A próxima animação já roda com as correções. O diário fica em `log.md`; os arquivos de cada rodada, em `out/<id>/`.
