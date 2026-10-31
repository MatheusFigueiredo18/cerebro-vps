---
name: instalar-cerebro-vps
description: Roteiro para colocar no ar, nesta VPS, o painel do segundo cérebro com Claude Code, WhatsApp (Evolution API) e n8n, conduzindo a pessoa passo a passo. Acione em frases como "põe o painel pra rodar aqui", "faz a instalação do cerebro-vps", "segue o SKILL.md", "monta meu cérebro nesse servidor", "executa o instalador".
---

# Instalar o cérebro nesta VPS

Contexto: servidor Ubuntu ou Debian, repositório (ou pacote) `cerebro-vps` já baixado. Você está lendo `skill/SKILL.md`; o instalador é `instalador/instalar.sh`, na pasta ao lado.

## Combinados durante toda a instalação

- A senha do painel só vai para a conversa depois de um aviso e de um "pode mostrar" (a pessoa pode estar gravando a tela).
- Firewall, Caddy e portas de container ficam exatamente como o instalador deixa. Nada de abrir porta extra.
- Nenhum travessão nas mensagens.
- Linguagem simples; jargão só se pedirem.

## 0. Esta sessão está como root?

Rode `id -u`. Se der `0`, **não continue**. Explique em três linhas:

> Você está como root, e o Claude Code se recusa a responder sem pedir confirmação quando roda como root.
> É exatamente esse modo que atende o WhatsApp, então como root o cérebro não responderia por lá.
> A saída é criar um usuário comum com sudo e fazer a instalação a partir dele.

E passe os comandos (troque `cerebro` pelo nome que preferir):

```bash
adduser cerebro              # cria o usuário e pede uma senha para ele
usermod -aG sudo cerebro     # dá permissão de sudo
su - cerebro                 # entra nele (ou, de fora: ssh cerebro@IP-DA-VPS)
```

Já dentro do usuário novo: instalar o Claude Code de novo (pelo instalador oficial, https://docs.claude.com/pt/docs/claude-code/setup), rodar `claude` uma vez para fazer login, clonar o repositório (público, sem login no GitHub) em `~/cerebro-vps` e repetir o pedido de instalação ao Claude Code de lá. Pare aqui até a pessoa voltar como usuário comum.

## 1. Uma mensagem só, com quatro perguntas

1. **Como você se chama?** O nome entra no título do cérebro.
2. **Vai usar domínio próprio?** Se sim, antes de instalar crie no DNS dois registros A para o IP desta VPS: o domínio em si (ex.: `cerebro.seusite.com`) e o mesmo com `n8n.` na frente (ex.: `n8n.cerebro.seusite.com`). Sem domínio funciona igual, só que sem HTTPS.
3. **Prefere inventar a senha do painel ou receber uma pronta?** Se inventar, ela precisa de 8 caracteres ou mais e não pode conter espaços nem nenhum destes símbolos: `'` `"` `$` `` ` `` `\`.
4. **Quer os exemplos de conteúdo** (carrossel, capas, vídeo)? Silêncio conta como sim.

Para citar o IP na pergunta 2: `curl -fsS https://api.ipify.org`.

## 2. Assinatura do Claude Code

`claude --version` precisa responder, e a conta precisa estar logada neste usuário. O painel e o WhatsApp vão rodar com essa mesma assinatura. Sem login, peça para a pessoa abrir `claude` uma vez e entrar.

## 3. Executar o instalador

Na raiz do repositório:

```bash
sudo bash instalador/instalar.sh --nome "Nome da Pessoa" [--dominio cerebro.seusite.com] [--senha "senha-escolhida"] [--sem-exemplos]
```

Combine as expectativas antes: leva alguns minutos e vai mostrando 8 passos numerados. `--simular` faz um ensaio sem alterar nada.

Deu erro? A mensagem traz o comando de log certo. Rode, descubra a causa, conserte e execute o mesmo comando outra vez: ele retoma de onde parou e preserva senhas, dados e o cérebro.

## 4. O que entregar, nesta ordem

1. **Painel:** endereço e senha, ambos no resumo final do instalador (lembre do aviso antes da senha).
2. **WhatsApp:** o QR já aparece no terminal. Caminho no celular: WhatsApp > Configurações > Aparelhos conectados > Conectar um aparelho. Ele expira em mais ou menos 1 minuto; um novo sai com `sudo bash instalador/whatsapp-qr.sh`.
3. **n8n:** passe o endereço e avise que o primeiro acesso pede para cadastrar a conta de administrador (e-mail e senha). O fluxo do WhatsApp já chega importado e ligado, não precisa tocar nele.
4. **Teste:** a pessoa escreve uma pergunta no chat consigo mesma ("Você") do WhatsApp e espera a resposta. Se for dar ordens de outro telefone, basta incluir esse número na guia WhatsApp do painel.

## Para explicar o WhatsApp

- O telefone que for conectado passa a ser o telefone do cérebro; serve tanto um número pessoal quanto um comercial.
- Atende ordens de duas origens apenas: o chat "Você" desse telefone e os números liberados no painel.
- Mensagem de grupo ou de número não liberado é ignorada, sem resposta.
- Liberar ou trocar números é feito no painel e vale na hora; o n8n fica intocado.
- `/nova` (ou `/limpar`) começa um assunto do zero. Depois de 6 horas de silêncio, a próxima mensagem já abre conversa nova por conta própria.
- No painel, as conversas que vieram do WhatsApp têm um selo próprio e podem ser continuadas dali.
