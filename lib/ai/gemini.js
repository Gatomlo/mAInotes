// Fournisseur Gemini (Google), optionnel et inactif par défaut.
const { readJsonResponse, parseJsonLoose } = require('./util');

const ROOT = 'https://generativelanguage.googleapis.com/v1beta';

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
  const data = await readJsonResponse(res, 'Gemini');
  const cand = (data.candidates || [])[0];
  const text = cand && cand.content ? (cand.content.parts || []).map((p) => p.text || '').join('') : '';
  const u = data.usageMetadata || {};
  return { text, usage: { in: u.promptTokenCount || 0, out: u.candidatesTokenCount || 0 } };
}

module.exports = {
  id: 'gemini',
  label: 'Gemini',
  supports: { classif: true, synth: true, vision: true, transcr: true },

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

  async test({ key }) {
    const res = await fetch(`${ROOT}/models?pageSize=50`, { headers: { 'x-goog-api-key': key } });
    const data = await readJsonResponse(res, 'Gemini');
    return { ok: true, models: (data.models || []).map((m) => String(m.name).replace(/^models\//, '')) };
  }
};
