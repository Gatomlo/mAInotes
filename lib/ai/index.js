// Interface commune des fournisseurs d'IA : choix du fournisseur par fonction,
// plafond mensuel (blocage à 100 %, alerte à 80 %), journal des appels et recours
// éventuel à un autre fournisseur en cas d'échec.
const { decrypt } = require('../secrets');

const PROVIDERS = {
  infomaniak: require('./infomaniak'),
  gemini: require('./gemini'),
  claude: require('./claude')
};

const FN_LABEL = { classif: 'Classement', transcr: 'Transcription', vision: 'Description d\'image', synth: 'Synthèse', enrich: 'Enrichissement' };

// Tarifs indicatifs en euros, pour estimer la dépense (jetons en millions, audio en
// minutes). À ajuster selon les grilles des fournisseurs : seule la facture fait foi.
const RATES = {
  infomaniak: { in: 0.2, out: 0.6, audioMin: 0.01 },
  gemini: { in: 0.1, out: 0.4, audioMin: 0.02 },
  claude: { in: 0.1, out: 0.5, audioMin: 0 }
};

class BudgetError extends Error {
  constructor(provider) {
    super(`Plafond mensuel atteint pour ${PROVIDERS[provider].label}.`);
    this.budget = true;
  }
}

const monthKey = () => new Date().toISOString().slice(0, 7);

module.exports = function createAI(store, masterKey) {
  const db = () => store.db;

  function key(provider) {
    const blob = db().keys[provider];
    try { return blob ? decrypt(masterKey, blob) : ''; } catch (e) { return ''; }
  }

  function available(provider, fn) {
    const p = PROVIDERS[provider];
    const s = db().settings;
    return !!p && p.supports[fn] && s.enabled[provider] && p.ready(s, key(provider));
  }

  function usage(provider) {
    const m = db().usage[monthKey()] || {};
    return m[provider] || { cost: 0, calls: 0 };
  }

  function budgetState(provider) {
    const cap = Number(db().settings.budgets[provider]);
    const used = usage(provider).cost;
    if (!cap || cap <= 0) return { cap: null, used, ratio: 0, blocked: false, alert: false };
    const ratio = used / cap;
    return { cap, used, ratio, blocked: ratio >= 1, alert: ratio >= 0.8 };
  }

  function estimate(provider, u) {
    const r = RATES[provider];
    return ((u.in || 0) * r.in + (u.out || 0) * r.out) / 1e6 + ((u.audioSec || 0) / 60) * r.audioMin;
  }

  function record(provider, fn, u, ok, error) {
    const cost = ok ? estimate(provider, u || {}) : 0;
    const mk = monthKey();
    const m = (db().usage[mk] = db().usage[mk] || {});
    const p = (m[provider] = m[provider] || { cost: 0, calls: 0 });
    p.calls++;
    p.cost += cost;
    db().log.unshift({ date: Date.now(), fn, provider, cost, ok, tokensIn: (u && u.in) || 0, tokensOut: (u && u.out) || 0, error: error || undefined });
    db().log = db().log.slice(0, 500);
    store.save();
  }

  // Ordre d'essai : le fournisseur imposé, sinon celui des réglages puis, en mode
  // « en cas d'échec », les autres fournisseurs activés.
  function candidates(fn, forced) {
    const s = db().settings;
    if (forced) return [forced];
    const main = s.providers[fn];
    const list = [main];
    if (s.recours === 'fail') Object.keys(PROVIDERS).forEach((p) => { if (p !== main) list.push(p); });
    return list;
  }

  async function call(fn, method, args, opts = {}) {
    const list = candidates(fn, opts.provider);
    let lastErr = null;
    let tried = 0;
    for (const provider of list) {
      if (!available(provider, fn)) {
        if (provider === list[0]) {
          lastErr = new Error(`${PROVIDERS[provider] ? PROVIDERS[provider].label : provider} n'est pas configuré pour : ${FN_LABEL[fn]}. Voir Réglages.`);
          lastErr.config = true;
        }
        continue;
      }
      if (budgetState(provider).blocked) { lastErr = new BudgetError(provider); continue; }
      tried++;
      try {
        const result = await PROVIDERS[provider][method]({ key: key(provider), settings: db().settings, ...args });
        record(provider, fn, result.usage, true);
        return { ...result, provider };
      } catch (err) {
        record(provider, fn, null, false, String(err.message).slice(0, 300));
        lastErr = err;
      }
    }
    if (!tried && lastErr && (lastErr.budget || lastErr.config)) throw lastErr;
    throw lastErr || new Error('Aucun fournisseur disponible.');
  }

  async function test(provider) {
    const p = PROVIDERS[provider];
    if (!p) throw new Error('Fournisseur inconnu.');
    const k = key(provider);
    if (!k) throw new Error('Aucune clé enregistrée.');
    const out = await p.test({ key: k, settings: db().settings });
    // La liste est gardée pour remplir les menus déroulants des réglages.
    db().modelLists[provider] = { at: Date.now(), ...out.models };
    store.save();
    return out;
  }

  function summary() {
    return Object.keys(PROVIDERS).map((id) => ({
      id,
      label: PROVIDERS[id].label,
      hasKey: !!db().keys[id],
      enabled: !!db().settings.enabled[id],
      supports: PROVIDERS[id].supports,
      usage: usage(id),
      budget: budgetState(id),
      models: db().modelLists[id] || null
    }));
  }

  return { call, test, summary, budgetState, available, PROVIDERS, BudgetError };
};

module.exports.FN_LABEL = FN_LABEL;
