---
name: whatsapp
description: Acesso ao WhatsApp ligado ao cérebro, para consultar conversas e mandar recados, fotos, arquivos ou áudios. Acione em frases como "avisa a Ana que vou atrasar 10 minutos", "o que o João falou hoje?", "joga esse PDF no meu zap", "quem me procurou ontem?", "qual é o telefone da Carla?", "manda essa foto no grupo da família".
---

# WhatsApp

Tudo passa por um único programa: `.claude/skills/whatsapp/motor/whatsapp.sh`, seguido do comando.

- `conversas [qtd]`: lista os papos mais recentes, com hora, nome, número, marca `[grupo]` e o início da última fala.
- `ler <número ou nome> [qtd]`: mostra a troca de mensagens com alguém, em ordem cronológica.
- `contato <nome>`: devolve o telefone das pessoas cujo nome bate com o termo.
- `text "<mensagem>" [número]`, `image <arquivo ou URL> ["legenda"] [número]`, `doc <arquivo ou URL> ["legenda"] [número]`, `audio <arquivo ou URL> [número]`: envios.
- `status`: diz se a conexão está de pé. `eu`: mostra o número conectado.

Envio sem número cai no próprio dono (quem pediu pelo WhatsApp ou, na falta dele, o número conectado). Se `ler` achar mais de uma pessoa, imprime os candidatos e termina com código 2; aí decida pelo contexto da conversa ou pergunte.

## Configuração

O programa tira as credenciais de `/opt/core-os/.env`; nada disso deve ser copiado para o cérebro.

A lista de números autorizados a mandar ordens mora no painel (guia WhatsApp) e, por baixo, no arquivo `/opt/core-os/dados/whatsapp-acesso.json`. O campo `numeros` traz os telefones com país e DDD; o campo `chatVoce` liga ou desliga o chat consigo mesmo do número conectado. A troca vale já na mensagem seguinte. Para mexer nessa lista, é só esse arquivo: alterar o fluxo do n8n, o código do painel ou o `.env` para isso está vetado.

## Mandar direto ou pedir confirmação

Mande sem perguntar se o dono deu a ordem com todas as letras ("manda pra Ana: chego às 8") e, em seguida, informe destinatário e texto exato.

Pare e mostre o rascunho primeiro em três situações: a iniciativa de enviar partiu de você; o nome pode corresponder a mais de uma pessoa; o assunto é delicado (dinheiro, cobrança, pedido de desculpas).

O texto precisa soar como o dono escreve (consulte `memoria/estilo-de-conteudo.md`) e jamais denunciar que foi uma IA. Grupos só recebem algo quando o dono citou o grupo pelo nome. Cada recado mandado a outra pessoa ganha registro em `conteudo/whatsapp/AAAA-MM-DD-<assunto>.md`.

## Ao consultar conversas

Resuma: quem pediu o quê, o que ficou em aberto, que datas apareceram. Só transcreva se o dono quiser. Algo pendente só entra em `tasks/todo.md` quando o dono pedir para acompanhar.

## Quando falha

Rode `status`. Qualquer coisa diferente de `open` significa WhatsApp desconectado: oriente o dono a ler o QR de novo na guia WhatsApp do painel (ou, no servidor, `sudo bash whatsapp-qr.sh`).
