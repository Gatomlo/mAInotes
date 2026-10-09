// Interface commune des fournisseurs d'IA : choix du fournisseur par fonction,
// plafond mensuel (blocage à 100 %, alerte à 80 %), journal des appels et recours
// éventuel à un autre fournisseur en cas d'échec.
const { decrypt } = require('../secrets');
const { quotaError, fmtDelay } = require('./util');

const PROVIDERS = {
  infomaniak: require('./infomaniak'),
  gemini: require('./gemini'),
  claude: require('./claude'),
  mistral: require('./mistral')
};

const FN_LABEL = { classif: 'Classement', transcr: 'Transcription', vision: 'Description d\'image', synth: 'Synthèse', enrich: 'Enrichissement' };

// Tarifs indicatifs en euros, pour estimer la dépense (jetons en millions, audio en
// minutes). À ajuster selon les grilles des fournisseurs : seule la facture fait foi.
const RATES = {
  infomaniak: { in: 0.2, out: 0.6, audioMin: 0.01 },
  gemini: { in: 0.1, out: 0.4, audioMin: 0.02 },
  claude: { in: 0.1, out: 0.5, audioMin: 0 },
  mistral: { in: 0.1, out: 0.3, audioMin: 0.003 }
};

class BudgetError extends Error {
  constructor(provider) {
    super(`Plafond mensuel atteint pour ${PROVIDERS[provider].label}.`);
    this.budget = true;
  }
}

const monthKey = () => new Date().toISOString().slice(0, 7);

// Les quotas quotidiens de Gemini repartent à minuit, heure du Pacifique ; les
// autres sont comptés sur la journée belge.
const RESET_TZ = { gemini: 'America/Los_Angeles' };
function tzParts(provider, t) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: RESET_TZ[provider] || 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const o = {};
  f.formatToParts(new Date(t || Date.now())).forEach((x) => { o[x.type] = x.value; });
  return o;
}
function dayKey(provider) { const o = tzParts(provider); return `${o.year}-${o.month}-${o.day}`; }
function msToNextDay(provider) {
  const o = tzParts(provider);
  const elapsed = ((Number(o.hour) * 60 + Number(o.minute)) * 60 + Number(o.second)) * 1000;
  return 864e5 - elapsed + 1000;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

  // ---------- Quotas du fournisseur ----------
  // Comptage local des appels (par minute en mémoire, par jour dans la base) pour
  // respecter les quotas indiqués dans les réglages, avant que le fournisseur ne bloque.
  const minuteCalls = {};
  function limitsOf(provider) {
    const all = (db().limits = db().limits || {});
    return (all[provider] = all[provider] || {});
  }
  function todayCalls(provider) {
    const d = limitsOf(provider).daily;
    return d && d.date === dayKey(provider) ? d.calls : 0;
  }
  function lastMinute(provider) {
    const now = Date.now();
    minuteCalls[provider] = (minuteCalls[provider] || []).filter((t) => now - t < 60000);
    return minuteCalls[provider];
  }
  function countCall(provider) {
    const l = limitsOf(provider);
    const date = dayKey(provider);
    if (!l.daily || l.daily.date !== date) l.daily = { date, calls: 0 };
    l.daily.calls++;
    lastMinute(provider).push(Date.now());
  }
  function cooldown(provider) {
    const q = limitsOf(provider).lastQuota;
    return q && q.retryAt > Date.now() ? q : null;
  }
  // Vérifie les quotas avant l'appel : attend une place si la limite par minute est
  // atteinte (60 s au plus), refuse si la limite du jour est atteinte ou si le
  // fournisseur a demandé d'attendre.
  async function checkQuota(provider) {
    const label = PROVIDERS[provider].label;
    const cd = cooldown(provider);
    if (cd) throw quotaError(label, provider, cd.message.replace(/^[^:]+ : /, '').replace(/ Nouvel essai.*$/, ''), cd.retryAt - Date.now(), { cooldown: true });
    const q = (db().settings.quotas || {})[provider] || {};
    if (q.perDay && todayCalls(provider) >= q.perDay) {
      throw quotaError(label, provider, `quota indiqué dans les réglages atteint (${q.perDay} requêtes par jour).`, msToNextDay(provider), { local: true, period: 'day', limit: q.perDay });
    }
    if (q.perMinute) {
      const recent = lastMinute(provider);
      if (recent.length >= q.perMinute) await sleep(Math.min(60000, recent[0] + 60000 - Date.now() + 200));
    }
  }
  function noteQuota(provider, err) {
    const q = err.quota || {};
    const wait = q.retryMs || (q.period === 'day' ? msToNextDay(provider) : 60000);
    limitsOf(provider).lastQuota = { at: Date.now(), message: err.message, retryAt: Date.now() + wait, period: q.period || null, limit: q.limit || null, unit: q.unit || null, freeTier: !!q.freeTier, model: q.model || null, local: !!q.local };
    store.save();
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
      try { await checkQuota(provider); } catch (err) { lastErr = err; continue; }
      tried++;
      countCall(provider);
      try {
        const result = await PROVIDERS[provider][method]({ key: key(provider), settings: db().settings, ...args });
        if (result.limits && Object.keys(result.limits).length) limitsOf(provider).observed = { at: Date.now(), headers: result.limits };
        if (limitsOf(provider).lastQuota) delete limitsOf(provider).lastQuota;
        record(provider, fn, result.usage, true);
        return { ...result, provider };
      } catch (err) {
        if (err.quota) noteQuota(provider, err);
        if (err.limits && Object.keys(err.limits).length) limitsOf(provider).observed = { at: Date.now(), headers: err.limits };
        record(provider, fn, null, false, String(err.message).slice(0, 300));
        lastErr = err;
      }
    }
    if (!tried && lastErr && (lastErr.budget || lastErr.config || lastErr.quota)) throw lastErr;
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
      quota: {
        set: (db().settings.quotas || {})[id] || {},
        today: todayCalls(id),
        lastMinute: lastMinute(id).length,
        observed: limitsOf(id).observed || null,
        lastQuota: cooldown(id) || null,
        resetIn: fmtDelay(msToNextDay(id))
      },
      models: db().modelLists[id] || null
    }));
  }

  return { call, test, summary, budgetState, available, PROVIDERS, BudgetError };
};

module.exports.FN_LABEL = FN_LABEL;
