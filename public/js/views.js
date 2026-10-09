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
function catChip(n) {
  var c = nb(n.notebookId);
  if (c && !n.needsReview) return '<span class="chip cat cat-' + c.color + '"><i class="dot"></i>' + esc(c.name) + '</span>';
  if (c) return '<span class="chip cat cat-' + c.color + '"><i class="dot"></i>' + esc(c.name) + '</span><span class="chip check">' + I(IC.help, 14) + 'À vérifier</span>';
  return '<span class="chip check">' + I(IC.help, 14) + 'À vérifier</span>';
}
function matchLabel(n, q) {
  var nq = norm(q).trim();
  if (!nq) return '';
  var w = [];
  if (norm(n.title).indexOf(nq) > -1) w.push('le titre');
  if (norm(n.content).indexOf(nq) > -1) w.push(n.type === 'image' ? 'la légende' : 'le texte');
  if (norm(n.transcript).indexOf(nq) > -1) w.push('la transcription');
  if (norm(n.description).indexOf(nq) > -1) w.push("la description de l'image");
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
  var ex = body ? hl(snippet(body, q), q) : '<span class="muted">' + (n.type === 'voice' ? 'Pas encore transcrite.' : n.type === 'image' ? 'Pas encore décrite.' : '') + '</span>';
  var foot;
  if (n.status === 'pending' || n.status === 'error') {
    var lbl = n.status === 'error' ? '<span class="chip err">Erreur d\'analyse</span>' : n.pendingReason === 'budget' ? '<span class="chip check">Plafond atteint</span>' : '<span class="chip check">À analyser</span>';
    foot = (n.notebookId ? catChip(n) : '') + lbl + '<button class="btn" style="height:44px;margin-left:auto;padding:0 14px" data-a="analyze" data-id="' + n.id + '">' + I(IC.spark, 16) + (n.status === 'error' ? 'Relancer' : 'Analyser') + '</button>';
  } else {
    var tags = n.tagIds.map(function (id) { var t = tagById(id); return t ? '<span class="chip">#' + esc(t.name) + '</span>' : ''; }).join('');
    var end = (n.locked ? '<span aria-label="Classement verrouillé" role="img">' + I(IC.lock, 16) + '</span>' : '') + (n.ai && !n.locked && n.notebookId ? '<span aria-label="Classé par l\'IA" role="img" title="Classé par l\'IA (' + esc(provLabel(n)) + ')">' + I(IC.spark, 16) + '</span>' : '');
    foot = (n.type === 'synthesis' ? '<span class="chip">Synthèse</span>' : catChip(n)) + tags + (end ? '<span class="end">' + end + '</span>' : '');
  }
  return '<div class="card" role="button" tabindex="0" data-a="open" data-id="' + n.id + '" aria-label="Ouvrir : ' + esc(n.title) + '">' + thumbHtml(n) + headLine(n) +
    '<div class="ttl">' + hl(n.title, q) + '</div><div class="exc">' + ex + '</div>' + matchLabel(n, q) + '<div class="foot">' + foot + '</div></div>';
}

function outboxCard(item) {
  return '<div class="card outbox">' + '<div class="head"><span>' + I(IC[item.type]) + TYPE_LABEL[item.type] + (item.type === 'voice' ? ' · ' + fmtDur(item.dur) : '') + '</span><span>' + fmtDate(item.createdAt) + '</span></div>' +
    '<div class="ttl">' + esc(item.content ? snippet(item.content, '') : TYPE_LABEL[item.type]) + '</div>' +
    '<div class="foot"><span class="chip wait">' + I(IC.cloud, 14) + (item.error ? 'Refusée : ' + esc(item.error) : 'Enregistrée sur l\'appareil, envoi au retour du réseau') + '</span>' +
    (item.error ? '<button class="btn danger" style="height:44px;margin-left:auto" data-a="outbox-del" data-id="' + item.clientId + '">Supprimer</button>' : '') + '</div></div>';
}

function live() { return S.notes.filter(function (n) { return !n.trashedAt; }); }

function filtered() {
  var nq = norm(F.q).trim();
  return live().filter(function (n) {
    var busy = n.status === 'queued' || n.status === 'analyzing' || n.status === 'uploading';
    if (busy) return !F.cat && !F.tags.length && !nq;
    if (F.cat === '__none') { if (n.notebookId && !n.needsReview) return false; if (n.type === 'synthesis') return false; }
    else if (F.cat && n.notebookId !== F.cat) return false;
    for (var i = 0; i < F.tags.length; i++) { if (n.tagIds.indexOf(F.tags[i]) < 0) return false; }
    if (nq && norm(n.title).indexOf(nq) < 0 && norm(noteText(n)).indexOf(nq) < 0) return false;
    return true;
  }).sort(function (a, b) { return b.createdAt - a.createdAt; });
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
    if (p.budget && p.budget.blocked) h += '<div class="banner warn">Plafond mensuel atteint pour ' + esc(p.label) + ' (' + fmtEur(p.budget.used) + ' sur ' + fmtEur(p.budget.cap) + ') : les analyses sont mises en attente.<button data-a="tab" data-id="set">Réglages</button></div>';
    else if (p.budget && p.budget.alert) h += '<div class="banner warn">' + esc(p.label) + ' : ' + Math.round(p.budget.ratio * 100) + ' % du plafond mensuel consommé (' + fmtEur(p.budget.used) + ' sur ' + fmtEur(p.budget.cap) + ').</div>';
  });
  var main = (S.providers || []).filter(function (p) { return p.id === S.settings.providers.classif; })[0];
  if (main && (!main.hasKey || !main.enabled)) h += '<div class="banner info">' + I(IC.spark, 18) + '<span>L\'IA n\'est pas encore configurée : les notes sont enregistrées mais pas analysées.</span><button data-a="tab" data-id="set">Configurer</button></div>';
  el.innerHTML = h;
}

function renderHome() {
  var ready = live().filter(function (n) { return n.status === 'ready' && n.type !== 'synthesis'; });
  var none = live().filter(function (n) { return n.type !== 'synthesis' && n.status === 'ready' && (!n.notebookId || n.needsReview); }).length;
  var ch = '<button class="fchip" data-a="fcat" data-id="" aria-pressed="' + (!F.cat) + '">Toutes <small>' + live().length + '</small></button>';
  S.notebooks.forEach(function (c) {
    var k = live().filter(function (n) { return n.notebookId === c.id; }).length;
    ch += '<button class="fchip cat-' + c.color + '" data-a="fcat" data-id="' + c.id + '" aria-pressed="' + (F.cat === c.id) + '"><i class="dot"></i>' + esc(c.name) + ' <small>' + k + '</small></button>';
  });
  if (none || F.cat === '__none') ch += '<button class="fchip" data-a="fcat" data-id="__none" aria-pressed="' + (F.cat === '__none') + '">' + I(IC.help, 14) + 'À vérifier <small>' + none + '</small></button>';
  $('#catchips').innerHTML = ch;
  var th = '<span class="fchip tag label">Tags</span>';
  S.tags.forEach(function (t) {
    var k = live().filter(function (n) { return n.tagIds.indexOf(t.id) > -1; }).length;
    th += '<button class="fchip tag" data-a="ftag" data-id="' + t.id + '" aria-pressed="' + (F.tags.indexOf(t.id) > -1) + '">#' + esc(t.name) + ' <small>' + k + '</small></button>';
  });
  $('#tagchips').innerHTML = th;
  var list = filtered(), active = F.cat || F.tags.length || F.q.trim();
  $('#resinfo').textContent = active ? plural(list.length, 'note', 'notes') + ' sur ' + live().length : '';
  $('#clearf').hidden = !active;
  $('#qclear').hidden = !F.q;
  var trashed = S.notes.filter(function (n) { return n.trashedAt; }).length;
  $('#trashbtn').hidden = !trashed;
  $('#trashbtn').textContent = 'Corbeille (' + trashed + ')';
  $('#synthhist').textContent = 'Historique' + (S.synthesesCount ? ' (' + S.synthesesCount + ')' : '');
  var nready = list.filter(function (n) { return n.status === 'ready' && n.type !== 'synthesis'; }).length;
  $('#synth').hidden = !nready;
  $('#synth').innerHTML = I(IC.synthesis, 16) + 'Synthèse des ' + plural(nready, 'note', 'notes');
  var pend = live().filter(function (n) { return n.status === 'pending' || n.status === 'error'; });
  var calls = pend.reduce(function (a, n) { return a + 1 + ((n.type === 'voice' && !n.transcript) || (n.type === 'image' && !n.description && !n.content) ? 1 : 0); }, 0);
  $('#pendbar').innerHTML = pend.length ? '<div class="pendbar"><span>' + plural(pend.length, 'note à analyser', 'notes à analyser') + '</span><button class="btn primary" style="height:44px" data-a="analyze-all">Tout analyser · ≈ ' + plural(calls, 'appel', 'appels') + '</button></div>' : '';
  var showOutbox = !active ? outbox.map(outboxCard).join('') : '';
  $('#grid').innerHTML = showOutbox + (list.length ? list.map(function (n) { return card(n, F.q); }).join('') :
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
    '<p class="sub">Chaque description guide le classement automatique. Une note n\'appartient qu\'à un seul carnet.</p>' +
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
  ['home', 'cats', 'set', 'account'].forEach(function (k) {
    $('#view-' + k).hidden = k !== t;
    $('#tab-' + k).setAttribute('aria-selected', String(k === t));
  });
  if (t === 'cats') renderCats();
  if (t === 'set') { setDirty = false; renderSet(); }
  if (t === 'account') { accountLoaded = false; renderAccount(); }
}
