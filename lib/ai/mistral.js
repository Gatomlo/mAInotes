// Fournisseur Mistral (La Plateforme), optionnel et inactif par défaut : API compatible
// OpenAI pour le texte et les images, transcription audio avec Voxtral.
const { readJsonResponse } = require('./util');

const ROOT = (process.env.MAINOTES_MISTRAL_URL || 'https://api.mistral.ai/v1').replace(/\/+$/, '');

function headers(key) {
  return { Authorization: `Bearer ${key}` };
}

async function chatRaw({ key, model, system, content, maxTokens, json }) {
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
  const send = () => fetch(`${ROOT}/chat/completions`, {
    method: 'POST',
    headers: { ...headers(key), 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  let res = await send();
  // Un modèle qui refuse response_format : on réessaie sans.
  if (res.status === 400 && json) {
    delete body.response_format;
    res = await send();
  }
  const data = await readJsonResponse(res, 'Mistral', 'mistral');
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  // Selon le modèle, le contenu est un texte ou une liste de blocs.
  const raw = msg ? msg.content : '';
  const text = Array.isArray(raw) ? raw.map((b) => (typeof b === 'string' ? b : b.text || '')).join('') : raw || '';
  const u = data.usage || {};
  return { text, usage: { in: u.prompt_tokens || 0, out: u.completion_tokens || 0 }, limits: data.__limits };
}

module.exports = {
  id: 'mistral',
  label: 'Mistral',
  supports: { classif: true, enrich: true, synth: true, vision: true, transcr: true },

  ready(settings, key) { return !!key; },

  async chat({ key, settings, system, prompt, maxTokens, json }) {
    return chatRaw({ key, model: settings.models.mistral.chat, system, content: prompt, maxTokens, json });
  },

  async vision({ key, settings, prompt, image, mime }) {
    const content = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: `data:${mime};base64,${image.toString('base64')}` }
    ];
    return chatRaw({ key, model: settings.models.mistral.vision, content, maxTokens: 600 });
  },

  async transcribe({ key, settings, audio, mime, filename, durationSec }) {
    const form = new FormData();
    form.append('file', new Blob([audio], { type: String(mime || 'audio/webm').split(';')[0] }), filename || 'note.webm');
    form.append('model', settings.models.mistral.audio);
    const res = await fetch(`${ROOT}/audio/transcriptions`, { method: 'POST', headers: headers(key), body: form });
    const data = await readJsonResponse(res, 'Mistral', 'mistral');
    const u = data.usage || {};
    return {
      text: String(data.text || '').trim(),
      lang: data.language || null,
      usage: { in: u.prompt_tokens || 0, out: u.completion_tokens || 0, audioSec: u.prompt_audio_seconds || durationSec || 0 },
      limits: data.__limits
    };
  },

  // La liste des modèles indique leurs capacités (texte, vision, audio) ; à défaut, le
  // nom sert d'indice. On écarte les modèles de vecteurs, de modération et d'OCR.
  async test({ key }) {
    const res = await fetch(`${ROOT}/models`, { headers: headers(key) });
    const data = await readJsonResponse(res, 'Mistral');
    const chat = [];
    const vision = [];
    const audio = [];
    const seen = new Set();
    (data.data || []).forEach((m) => {
      if (!m || !m.id || seen.has(m.id)) return;
      seen.add(m.id);
      const c = m.capabilities || {};
      const isAudio = !!c.audio_transcription || (/voxtral/i.test(m.id) && /transcri/i.test(m.id));
      const other = /embed|moderation|ocr/i.test(m.id);
      if (isAudio) { audio.push(m.id); return; }
      if (other) return;
      if (c.completion_chat === false) return;
      chat.push(m.id);
      if (c.vision) vision.push(m.id);
    });
    chat.sort();
    vision.sort();
    audio.sort();
    return { ok: true, models: { chat, vision: vision.length ? vision : chat, audio } };
  }
};
