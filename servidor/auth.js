// Senha única, tokens de sessão persistidos em logins.json e limite de tentativas por IP.
import crypto from 'node:crypto';
import { lerJson, gravarJson } from './dados.js';

const JANELA_MS = 60_000;
const MAX_ERROS = 5;
const MAX_TOKENS = 50;
const TOKEN = /^[0-9a-f]{64}$/;

const resumo = (s) => crypto.createHash('sha256').update(String(s ?? '')).digest();
// resumos de mesmo tamanho deixam a comparação em tempo constante mesmo com tamanhos diferentes
export const iguaisSeguro = (a, b) => crypto.timingSafeEqual(resumo(a), resumo(b));

export function lerCookie(cabecalho, nome) {
  for (const parte of String(cabecalho ?? '').split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nome) return parte.slice(i + 1).trim();
  }
  return '';
}

export function criarAuth({ senha, dados, agora = Date.now }) {
  const salvos = lerJson(dados, 'logins.json', []);
  const tokens = new Set(Array.isArray(salvos) ? salvos.filter((t) => TOKEN.test(t)) : []);
  const erros = new Map();
  const gravar = () => gravarJson(dados, 'logins.json', [...tokens]);

  const recentes = (ip) => (erros.get(ip) ?? []).filter((t) => agora() - t < JANELA_MS);

  return {
    entrar(enviada, ip) {
      const lista = recentes(ip);
      erros.set(ip, lista);
      if (lista.length >= MAX_ERROS) return { status: 429, corpo: { erro: 'Muitas tentativas. Espere um minuto e tente de novo.' } };
      if (!iguaisSeguro(enviada, senha)) {
        lista.push(agora());
        return { status: 401, corpo: { erro: 'Senha errada.' } };
      }
      const token = crypto.randomBytes(32).toString('hex');
      tokens.add(token);
      while (tokens.size > MAX_TOKENS) tokens.delete(tokens.values().next().value);
      gravar();
      return { status: 200, corpo: { ok: true }, token };
    },
    sair(token) {
      if (tokens.delete(token)) gravar();
    },
    valido: (token) => TOKEN.test(token) && tokens.has(token),
  };
}
