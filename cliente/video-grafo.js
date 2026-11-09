// Criação de vídeo: lógica pura do grafo (sem DOM), testada em teste/interface-pura.test.js.
// Fluxo: Conteúdo principal / Referência / Modelo base / Música / Efeito sonoro → Prompt (opcional) → Claude (opcional) → Gerar vídeo → Vídeo Final.
import { nomeBase } from './formatos.js';

export const ehAudio = (c) => /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(c ?? '');
const fontes = (grafo, id) => grafo.links.filter((l) => l.b === id).map((l) => grafo.nos.find((n) => n.id === l.a)).filter(Boolean);

// tudo o que chega no Gerar vídeo, subindo por Prompt, Claude e Lista; o texto de um Prompt ligado numa mídia vira pré-escrita sobre ela
export function entradasDe(grafo, idGerar) {
  const r = { principal: null, referencias: [], modelos: [], audios: [], prompts: [] };
  const vistos = new Set();
  const referencia = (c) => { if (c && c !== r.principal && !r.referencias.includes(c)) r.referencias.push(c); };
  const subir = (id) => {
    for (const n of fontes(grafo, id)) {
      if (vistos.has(n.id)) continue;
      vistos.add(n.id);
      const c = n.dados?.caminho;
      if (n.tipo === 'modelo') { if (c) r.modelos.push({ caminho: c, extrair: n.dados?.extrair ?? [] }); }
      else if (n.tipo === 'principal' && c && !r.principal) r.principal = c;
      else if (n.tipo === 'principal' || n.tipo === 'referencia') referencia(c);
      else if ((n.tipo === 'musica' || n.tipo === 'efeito') && c) r.audios.push({ tipo: n.tipo, caminho: c });
      else if (n.tipo === 'lista') { (n.dados?.itens ?? []).forEach((i) => referencia(i.caminho)); subir(n.id); }
      else if (n.tipo === 'claude') subir(n.id);
      else if (n.tipo === 'prompt') {
        const sobre = fontes(grafo, n.id).filter((m) => m.dados?.caminho);
        subir(n.id);
        const texto = n.dados?.texto?.trim();
        if (texto) r.prompts.push(sobre.length ? `Sobre ${sobre.map((m) => nomeBase(m.dados.caminho)).join(', ')}: ${texto}` : texto);
      }
    }
  };
  subir(idGerar);
  return r;
}

// o nó ligado direto na saída de `id` com o tipo pedido (ex.: o Gerar vídeo de um Claude, o Vídeo Final de um Gerar)
export const ligadoEm = (grafo, id, tipo) => grafo.links.map((l) => l.a === id && grafo.nos.find((n) => n.id === l.b && n.tipo === tipo)).find(Boolean) ?? null;

// cópia de nós com novos ids, levando só as ligações entre eles; dx/dy deslocam (colar, duplicar)
export function clonar(nos, links, dx, dy, novoId) {
  const ids = new Map(nos.map((n) => [n.id, novoId()]));
  return {
    nos: nos.map((n) => ({ ...structuredClone(n), id: ids.get(n.id), x: Math.round(n.x + dx), y: Math.round(n.y + dy) })),
    links: links.filter((l) => ids.has(l.a) && ids.has(l.b)).map((l) => ({ a: ids.get(l.a), b: ids.get(l.b) })),
  };
}

// nós cujo retângulo cruza a seleção (coordenadas do mundo)
export const nosNaArea = (nos, a) => nos.filter((n) => n.x < a.x + a.w && n.x + n.w > a.x && n.y < a.y + a.h && n.y + n.h > a.y).map((n) => n.id);
