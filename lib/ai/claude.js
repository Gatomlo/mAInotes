// Fournisseur Claude (Anthropic), optionnel et inactif par défaut. Pas de
// transcription audio chez ce fournisseur.
const Anthropic = require('@anthropic-ai/sdk');

const clients = new Map();
function client(key) {
  if (!clients.has(key)) clients.set(key, new Anthropic({ apiKey: key, maxRetries: 1 }));
  return clients.get(key);
}

// Les modèles de la génération 5 acceptent le niveau d'effort : « low » suffit pour
// classer ou décrire, et consomme moins de jetons.
function effortFor(model, level) {
  return /^claude-(haiku|sonnet|opus|fable)-5/.test(model) ? { output_config: { effort: level } } : {};
}

function toResult(msg) {
  if (msg.stop_reason === 'refusal') throw new Error('Claude a refusé de traiter ce contenu.');
  const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return { text, usage: { in: msg.usage.input_tokens || 0, out: msg.usage.output_tokens || 0 } };
}

module.exports = {
  id: 'claude',
  label: 'Claude',
  supports: { classif: true, synth: true, vision: true, transcr: false },

  ready(settings, key) { return !!key; },

  async chat({ key, settings, system, prompt, maxTokens, long }) {
    const model = settings.models.claude.chat;
    const params = {
      model,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: prompt }],
      ...effortFor(model, long ? 'medium' : 'low')
    };
    // Les synthèses longues passent en flux pour éviter les délais d'attente HTTP.
    const msg = long ? await client(key).messages.stream(params).finalMessage() : await client(key).messages.create(params);
    return toResult(msg);
  },

  async vision({ key, settings, prompt, image, mime }) {
    const model = settings.models.claude.vision;
    const msg = await client(key).messages.create({
      model,
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mime, data: image.toString('base64') } },
          { type: 'text', text: prompt }
        ]
      }],
      ...effortFor(model, 'low')
    });
    return toResult(msg);
  },

  async test({ key }) {
    const page = await client(key).models.list({ limit: 100 });
    const ids = page.data.map((m) => m.id);
    return { ok: true, models: { chat: ids, vision: ids } };
  }
};
