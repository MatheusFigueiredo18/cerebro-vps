# 06 · Modelo do cérebro

> O instalador copia um cérebro de exemplo para `<casa do dono>/cerebro`. Este documento diz o que esse modelo precisa conter e por quê. Todos os textos (constituição, skills, índices, guia) devem ser redigidos pelo implementador; aqui só estão as intenções.

## 1. Ideia geral

O cérebro é uma pasta comum de arquivos Markdown que o agente de IA usa como memória e local de trabalho. Três princípios orientam o desenho:

1. **Roteamento direto.** Cada coisa tem um destino conhecido; não há área de espera para triagem posterior. Por isso o modelo **não** traz pastas de rascunho, diário ou "caixa de entrada".
2. **Mapas por pasta.** Cada pasta importante tem um pequeno índice, para o agente se orientar sem ler tudo. O índice orienta, mas quem manda é o conteúdo real: se os dois discordarem, o agente corrige o índice.
3. **Regras escritas, reforçadas por automação.** O comportamento do agente vem de um documento de regras (a constituição) e é relembrado por hooks a cada mensagem.

## 2. Árvore do modelo

Agrupada por papel, e não por ordem alfabética.

**Regras e orientação (raiz)**

| Caminho | Papel |
|---|---|
| `CLAUDE.md` | a constituição (§3) |
| `AGENTS.md` | versão resumida das regras para motores que não leem `CLAUDE.md` (§5) |
| `COMO-USAR.md` | explicação para o dono, sem jargão (§6) |

**Automação e habilidades (`.claude/` e afins)**

| Caminho | Papel |
|---|---|
| `.claude/settings.json` | liga os hooks aos eventos do Claude Code |
| `.claude/hooks/` | os scripts dos hooks (§7) |
| `.claude/skills/<nome>/SKILL.md` | as skills (§4); algumas têm uma subpasta `motor/` com scripts |
| `.agents/skills` | link simbólico para `../.claude/skills`, para que outros motores encontrem as mesmas skills |

**Trabalho e memória**

| Caminho | Papel |
|---|---|
| `tasks/todo.md` | a única lista de pendências do dono; não deve haver tarefas espalhadas em outros lugares |
| `tasks/lessons.md` | regras tiradas de erros já corrigidos, para não se repetirem |
| `memoria/MEMORY.md` | sumário das notas de contexto duradouro, com um link e uma linha por nota |
| `memoria/estilo-de-conteudo.md` | exemplo de nota de contexto: como o dono quer que o conteúdo soe e o que evitar |

**Produção**

| Caminho | Papel |
|---|---|
| `conteudo/` | raiz de tudo o que o cérebro entrega; o painel monta a galeria a partir daqui |
| `conteudo/carrosseis/`, `conteudo/thumbnails/`, `conteudo/reels/` | uma subpasta por entrega, por formato |
| `conteudo/whatsapp/` | registros de mensagens que o cérebro enviou em nome do dono |
| `assets/` | material de referência fornecido pelo dono (fotos, marcas, fontes, documentos); começa vazia |

**Integração com o painel**

| Caminho | Papel |
|---|---|
| `sessoes/` | uma nota por conversa aberta no painel, criada e mantida pelo próprio agente; o índice desta pasta pede que ninguém a altere manualmente |

**Índices:** `tasks`, `memoria`, `conteudo`, `sessoes` e `assets` têm cada uma o seu `CLAUDE.md` curto, listando o que há dentro e, em `conteudo`, quais exemplos já vêm prontos. O painel ignora esses arquivos na galeria e nas listagens (ver 01).

**Marcador:** o título de `CLAUDE.md` e de `AGENTS.md` contém `{{NOME}}`, trocado pelo nome do dono durante a instalação.

## 3. Constituição (`CLAUDE.md`)

O agente a lê antes de agir. Ela precisa tratar dos assuntos abaixo; a divisão em seções, a numeração e a redação são livres, **exceto** que a regra da nota de status precisa existir com o formato exato descrito no item 5.

1. **Identidade e tom.** Quem é o dono (via marcador), em que contexto o cérebro vive (servidor sempre ligado, acessado pelo navegador, pelo aplicativo de mensagens e por SSH) e como o agente deve se dirigir a ele: linguagem do dia a dia, detalhes técnicos apenas sob pedido.
2. **Captura contínua.** Princípio central: qualquer informação nova que o dono mencione (sobre pessoas, decisões, números, negócios) é registrada imediatamente no destino apropriado, mesmo que não seja o assunto principal do pedido. Cada registro é comunicado ao dono numa frase curta. Faltando um dado essencial, o agente faz uma única pergunta, sem interrogatório. Pendências mencionadas vão para `tasks/todo.md`; correções que o dono fizer viram uma regra em `tasks/lessons.md`.
3. **Mapa das pastas.** Uma tabela equivalente à do §2 e a proibição explícita de criar pastas de triagem.
4. **Para onde vai cada coisa.** Uma tabela de "tipo de pedido" para "pasta de destino", cobrindo os formatos de conteúdo, os registros de envio por mensagem, pendências, lições e material de apoio. Duas regras acompanham a tabela: o resultado de um pedido mora junto do assunto a que pertence; e cada pasta de entrega recebe um arquivo `pedido.md` registrando o que foi pedido, por qual canal e o que foi entregue. Também explica o uso dos índices de pasta (§1, princípio 2).
5. **Nota de status das conversas do painel.** O contrato com o painel (ver 02, §6): o caminho da nota chega no prompt de sistema; o agente a cria logo no início de qualquer tarefa; o formato é fixo, com uma linha `# ` de título, uma linha `> ` com resumo de uma ou duas frases e uma lista de itens `- [ ]` (um por etapa), marcados como `- [x]` à medida que são concluídos; ao final, o resumo passa a descrever o resultado. A constituição deve deixar claro que, sem essa nota, o painel fica sem informação.
6. **Skills disponíveis.** Uma linha por skill, a regra de transformar em skill qualquer procedimento repetido três vezes e o local onde as skills ficam.
7. **Motores.** Os três motores possíveis, onde o dono escolhe cada um (separadamente para o painel e para o WhatsApp) e o fato de todos obedecerem às mesmas regras e skills.
8. **Limites de operação.** Arquivar com data em vez de apagar; pedir aprovação antes de mandar qualquer coisa a terceiros (ao próprio dono pode mandar sem perguntar); nunca colocar segredos no cérebro, pois eles vivem em `/opt/core-os/.env`; não usar travessão; sugerir a skill de fechamento ao fim de um bloco de trabalho.

## 4. Skills

Formato comum: pasta `.claude/skills/<nome>/` com um `SKILL.md` que começa por metadados (`name` e uma `description` contendo exemplos de frases do dono que devem acionar a skill), seguidos do procedimento. Há cinco no modelo.

### 4.1 `whatsapp`: ler e enviar mensagens

**Objetivo.** Dar ao agente, em qualquer canal, acesso ao WhatsApp do número conectado: consultar conversas recentes, localizar uma pessoa pelo nome, ler o histórico com ela e enviar texto, imagem, documento ou mensagem de voz para ela ou para o dono.

**Ferramenta de apoio** `motor/whatsapp.sh`, com estes subcomandos (os nomes são interface, porque o `SKILL.md` e o agente os usam):

| Subcomando | Argumentos | Resultado esperado |
|---|---|---|
| `conversas` | quantidade opcional (20 se omitida) | conversas mais recentes, uma por linha, com horário, nome, número, marca de grupo e começo da última mensagem (até 80 caracteres) |
| `ler` | número ou nome, quantidade opcional (20) | mensagens trocadas com a pessoa, da mais antiga para a mais nova, com data, hora, autor e conteúdo (ou legenda, ou o tipo quando não há texto) |
| `contato` | nome | pessoas cujo nome contém o termo, com o número |
| `text` | mensagem, destino opcional | envia texto |
| `image`, `doc` | arquivo (local ou URL), legenda, destino opcional | envia mídia; arquivo local é codificado em base64 com o tipo MIME detectado |
| `audio` | arquivo, destino opcional | envia como mensagem de voz |
| `status` | | estado da conexão |
| `eu` | | número conectado |

Comportamentos exigidos da ferramenta:

- Credenciais (`EVO_URL`, `EVO_KEY`, `EVO_INSTANCE`) lidas de `/opt/core-os/.env`; se faltarem, encerra com erro claro. Datas no fuso de São Paulo.
- Para montar a lista de conversas, cruza os chats com os contatos da Evolution. Número: preferir o identificador alternativo da última mensagem. Nome: do contato; se não houver, o de quem enviou a última mensagem (quando não foi o dono); por fim, o nome do chat. Exclui a lista de status. Entradas que representam a mesma pessoa (mesmo número) são unificadas, guardando a mais recente e todos os identificadores.
- Ao identificar a pessoa para leitura: um identificador completo (com `@`) é usado como está; uma sequência de pelo menos 8 dígitos é comparada com o final dos números; qualquer outro texto é procurado no nome, sem distinguir maiúsculas. Sem resultado, erro. Com vários resultados, a ferramenta lista os candidatos e sai com código 2, cabendo ao agente decidir pelo contexto ou perguntar.
- A leitura junta as mensagens de todos os identificadores da pessoa, elimina repetidas e ordena por horário.
- Destino de envio, em ordem de preferência: o informado; `WHATS_PARA`; o número conectado.
- Envio ao próprio número conectado é prefixado com U+2063 (ver 04, §5.4).
- Envio bem-sucedido imprime uma confirmação curta; falha imprime o retorno da Evolution. Chamada sem subcomando reconhecido mostra a forma de uso.

Diretrizes que o `SKILL.md` deve passar ao agente (com redação própria):

- Onde ficam as credenciais e onde o dono controla quem dá ordens.
- **Quando enviar sem perguntar:** quando o dono ordenou de forma inequívoca; depois do envio, relatar destinatário e texto exato.
- **Quando confirmar antes:** se a iniciativa foi do agente, se há mais de um destinatário possível, ou se o agente teve de redigir algo sensível (dinheiro, cobrança, pedido de desculpas).
- O texto enviado imita o jeito do dono escrever e nunca revela que foi escrito por IA. Grupos só recebem mensagem se o dono nomeou o grupo.
- Ao ler conversas, entregar uma síntese (quem quer o quê, o que está pendente, prazos) em vez da transcrição; pendências só entram no todo se o dono pedir acompanhamento.
- Em caso de falha, consultar o `status`; se desconectado, orientar o dono a reconectar pelo QR nas configurações do painel.
- Para mudar quem pode dar ordens, explicar o arquivo `whatsapp-acesso.json` (campos e efeito imediato) e **vetar** alterações no fluxo do n8n, no código do painel ou no `.env` com esse propósito.

### 4.2 `carrossel`: posts em várias páginas

**Objetivo.** Produzir carrosséis verticais de 1080 por 1350, seja partindo de um tema, seja recriando em português um carrossel de referência.

Elementos que o procedimento deve conter:

- Dois modos distintos: criação a partir de tema e recriação de referência.
- Cada entrega em pasta própria com data no nome e o `pedido.md`.
- Na recriação: guardar as páginas de referência numa subpasta `original/`, extrair a paleta real das imagens, escolher a fonte disponível mais parecida e medir a diagramação em proporções relativas.
- Cada página construída como um documento HTML numa subpasta `build/`. O texto é sempre composto em HTML e CSS; imagens geradas por IA só entram como ilustração, nunca com texto embutido (geradores erram letras).
- Exportação de cada página em PNG por um navegador sem interface, comparação com a referência e novas rodadas até ficar fiel.
- Resultado final numa subpasta `entrega/`, com a legenda do post num arquivo separado.
- Critérios editoriais: a primeira página precisa vender o carrossel, cada página carrega uma ideia só e a última termina com uma chamada para ação bem curta. Numa recriação, menções ao perfil original passam a ser o perfil do dono.
- Referência ao exemplo pronto.

### 4.3 `thumbnail`: capas de vídeo

**Objetivo.** Criar capas de vídeo em 1280 por 720 (JPG), sempre com três alternativas conceitualmente diferentes para teste A/B.

Elementos: pasta por vídeo com `pedido.md`; extrair do roteiro uma promessa de no máximo quatro palavras; três ângulos de promessa distintos (variar só a cor não conta); geração da cena com o serviço de imagem configurado, com a chave no `.env` e uma imagem do rosto do dono guardada em `assets/` como base; retoque final; uma lista curta de proibições de composição voltada a evitar erros típicos de imagem gerada (enquadramento que corta a pessoa, elementos gráficos soltos sem função, tipografia que não existe); referência ao exemplo.

### 4.4 `edicao-video`: vídeos curtos verticais

**Objetivo.** Transformar uma gravação bruta, com repetições de falas, num vídeo vertical 1080 por 1920 pronto para publicar.

Elementos: pasta por vídeo contendo `pedido.md` e a gravação original; transcrição com marcação de tempo por palavra; quando uma frase foi gravada várias vezes, aproveitar a versão final (as primeiras costumam ser ensaio); remoção de pausas e tropeços preservando uma folga mínima entre cortes; um roteiro de animações (posição, duração, cobertura) que **só é executado após aprovação do dono**; legendas no estilo do dono, efeitos sonoros nas animações e música de fundo discreta; arquivo final salvo junto do bruto; referência ao exemplo.

### 4.5 `save`: encerramento da sessão

**Objetivo.** Garantir que nada dito numa sessão de trabalho se perca.

Elementos: revisar a conversa à procura de informações que ficaram sem registro e gravá-las (pendência, lição ou contexto duradouro), avisando cada gravação; fechar tarefas cumpridas com a data e incluir as novas; corrigir os índices das pastas cujo conteúdo mudou; registrar o desfecho na nota de status, quando a sessão veio do painel; terminar com um resumo de poucas linhas dizendo o que foi gravado e onde. Reforça as proibições de apagar arquivos e de usar travessão.

## 5. `AGENTS.md`: regras para os outros motores

Codex e Antigravity não carregam `CLAUDE.md` nem executam hooks. Este arquivo existe para compensar isso e deve:

- remeter à constituição como regra válida também para eles, com a observação de que as menções ao "Claude" se referem a quem está lendo;
- substituir manualmente o que os hooks fariam: ler as primeiras pendências de `tasks/todo.md` ao começar e aplicar a captura contínua a cada mensagem;
- explicar como achar a nota de status: o valor de `CORE_OS_SESSAO` indica o arquivo `sessoes/<valor>.md`, que deve ser criado no início no formato da constituição e atualizado a cada etapa;
- indicar onde estão as skills (`.claude/skills/` e o espelho `.agents/skills/`) e exigir a leitura da skill antes das tarefas correspondentes;
- repetir as regras de segredos fora do cérebro e de não usar travessão.

## 6. `COMO-USAR.md`

Texto breve para leigos: os três jeitos de falar com o cérebro (painel no navegador, aplicativo de mensagens e terminal, inclusive pelo celular), alguns exemplos de pedidos com a pasta em que cada resultado aparece, e o lembrete de que basta conversar naturalmente, porque o registro é automático.

## 7. Hooks

Configurados em `.claude/settings.json`, chamando scripts de `.claude/hooks/` a partir do diretório do projeto que o Claude Code informa.

| Evento do Claude Code | Script | Efeito |
|---|---|---|
| início de sessão | `painel.sh` | coloca no contexto a data atual, até dez pendências em aberto de `tasks/todo.md` e um lembrete da captura contínua |
| cada mensagem enviada | `captura.sh` | coloca no contexto um lembrete de uma linha sobre registrar fatos novos e transformar pendências em itens do todo |

Motivo: a regra mais importante não pode depender de o agente lembrar dela sozinho.

## 8. Conteúdo inicial e exemplos

**Arquivos de trabalho iniciais.**

- `tasks/todo.md`: um cabeçalho dizendo que é a lista única, um bloco da semana com duas pendências relacionadas aos exemplos e um bloco de concluídos contendo a própria instalação.
- `tasks/lessons.md`: um punhado de lições de exemplo, cada uma uma regra curta em destaque seguida do motivo (por exemplo, sobre texto em imagens geradas, enquadramento de capas, escolha de takes, roteamento direto e o travessão).
- `memoria/MEMORY.md`: sumário com um link para a nota de estilo.
- `memoria/estilo-de-conteudo.md`: nota com metadados `type` e `updated`, cobrindo tom de voz, o tipo de conteúdo que funciona e uma regra para cada formato.

**Exemplos de entrega.** Evitam que a galeria comece vazia e ensinam o padrão. Cada um traz um `pedido.md` com metadados (`type: entrega`, `caso`, `canal`, `data`), a frase do pedido citada, as etapas executadas e o resultado.

| Formato | Pasta (padrão do nome) | Conteúdo |
|---|---|---|
| carrossel recriado | `conteudo/carrosseis/AAAA-MM-DD-<tema>/` | mais de uma dúzia de páginas JPG em `entrega/`, de onde sai a capa da galeria; canal painel |
| vídeo editado | `conteudo/reels/<numero>-<slug>/` | `antes-bruto.mp4` e `depois-editado.mp4`, com a capa vinda do segundo; canal terminal |
| capas de vídeo | `conteudo/thumbnails/<slug-do-video>/` | algumas variações JPG para A/B; canal painel |
| registro de envio | `conteudo/whatsapp/AAAA-MM-DD-<assunto>.md` | pedido recebido pelo WhatsApp e envio de uma imagem de volta, com espaço reservado para um print |

As mídias de exemplo podem ser quaisquer arquivos de demonstração. Com `--sem-exemplos`, essas pastas e seus `pedido.md` não são copiados.
