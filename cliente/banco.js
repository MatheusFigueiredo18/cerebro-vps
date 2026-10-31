// Banco de dados em guia: tabela, quadro e calendário sobre as páginas de uma pasta com .banco.json.
// Cada linha é uma página .md; as propriedades ficam no frontmatter dela (rotas /api/banco*).
import { agruparLinhas, linhasPorDia, ordenarLinhas } from './visoes.js';
import { el, api, ler, guardar, emitir, botaoIcone } from './comum.js';
import * as shell from './shell.js';

const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const TIPOS = [['texto', 'Texto'], ['select', 'Seleção'], ['data', 'Data'], ['numero', 'Número'], ['checkbox', 'Caixa de marcar']];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const dois = (n) => String(n).padStart(2, '0');
const SEM_VALOR = 'Sem valor';

function montarBanco(area, guia) {
  let esquema = null;
  let linhas = [];
  let visaoId = ler(`bancoVisao:${guia.caminho}`, null);
  let ordem = null; // { prop, sentido }
  let painelAberto = false;
  const hoje = new Date();
  let ano = hoje.getFullYear();
  let mes = hoje.getMonth() + 1;

  const topo = el('div', { class: 'banco-topo' });
  const barra = el('div', { class: 'banco-barra' });
  const aviso = el('div', { class: 'banco-aviso', role: 'alert', hidden: true });
  const props = el('div', { class: 'banco-props', hidden: true });
  const corpo = el('div', { class: 'banco-corpo' });
  const raiz = el('div', { class: 'banco' }, topo, barra, aviso, props, corpo);
  area.append(raiz);

  const prop = (id) => esquema.propriedades.find((p) => p.id === id);
  const visao = () => esquema.visoes.find((v) => v.id === visaoId) ?? esquema.visoes[0] ?? { id: 'tabela', nome: 'Tabela', tipo: 'tabela' };
  const abrirLinha = (l) => shell.abrir({ id: `p:${l.caminho}`, tipo: 'pagina', titulo: l.titulo, caminho: l.caminho });

  function avisar(msg) {
    aviso.hidden = false;
    aviso.textContent = msg;
    setTimeout(() => { if (aviso.textContent === msg) aviso.hidden = true; }, 4000);
  }

  // ---------- dados ----------
  async function carregar() {
    try {
      const d = await api(`/api/banco?pasta=${encodeURIComponent(guia.caminho)}`);
      esquema = d.esquema;
      linhas = d.linhas;
      pintar();
    } catch (e) {
      corpo.replaceChildren(el('p', { class: 'banco-erro' }, e.message), el('button', { type: 'button', class: 'bt', onclick: carregar }, 'Tentar de novo'));
    }
  }

  async function gravar(l, propId, valor, repintar = false) {
    try { l.props = (await api('/api/banco/linha', { metodo: 'PATCH', corpo: { caminho: l.caminho, prop: propId, valor } })).props; } catch (e) { avisar(e.message); await carregar(); return; }
    if (repintar) pintarCorpo();
  }

  async function gravarEsquema() {
    try { await api('/api/banco/esquema', { metodo: 'PUT', corpo: { pasta: guia.caminho, esquema } }); } catch (e) { avisar(e.message); }
    await carregar();
  }

  function pedirTitulo(rotulo) {
    return new Promise((resolve) => {
      const campo = el('input', { class: 'campo', type: 'text', 'aria-label': rotulo });
      barra.replaceChildren(el('label', { class: 'rotulo' }, rotulo), campo, el('small', { class: 'dica' }, 'Enter cria, Esc cancela'));
      campo.focus();
      let feito = false;
      const fim = (v) => { if (feito) return; feito = true; pintarBarra(); resolve(v); };
      campo.addEventListener('keydown', (e) => { if (e.key === 'Enter') fim(campo.value.trim()); if (e.key === 'Escape') fim(null); });
      campo.addEventListener('blur', () => fim(null));
    });
  }

  async function novaLinha(rotulo = 'Nome da nova linha', extra) {
    const titulo = await pedirTitulo(rotulo);
    if (titulo === null) return;
    try {
      const l = await api('/api/banco/linhas', { metodo: 'POST', corpo: { pasta: guia.caminho, titulo } });
      if (extra) l.props = (await api('/api/banco/linha', { metodo: 'PATCH', corpo: { caminho: l.caminho, prop: extra.prop, valor: extra.valor } })).props;
      linhas.push(l);
      pintarCorpo();
      emitir('arvore-mudou');
    } catch (e) { avisar(e.message); }
  }

  // ---------- cabeçalho ----------
  function pintar() {
    const visoes = el('div', { class: 'banco-visoes', role: 'tablist', 'aria-label': 'Visões' }, esquema.visoes.map((v) => el('button', {
      type: 'button', role: 'tab', 'aria-selected': String(v.id === visao().id), class: v.id === visao().id ? 'ativa' : '',
      onclick: () => { visaoId = v.id; guardar(`bancoVisao:${guia.caminho}`, visaoId); pintar(); },
    }, v.nome)));
    topo.replaceChildren(el('h2', {}, esquema.nome || guia.titulo), visoes,
      el('button', { type: 'button', class: 'bt', onclick: () => novaLinha() }, '+ Nova linha'),
      el('button', { type: 'button', class: 'bt', 'aria-expanded': String(painelAberto), onclick: () => { painelAberto = !painelAberto; pintar(); } }, 'Propriedades'));
    pintarBarra();
    pintarProps();
    pintarCorpo();
  }

  function seletor(rotulo, opcoes, atual, aoMudar) {
    const s = el('select', { class: 'campo pequeno' });
    for (const [v, nome] of opcoes) s.append(new Option(nome, v));
    s.value = atual ?? '';
    s.addEventListener('change', () => aoMudar(s.value));
    return el('label', { class: 'banco-sel' }, rotulo, s);
  }

  function pintarBarra() {
    barra.replaceChildren();
    const v = visao();
    if (v.tipo === 'quadro') {
      const sel = esquema.propriedades.filter((p) => p.tipo === 'select');
      barra.append(sel.length ? seletor('Agrupar por', sel.map((p) => [p.id, p.nome]), v.agruparPor, (x) => { v.agruparPor = x; gravarEsquema(); }) : el('span', {}, 'Crie uma propriedade de seleção para usar o quadro.'));
      if (sel.length) barra.append(el('small', { class: 'dica' }, 'Arraste um cartão para outra coluna para mudar o valor.'));
    }
    if (v.tipo === 'calendario') {
      const datas = esquema.propriedades.filter((p) => p.tipo === 'data');
      barra.append(datas.length ? seletor('Data', datas.map((p) => [p.id, p.nome]), v.dataProp, (x) => { v.dataProp = x; gravarEsquema(); }) : el('span', {}, 'Crie uma propriedade de data para usar o calendário.'));
    }
  }

  // ---------- propriedades ----------
  function pintarProps() {
    props.hidden = !painelAberto;
    props.replaceChildren();
    if (!painelAberto) return;
    props.append(el('p', { class: 'rotulo' }, 'Propriedades das linhas'));
    for (const p of esquema.propriedades) {
      const nome = el('input', { class: 'campo pequeno', 'aria-label': 'Nome da propriedade' });
      nome.value = p.nome;
      nome.addEventListener('change', () => { if (nome.value.trim()) { p.nome = nome.value.trim(); gravarEsquema(); } });
      const tipo = el('select', { class: 'campo pequeno', 'aria-label': `Tipo de ${p.nome}` });
      for (const [v, n] of TIPOS) tipo.append(new Option(n, v));
      tipo.value = p.tipo;
      tipo.addEventListener('change', () => { p.tipo = tipo.value; if (p.tipo === 'select' && !p.opcoes) p.opcoes = []; gravarEsquema(); });
      const linha = el('div', { class: 'banco-prop' }, nome, tipo);
      if (p.tipo === 'select') {
        const op = el('input', { class: 'campo pequeno', placeholder: 'Opções separadas por vírgula', 'aria-label': `Opções de ${p.nome}` });
        op.value = (p.opcoes ?? []).join(', ');
        op.addEventListener('change', () => { p.opcoes = op.value.split(',').map((x) => x.trim()).filter(Boolean); gravarEsquema(); });
        linha.append(op);
      }
      linha.append(botaoIcone('x', `Remover ${p.nome} (os valores continuam nos arquivos)`, () => {
        esquema.propriedades = esquema.propriedades.filter((q) => q.id !== p.id);
        for (const v of esquema.visoes) {
          if (v.agruparPor === p.id) v.agruparPor = esquema.propriedades.find((q) => q.tipo === 'select')?.id;
          if (v.dataProp === p.id) v.dataProp = esquema.propriedades.find((q) => q.tipo === 'data')?.id;
        }
        gravarEsquema();
      }, 'pequeno'));
      props.append(linha);
    }
    const novo = el('input', { class: 'campo pequeno banco-prop-nova', placeholder: '+ Nova propriedade (digite o nome e tecle Enter)', 'aria-label': 'Nova propriedade' });
    novo.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !novo.value.trim()) return;
      const nome = novo.value.trim();
      let id = norm(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'prop';
      while (prop(id)) id += '-2';
      esquema.propriedades.push({ id, nome, tipo: 'texto' });
      gravarEsquema();
    });
    props.append(novo);
  }

  // ---------- visões ----------
  const valorDe = (p, c) => (p.tipo === 'checkbox' ? c.checked : c.value === '' ? null : p.tipo === 'numero' ? Number(c.value) : c.value);

  function celula(l, p) {
    const v = l.props[p.id];
    let c;
    if (p.tipo === 'select') {
      c = el('select', { 'aria-label': `${p.nome} de ${l.titulo}` });
      c.append(new Option('', ''));
      const ops = p.opcoes ?? [];
      for (const o of ops) c.append(new Option(o, o));
      if (v != null && v !== '' && !ops.includes(String(v))) c.append(new Option(String(v), String(v)));
      c.value = v == null ? '' : String(v);
    } else {
      c = el('input', { type: p.tipo === 'data' ? 'date' : p.tipo === 'numero' ? 'number' : p.tipo === 'checkbox' ? 'checkbox' : 'text', 'aria-label': `${p.nome} de ${l.titulo}` });
      if (p.tipo === 'checkbox') c.checked = v === true;
      else c.value = v == null ? '' : p.tipo === 'data' ? String(v).slice(0, 10) : String(v);
    }
    c.addEventListener('change', () => gravar(l, p.id, valorDe(p, c)));
    return c;
  }

  function tabela() {
    const lista = ordem ? ordenarLinhas(linhas, ordem.prop, ordem.sentido) : linhas;
    const colunas = [['titulo', 'Título'], ...esquema.propriedades.map((p) => [p.id, p.nome])];
    const cab = el('tr', {}, colunas.map(([id, nome]) => el('th', { 'aria-sort': ordem?.prop === id ? (ordem.sentido === 'asc' ? 'ascending' : 'descending') : null },
      el('button', { type: 'button', class: 'banco-ordenar', onclick: () => { ordem = { prop: id, sentido: ordem?.prop === id && ordem.sentido === 'asc' ? 'desc' : 'asc' }; pintarCorpo(); } },
        nome + (ordem?.prop === id ? (ordem.sentido === 'asc' ? ' ↑' : ' ↓') : '')))));
    const emTd = (conteudo) => el('td', {}, conteudo);
    const tb = el('tbody', {}, lista.map((l) => el('tr', {},
      emTd(el('button', { type: 'button', class: 'banco-titulo', onclick: () => abrirLinha(l) }, l.titulo)),
      ...esquema.propriedades.map((p) => emTd(celula(l, p))))));
    return el('div', { class: 'banco-rolagem' }, el('table', { class: 'banco-tabela' }, el('thead', {}, cab), tb));
  }

  function quadro(v) {
    const p = prop(v.agruparPor);
    if (!p) return el('p', { class: 'vazio' }, 'Escolha uma propriedade de seleção em "Agrupar por".');
    const q = el('div', { class: 'banco-quadro' });
    for (const g of agruparLinhas(linhas, p.id, p.opcoes ?? [])) {
      const col = el('div', { class: 'banco-coluna' }, el('h3', {}, `${g.coluna} · ${g.linhas.length}`));
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('alvo'); });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('alvo'); });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('alvo');
        const l = linhas.find((x) => x.caminho === e.dataTransfer.getData('text/plain'));
        if (l) gravar(l, p.id, g.coluna === SEM_VALOR ? null : g.coluna, true);
      });
      for (const l of g.linhas) {
        const c = el('button', { type: 'button', class: 'banco-cartao', draggable: 'true', onclick: () => abrirLinha(l) }, l.titulo);
        c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', l.caminho); e.dataTransfer.effectAllowed = 'move'; });
        col.append(c);
      }
      q.append(col);
    }
    return q;
  }

  function calendario(v) {
    const p = prop(v.dataProp);
    if (!p) return el('p', { class: 'vazio' }, 'Escolha uma propriedade de data em "Data".');
    const dias = linhasPorDia(linhas, p.id, ano, mes);
    const ir = (d) => { mes += d; if (mes < 1) { mes = 12; ano -= 1; } if (mes > 12) { mes = 1; ano += 1; } pintarCorpo(); };
    const nav = el('div', { class: 'banco-mes' },
      botaoIcone('voltar', 'Mês anterior', () => ir(-1)),
      el('b', {}, `${MESES[mes - 1].replace(/^./, (c) => c.toUpperCase())} de ${ano}`),
      botaoIcone('avancar', 'Próximo mês', () => ir(1)),
      el('button', { type: 'button', class: 'bt', onclick: () => { ano = hoje.getFullYear(); mes = hoje.getMonth() + 1; pintarCorpo(); } }, 'Hoje'));
    const grade = el('div', { class: 'banco-grade' }, DIAS.map((d) => el('div', { class: 'banco-dia-nome' }, d)));
    for (let i = 0; i < new Date(ano, mes - 1, 1).getDay(); i += 1) grade.append(el('div', { class: 'banco-dia fora' }));
    for (let d = 1; d <= new Date(ano, mes, 0).getDate(); d += 1) {
      const chave = `${ano}-${dois(mes)}-${dois(d)}`;
      const ehHoje = d === hoje.getDate() && mes === hoje.getMonth() + 1 && ano === hoje.getFullYear();
      grade.append(el('div', { class: `banco-dia${ehHoje ? ' hoje' : ''}` },
        el('button', { type: 'button', class: 'banco-dia-n', title: `Nova linha em ${dois(d)}/${dois(mes)}`, 'aria-label': `Nova linha em ${dois(d)}/${dois(mes)}`, onclick: () => novaLinha(`Nova linha em ${dois(d)}/${dois(mes)}`, { prop: p.id, valor: chave }) }, String(d)),
        (dias[chave] ?? []).map((l) => el('button', { type: 'button', class: 'banco-evento', onclick: () => abrirLinha(l) }, l.titulo))));
    }
    const semData = linhas.filter((l) => !/^\d{4}-\d{2}-\d{2}/.test(String(l.props[p.id] ?? ''))).length;
    return el('div', { class: 'banco-calendario' }, nav, grade, semData ? el('p', { class: 'vazio' }, `${semData} linha(s) sem data não aparecem aqui.`) : null);
  }

  function pintarCorpo() {
    const v = visao();
    if (!linhas.length && v.tipo !== 'calendario') { corpo.replaceChildren(el('p', { class: 'vazio' }, 'Nenhuma linha ainda. Use "+ Nova linha".')); return; }
    corpo.replaceChildren(v.tipo === 'quadro' ? quadro(v) : v.tipo === 'calendario' ? calendario(v) : tabela());
  }

  carregar();
  return { mostrar: () => { if (esquema) carregar(); } };
}

shell.registrar('banco', montarBanco);
