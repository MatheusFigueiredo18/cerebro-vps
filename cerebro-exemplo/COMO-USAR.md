# Como usar o seu cérebro

Pense nele como um assistente com caderno: tudo o que você conta fica anotado, e tudo o que ele produz fica guardado numa pasta que você consegue abrir.

## Três jeitos de falar com ele

1. **Pelo navegador.** Abra o endereço do painel, entre com a senha e vá em Conversas. Ali você também vê os arquivos e a galeria do que já foi feito.
2. **Pelo WhatsApp.** Mande mensagem no número conectado (no seu próprio chat "Você", se o número for o seu). Para começar um assunto do zero, escreva `/nova`.
3. **Pelo terminal.** Entre no servidor por SSH (dá para fazer pelo celular com um aplicativo de SSH), vá para a pasta `cerebro` e rode `claude`.

## Exemplos de pedido

| Você pede | O resultado aparece em |
|---|---|
| "Faz um carrossel sobre 3 hábitos que economizam tempo" | `conteudo/carrosseis/` |
| "Cria três capas para o vídeo da rotina da manhã" | `conteudo/thumbnails/` |
| "Edita esse vídeo bruto e tira as repetições" | `conteudo/reels/` |
| "Manda pra Ana a foto do cardápio da semana" | `conteudo/whatsapp/` (e a mensagem vai pra Ana depois do seu ok) |
| "Me lembra de pagar o contador sexta" | `tasks/todo.md` |

## O que você não precisa fazer

Organizar nada. Basta conversar normalmente: o cérebro registra sozinho o que for importante e avisa onde guardou. Quando terminar um bloco de trabalho, diga "salva" para ele fechar a sessão sem perder nada.
