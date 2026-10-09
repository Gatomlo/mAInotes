// Fournisseur Infomaniak : API compatible OpenAI (chat, vision, transcription Whisper).
// L'adresse de base dépend du produit IA (identifiant numérique visible dans le
// manager Infomaniak) ; elle reste modifiable dans les réglages si Infomaniak la change.
const { readJsonResponse } = require('./util');

function baseUrl(cfg) {
  if (!cfg.productId) throw new Error('Identifiant du produit IA Infomaniak manquant (Réglages > Clés API).');
  return cfg.baseUrl.replace('{product_id}', encodeURIComponent(cfg.productId)).replace(/\/+$/, '');
}

function headers(key) {
  return { Authorization: `Bearer ${key}` };
}

async function chatRaw({ key, cfg, model, system, content, maxTokens, json }) {
  const body = {
    model,
    max_tokens: maxTokens,
    temperature: 0.2,
    messages: [
      ...(system ? [{ role: 'system', content: system }] : []),
      { role: 'user', content }
    ]
  };
  if (json) body.response_format = { type: 'json_object' };
  let res = await fetch(`${baseUrl(cfg)}/chat/completions`, {
    method: 'POST',
    headers: { ...headers(key), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  // Certains modèles refusent response_format : on réessaie sans.
  if (res.status === 400 && json) {
    delete body.response_format;
    res = await fetch(`${baseUrl(cfg)}/chat/completions`, {
      method: 'POST',
      headers: { ...headers(key), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }
  const data = await readJsonResponse(res, 'Infomaniak');
  const text = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content || '' : '';
  const u = data.usage || {};
  return { text, usage: { in: u.prompt_tokens || 0, out: u.completion_tokens || 0 } };
}

module.exports = {
  id: 'infomaniak',
  label: 'Infomaniak',
  supports: { classif: true, synth: true, vision: true, transcr: true },

  ready(settings, key) { return !!key && !!settings.infomaniak.productId; },

  async chat({ key, settings, system, prompt, maxTokens, json }) {
    return chatRaw({ key, cfg: settings.infomaniak, model: settings.models.infomaniak.chat, system, content: prompt, maxTokens, json });
  },

  async vision({ key, settings, prompt, image, mime }) {
    const content = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: `data:${mime};base64,${image.toString('base64')}` } }
    ];
    return chatRaw({ key, cfg: settings.infomaniak, model: settings.models.infomaniak.vision, content, maxTokens: 600 });
  },

  async transcribe({ key, settings, audio, mime, filename }) {
    const cfg = settings.infomaniak;
    const send = (format) => {
      const form = new FormData();
      form.append('file', new Blob([audio], { type: mime }), filename);
      form.append('model', settings.models.infomaniak.audio);
      form.append('response_format', format);
      return fetch(`${baseUrl(cfg)}/audio/transcriptions`, { method: 'POST', headers: headers(key), body: form });
    };
    // verbose_json donne la langue détectée ; repli sur json si le format est refusé.
    let res = await send('verbose_json');
    if (res.status === 400) res = await send('json');
    let data = await readJsonResponse(res, 'Infomaniak');
    // Selon la version de l'API, la transcription est rendue tout de suite ou
    // traitée en tâche de fond (batch_id à interroger).
    if (data && data.batch_id && !data.text) data = await pollBatch(key, cfg, data.batch_id);
    const text = typeof data === 'string' ? data : data.text || '';
    return { text: text.trim(), lang: data.language || null, usage: { audioSec: data.duration || 0 } };
  },

  async test({ key, settings }) {
    const res = await fetch(`${baseUrl(settings.infomaniak)}/models`, { headers: headers(key) });
    const data = await readJsonResponse(res, 'Infomaniak');
    const models = (data.data || []).map((m) => m.id).filter(Boolean);
    return { ok: true, models };
  }
};

async function pollBatch(key, cfg, batchId) {
  const root = `https://api.infomaniak.com/1/ai/${encodeURIComponent(cfg.productId)}/results/${encodeURIComponent(batchId)}`;
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await fetch(root, { headers: headers(key) });
    const data = await readJsonResponse(res, 'Infomaniak');
    const d = data.data || data;
    if (d.status === 'success' || d.status === 'done') {
      if (d.data && (d.data.text || typeof d.data === 'string')) return d.data;
      if (d.text) return d;
      const dl = await fetch(`${root}/download`, { headers: headers(key) });
      const raw = await dl.text();
      try { return JSON.parse(raw); } catch (e) { return { text: raw }; }
    }
    if (d.status === 'error' || d.status === 'failed') throw new Error('Infomaniak : la transcription a échoué.');
  }
  throw new Error('Infomaniak : transcription trop longue (délai dépassé).');
}
