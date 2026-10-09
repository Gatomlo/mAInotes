/* Vues principales : cartes, filtres, carnets et tags. */
'use strict';

function hl(text, q) {
  text = String(text || '');
  var nq = norm(q).trim();
  if (!nq) return esc(text);
  var nt = norm(text);
  if (nt.length !== text.length) return esc(text);
  var out = '', i = 0, j;
  while ((j = nt.indexOf(nq, i)) > -1) { out += esc(text.slice(i, j)) + '<mark>' + esc(text.slice(j, j + nq.length)) + '</mark>'; i = j + nq.length; }
  return out + esc(text.slice(i));
}
function snippet(c, q) {
  c = String(c || '');
  var nq = norm(q).trim(), nt = norm(c), k = nq && nt.length === c.length ? nt.indexOf(nq) : -1;
  var st = k > 110 ? k - 50 : 0, s = c.slice(st, st + 170);
  return (st ? '…' : '') + s + (st + 170 < c.length ? '…' : '');
}
// Badge de carnet ; sur une carte, le toucher filtre sur ce carnet.
function catChip(n, quick) {
  var c = nb(n.notebookId);
  var q = function (id) { return quick ? ' data-a="qcat" data-id="' + id + '" role="button" tabindex="0" title="Filtrer sur ce carnet"' : ''; };
  var chk = '<span class="chip check"' + q('__none') + '>' + I(IC.help, 14) + 'À vérifier</span>';
  if (c && !n.needsReview) return '<span class="chip cat cat-' + c.color + '"' + q(c.id) + '><i class="dot"></i>' + esc(c.name) + '</span>';
  if (c) return '<span class="chip cat cat-' + c.color + '"' + q(c.id) + '><i class="dot"></i>' + esc(c.name) + '</span>' + chk;
  return chk;
}
function tagChips(n, quick) {
  return n.tagIds.map(function (id) { var t = tagById(id); return t ? '<span class="chip"' + (quick ? ' data-a="qtag" data-id="' + t.id + '" role="button" tabindex="0" title="Filtrer sur ce tag"' : '') + '>#' + esc(t.name) + '</span>' : ''; }).join('');
}
function matchLabel(n, q) {
  var nq = norm(q).trim();
  if (!nq) return '';
  var w = [];
  if (norm(n.title).indexOf(nq) > -1) w.push('le titre');
  if (norm(n.content).indexOf(nq) > -1) w.push(n.type === 'image' ? 'la légende' : 'le texte');
  if (norm(n.transcript).indexOf(nq) > -1) w.push('la transcription');
  if (norm(n.description).indexOf(nq) > -1) w.push("la description de l'image");
  if (norm(linksText(n)).indexOf(nq) > -1) w.push('un lien');
  return w.length ? '<div class="match">' + I(IC.search, 13) + 'Trouvé dans ' + w.join(' et ') + '</div>' : '';
}
function headLine(n) {
  return '<div class="head"><span>' + I(IC[n.type] || IC.text) + TYPE_LABEL[n.type] + (n.type === 'voice' ? ' · ' + fmtDur(n.dur) : '') + '</span><span>' + fmtDate(n.createdAt) + '</span></div>';
}
function thumbHtml(n) {
  if (n.type !== 'image' || !n.media.length) return '';
  return '<div class="thumb"><img alt="" loading="lazy" src="api/media/' + n.id + '/' + n.media[0].id + '?ai=1"></div>';
}
function provLabel(n) {
  var p = n.provider || {}, list = [];
  Object.keys(p).forEach(function (k) { if (p[k] && list.indexOf(PROV[p[k]]) < 0) list.push(PROV[p[k]]); });
  return list.join(', ');
}

function card(n, q) {
  if (n.status === 'queued' || n.status === 'analyzing' || n.status === 'uploading') {
    var what = n.status === 'uploading' ? 'Envoi du fichier' : n.type === 'voice' && !n.transcript ? 'Transcription et classement en cours' : n.type === 'image' && !n.description && !n.content ? 'Description et classement en cours' : 'Classement en cours';
    return '<div class="card busy" aria-busy="true" role="button" tabindex="0" data-a="open" data-id="' + n.id + '">' + headLine(n) + '<div class="ttl">' + esc(n.title) + '</div><div class="bar" style="width:78%"></div><div class="status">' + I(IC.spark) + what + '</div></div>';
  }
  var body = n.type === 'voice' ? (n.transcript || n.content) : n.type === 'image' ? [n.content, n.description].filter(Boolean).join(' — ') : n.content;
  var ex = body ? (norm(q).trim() ? hl(snippet(body, q), q) : linkify(snippet(body, ''))) : '<span class="muted">' + (n.type === 'voice' ? 'Pas encore transcrite.' : n.type === 'image' ? 'Pas encore décrite.' : '') + '</span>';
  var foot;
  if (n.status === 'pending' || n.status === 'error') {
    var lbl = n.status === 'error' ? '<span class="chip err">Erreur d\'analyse</span>' : n.pendingReason === 'budget' ? '<span class="chip check">Plafond atteint</span>' : n.pendingReason === 'quota' ? '<span class="chip check">Quota atteint</span>' : '<span class="chip check">À analyser</span>';
    foot = (n.notebookId ? catChip(n, true) : '') + lbl + '<button class="btn" style="height:44px;margin-left:auto;padding:0 14px" data-a="analyze" data-id="' + n.id + '">' + I(IC.spark, 16) + (n.status === 'error' ? 'Relancer' : 'Analyser') + '</button>';
  } else {
    var tags = tagChips(n, true);
    var end = (n.locked ? '<span aria-label="Classement verrouillé" role="img">' + I(IC.lock, 16) + '</span>' : '') + (n.ai && !n.locked && n.notebookId ? '<span aria-label="Classé par l\'IA" role="img" title="Classé par l\'IA (' + esc(provLabel(n)) + ')">' + I(IC.spark, 16) + '</span>' : '');
    foot = (n.type === 'synthesis' ? '<span class="chip">Synthèse</span>' : catChip(n, true)) + tags + (n.enrichment ? '<span class="chip wait" title="Pistes complémentaires">' + I(IC.spark, 12) + 'Pistes</span>' : '') + (end ? '<span class="end">' + end + '</span>' : '');
  }
  return '<div class="card" role="button" tabindex="0" data-a="open" data-id="' + n.id + '" aria-label="Ouvrir : ' + esc(n.title) + '">' + thumbHtml(n) + headLine(n) +
    '<div class="ttl">' + hl(n.title, q) + '</div><div class="exc">' + ex + '</div>' + (n.links && n.links.length ? linkCard(n.links[0], true) + (n.links.length > 1 ? '<div class="muted" style="font-size:13px">+ ' + plural(n.links.length - 1, 'autre lien', 'autres liens') + '</div>' : '') : '') + matchLabel(n, q) + '<div class="foot">' + foot + '</div></div>';
}

function outboxCard(item) {
  return '<div class="card outbox">' + '<div class="head"><span>' + I(IC[item.type]) + TYPE_LABEL[item.type] + (item.type === 'voice' ? ' · ' + fmtDur(item.dur) : '') + '</span><span>' + fmtDate(item.createdAt) + '</span></div>' +
    '<div class="ttl">' + esc(item.content ? snippet(item.content, '') : TYPE_LABEL[item.type]) + '</div>' +
    '<div class="foot"><span class="chip wait">' + I(IC.cloud, 14) + (item.error ? 'Refusée : ' + esc(item.error) : 'Enregistrée sur l\'appareil, envoi au retour du réseau') + '</span>' +
    (item.error ? '<button class="btn danger" style="height:44px;margin-left:auto" data-a="outbox-del" data-id="' + item.clientId + '">Supprimer</button>' : '') + '</div></div>';
}

// Vue liste : une note par ligne (titre, date de création, carnet, tags).
function listRow(n, q) {
  var busy = n.status === 'queued' || n.status === 'analyzing' || n.status === 'uploading';
  var state = busy ? '<span class="chip wait">' + I(IC.spark, 12) + 'Analyse</span>' : n.status === 'error' ? '<span class="chip err">Erreur</span>' : n.status === 'pending' ? '<span class="chip check">À analyser</span>' : '';
  var tags = tagChips(n, true);
  var d = new Date(n.createdAt);
  return '<div class="lrow" role="button" tabindex="0" data-a="open" data-id="' + n.id + '" aria-label="Ouvrir : ' + esc(n.title) + '">' +
    '<span class="lt">' + I(IC[n.type] || IC.text, 16) + '<span>' + hl(n.title, q) + '</span>' + (n.enrichment ? I(IC.spark, 13) : '') + '</span>' +
    '<span class="ld" title="' + esc(fmtFull(n.createdAt)) + '">' + d.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' }) + '</span>' +
    '<span class="lc">' + (n.type === 'synthesis' ? '<span class="chip">Synthèse</span>' : catChip(n, true)) + tags + state + '</span></div>';
}

function live() { return S.notes.filter(function (n) { return !n.trashedAt; }); }

// Notes visibles pour un jeu de filtres (par défaut, ceux de l'écran).
function filtered(f) {
  f = f || F;
  var nq = norm(f.q).trim();
  var range = dateRange(f);
  return live().filter(function (n) {
    if (range && (n.createdAt < range[0] || n.createdAt > range[1])) return false;
    var busy = n.status === 'queued' || n.status === 'analyzing' || n.status === 'uploading';
    if (busy) return !f.cat && !f.tags.length && !nq;
    if (f.cat === '__none') { if (n.notebookId && !n.needsReview) return false; if (n.type === 'synthesis') return false; }
    else if (f.cat && n.notebookId !== f.cat) return false;
    if (f.tags.length) {
      var hit = f.tags.filter(function (t) { return n.tagIds.indexOf(t) > -1; }).length;
      if (f.tagMode === 'any' ? !hit : hit < f.tags.length) return false;
    }
    if (nq && norm(n.title).indexOf(nq) < 0 && norm(noteText(n)).indexOf(nq) < 0) return false;
    return true;
  }).sort(function (a, b) { return b.createdAt - a.createdAt; });
}
function filterCount() { return (F.cat ? 1 : 0) + F.tags.length + (dateRange() ? 1 : 0); }

/* ---------- Panneau de filtres : carnet, tags, date ---------- */
// Même contenu dans la fenêtre du bas (téléphone) et dans la colonne latérale (grand écran).
var FP = { q: '', allCats: false, allTags: false };
var FP_MAX_CATS = 8, FP_MAX_TAGS = 12;
function fpanelShell(inSheet) {
  return '<div class="fp-search search"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC.search + '</svg>' +
    '<input class="fpq" type="search" autocomplete="off" aria-label="Chercher un carnet ou un tag" placeholder="Chercher un carnet ou un tag" value="' + esc(FP.q) + '"></div>' +
    '<div class="fp-lists"></div>' +
    '<div class="fp-sec"><label class="l" for="fperiod">Date de création</label>' +
    '<select id="fperiod" class="field">' + PERIODS.map(function (p) { return '<option value="' + p[0] + '">' + p[1] + '</option>'; }).join('') + '</select>' +
    '<div id="fcustom" class="period" hidden><label for="ffrom">du</label><input id="ffrom" type="date" class="field"><label for="fto">au</label><input id="fto" type="date" class="field"></div></div>' +
    (inSheet ? '<div class="fp-foot"><button class="btn" data-a="clearf">Effacer</button><button class="btn primary" data-a="close" id="fpgo"></button></div>' : '');
}
function fpanelRoot() {
  if (modal === 'filters') return $('#sheet');
  var side = $('#fside');
  return side && side.offsetParent !== null ? side : null;
}
function renderFilterPanel() {
  var root = fpanelRoot();
  if (!root) return;
  if (!$('.fp-lists', root)) root.innerHTML = (root.id === 'sheet' ? '<div class="grab"></div>' + shead('Filtres') : '<h2 class="fp-title">Filtres</h2>') + fpanelShell(root.id === 'sheet');
  var nq = norm(FP.q).trim(), match = function (name) { return !nq || norm(name).indexOf(nq) > -1; };
  var base = Object.assign({}, F, { cat: null });
  var all = filtered(base);
  var countIn = function (list, pred) { return list.filter(pred).length; };

  // Carnets : un seul à la fois. Ordre stable (les plus remplis d'abord) pour que la liste ne saute pas au toucher ;
  // le compteur, lui, tient compte des tags, de la date et de la recherche.
  var total = function (pred) { return countIn(live(), pred); };
  var cats = S.notebooks.map(function (c) { var p = function (n) { return n.notebookId === c.id; }; return { c: c, k: countIn(all, p), t: total(p) }; })
    .filter(function (x) { return match(x.c.name); })
    .sort(function (a, b) { return b.t - a.t || a.c.name.localeCompare(b.c.name, 'fr'); });
  var nCats = cats.length;
  if (!FP.allCats && !nq) cats = cats.filter(function (x, i) { return i < FP_MAX_CATS || x.c.id === F.cat; });
  var none = countIn(all, function (n) { return n.type !== 'synthesis' && n.status === 'ready' && (!n.notebookId || n.needsReview); });
  var radio = function (id, label, k, cls, on) {
    return '<button class="fp-row' + (cls ? ' ' + cls : '') + (k ? '' : ' zero') + '" role="radio" data-a="fcat" data-id="' + id + '" aria-checked="' + on + '"><i class="rd"></i>' + label + '<small>' + k + '</small></button>';
  };
  var h = '<div class="fp-sec"><div class="l">Carnet</div><div class="fp-list" role="radiogroup" aria-label="Carnet">';
  if (!nq) h += radio('', 'Tous les carnets', all.length, '', !F.cat);
  cats.forEach(function (x) { h += radio(x.c.id, '<i class="dot"></i><span>' + esc(x.c.name) + '</span>', x.k, 'cat-' + x.c.color, F.cat === x.c.id); });
  if ((none || F.cat === '__none') && match('à vérifier')) h += radio('__none', I(IC.help, 14) + '<span>À vérifier</span>', none, '', F.cat === '__none');
  if (!nCats && nq) h += '<p class="sub">Aucun carnet ne correspond.</p>';
  h += '</div>';
  if (!nq && nCats > FP_MAX_CATS) h += '<button class="linkbtn" data-a="fp-more" data-id="cats">' + (FP.allCats ? 'Moins de carnets' : 'Voir tous les carnets (' + nCats + ')') + '</button>';
  h += '</div>';

  // Tags : plusieurs à la fois. Compteur = notes affichées si on ajoute ce tag ; les tags sans note sont masqués.
  var tbase = Object.assign({}, F, { tags: F.tagMode === 'any' ? [] : F.tags });
  var shown = filtered(tbase);
  var tags = S.tags.map(function (t) { var p = function (n) { return n.tagIds.indexOf(t.id) > -1; }; return { t: t, k: countIn(shown, p), u: total(p), on: F.tags.indexOf(t.id) > -1 }; })
    .filter(function (x) { return (x.on || x.k) && match(x.t.name); })
    .sort(function (a, b) { return b.u - a.u || a.t.name.localeCompare(b.t.name, 'fr'); });
  var nTags = tags.length;
  if (!FP.allTags && !nq) tags = tags.filter(function (x, i) { return i < FP_MAX_TAGS || x.on; });
  h += '<div class="fp-sec"><div class="fp-head"><div class="l">Tags</div>' + (F.tags.length > 1 ? '<div class="modes small" role="group" aria-label="Combinaison des tags"><button data-a="ftagmode" data-id="all" aria-pressed="' + (F.tagMode !== 'any') + '">Tous</button><button data-a="ftagmode" data-id="any" aria-pressed="' + (F.tagMode === 'any') + '">Au moins un</button></div>' : '') + '</div>';
  h += '<div class="fp-tags" role="group" aria-label="Tags">' + (tags.map(function (x) {
    return '<button class="fchip tag" data-a="ftag" data-id="' + x.t.id + '" aria-pressed="' + x.on + '">#' + esc(x.t.name) + ' <small>' + x.k + '</small></button>';
  }).join('') || '<p class="sub">' + (nq ? 'Aucun tag ne correspond.' : S.tags.length ? 'Aucun tag dans les notes affichées.' : 'Aucun tag pour l\'instant.') + '</p>') + '</div>';
  if (!nq && nTags > tags.length) h += '<button class="linkbtn" data-a="fp-more" data-id="tags">Voir tous les tags (' + nTags + ')</button>';
  else if (!nq && FP.allTags && nTags > FP_MAX_TAGS) h += '<button class="linkbtn" data-a="fp-more" data-id="tags">Moins de tags</button>';
  h += '</div>';
  $('.fp-lists', root).innerHTML = h;

  var per = $('#fperiod', root);
  if (per) { per.value = F.period; $('#fcustom', root).hidden = F.period !== 'custom'; if (document.activeElement !== $('#ffrom', root)) $('#ffrom', root).value = F.from; if (document.activeElement !== $('#fto', root)) $('#fto', root).value = F.to; }
  var go = $('#fpgo', root);
  if (go) go.textContent = 'Voir ' + plural(filtered().length, 'note', 'notes');
}
function openFilters() {
  FP.q = '';
  modal = 'filters';
  openSheet('', 'Filtres');
  $('#sheet').innerHTML = '';
  renderFilterPanel();
}

// La colonne latérale apparaît ou disparaît avec la largeur de l'écran.
if (window.matchMedia) {
  var wideMq = window.matchMedia('(min-width:1024px)');
  var onWide = function () { if (S.user && S.settings) renderFilterPanel(); };
  if (wideMq.addEventListener) wideMq.addEventListener('change', onWide); else if (wideMq.addListener) wideMq.addListener(onWide);
}

// Filtres actifs sous la recherche, chacun retirable d'un geste.
function renderActive() {
  var h = '';
  var x = function (k, id, label, cls) { return '<button class="achip' + (cls ? ' ' + cls : '') + '" data-a="frm" data-k="' + k + '" data-id="' + (id || '') + '" aria-label="Retirer le filtre ' + esc(label.replace(/<[^>]+>/g, '')) + '">' + label + I(IC.x, 14) + '</button>'; };
  if (F.cat === '__none') h += x('cat', '', 'À vérifier');
  else if (F.cat && nb(F.cat)) h += x('cat', '', '<i class="dot"></i>' + esc(nb(F.cat).name), 'cat-' + nb(F.cat).color);
  F.tags.forEach(function (id, i) { var t = tagById(id); if (t) h += (i && F.tagMode === 'any' ? '<span class="aor">ou</span>' : '') + x('tag', id, '#' + esc(t.name)); });
  if (dateRange()) h += x('period', '', esc(periodLabel()));
  if (filterCount() > 1) h += '<button class="linkbtn" data-a="clearf">Tout effacer</button>';
  $('#actchips').innerHTML = h;
  $('#actchips').hidden = !h;
}

function render() {
  if (!S.user || !S.settings) return;
  var all = live();
  $('#count').textContent = plural(all.length, 'note', 'notes') + (S.user.name ? ' · ' + S.user.name : '');
  renderBanners();
  renderHome();
  if (tab === 'cats') renderCats();
  if (tab === 'set' && typeof renderSet === 'function' && !setDirty) renderSet();
  if (tab === 'account' && typeof renderAccount === 'function' && !accountLoaded) renderAccount();
}

function renderBanners() {
  var el = $('#banners');
  if (!el || !S.settings) return;
  var h = '';
  if (!online) h += '<div class="banner warn" role="status">' + I(IC.cloud, 18) + '<span>Hors connexion : les nouvelles notes restent sur cet appareil et partiront au retour du réseau.</span></div>';
  if (outbox.length) h += '<div class="banner info"><span>' + plural(outbox.length, 'note en attente d\'envoi', 'notes en attente d\'envoi') + '</span>' + (online ? '<button data-a="flush">Envoyer maintenant</button>' : '') + '</div>';
  (S.providers || []).forEach(function (p) {
    if (p.quota && p.quota.lastQuota) h += '<div class="banner warn">' + esc(p.quota.lastQuota.message.replace(/ Nouvel essai.*$/, '')) + ' Les notes attendent ; nouvel essai à ' + new Date(p.quota.lastQuota.retryAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) + '.<button data-a="tab" data-id="set">Réglages</button></div>';
    if (p.budget && p.budget.blocked) h += '<div class="banner warn">Plafond mensuel atteint pour ' + esc(p.label) + ' (' + fmtEur(p.budget.used) + ' sur ' + fmtEur(p.budget.cap) + ') : les analyses sont mises en attente.<button data-a="tab" data-id="set">Réglages</button></div>';
    else if (p.budget && p.budget.alert) h += '<div class="banner warn">' + esc(p.label) + ' : ' + Math.round(p.budget.ratio * 100) + ' % du plafond mensuel consommé (' + fmtEur(p.budget.used) + ' sur ' + fmtEur(p.budget.cap) + ').</div>';
  });
  var main = (S.providers || []).filter(function (p) { return p.id === S.settings.providers.classif; })[0];
  if (main && (!main.hasKey || !main.enabled)) h += '<div class="banner info">' + I(IC.spark, 18) + '<span>L\'IA n\'est pas encore configurée : les notes sont enregistrées mais pas analysées.</span><button data-a="tab" data-id="set">Configurer</button></div>';
  el.innerHTML = h;
}

function renderHome() {
  // Des filtres pointant vers un carnet ou un tag supprimé ne doivent pas vider l'écran.
  if (F.cat && F.cat !== '__none' && !nb(F.cat)) F.cat = null;
  F.tags = F.tags.filter(function (id) { return tagById(id); });
  var list = filtered(), active = F.cat || F.tags.length || F.q.trim() || dateRange();
  var nf = filterCount();
  $('#fbadge').textContent = nf || '';
  $('#fbadge').hidden = !nf;
  $('#fbtn').setAttribute('aria-label', 'Filtres' + (nf ? ' (' + nf + ' actif' + (nf > 1 ? 's' : '') + ')' : ''));
  renderActive();
  renderFilterPanel();
  $$('[data-a="view"]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === VIEW)); });
  $('#resinfo').textContent = active ? plural(list.length, 'note', 'notes') + ' sur ' + live().length : plural(live().length, 'note', 'notes');
  $('#qclear').hidden = !F.q;
  var trashed = S.notes.filter(function (n) { return n.trashedAt; }).length;
  $('#trashbtn').hidden = !trashed;
  $('#trashbtn').innerHTML = I('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 18) + 'Corbeille (' + trashed + ')';
  $('#synthhist').innerHTML = I(IC.synthesis, 18) + 'Historique des synthèses' + (S.synthesesCount ? ' (' + S.synthesesCount + ')' : '');
  var nready = list.filter(function (n) { return n.status === 'ready' && n.type !== 'synthesis'; }).length;
  $('#synth').hidden = !nready;
  $('#synth').innerHTML = I(IC.synthesis, 16) + 'Synthèse des ' + plural(nready, 'note', 'notes');
  var pend = live().filter(function (n) { return n.status === 'pending' || n.status === 'error'; });
  var calls = pend.reduce(function (a, n) { return a + 1 + ((n.type === 'voice' && !n.transcript) || (n.type === 'image' && !n.description && !n.content) ? 1 : 0); }, 0);
  $('#pendbar').innerHTML = pend.length ? '<div class="pendbar"><span>' + plural(pend.length, 'note à analyser', 'notes à analyser') + '</span><button class="btn primary" style="height:44px" data-a="analyze-all">Tout analyser · ≈ ' + plural(calls, 'appel', 'appels') + '</button></div>' : '';
  var showOutbox = !active ? outbox.map(outboxCard).join('') : '';
  $('#grid').className = VIEW === 'list' ? 'rows' : 'grid';
  $('#grid').innerHTML = showOutbox + (list.length ? list.map(function (n) { return VIEW === 'list' ? listRow(n, F.q) : card(n, F.q); }).join('') :
    (showOutbox ? '' : '<div class="empty"><h3>' + (active ? 'Aucune note ne correspond' : 'Aucune note pour l\'instant') + '</h3><p>' + (active ? 'Essayez un autre mot ou retirez un filtre.' : 'Ajoutez un texte, un vocal ou une image : le classement se fait tout seul.') + '</p></div>'));
}

function renderCats() {
  var st = S.settings;
  var def = '<option value="">Choisi par l\'IA (aucun défaut)</option>' + S.notebooks.map(function (c) { return '<option value="' + c.id + '"' + (st.defaultNotebook === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
  var rows = S.notebooks.map(function (c) {
    var k = live().filter(function (n) { return n.notebookId === c.id; }).length;
    return '<button class="row cat-' + c.color + '" data-a="cat-edit" data-id="' + c.id + '"><i class="dot"></i><span class="rt"><b>' + esc(c.name) + (st.defaultNotebook === c.id ? ' <small>· par défaut</small>' : '') + '</b><span>' + (c.needsDesc || !c.desc ? '<em>Description à compléter pour guider le classement.</em>' : esc(c.desc)) + '</span></span><span class="n">' + k + '</span></button>';
  }).join('') || '<div class="empty">Aucun carnet.</div>';
  var tags = S.tags.map(function (t) {
    var k = live().filter(function (n) { return n.tagIds.indexOf(t.id) > -1; }).length;
    return '<button class="chip" data-a="tag-edit" data-id="' + t.id + '" style="height:44px;font-size:14px">#' + esc(t.name) + ' · ' + k + '</button>';
  }).join('');
  var r = S.retri;
  var retriInfo = r ? (r.status === 'running' ? 'Re-tri en cours : ' + r.done + ' / ' + r.total + ' notes examinées.' : 'Dernier re-tri le ' + fmtFull(r.date) + ' : ' + plural(r.items.length, 'note déplacée', 'notes déplacées') + '.') : '';
  $('#view-cats').innerHTML =
    '<div class="sec"><h2>Carnets</h2><button class="btn primary" data-a="cat-new">Nouveau carnet</button></div>' +
    '<form class="panel" id="ctxform"><h3>Description de votre carnet de notes</h3>' +
    '<p class="sub" style="margin:0">Qui vous êtes, à quoi servent vos notes, vos sujets du moment. L\'IA la lit à chaque classement pour choisir le bon carnet.</p>' +
    '<textarea id="ctx" class="field" rows="4" maxlength="1500" placeholder="ex. Enseignante en sciences, je note des idées de cours, des lectures sur l\'IA en éducation et les tâches du ranch (chevaux, travaux, factures).">' + esc(st.context || '') + '</textarea>' +
    '<div class="help"><span>Restez bref : quelques phrases suffisent, et chaque mot est envoyé à chaque classement.</span></div>' +
    '<div class="actions"><button type="submit" class="btn primary">Enregistrer la description</button></div></form>' +
    '<p class="sub">Chaque carnet a aussi sa propre description (« Ce qu\'il doit contenir ») : touchez un carnet pour la compléter. Une note n\'appartient qu\'à un seul carnet.</p>' +
    '<div style="margin-top:12px"><label class="l" for="defcat">Carnet par défaut des nouvelles notes</label><select id="defcat" class="field" data-set="defaultNotebook">' + def + '</select><div class="help"><span>Modifiable note par note à la création. Un carnet choisi à la création n\'est jamais changé par l\'IA.</span></div></div>' +
    '<div class="list">' + rows + '</div>' +
    '<div class="sec"><h2>Tags</h2></div>' +
    '<div class="chips tags" style="flex-wrap:wrap;overflow:visible">' + tags + '</div>' +
    '<form class="tagform" id="tagform" autocomplete="off"><label for="newtag" class="l" style="width:100%;margin:0">Nouveau tag</label><input id="newtag" placeholder="ex. voyage" maxlength="30"><button type="submit" class="btn primary">Ajouter</button></form>' +
    '<div class="sec"><h2>Fusion et re-tri</h2></div>' +
    '<div class="actions" style="margin-top:12px"><button class="btn" data-a="merge-open" data-id="notebook">Fusionner des carnets</button><button class="btn" data-a="merge-open" data-id="tag">Fusionner des tags</button><button class="btn" data-a="retri-open">' + I(IC.spark, 16) + 'Relancer le tri</button></div>' +
    (retriInfo ? '<p class="help"><span>' + esc(retriInfo) + '</span>' + (r && r.items.length ? ' <button class="linkbtn" data-a="retri-recap">Voir le récapitulatif</button>' : '') + '</p>' : '') +
    '<p class="help"><span>Renommer, supprimer et fusionner n\'appellent jamais l\'IA. Seul le re-tri, lancé par vous, le fait.</span></p>';
}

function setTab(t) {
  tab = t;
  $('#fab').hidden = t !== 'home';
  $('#menubtn').hidden = t !== 'home';
  closeMenu();
  ['home', 'cats', 'set', 'account'].forEach(function (k) {
    $('#view-' + k).hidden = k !== t;
    $('#tab-' + k).setAttribute('aria-selected', String(k === t));
  });
  if (t === 'cats') renderCats();
  if (t === 'set') { setDirty = false; renderSet(); }
  if (t === 'account') { accountLoaded = false; renderAccount(); }
}
