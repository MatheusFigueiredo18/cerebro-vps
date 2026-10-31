// Core OS · páginas em blocos: converte entre o texto .md e a lista de blocos do editor.
// Sem DOM: roda no navegador e no Node (testes).
// Bloco = { tipo, texto, feito?, lang?, num?, linhasEmBranco? }
//   lang: linguagem do código ou variante do destaque ("note"); num: número original da lista numerada;
//   linhasEmBranco: quantas linhas em branco vinham antes (guarda o espaçamento exato do arquivo).
// shortcut: CRLF vira LF e linhas em branco no fim do arquivo somem ao salvar; ajustar se o vault passar a usar CRLF.

const CABECA = /^---\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;
const LISTAS = new Set(['lista', 'numerada', 'tarefa']);
const CITACAO = /^>( |$)/;
const INICIO_DESTAQUE = /^> \[!([\w-]+)\]([+-]?)[ \t]?(.*)$/; // [+-] é o destaque dobrável do Obsidian
const sacar = (linha) => linha.replace(/^> ?/, '');

// páginas .md abrem na guia do editor; as de pastas ocultas (.claude) seguem no visualizador antigo
export const abreEmGuia = (caminho) => /\.md$/i.test(caminho) && !/(^|\/)\./.test(caminho);

export function separarFrontmatter(md) {
  const m = CABECA.exec(md);
  return m ? { cabeca: m[0], corpo: md.slice(m[0].length) } : { cabeca: '', corpo: md };
}

export function mdParaBlocos(corpo) {
  if (corpo === '') return [];
  const linhas = corpo.replace(/\r\n/g, '\n').split('\n');
  if (linhas.at(-1) === '') linhas.pop();
  const blocos = [];
  let brancas = 0;
  const novo = (b) => { blocos.push({ ...b, linhasEmBranco: brancas }); brancas = 0; };

  for (let i = 0; i < linhas.length; i += 1) {
    const l = linhas[i];
    if (l === '') { brancas += 1; continue; }
    const cerca = /^```(.*)$/.exec(l);
    const titulo = /^(#{1,3}) (.*)$/.exec(l);
    const tarefa = /^- \[([ xX])\] (.*)$/.exec(l);
    const item = /^- (.*)$/.exec(l);
    const numerada = /^(\d+)\. (.*)$/.exec(l);
    if (cerca && linhas.indexOf('```', i + 1) === -1) novo({ tipo: 'paragrafo', texto: l }); // cerca sem fechamento é texto, não engole a página
    else if (cerca) {
      const dentro = [];
      for (i += 1; i < linhas.length && linhas[i] !== '```'; i += 1) dentro.push(linhas[i]);
      novo({ tipo: 'codigo', texto: dentro.join('\n'), lang: cerca[1].trim() });
    } else if (l === '---') novo({ tipo: 'divisor', texto: '' });
    else if (titulo) novo({ tipo: `h${titulo[1].length}`, texto: titulo[2] });
    else if (tarefa) novo({ tipo: 'tarefa', texto: tarefa[2], feito: tarefa[1] !== ' ' });
    else if (item) novo({ tipo: 'lista', texto: item[1] });
    else if (numerada) novo({ tipo: 'numerada', texto: numerada[2], num: Number(numerada[1]) });
    else if (CITACAO.test(l)) {
      const destaque = INICIO_DESTAQUE.exec(l);
      const partes = [destaque ? destaque[3] : sacar(l)];
      while (i + 1 < linhas.length && CITACAO.test(linhas[i + 1]) && !INICIO_DESTAQUE.test(linhas[i + 1])) { i += 1; partes.push(sacar(linhas[i])); }
      novo(destaque ? { tipo: 'destaque', texto: partes.join('\n'), lang: destaque[1], ...(destaque[2] && { dobra: destaque[2] }) } : { tipo: 'citacao', texto: partes.join('\n') });
    } else novo({ tipo: 'paragrafo', texto: l });
  }
  return blocos;
}

const prefixar = (linhas) => linhas.map((x) => (x === '' ? '>' : `> ${x}`));

function linhaDe(b, n) {
  switch (b.tipo) {
    case 'h1': case 'h2': case 'h3': return `${'#'.repeat(Number(b.tipo[1]))} ${b.texto}`;
    case 'lista': return `- ${b.texto}`;
    case 'tarefa': return `- [${b.feito ? 'x' : ' '}] ${b.texto}`;
    case 'numerada': return `${n}. ${b.texto}`;
    case 'citacao': return prefixar(b.texto.split('\n')).join('\n');
    case 'destaque': {
      const [primeira, ...resto] = b.texto.split('\n');
      return [`> [!${b.lang || 'note'}]${b.dobra || ''}${primeira ? ` ${primeira}` : ''}`, ...prefixar(resto)].join('\n');
    }
    case 'codigo': return `\`\`\`${b.lang || ''}\n${b.texto === '' ? '' : `${b.texto}\n`}\`\`\``;
    case 'divisor': return '---';
    default: return b.texto;
  }
}

export function blocosParaMd(blocos) {
  let saida = '';
  let n = 0;
  blocos.forEach((b, i) => {
    const ant = blocos[i - 1];
    const junta = ant && ant.tipo === b.tipo && LISTAS.has(b.tipo);
    const brancas = b.linhasEmBranco ?? (i === 0 || junta ? 0 : 1);
    n = b.tipo === 'numerada' ? (b.num ?? (ant?.tipo === 'numerada' ? n + 1 : 1)) : 0;
    saida += (i === 0 ? '' : '\n') + '\n'.repeat(brancas) + linhaDe(b, n);
  });
  return saida ? `${saida}\n` : '';
}
