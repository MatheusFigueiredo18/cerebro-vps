// Cliente mínimo da Evolution API (conexão do WhatsApp).
export function criarEvolution({ url, key, instancia }, fetchFn = fetch) {
  const configurado = Boolean(url && key);
  const inst = encodeURIComponent(instancia);

  async function chamar(metodo, rota, corpo) {
    if (!configurado) throw new Error('A Evolution API não está configurada neste servidor.');
    const r = await fetchFn(`${url}${rota}`, {
      method: metodo,
      headers: { apikey: key, 'content-type': 'application/json' },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await r.text();
    let j = null;
    try { j = texto ? JSON.parse(texto) : null; } catch { /* resposta não JSON */ }
    if (!r.ok) {
      const m = j?.response?.message ?? j?.message ?? j?.error;
      throw new Error(Array.isArray(m) ? m.flat().join('; ') : m ? String(m) : `HTTP ${r.status}`);
    }
    return j;
  }

  const evo = {
    configurado,
    async estado() {
      const j = await chamar('GET', `/instance/connectionState/${inst}`);
      return j?.instance?.state ?? j?.state ?? 'close';
    },
    // null quando a instância não existe
    async dados() {
      const j = await chamar('GET', `/instance/fetchInstances?instanceName=${inst}`);
      const lista = Array.isArray(j) ? j : j ? [j] : [];
      const i = lista.find((x) => (x?.name ?? x?.instance?.instanceName) === instancia);
      if (!i) return null;
      const dono = String(i.ownerJid ?? i.instance?.owner ?? '');
      return { numero: dono.split('@')[0].replace(/\D/g, ''), nomePerfil: i.profileName ?? i.instance?.profileName ?? '' };
    },
    async criar(webhook) {
      await chamar('POST', '/instance/create', { instanceName: instancia, integration: 'WHATSAPP-BAILEYS', qrcode: false });
      await evo.apontarWebhook(webhook);
    },
    apontarWebhook: (webhook) => chamar('POST', `/webhook/set/${inst}`, {
      webhook: { enabled: true, url: webhook, byEvents: false, base64: false, events: ['MESSAGES_UPSERT'] },
    }),
    async qr() {
      const j = await chamar('GET', `/instance/connect/${inst}`);
      const b = j?.base64 ?? null;
      return { qr: b && !b.startsWith('data:') ? `data:image/png;base64,${b}` : b, codigo: j?.code ?? null };
    },
    logout: () => chamar('DELETE', `/instance/logout/${inst}`),
    enviarTexto: (number, text) => chamar('POST', `/message/sendText/${inst}`, { number, text }),
  };
  return evo;
}
