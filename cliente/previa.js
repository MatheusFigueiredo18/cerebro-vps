// Prévia ao passar o mouse (como no YouTube): vídeo dentro da área de trabalho toca mudo enquanto o mouse está em cima
// e volta ao primeiro quadro quando sai. Vale para as Conversas e para a Criação de vídeo; não abre nem entra no vídeo.
const doPalco = (e) => (e.target instanceof HTMLVideoElement && e.target.closest('.palco') ? e.target : null);

document.addEventListener('mouseover', (e) => {
  const v = doPalco(e);
  if (!v) return;
  v.muted = true; // sem som: o navegador só deixa tocar sozinho se estiver mudo
  v.loop = true;
  v.play().catch(() => { /* ainda carregando ou bloqueado: tenta de novo no próximo mouseover */ });
});

document.addEventListener('mouseout', (e) => {
  const v = doPalco(e);
  if (!v || v.contains(e.relatedTarget)) return;
  v.pause();
  try { v.currentTime = 0; } catch { /* sem metadados ainda */ }
});
