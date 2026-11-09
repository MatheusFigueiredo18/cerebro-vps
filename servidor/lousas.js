// Core OS · Lousas: quadros infinitos de desenho livre. Cada lousa é um arquivo JSON em <dados>/lousas/<id>.json.
// O painel salva a cada alteração (com versão otimista: duas abas não se sobrescrevem). Nada é apagado por aqui:
// a função não tem "excluir"; arquivar fica para uma decisão futura.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { lerJson, gravarJson } from './dados.js';

const ID = /^[a-f0-9]{16}$/;
const TIPOS = new Set(['stroke', 'shape', 'sticky', 'text', 'frame', 'line', 'midia']);
export const LIMITES = { bytes: 8 * 1024 * 1024, objetos: 20000, pontos: 50000, texto: 20000, miniatura: 60 * 1024 };

const invalida = (porque) => new Error(`quadro inválido: ${porque}`);
const finito = (n) => typeof n === 'number' && Number.isFinite(n);
const texto = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

function validarObjeto(o, i) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw invalida(`objeto ${i}`);
  if (typeof o.id !== 'string' || !o.id || o.id.length > 64) throw invalida(`id do objeto ${i}`);
  if (!TIPOS.has(o.t)) throw invalida(`tipo do objeto ${i}`);
  for (const k of ['x', 'y', 'w', 'h', 'x1', 'y1', 'x2', 'y2', 's', 'r', 'fs']) if (k in o && !finito(o[k])) throw invalida(`número ${k} do objeto ${i}`);
  for (const k of ['text', 'title']) if (k in o && (typeof o[k] !== 'string' || o[k].length > LIMITES.texto)) throw invalida(`texto do objeto ${i}`);
  if (o.t === 'stroke') {
    if (!Array.isArray(o.p) || !o.p.length || o.p.length > LIMITES.pontos) throw invalida(`pontos do traço ${i}`);
    for (const p of o.p) if (!Array.isArray(p) || p.length !== 2 || !finito(p[0]) || !finito(p[1])) throw invalida(`ponto do traço ${i}`);
  }
  if (o.t === 'midia') { // imagem ou vídeo do cérebro: só o caminho relativo, sem sair da pasta
    if (typeof o.src !== 'string' || !o.src || o.src.length > 1000 || o.src.startsWith('/') || o.src.split(/[\\/]/).includes('..')) throw invalida(`arquivo do objeto ${i}`);
    if ('v' in o && typeof o.v !== 'boolean') throw invalida(`vídeo do objeto ${i}`);
  }
}

export function validarObjetos(objs) {
  if (!Array.isArray(objs)) throw invalida('objetos');
  if (objs.length > LIMITES.objetos) throw new Error('quadro grande demais');
  objs.forEach(validarObjeto);
}

const vistaOk = (v) => (v && finito(v.x) && finito(v.y) && finito(v.z) && v.z > 0.01 && v.z < 100 ? { x: v.x, y: v.y, z: v.z } : { x: 80, y: 80, z: 1 });
const miniaturaOk = (m) => (typeof m === 'string' && m.startsWith('data:image/png;base64,') && m.length <= LIMITES.miniatura && /^[A-Za-z0-9+/=,:;]+$/.test(m) ? m : '');

export function criarLousas(dados, agora = Date.now) {
  const dir = path.join(dados, 'lousas');
  fs.mkdirSync(dir, { recursive: true });
  const nomeArq = (id) => {
    if (!ID.test(String(id))) throw invalida('id');
    return `${id}.json`;
  };
  const gravar = (l) => gravarJson(dir, nomeArq(l.id), l, { compacto: true });

  function ler(id) {
    const l = lerJson(dir, nomeArq(id), null);
    if (!l) throw new Error('quadro não encontrado');
    return l;
  }

  function listar() {
    const lista = [];
    for (const nome of fs.readdirSync(dir)) {
      const id = nome.replace(/\.json$/, '');
      if (!nome.endsWith('.json') || !ID.test(id)) continue;
      const l = lerJson(dir, nome, null);
      if (!l) continue;
      lista.push({ id: l.id, titulo: l.titulo, criada: l.criada, atualizada: l.atualizada, versao: l.versao, miniatura: l.miniatura ?? '', objetos: l.objs?.length ?? 0 });
    }
    return lista.sort((a, b) => b.atualizada - a.atualizada);
  }

  function criar(titulo) {
    const t = agora();
    const l = { id: crypto.randomBytes(8).toString('hex'), titulo: texto(titulo, 120) || 'Quadro sem título', criada: t, atualizada: t, versao: 1, vista: { x: 80, y: 80, z: 1 }, objs: [], miniatura: '' };
    gravar(l);
    return l;
  }

  function salvar(id, b) {
    const atual = ler(id);
    if (b.versao !== atual.versao) throw Object.assign(new Error('o quadro mudou em outra aba ou aparelho'), { code: 'CONFLITO' });
    validarObjetos(b.objs);
    const novo = {
      ...atual,
      titulo: 'titulo' in b ? (texto(b.titulo, 120) || 'Quadro sem título') : atual.titulo,
      vista: vistaOk(b.vista),
      objs: b.objs,
      miniatura: 'miniatura' in b ? miniaturaOk(b.miniatura) : atual.miniatura,
      atualizada: agora(),
      versao: atual.versao + 1,
    };
    if (Buffer.byteLength(JSON.stringify(novo)) > LIMITES.bytes) throw new Error('quadro grande demais');
    gravar(novo);
    return { versao: novo.versao, atualizada: novo.atualizada };
  }

  function duplicar(id) {
    const o = ler(id);
    const t = agora();
    const l = { ...o, id: crypto.randomBytes(8).toString('hex'), titulo: texto(`${o.titulo} (cópia)`, 120), criada: t, atualizada: t, versao: 1 };
    gravar(l);
    return l;
  }

  return { listar, criar, ler, salvar, duplicar };
}
