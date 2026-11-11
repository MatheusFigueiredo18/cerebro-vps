// Perfil: nome, tema e sair para todo mundo; para o admin, também as pessoas que entram no servidor e o que cada uma pode fazer.
import { el, api, icone, avisar, botaoConfirmar } from './comum.js';
import { perfil, iniciais } from './perfil.js';
import { alternarTema, pintarBotaoTema, sair } from './app.js';
import * as shell from './shell.js';

const SECOES = [['grafo', 'Grafo'], ['arquivos', 'Arquivos (Cérebro)'], ['conteudos', 'Conteúdos'], ['whatsapp', 'WhatsApp'], ['n8n', 'n8n'], ['lousa', 'Quadro'], ['video', 'Criação de vídeo']];
const NIVEIS = [['', 'Sem acesso'], ['ver', 'Só ver'], ['editar', 'Editar']];

// grade seção x nível; devolve { el, valor() }
function gradePermissoes(inicial = {}) {
  const escolha = { ...inicial };
  const linhas = SECOES.map(([id, nome]) => {
    const botoes = NIVEIS.map(([nivel, rotulo]) => el('button', {
      type: 'button', 'aria-pressed': String((escolha[id] ?? '') === nivel),
      onclick: (e) => {
        if (nivel) escolha[id] = nivel; else delete escolha[id];
        for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
      },
    }, rotulo));
    return el('div', { class: 'perm-linha' }, el('span', {}, nome), el('div', { class: 'seg', role: 'group', 'aria-label': `Acesso a ${nome}` }, ...botoes));
  });
  return { el: el('div', { class: 'perm-grade' }, ...linhas, el('p', { class: 'dica' }, 'Conversas fica só com você: ela abre um terminal no servidor.')), valor: () => ({ ...escolha }) };
}

function montar(corpo) {
  const eu = perfil() ?? {};
  const botaoTema = el('button', { type: 'button', class: 'bt', onclick: () => { alternarTema(); pintarBotaoTema(botaoTema); } });
  pintarBotaoTema(botaoTema);
  const pessoas = el('div', { class: 'pessoas' });
  corpo.classList.add('perfil-espaco');
  corpo.append(el('div', { class: 'config' },
    el('header', { class: 'config-topo' }, el('h1', {}, `Olá, ${eu.nome ?? ''}`), el('p', { class: 'dica' }, eu.admin ? 'Você é o admin: decide quem entra no servidor e o que cada pessoa pode fazer.' : 'Seu perfil neste cérebro.')),
    el('section', { class: 'config-secao perfil-eu' },
      el('span', { class: 'avatar grande', 'aria-hidden': 'true' }, iniciais(eu.nome)),
      el('div', { class: 'perfil-nome' }, el('b', {}, eu.nome ?? ''), el('small', {}, `@${eu.usuario ?? ''}${eu.admin ? ' · admin' : ''}`)),
      el('div', { class: 'linha-botoes' }, botaoTema, el('button', { type: 'button', class: 'bt', onclick: sair }, icone('sair'), 'Sair'))),
    eu.admin ? el('section', { class: 'config-secao' }, el('h2', {}, 'Pessoas e acessos'), formNovo(), pessoas) : null));

  async function pintarPessoas() {
    let lista;
    try { lista = await api('/api/usuarios'); } catch (e) { pessoas.replaceChildren(el('p', { class: 'vazio' }, e.message)); return; }
    pessoas.replaceChildren(...(lista.length ? lista.map(cartaoPessoa) : [el('p', { class: 'vazio' }, 'Ninguém além de você ainda. Crie a primeira pessoa acima.')]));
  }

  function formNovo() {
    const nome = el('input', { class: 'campo', placeholder: 'Nome', autocomplete: 'off' });
    const usuario = el('input', { class: 'campo', placeholder: 'usuário (ex.: ana)', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
    const senha = el('input', { class: 'campo', type: 'password', placeholder: 'Senha (8 ou mais caracteres)', autocomplete: 'new-password' });
    const grade = gradePermissoes();
    const caixa = el('details', { class: 'pessoa-nova' }, el('summary', { class: 'bt primario' }, icone('mais'), 'Nova pessoa'),
      el('form', { class: 'pessoa-form', onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('/api/usuarios', { metodo: 'POST', corpo: { nome: nome.value, usuario: usuario.value, senha: senha.value, permissoes: grade.valor() } });
          avisar(`${nome.value || usuario.value} já pode entrar com o usuário "${usuario.value.trim().toLowerCase()}".`);
          caixa.replaceWith(formNovo());
          pintarPessoas();
        } catch (x) { avisar(x.message, 'erro'); }
      } }, el('div', { class: 'pessoa-campos' }, nome, usuario, senha), grade.el, el('div', { class: 'linha-botoes' }, el('button', { type: 'submit', class: 'bt primario' }, 'Criar acesso'))));
    return caixa;
  }

  function cartaoPessoa(u) {
    const grade = gradePermissoes(u.permissoes);
    const novaSenha = el('input', { class: 'campo', type: 'password', placeholder: 'Nova senha (opcional)', autocomplete: 'new-password' });
    const salvar = async (corpo, msg) => {
      try { await api(`/api/usuarios/${u.id}`, { metodo: 'PUT', corpo }); avisar(msg); pintarPessoas(); } catch (x) { avisar(x.message, 'erro'); }
    };
    const resumo = SECOES.filter(([id]) => u.permissoes?.[id]).map(([id, nome]) => `${nome}${u.permissoes[id] === 'ver' ? ' (ver)' : ''}`).join(', ') || 'Sem acesso a nada';
    return el('details', { class: `pessoa${u.ativo ? '' : ' suspensa'}` },
      el('summary', {}, el('span', { class: 'avatar', 'aria-hidden': 'true' }, iniciais(u.nome)),
        el('span', { class: 'perfil-nome' }, el('b', {}, u.nome), el('small', {}, `@${u.usuario}${u.ativo ? '' : ' · suspensa'} · ${resumo}`)), icone('baixo')),
      el('div', { class: 'pessoa-form' }, grade.el, novaSenha,
        el('div', { class: 'linha-botoes' },
          el('button', { type: 'button', class: 'bt primario', onclick: () => salvar({ permissoes: grade.valor(), ...(novaSenha.value ? { senha: novaSenha.value } : {}) }, `Acesso de ${u.nome} salvo.`) }, 'Salvar'),
          el('button', { type: 'button', class: 'bt', onclick: () => salvar({ ativo: !u.ativo }, u.ativo ? `${u.nome} não entra mais até você reativar.` : `${u.nome} pode entrar de novo.`) }, u.ativo ? 'Suspender' : 'Reativar'),
          botaoConfirmar('Apagar', `Apagar ${u.nome}?`, async () => {
            try { await api(`/api/usuarios/${u.id}`, { metodo: 'DELETE' }); avisar(`${u.nome} foi apagada.`); pintarPessoas(); } catch (x) { avisar(x.message, 'erro'); }
          }, 'bt perigo'))));
  }

  if (eu.admin) pintarPessoas();
  return {};
}

shell.registrar('perfil', montar);
