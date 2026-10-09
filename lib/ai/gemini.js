// Fournisseur Gemini (Google), optionnel et inactif par défaut.
const { readJsonResponse, parseJsonLoose, toMs, quotaError } = require('./util');

const ROOT = process.env.MAINOTES_GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta';

async function generate({ key, model, system, parts, maxTokens, json }) {
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 }
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (json) body.generationConfig.responseMimeType = 'application/json';
  const res = await fetch(`${ROOT}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body)
  });
  let data;
  try {
    data = await readJsonResponse(res, 'Gemini', 'gemini');
  } catch (err) {
    if (err.quota) throw explainQuota(err, model);
    throw err;
  }
  const cand = (data.candidates || [])[0];
  const text = cand && cand.content ? (cand.content.parts || []).map((p) => p.text || '').join('') : '';
  const u = data.usageMetadata || {};
  return { text, usage: { in: u.promptTokenCount || 0, out: u.candidatesTokenCount || 0 }, limits: data.__limits };
}

// Google détaille le quota dépassé (QuotaFailure) et le délai conseillé (RetryInfo).
function explainQuota(err, model) {
  const details = (err.data && err.data.error && err.data.error.details) || [];
  const failure = details.find((d) => /QuotaFailure/.test(d['@type'] || '')) || {};
  const retry = details.find((d) => /RetryInfo/.test(d['@type'] || '')) || {};
  const v = (failure.violations || [])[0] || {};
  const id = `${v.quotaId || ''} ${v.quotaMetric || ''}`;
  const period = /PerDay/i.test(id) ? 'day' : /PerMinute/i.test(id) ? 'minute' : /PerHour/i.test(id) ? 'hour' : null;
  const unit = /token/i.test(id) ? 'jetons' : 'requêtes';
  const free = /free.?tier/i.test(id);
  const limit = v.quotaValue ? Number(v.quotaValue) : null;
  const target = (v.quotaDimensions && v.quotaDimensions.model) || model;
  const per = { day: 'par jour', minute: 'par minute', hour: 'par heure' }[period] || '';
  const what = limit ? `${limit} ${unit} ${per}`.trim() : `limite ${per}`.trim();
  const retryMs = toMs(retry.retryDelay) || err.quota.retryMs;
  return quotaError('Gemini', 'gemini', `quota${free ? ' gratuit' : ''} atteint (${what}${target ? ', ' + target : ''}).`, retryMs, { period, unit, limit, freeTier: free, model: target });
}

module.exports = {
  id: 'gemini',
  label: 'Gemini',
  supports: { classif: true, enrich: true, synth: true, vision: true, transcr: true },

  ready(settings, key) { return !!key; },

  chat({ key, settings, system, prompt, maxTokens, json }) {
    return generate({ key, model: settings.models.gemini.chat, system, parts: [{ text: prompt }], maxTokens, json });
  },

  vision({ key, settings, prompt, image, mime }) {
    return generate({ key, model: settings.models.gemini.vision, parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: image.toString('base64') } }], maxTokens: 600 });
  },

  async transcribe({ key, settings, audio, mime, durationSec }) {
    const prompt = 'Transcris cet enregistrement mot à mot, sans résumer. Réponds en JSON : {"texte": "...", "langue": "code ISO 639-1"}.';
    const r = await generate({
      key,
      model: settings.models.gemini.audio,
      parts: [{ text: prompt }, { inline_data: { mime_type: mime.split(';')[0], data: audio.toString('base64') } }],
      maxTokens: 4000,
      json: true
    });
    let text = r.text;
    let lang = null;
    try { const j = parseJsonLoose(r.text); text = j.texte || j.text || ''; lang = j.langue || null; } catch (e) { /* texte brut */ }
    return { text: String(text).trim(), lang, usage: { ...r.usage, audioSec: durationSec || 0 } };
  },

  // Seuls les modèles qui acceptent generateContent servent ici ; on écarte ceux qui
  // produisent des images, de la vidéo, de la voix ou des vecteurs.
  async test({ key }) {
    const res = await fetch(`${ROOT}/models?pageSize=1000`, { headers: { 'x-goog-api-key': key } });
    const data = await readJsonResponse(res, 'Gemini');
    const ids = (data.models || [])
      .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m) => String(m.name).replace(/^models\//, ''))
      .filter((id) => !/embed|imagen|veo|tts|aqa|image|live|native-audio|robotics|computer-use/i.test(id))
      .sort();
    return { ok: true, models: { chat: ids, vision: ids, audio: ids } };
  }
};
