// Login do admin (senha do .env) e das pessoas criadas no painel; tokens de sessão em logins.json e limite de tentativas por IP.
// Em logins.json o token do admin fica puro (como nas versões antigas) e o de outra pessoa vira "token:id".
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

export function criarAuth({ senha, dados, agora = Date.now, usuarios = null }) {
  const salvos = lerJson(dados, 'logins.json', []);
  const tokens = new Map(); // token -> 'admin' ou id da pessoa
  for (const s of Array.isArray(salvos) ? salvos : []) {
    const [t, quem = 'admin'] = String(s).split(':');
    if (TOKEN.test(t)) tokens.set(t, quem);
  }
  const erros = new Map();
  const gravar = () => gravarJson(dados, 'logins.json', [...tokens].map(([t, quem]) => (quem === 'admin' ? t : `${t}:${quem}`)));
  const perfil = (token) => {
    const quem = TOKEN.test(token) ? tokens.get(token) : undefined;
    if (quem === 'admin') return { admin: true, usuario: 'admin', nome: 'Admin' };
    const u = quem && usuarios?.porId(quem);
    return u?.ativo ? { admin: false, ...u } : null;
  };

  const recentes = (ip) => (erros.get(ip) ?? []).filter((t) => agora() - t < JANELA_MS);

  return {
    entrar(enviada, ip, usuario = '') {
      const lista = recentes(ip);
      erros.set(ip, lista);
      if (lista.length >= MAX_ERROS) return { status: 429, corpo: { erro: 'Muitas tentativas. Espere um minuto e tente de novo.' } };
      const nome = String(usuario ?? '').trim().toLowerCase();
      const quem = !nome || nome === 'admin' ? (iguaisSeguro(enviada, senha) ? 'admin' : null) : usuarios?.verificar(nome, enviada)?.id ?? null;
      if (!quem) {
        lista.push(agora());
        return { status: 401, corpo: { erro: 'Usuário ou senha errados.' } };
      }
      const token = crypto.randomBytes(32).toString('hex');
      tokens.set(token, quem);
      while (tokens.size > MAX_TOKENS) tokens.delete(tokens.keys().next().value);
      gravar();
      return { status: 200, corpo: { ok: true }, token };
    },
    sair(token) {
      if (tokens.delete(token)) gravar();
    },
    perfil,
    valido: (token) => perfil(token) !== null,
    // pessoa apagada ou com senha trocada: as sessões abertas dela caem na hora
    sairDe(id) {
      let mudou = false;
      for (const [t, quem] of tokens) if (quem === id) { tokens.delete(t); mudou = true; }
      if (mudou) gravar();
    },
  };
}
