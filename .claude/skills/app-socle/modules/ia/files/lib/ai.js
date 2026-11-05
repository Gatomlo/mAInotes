// IA : interface commune des fournisseurs (appels HTTP directs, aucun SDK).
// Reglages dans settings « ai » (JSON), cles chiffrees dans ai_keys, depense du mois dans ai_usage,
// reponses gardees dans ai_cache. Plafond mensuel par fournisseur : alerte a 80 %, blocage a 100 %.
const crypto = require('crypto');
const { db, getSetting, setSetting } = require('./db');
const { encrypt, decrypt } = require('./secrets');
const { httpError, str, asyncHandler } = require('./util');

// Tarifs indicatifs en euros par million de jetons : seule la facture du fournisseur fait foi.
const RATES = { infomaniak: { in: 0.2, out: 0.6 }, claude: { in: 1, out: 5 }, gemini: { in: 0.1, out: 0.4 }, mistral: { in: 0.1, out: 0.3 } };
const LABELS = { infomaniak: 'Infomaniak', claude: 'Claude', gemini: 'Gemini', mistral: 'Mistral' };

const DEFAULTS = {
  provider: 'infomaniak',
  enabled: { infomaniak: true, claude: false, gemini: false, mistral: false }, // seul Infomaniak actif par defaut
  models: { infomaniak: 'mistral24b', claude: 'claude-haiku-5-5', gemini: 'gemini-2.5-flash', mistral: 'mistral-small-latest' },
  budgets: { infomaniak: 2, claude: 2, gemini: 2, mistral: 2 }, // euros par mois ; 0 = pas de plafond
  productId: '',
  baseUrl: 'https://api.infomaniak.com/1/ai/{product_id}/openai/v1', // modifiable si Infomaniak change l'adresse
};

function config() {
  const saved = JSON.parse(getSetting('ai') || '{}');
  const merge = (k) => ({ ...DEFAULTS[k], ...(saved[k] || {}) });
  return { ...DEFAULTS, ...saved, enabled: merge('enabled'), models: merge('models'), budgets: merge('budgets') };
}
const monthKey = () => new Date().toISOString().slice(0, 7);
const key = (provider) => { const r = db.prepare('SELECT blob FROM ai_keys WHERE provider = ?').get(provider); try { return r ? decrypt(r.blob) : ''; } catch { return ''; } };
const usage = (provider) => db.prepare('SELECT calls, tokens_in AS tokensIn, tokens_out AS tokensOut, cost FROM ai_usage WHERE month = ? AND provider = ?').get(monthKey(), provider) || { calls: 0, tokensIn: 0, tokensOut: 0, cost: 0 };

function budget(provider, cfg = config()) {
  const cap = Number(cfg.budgets[provider]);
  const used = usage(provider).cost;
  if (!cap || cap <= 0) return { cap: null, used, ratio: 0, blocked: false, alert: false };
  return { cap, used, ratio: used / cap, blocked: used >= cap, alert: used >= cap * 0.8 };
}

// ---------- Fournisseurs : chacun renvoie { text, usage: { in, out } } ----------
async function json(res, label) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(`${label} : ${(data.error && (data.error.message || data.error)) || res.status}`), { status: res.status });
  return data;
}
async function openaiLike(base, k, model, { system, prompt, maxTokens, json: wantJson }, label) {
  const body = { model, max_tokens: maxTokens, temperature: 0.2, messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }] };
  if (wantJson) body.response_format = { type: 'json_object' };
  const data = await json(await fetch(`${base}/chat/completions`, { method: 'POST', headers: { Authorization: `Bearer ${k}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }), label);
  const u = data.usage || {};
  return { text: (data.choices && data.choices[0] && data.choices[0].message.content) || '', usage: { in: u.prompt_tokens || 0, out: u.completion_tokens || 0 } };
}
const PROVIDERS = {
  infomaniak: (k, cfg, a) => {
    if (!cfg.productId) throw Object.assign(new Error('Identifiant du produit IA Infomaniak manquant (Réglages).'), { config: true });
    return openaiLike(cfg.baseUrl.replace('{product_id}', encodeURIComponent(cfg.productId)).replace(/\/+$/, ''), k, cfg.models.infomaniak, a, 'Infomaniak');
  },
  mistral: (k, cfg, a) => openaiLike('https://api.mistral.ai/v1', k, cfg.models.mistral, a, 'Mistral'),
  async claude(k, cfg, a) {
    const data = await json(await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.models.claude, max_tokens: a.maxTokens, system: a.system || undefined, messages: [{ role: 'user', content: a.prompt }] }) }), 'Claude');
    return { text: (data.content || []).map((c) => c.text || '').join(''), usage: { in: (data.usage || {}).input_tokens || 0, out: (data.usage || {}).output_tokens || 0 } };
  },
  async gemini(k, cfg, a) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.models.gemini)}:generateContent`;
    const data = await json(await fetch(url, { method: 'POST', headers: { 'x-goog-api-key': k, 'content-type': 'application/json' },
      body: JSON.stringify({ systemInstruction: a.system ? { parts: [{ text: a.system }] } : undefined, contents: [{ role: 'user', parts: [{ text: a.prompt }] }],
        generationConfig: { maxOutputTokens: a.maxTokens, temperature: 0.2, ...(a.json ? { responseMimeType: 'application/json' } : {}) } }) }), 'Gemini');
    const u = data.usageMetadata || {};
    return { text: (((data.candidates || [])[0] || {}).content || { parts: [] }).parts.map((p) => p.text || '').join(''), usage: { in: u.promptTokenCount || 0, out: u.candidatesTokenCount || 0 } };
  },
};

// ---------- Appel principal ----------
// complete({ system, prompt, json, maxTokens, cache = true, provider }) -> { text, usage, provider, cached }
async function complete({ system = '', prompt, json: wantJson = false, maxTokens = 600, cache = true, provider } = {}) {
  const cfg = config();
  const p = provider || cfg.provider;
  if (!PROVIDERS[p]) throw Object.assign(new Error('Fournisseur IA inconnu.'), { config: true });
  const fake = process.env.__ENV___AI === 'fake';
  if (!fake && !cfg.enabled[p]) throw Object.assign(new Error(`${LABELS[p]} est désactivé (Réglages).`), { config: true });
  const k = fake ? 'fake' : key(p);
  if (!k) throw Object.assign(new Error(`Aucune clé enregistrée pour ${LABELS[p]} (Réglages).`), { config: true });

  const hash = crypto.createHash('sha256').update(JSON.stringify([p, cfg.models[p], system, prompt, wantJson])).digest('hex');
  if (cache) { const hit = db.prepare('SELECT text FROM ai_cache WHERE hash = ?').get(hash); if (hit) return { text: hit.text, usage: { in: 0, out: 0 }, provider: p, cached: true }; }
  if (budget(p, cfg).blocked) throw Object.assign(new Error(`Plafond mensuel atteint pour ${LABELS[p]}.`), { budget: true });

  const args = { system, prompt, maxTokens, json: wantJson };
  const out = fake ? { text: `[essai] ${String(prompt).slice(0, 80)}`, usage: { in: Math.ceil(String(prompt).length / 4) + 1000, out: 50 } } : await PROVIDERS[p](k, cfg, args);
  const cost = (out.usage.in * RATES[p].in + out.usage.out * RATES[p].out) / 1e6;
  db.prepare(`INSERT INTO ai_usage (month, provider, calls, tokens_in, tokens_out, cost) VALUES (?, ?, 1, ?, ?, ?)
    ON CONFLICT(month, provider) DO UPDATE SET calls = calls + 1, tokens_in = tokens_in + excluded.tokens_in, tokens_out = tokens_out + excluded.tokens_out, cost = cost + excluded.cost`)
    .run(monthKey(), p, out.usage.in, out.usage.out, cost);
  if (cache) db.prepare('INSERT OR REPLACE INTO ai_cache (hash, text, created_at) VALUES (?, ?, ?)').run(hash, out.text, Date.now());
  return { ...out, provider: p, cached: false };
}

// ---------- Routes (derriere la session) ----------
function summary() {
  const cfg = config();
  return {
    provider: cfg.provider, models: cfg.models, budgets: cfg.budgets, productId: cfg.productId, baseUrl: cfg.baseUrl,
    providers: Object.keys(PROVIDERS).map((id) => ({ id, label: LABELS[id], enabled: cfg.enabled[id], hasKey: !!key(id), usage: usage(id), budget: budget(id, cfg) })),
  };
}
function routes(r) {
  r.get('/ai/settings', (req, res) => res.json(summary()));
  r.put('/ai/settings', (req, res) => {
    const b = req.body || {};
    const cfg = config();
    if (b.provider) { if (!PROVIDERS[b.provider]) throw httpError(400, 'Fournisseur inconnu.'); cfg.provider = b.provider; }
    for (const id of Object.keys(PROVIDERS)) {
      if (b.enabled && id in b.enabled) cfg.enabled[id] = !!b.enabled[id];
      if (b.models && b.models[id]) cfg.models[id] = str(b.models[id], 100);
      if (b.budgets && id in b.budgets) cfg.budgets[id] = Math.max(0, Number(b.budgets[id]) || 0);
    }
    if (b.productId != null) cfg.productId = str(b.productId, 40);
    if (b.baseUrl) { if (!/^https:\/\//.test(b.baseUrl)) throw httpError(400, 'Adresse https requise.'); cfg.baseUrl = str(b.baseUrl, 300); }
    setSetting('ai', JSON.stringify(cfg));
    res.json(summary());
  });
  r.put('/ai/key', (req, res) => {
    const { provider, key: k } = req.body || {};
    if (!PROVIDERS[provider]) throw httpError(400, 'Fournisseur inconnu.');
    if (!k) db.prepare('DELETE FROM ai_keys WHERE provider = ?').run(provider);
    else db.prepare('INSERT OR REPLACE INTO ai_keys (provider, blob) VALUES (?, ?)').run(provider, encrypt(str(k, 500)));
    res.json(summary());
  });
  r.post('/ai/test', asyncHandler(async (req, res) => {
    const out = await complete({ provider: (req.body || {}).provider, prompt: 'Réponds par le seul mot : ok', maxTokens: 10, cache: false });
    res.json({ ok: true, text: out.text, provider: out.provider });
  }));
  r.get('/ai/usage', (req, res) => res.json(summary().providers));
}

module.exports = { complete, config, budget, routes, PROVIDERS };
