// Ponto de entrada do painel: lê o .env (fora do cérebro), monta o servidor e começa a escutar.
import { lerArquivoEnv, configuracao } from './config.js';
import { criarServidor } from './app.js';

const env = lerArquivoEnv(process.env.CORE_OS_ENV || '/opt/core-os/.env', process.env);
const cfg = configuracao(env);
const s = criarServidor(cfg);
if (s.senhaGerada) console.log(`CORE_OS_PASSWORD vazia. Senha gerada para esta execução: ${s.senhaGerada}`);
if (!cfg.tokenPonte) console.log('CORE_OS_HOOK_TOKEN vazio: a ponte do WhatsApp recusa todas as mensagens.');
s.conversas.iniciarRelogios();
s.server.listen(cfg.porta, cfg.host, () => {
  const { address, port } = s.server.address();
  console.log(`Painel no ar em http://${address}:${port} (cérebro: ${cfg.vault})`);
});

const sair = () => s.fechar().then(() => process.exit(0));
process.on('SIGTERM', sair);
process.on('SIGINT', sair);
