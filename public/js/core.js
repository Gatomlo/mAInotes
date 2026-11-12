/* mAInotes – noyau : accès à l'API, état, synchronisation, file d'envoi hors connexion.
   Tous les chemins sont relatifs : l'app fonctionne à la racine comme sous /mainotes/. */
'use strict';

var $ = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var norm = function (s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 9); };
var COLORS = ['blue', 'amber', 'purple', 'green', 'rose'];
var CNAME = { blue: 'Bleu', amber: 'Ocre', purple: 'Violet', green: 'Vert', rose: 'Rose' };
var TYPE_LABEL = { text: 'Texte', voice: 'Note vocale', image: 'Image', synthesis: 'Synthèse' };
var PROV = { infomaniak: 'Infomaniak', gemini: 'Gemini', claude: 'Claude', mistral: 'Mistral' };
var I = function (p, w) { return '<svg width="' + (w || 16) + '" height="' + (w || 16) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
var IC = {
  text: '<path d="M4 20l1-4L16 5l3 3L8 19l-4 1z"/>',
  voice: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 8"/>',
  synthesis: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  upload: '<path d="M12 15V4M7 9l5-5 5 5M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>',
  bookmark: '<path d="M7 3h10v18l-5-4-5 4z"/>',
  check: '<path d="m5 12 5 5 9-10"/>'
};

/* ---------- État ---------- */
var S = { user: null, users: [], notebooks: [], tags: [], notes: [], settings: null, providers: [], retri: null, synthesesCount: 0 };
/* Comptes et partage : rôle de la personne sur une note ou un carnet (« owner », « edit », « read »). */
function isAdmin() { return !!(S.user && S.user.role === 'admin'); }
function roleOf(x) { return x.role || 'owner'; }
function canEdit(n) { return roleOf(n) !== 'read'; }
function userName(id) { var u = (S.users || []).filter(function (x) { return x.id === id; })[0]; return u ? u.name : ''; }
var F = { q: '', cat: null, tags: [], tagMode: 'all', read: '', period: '', from: '', to: '' };
var VIEW = 'cards';
try { var vs = localStorage.getItem('mainotes-view'); VIEW = vs === 'list' || vs === 'agenda' ? vs : 'cards'; } catch (e) { /* stockage indisponible */ }

// Période de création choisie dans les filtres : [début, fin] en millisecondes, ou null.
function dateRange(f) {
  f = f || F;
  var now = new Date();
  var day = function (d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  var parse = function (v, end) { if (!v) return null; var p = v.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0).getTime(); };
  switch (f.period) {
    case 'today': return [day(now), Infinity];
    case '7': return [day(now) - 6 * 864e5, Infinity];
    case '30': return [day(now) - 29 * 864e5, Infinity];
    case 'month': return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), Infinity];
    case 'year': return [new Date(now.getFullYear(), 0, 1).getTime(), Infinity];
    case 'custom': return f.from || f.to ? [parse(f.from, false) || -Infinity, parse(f.to, true) || Infinity] : null;
    default: return null;
  }
}
var PERIODS = [['', 'Toutes les dates'], ['today', 'Aujourd\'hui'], ['7', '7 derniers jours'], ['30', '30 derniers jours'], ['month', 'Ce mois-ci'], ['year', 'Cette année'], ['custom', 'Période personnalisée…']];
function periodLabel() {
  if (!dateRange()) return '';
  if (F.period !== 'custom') return PERIODS.filter(function (p) { return p[0] === F.period; })[0][1];
  var f = function (v) { return v ? v.split('-').reverse().join('/') : '…'; };
  return 'du ' + f(F.from) + ' au ' + f(F.to);
}
var tab = 'home';
var online = navigator.onLine;
var outbox = [];
var CACHE_KEY = 'mainotes-cache-v1';

function nb(id) { return S.notebooks.filter(function (c) { return c.id === id; })[0] || null; }
function tagById(id) { return S.tags.filter(function (t) { return t.id === id; })[0] || null; }
function noteById(id) { return S.notes.filter(function (n) { return n.id === id; })[0] || null; }
function linksText(n) { return (n.links || []).map(function (l) { return [l.title, l.description || l.summary, l.site].filter(Boolean).join(' '); }).join('\n'); }
function todosText(n) { return (n.todos || []).map(function (t) { return t.text; }).join('\n'); }
function noteText(n) { return [n.content, n.transcript, n.description, todosText(n), linksText(n), n.enrichment ? n.enrichment.explanation : ''].filter(Boolean).join('\n\n'); }
// Fonction « Tâches » activable dans les réglages ; les données restent même désactivée.
function tasksOn() { return !S.settings || !S.settings.features || S.settings.features.tasks !== false; }
function aiOn() { return !S.settings || !S.settings.features || S.settings.features.ai !== false; }
// Mise en forme simple dans le texte d'une note : « # » titre, « - » liste, « > » citation, « --- » séparateur.
var BLOCK_RE = /^(#{1,3} |[-*] |\d+\. |> |---$)/m;
// Mise en forme dans une ligne : **gras**, *italique*, ~~barré~~, `code`, [texte](adresse).
var INLINE_RE = /\*\*[^*\n]+\*\*|~~[^~\n]+~~|`[^`\n]+`|(?:^|[\s(])\*[^*\s][^*\n]*\*(?=$|[\s.,;:!?)])|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)/m;
function inlineFmt(text, selfId) {
  var links = [];
  text = String(text || '').replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, function (m, t, u) { links.push([t, u]); return '\u0001' + (links.length - 1) + '\u0001'; });
  var html = linkify(text);
  html = html.replace(/\u0001(\d+)\u0001/g, function (m, i) { var l = links[+i]; return '<a href="' + esc(l[1]) + '" target="_blank" rel="noopener noreferrer">' + esc(l[0]) + '</a>'; });
  // La mise en forme ne touche pas l'intérieur des liens.
  html = html.split(/(<a [^>]*>.*?<\/a>)/).map(function (seg, i) {
    if (i % 2) return seg;
    return seg.replace(/`([^`\n]+)`/g, '<code>$1</code>').replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>').replace(/~~([^~\n]+)~~/g, '<s>$1</s>')
      .replace(/(^|[\s(])\*([^*\s][^*\n]*?)\*(?=$|[\s.,;:!?)])/g, '$1<em>$2</em>');
  }).join('');
  return mentionify(html, selfId);
}
function richText(text, selfId) {
  if (!BLOCK_RE.test(text) && !INLINE_RE.test(text)) return null;
  var out = '', list = '', para = [];
  var flush = function () { if (para.length) { out += '<p>' + inlineFmt(para.join('\n'), selfId) + '</p>'; para = []; } };
  var closeList = function () { if (list) { out += '</' + list + '>'; list = ''; } };
  var openList = function (kind) { if (list !== kind) { closeList(); out += '<' + kind + ' class="bul">'; list = kind; } };
  text.split('\n').forEach(function (line) {
    var m;
    if ((m = /^(#{1,3}) (.*)$/.exec(line))) { flush(); closeList(); out += '<h3 class="bh bh' + m[1].length + '">' + inlineFmt(m[2], selfId) + '</h3>'; }
    else if ((m = /^[-*] (.*)$/.exec(line))) { flush(); openList('ul'); out += '<li>' + inlineFmt(m[1], selfId) + '</li>'; }
    else if ((m = /^\d+\. (.*)$/.exec(line))) { flush(); openList('ol'); out += '<li>' + inlineFmt(m[1], selfId) + '</li>'; }
    else if ((m = /^> ?(.*)$/.exec(line))) { flush(); closeList(); out += '<blockquote class="bq">' + inlineFmt(m[1], selfId) + '</blockquote>'; }
    else if (/^---$/.test(line)) { flush(); closeList(); out += '<hr class="bhr">'; }
    else if (!line.trim()) { flush(); closeList(); }
    else { closeList(); para.push(line); }
  });
  flush(); closeList();
  return out;
}
function linksOn() { return !S.settings || !S.settings.features || S.settings.features.links !== false; }
function templatesOn() { return !S.settings || !S.settings.features || S.settings.features.templates !== false; }
// Mentions : [[Titre d'une note]] devient un lien vers cette note (résolu à l'affichage, donc toujours à jour).
function mentionTarget(title, selfId) {
  var q = norm(title).trim();
  return live().filter(function (n) { return n.id !== selfId && n.type !== 'synthesis' && norm(n.title).trim() === q; })[0] || null;
}
function mentionify(html, selfId) {
  if (!linksOn()) return html;
  return html.replace(/\[\[([^\[\]\n]{1,200})\]\]/g, function (m, t) {
    var plain = t.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    var n = mentionTarget(plain, selfId);
    return n ? '<button type="button" class="mention" data-a="open" data-id="' + n.id + '" title="Ouvrir la note">' + t + '</button>' : '<span class="mention broken" title="Aucune note avec ce titre">' + t + '</span>';
  });
}
// Notes dont le texte cite celle-ci.
function backlinks(n) {
  if (!linksOn() || !n.title) return [];
  var key = '[[' + norm(n.title).trim() + ']]';
  return live().filter(function (x) { return x.id !== n.id && norm(noteText(x)).indexOf(key) > -1; });
}
function propsOn() { return !S.settings || !S.settings.features || S.settings.features.props !== false; }
function viewsOn() { return !S.settings || !S.settings.features || S.settings.features.views !== false; }
// Propriétés du carnet (vide si la fonction est désactivée).
function nbProps(c) { return propsOn() && c && c.properties ? c.properties : []; }
// Vue choisie pour un carnet (tableau, kanban, calendrier), gardée sur cet appareil.
function nbViewGet(id) { try { return JSON.parse(localStorage.getItem('mainotes-nbview') || '{}')[id] || null; } catch (e) { return null; } }
function nbViewSet(id, v) { try { var o = JSON.parse(localStorage.getItem('mainotes-nbview') || '{}'); if (v) o[id] = v; else delete o[id]; localStorage.setItem('mainotes-nbview', JSON.stringify(o)); } catch (e) { /* rien */ } }
function propValue(n, p) { var v = n.props ? n.props[p.id] : undefined; return v === undefined || v === null ? '' : v; }
function propShow(p, v) {
  if (v === '' || v === undefined) return '';
  if (p.type === 'date') return fmtDay(v);
  if (p.type === 'checkbox') return v ? '✓' : '';
  if (p.type === 'url') return String(v).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
  return String(v);
}
function todayStr() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function fmtDay(s) { var p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString('fr-BE', { weekday: 'short', day: 'numeric', month: 'short' }); }
function todoStats(n) { var t = n.todos || []; return { total: t.length, done: t.filter(function (x) { return x.done; }).length }; }

/* Adresses web rendues cliquables (texte échappé, liens ouverts dans un nouvel onglet). */
var URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"'«»]+/gi;
function linkify(text) {
  text = String(text || '');
  var out = '', i = 0, m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text))) {
    var raw = m[0].replace(/[.,;:!?)\]}”’]+$/, '');
    var href = /^www\./i.test(raw) ? 'https://' + raw : raw;
    out += esc(text.slice(i, m.index)) + '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + esc(raw) + '</a>';
    i = m.index + raw.length;
    URL_RE.lastIndex = i;
  }
  return out + esc(text.slice(i));
}
function linkCard(l, compact) {
  var desc = l.description || l.summary || (l.error ? 'Aperçu indisponible (' + l.error + ').' : '');
  var yt = (String(l.image || '').match(/^https:\/\/i\.ytimg\.com\/vi\/([\w-]{11})\//) || [])[1];
  if (yt) {
    return '<div class="linkcard yt"><button type="button" class="lk-thumb" data-yt="' + yt + '" aria-label="Lire la vidéo">' +
      '<img class="lk-img" src="' + esc(l.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' +
      '<span class="lk-play"><svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span></button>' +
      '<a href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer" class="lk-meta"><span class="lk-site">' + esc(l.site || 'YouTube') + '</span><b>' + esc(l.title || l.url) + '</b>' +
      (desc ? '<span class="lk-desc">' + (l.aiDescription ? I(IC.spark, 12) + ' ' : '') + esc(compact && desc.length > 140 ? desc.slice(0, 137) + '…' : desc) + '</span>' : '') + '</a></div>';
  }
  return '<a class="linkcard" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">' +
    (l.image ? '<img class="lk-img" src="' + esc(l.image) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">' : '') +
    '<span class="lk-site">' + I('<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>', 14) + esc(l.site || '') + '</span>' +
    '<b>' + esc(l.title || l.url) + '</b>' +
    (desc ? '<span class="lk-desc">' + (l.aiDescription ? I(IC.spark, 12) + ' ' : '') + esc(compact && desc.length > 140 ? desc.slice(0, 137) + '…' : desc) + '</span>' : '') +
    '</a>';
}

/* ---------- API ---------- */
function ApiError(msg, status, data) { this.message = msg; this.status = status; this.data = data; }
ApiError.prototype = Object.create(Error.prototype);

function api(method, path, body, opts) {
  opts = opts || {};
  var headers = { 'X-Mainotes': '1' };
  var payload = body;
  if (body !== undefined && !(body instanceof Blob)) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  if (body instanceof Blob) headers['Content-Type'] = body.type || 'application/octet-stream';
  // opts.timeout : abandon si le serveur ne répond pas (réseau muet), traité comme hors connexion.
  var ctrl = opts.timeout && window.AbortController ? new AbortController() : null;
  var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, opts.timeout) : null;
  return fetch('api/' + path, { method: method, headers: headers, body: payload, credentials: 'same-origin', cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
    .then(function (res) {
      clearTimeout(timer);
      return res.text().then(function (t) {
        var data = {};
        try { data = t ? JSON.parse(t) : {}; } catch (e) { data = { error: t }; }
        if (res.status === 401 && !opts.allow401) { onLoggedOut(data); throw new ApiError(data.error || 'Session expirée.', 401, data); }
        if (!res.ok) throw new ApiError(data.error || ('Erreur ' + res.status), res.status, data);
        setOnline(true);
        return data;
      });
    }, function (err) {
      clearTimeout(timer);
      setOnline(false);
      var e = new ApiError('Pas de connexion au serveur.', 0);
      e.network = true;
      throw e;
    });
}

function setOnline(v) {
  if (online === v) return;
  online = v;
  renderBanners();
  renderSync();
  if (v) { flushOutbox(); flushOps(); }
}
window.addEventListener('online', function () { setOnline(true); sync(); });
window.addEventListener('offline', function () { setOnline(false); });

/* ---------- Cache local (consultation hors connexion) ---------- */
function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), S: S })); } catch (e) { /* stockage plein ou bloqué */ }
}
function loadCache() {
  try { var c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); return c && c.S; } catch (e) { return null; }
}
function clearCache() { try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem('mainotes-hist'); } catch (e) { /* rien */ } }

/* ---------- File d'envoi (IndexedDB) : aucune note perdue sans réseau ---------- */
var idb = null;
function openIdb() {
  if (idb) return Promise.resolve(idb);
  return new Promise(function (resolve, reject) {
    if (!window.indexedDB) return reject(new Error('IndexedDB indisponible'));
    var rq = indexedDB.open('mainotes', 1);
    rq.onupgradeneeded = function () { rq.result.createObjectStore('outbox', { keyPath: 'clientId' }); };
    rq.onsuccess = function () { idb = rq.result; resolve(idb); };
    rq.onerror = function () { reject(rq.error); };
  });
}
function idbAll() {
  return openIdb().then(function (d) {
    return new Promise(function (resolve, reject) {
      var rq = d.transaction('outbox').objectStore('outbox').getAll();
      rq.onsuccess = function () { resolve(rq.result || []); };
      rq.onerror = function () { reject(rq.error); };
    });
  }).catch(function () { return []; });
}
function idbPut(item) {
  return openIdb().then(function (d) {
    return new Promise(function (resolve, reject) {
      var tx = d.transaction('outbox', 'readwrite');
      tx.objectStore('outbox').put(item);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
}
function idbDel(id) {
  return openIdb().then(function (d) {
    return new Promise(function (resolve) {
      var tx = d.transaction('outbox', 'readwrite');
      tx.objectStore('outbox').delete(id);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { resolve(); };
    });
  }).catch(function () {});
}

// Une note est d'abord rangée dans l'appareil, puis envoyée. Le serveur reconnaît
// un renvoi grâce au clientId : pas de doublon.
function queueNote(item) {
  item.clientId = item.clientId || uid();
  item.createdAt = item.createdAt || Date.now();
  outbox.push(item);
  render();
  return idbPut(item).catch(function () { /* IndexedDB indisponible : reste en mémoire */ }).then(flushOutbox);
}

var flushing = false;
function flushOutbox() {
  if (flushing || !S.user) return Promise.resolve();
  flushing = true;
  var list = outbox.slice();
  var chain = Promise.resolve();
  list.forEach(function (item) {
    chain = chain.then(function () { return sendItem(item); }).then(function (note) {
      outbox = outbox.filter(function (x) { return x !== item; });
      upsertNote(note);
      return idbDel(item.clientId);
    }, function (err) {
      if (err && !err.network && err.status && err.status < 500) {
        item.error = err.message;
        idbPut(item).catch(function () {});
        toast('Envoi refusé : ' + err.message);
      }
    });
  });
  // Une note envoyée part à l'analyse : on resynchronise vite pour afficher le résultat.
  var done = function () { flushing = false; render(); if (list.length) scheduleSync(); };
  return chain.then(done, done);
}

function sendItem(item) {
  return api('POST', 'notes', { clientId: item.clientId, type: item.type, content: item.content, todos: item.todos, notebookId: item.notebookId, dur: item.dur, createdAt: item.createdAt, enrich: item.enrich, read: item.read ? 'todo' : undefined })
    .then(function (r) {
      var note = r.note;
      if (item.type === 'text' || note.status !== 'uploading') return note;
      var chain = Promise.resolve();
      (item.files || []).forEach(function (f, i) {
        chain = chain.then(function () { return api('POST', 'notes/' + note.id + '/media?kind=original&slot=' + i, f.original); });
        if (f.ai) chain = chain.then(function () { return api('POST', 'notes/' + note.id + '/media?kind=ai', f.ai); });
      });
      return chain.then(function () { return api('POST', 'notes/' + note.id + '/submit', {}); }).then(function (x) { return x.note; });
    });
}

function upsertNote(n) {
  if (!n) return;
  var i = S.notes.findIndex(function (x) { return x.id === n.id; });
  if (i > -1) S.notes[i] = n; else S.notes.push(n);
}

/* ---------- Modifications hors connexion (tâches et propriétés) ---------- */
// Chaque modification est appliquée tout de suite sur l'appareil, rangée dans une file
// (gardée dans le navigateur) puis envoyée dans l'ordre dès que le réseau le permet.
var OPS_KEY = 'mainotes-ops';
var ops = [];
try { ops = JSON.parse(localStorage.getItem(OPS_KEY) || '[]') || []; } catch (e) { ops = []; }
function saveOps() { try { localStorage.setItem(OPS_KEY, JSON.stringify(ops)); } catch (e) { /* stockage indisponible : la file reste en mémoire */ } }
function opApply(op, n) {
  n.todos = n.todos || [];
  if (op.kind === 'note-due') {
    n.due = op.due || null;
  } else if (op.kind === 'todo-add') {
    if (!n.todos.some(function (t) { return t.id === op.tid; })) n.todos.push({ id: op.tid, text: op.text, done: false, due: op.due || null, doneAt: null });
  } else if (op.kind === 'todo-patch') {
    var t = n.todos.filter(function (x) { return x.id === op.tid; })[0];
    if (t) {
      if (op.patch.done !== undefined) { t.done = !!op.patch.done; t.doneAt = t.done ? Date.now() : null; }
      if (op.patch.text !== undefined) t.text = op.patch.text;
      if (op.patch.due !== undefined) t.due = op.patch.due || null;
      if (op.patch.assignee !== undefined) t.assignee = op.patch.assignee || null;
    }
  } else if (op.kind === 'todo-del') {
    n.todos = n.todos.filter(function (x) { return x.id !== op.tid; });
  } else if (op.kind === 'props') {
    n.props = n.props || {}; n.propsAi = n.propsAi || {};
    Object.keys(op.props).forEach(function (k) {
      var v = op.props[k];
      delete n.propsAi[k];
      if (v === null || v === '' || v === false) delete n.props[k]; else n.props[k] = v;
    });
  }
}
function opsApplyAll() { ops.forEach(function (op) { var n = noteById(op.noteId); if (n) opApply(op, n); }); }
function queueOp(op) {
  op.id = uid();
  ops.push(op);
  saveOps();
  var n = noteById(op.noteId);
  if (n) opApply(op, n);
  saveCache();
  if (n && typeof refreshTodos === 'function') refreshTodos(n);
  render();
  flushOps();
}
function sendOp(op) {
  var base = 'notes/' + op.noteId;
  var p = op.kind === 'todo-add' ? api('POST', base + '/todos', { text: op.text, due: op.due, id: op.tid })
    : op.kind === 'todo-patch' ? api('PATCH', base + '/todos/' + op.tid, op.patch)
    : op.kind === 'todo-del' ? api('DELETE', base + '/todos/' + op.tid)
    : op.kind === 'note-due' ? api('PATCH', base, { due: op.due || null })
    : api('PATCH', base, { props: op.props });
  return p.then(function (r) { return r.note; });
}
var opsFlushing = false;
function flushOps() {
  if (opsFlushing || !ops.length || !S.user) return Promise.resolve();
  opsFlushing = true;
  var next = function () {
    if (!ops.length) return Promise.resolve();
    var op = ops[0];
    return sendOp(op).then(function (note) {
      ops.shift(); saveOps();
      upsertNote(note); opsApplyAll(); saveCache(); render();
      return next();
    }, function (err) {
      if (!err || err.network || err.status === 401) return; // réseau absent : on réessaiera
      ops.shift(); saveOps();
      if (err.status !== 404) toast('Modification refusée : ' + err.message);
      return next();
    });
  };
  var done = function () { opsFlushing = false; render(); };
  return next().then(done, done);
}

/* ---------- Synchronisation ---------- */
var syncTimer = null;
function sync() {
  if (!S.user) return Promise.resolve();
  return flushOps().then(function () { return api('GET', 'state', undefined, { timeout: 15000 }); }).then(function (d) {
    S.notebooks = d.notebooks; S.tags = d.tags; S.notes = d.notes; S.settings = d.settings; S.users = d.users || []; S.notify = d.notify || null;
    opsApplyAll();
    S.providers = d.providers; S.retri = d.retri; S.synthesesCount = d.synthesesCount;
    saveCache();
    render();
    if (startAction && S.user) { var t = startAction; startAction = null; openAdd(t); }
    if (typeof onSynced === 'function') onSynced();
  }).catch(function () { render(); }).then(scheduleSync);
}
function scheduleSync() {
  clearTimeout(syncTimer);
  var busy = S.notes.some(function (n) { return n.status === 'queued' || n.status === 'analyzing'; }) || (S.retri && S.retri.status === 'running');
  syncTimer = setTimeout(function () { if (document.visibilityState === 'visible') sync(); else scheduleSync(); }, busy ? 3000 : 20000);
}
document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && S.user) { sync(); flushOutbox(); } });

/* ---------- Démarrage ---------- */
function boot() {
  idbAll().then(function (items) { outbox = items; if (S.user) render(); });
  // Notes déjà chargées sur cet appareil : affichées tout de suite, sans attendre le
  // serveur (réseau absent ou trop lent). Le serveur confirme ensuite la session.
  var c = loadCache();
  var shown = !!(c && c.user);
  if (shown) {
    Object.assign(S, c);
    online = navigator.onLine;
    showApp();
    render();
  }
  api('GET', 'auth/state', undefined, { allow401: true, timeout: 8000 }).then(function (st) {
    if (st.setup) return showAuth('setup', st);
    if (!st.user) return showAuth('login', st);
    S.user = st.user;
    if (!shown) showApp();
    return sync().then(flushOutbox);
  }, function () {
    // Hors connexion : on reste sur les notes déjà chargées, ou on le signale.
    if (shown) { render(); scheduleSync(); } else showAuth('offline');
  });
}

function onLoggedOut(data) {
  if (!S.user) return;
  S.user = null;
  closeModal();
  showAuth(data && data.setup ? 'setup' : 'login', { setupTokenRequired: false });
}

// Lancement par l'icône « Nouvelle note » ou un raccourci : ?action=new[&type=voice|image]
var startAction = (function () {
  var q = new URLSearchParams(location.search);
  if (q.get('action') !== 'new') return null;
  var t = q.get('type');
  return t === 'voice' || t === 'image' ? t : 'text';
})();

function showApp() {
  $('#auth').hidden = true;
  $('#app').hidden = false;
  $('#fab').hidden = false;
  if (startAction) tab = 'home';
  setTab(tab);
  if (startAction && S.settings) { var t = startAction; startAction = null; openAdd(t); }
}

/* Bouton flottant sur grand écran : visible dès que « Nouvelle note » de l'en-tête sort de l'écran. */
(function () {
  var head = document.querySelector('.add-desktop');
  if (!head || !window.IntersectionObserver) { document.body.classList.add('fab-on'); return; }
  new IntersectionObserver(function (entries) {
    document.body.classList.toggle('fab-on', !entries[0].isIntersecting);
  }).observe(head);
})();

/* Installation sur l'appareil (Android, ordinateur) : l'invitation du navigateur est
   gardée pour être lancée depuis Réglages › Installer sur cet appareil. */
var installPrompt = null;
window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installPrompt = e; if (tab === 'set' && typeof renderInstall === 'function') renderInstall(); });
window.addEventListener('appinstalled', function () { installPrompt = null; toast('Application installée'); if (tab === 'set' && typeof renderInstall === 'function') renderInstall(); });
function isInstalled() {
  return !!(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}

/* ---------- Petits outils d'affichage ---------- */
var toastTimer;
// Message bref ; avec undo, un bouton « Annuler » reste quelques secondes de plus.
var toastUndo = null;
function toast(m, undo) {
  var e = $('#toast');
  toastUndo = undo || null;
  e.innerHTML = esc(m) + (undo ? '<button class="toast-undo" data-a="toast-undo">Annuler</button>' : '');
  e.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { e.hidden = true; toastUndo = null; }, undo ? 6000 : 3600);
}
function fmtDate(ts) {
  var d = new Date(ts), n = new Date(), same = function (a, b) { return a.toDateString() === b.toDateString(); };
  var tm = d.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
  if (same(d, n)) return "Aujourd'hui, " + tm;
  if (same(d, new Date(n.getTime() - 864e5))) return 'Hier, ' + tm;
  if (n - d < 6 * 864e5) { var w = d.toLocaleDateString('fr-BE', { weekday: 'long' }); return w.charAt(0).toUpperCase() + w.slice(1); }
  return d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: d.getFullYear() !== n.getFullYear() ? 'numeric' : undefined });
}
function fmtFull(ts) { return new Date(ts).toLocaleString('fr-BE', { dateStyle: 'long', timeStyle: 'short' }); }
function fmtDur(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
function fmtEur(v) { return (v || 0).toLocaleString('fr-BE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: v && v < 0.1 ? 4 : 2 }); }
function plural(n, one, many) { return n + ' ' + (n > 1 ? many : one); }
function fail(err) { toast(err && err.message ? err.message : 'Erreur.'); }
