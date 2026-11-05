// Envio de arquivos do computador para o cérebro, um por vez, com aviso de progresso.
// Usado pela galeria de Conteúdos e pela área de trabalho das Conversas. Devolve os caminhos que chegaram.
import { $, el, icone, emitir } from './comum.js';

export const ENVIADOS = 'conteudo/enviados';

export async function enviarArquivos(arquivos, pastaDestino = ENVIADOS) {
  if (!arquivos.length) return [];
  const caixa = $('#envio');
  const barra = el('progress', { max: 100, value: 0 });
  const linha = el('span');
  caixa.replaceChildren(icone('enviar'), el('div', {}, linha, barra));
  caixa.hidden = false;
  const chegaram = [];
  for (const [i, f] of arquivos.entries()) {
    linha.textContent = `${i + 1} de ${arquivos.length} · ${f.name}`;
    barra.value = 0;
    const caminho = await new Promise((fim) => {
      const x = new XMLHttpRequest(); // XHR porque o fetch não informa o progresso do envio
      x.open('POST', `/api/enviar?pasta=${encodeURIComponent(pastaDestino)}&nome=${encodeURIComponent(f.name)}`);
      x.setRequestHeader('Content-Type', 'application/octet-stream');
      x.upload.onprogress = (e) => { if (e.lengthComputable) barra.value = Math.round((e.loaded / e.total) * 100); };
      x.onload = () => {
        if (x.status === 401) emitir('sessao-expirou');
        let c = null;
        try { c = x.status === 200 ? JSON.parse(x.responseText).caminho : null; } catch { /* resposta sem caminho */ }
        fim(c);
      };
      x.onerror = () => fim(null);
      x.send(f);
    });
    if (caminho) chegaram.push(caminho);
  }
  linha.textContent = `${chegaram.length} de ${arquivos.length} enviado${arquivos.length === 1 ? '' : 's'} para ${pastaDestino === ENVIADOS ? 'Enviados' : pastaDestino}`;
  barra.remove();
  setTimeout(() => { caixa.hidden = true; }, 4000);
  emitir('arvore-mudou');
  return chegaram;
}
