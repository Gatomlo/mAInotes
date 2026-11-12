/* Fenêtres : ajout de note, détail, carnets, tags, fusion, re-tri, synthèse, historique, corbeille. */
'use strict';

var modal = null, timers = {};
function openSheet(html, label) {
  $('#sheet').innerHTML = '<div class="grab"></div>' + html;
  $('#sheet').setAttribute('aria-label', label || 'Fenêtre');
  $('#ov').hidden = false;
  document.body.style.overflow = 'hidden';
  $('#sheet').scrollTop = 0;
  var f = $('#sheet [autofocus]');
  if (f) f.focus({ preventScroll: true }); // la fenêtre s'ouvre en haut (titre, image)
}
function closeModal() {
  stopRecording(true);
  Object.keys(timers).forEach(function (k) { clearInterval(timers[k]); clearTimeout(timers[k]); });
  timers = {};
  modal = null;
  $('#ov').hidden = true;
  document.body.style.overflow = '';
  $('#sheet').innerHTML = '';
}
var TRASH = '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>';
function xbtn() { return '<button class="iconbtn" data-a="close" aria-label="Fermer">' + I(IC.x, 22) + '</button>'; }
function shead(t) { return '<div class="shead"><h2>' + t + '</h2>' + xbtn() + '</div>'; }

/* Image en plein écran (original) ; un toucher ou Échap referme. */
function openZoom(src) {
  var lb = $('#lb');
  $('img', lb).src = src;
  lb.hidden = false;
  $('.lb-close', lb).focus();
}
function closeZoom() { var lb = $('#lb'); lb.hidden = true; $('img', lb).removeAttribute('src'); }

/* ---------- Ajout d'une note ---------- */
var add = null;
// Modèles de notes : texte de départ, tâches initiales et, pour la fiche livre, « à lire ».
var TEMPLATES = [
  { id: 'cr', name: 'Compte rendu', text: 'Compte rendu\n\nDate :\nParticipants :\n\nDécisions :\n- \n\nÀ suivre :\n- ' },
  { id: 'courses', name: 'Liste de courses', text: 'Liste de courses', todos: ['Pain', 'Lait', 'Fruits et légumes'] },
  { id: 'livre', name: 'Fiche livre', text: 'Titre :\nAuteur :\nPourquoi je veux le lire :\n', read: 'todo' },
  { id: 'projet', name: 'Projet', text: 'Projet\n\nObjectif :\nÉchéance :\nÉtapes :', todos: ['Définir les étapes', 'Fixer une échéance'] }
];
function openAdd(t) {
  add = { tab: t || 'text', read: null, enrich: S.settings.trigger.enrich === 'auto', notebookId: S.settings.defaultNotebook || '', text: '', caption: '', rec: null, audio: null, images: [] };
  modal = 'add';
  renderAdd();
}
function renderAdd() {
  var st = S.settings;
  // Les deux autres formats, en boutons ronds sur la dernière ligne, sous le pouce.
  var other = function (k, l) { return '<button type="button" class="rbtn" data-a="addtab" data-id="' + k + '" aria-label="' + l + '" title="' + l + '">' + I(IC[k], 24) + '</button>'; };
  var modes = (add.tab !== 'text' ? other('text', 'Écrire une note') : '') + (add.tab !== 'voice' ? other('voice', 'Enregistrer un vocal') : '') + (add.tab !== 'image' ? other('image', 'Ajouter une image') : '');
  var body = '', go = '';
  if (add.tab === 'text') {
    var tpl = templatesOn() ? '<div class="tpls" role="group" aria-label="Modèles"><span class="l" style="margin:0">Modèle</span>' + TEMPLATES.map(function (t) { return '<button type="button" class="fchip tag" data-a="tpl" data-id="' + t.id + '" aria-pressed="' + (add.tpl === t.id) + '">' + esc(t.name) + '</button>'; }).join('') + '</div>' + (add.todos && add.todos.length ? '<div class="help"><span>' + plural(add.todos.length, 'tâche sera ajoutée', 'tâches seront ajoutées') + ' avec la note (modifiables ensuite).</span></div>' : '') : '';
    body = tpl + '<div class="addtext"><label class="sr" for="ntext">Votre note</label>' + blocksBar('ntext') + '<textarea id="ntext" class="field big" rows="6" placeholder="Écrivez librement…" autofocus>' + esc(add.text) + '</textarea>' + slashMenu('ntext') + '</div>';
    go = '<button class="btn primary" data-a="add-text">' + I(IC.check, 20) + 'Enregistrer</button>';
  } else if (add.tab === 'voice') {
    var on = add.rec && add.rec.on;
    if (add.audio) {
      body = '<div class="recbox"><div class="sub">Enregistrement prêt · ' + fmtDur(add.audio.dur) + '</div><audio controls src="' + add.audio.url + '"></audio><button class="btn" data-a="rec-discard">Recommencer</button></div>';
      go = '<button class="btn primary" data-a="add-voice">' + I(IC.check, 20) + 'Ajouter le vocal</button>';
    } else {
      body = '<div class="recbox">' + (on ? '<div class="recdot"><i></i>Enregistrement en cours</div>' : '<div class="sub">Appuyez pour enregistrer</div>') +
        '<div class="time" id="rtime">' + fmtDur(add.rec ? add.rec.sec : 0) + '</div><div class="sub">sur ' + fmtDur(st.maxVoiceSec) + ' maximum, arrêt automatique</div>' +
        '<div class="wave' + (on ? ' on' : '') + '" aria-hidden="true">' + new Array(24).join('<i></i>') + '</div>' +
        (on ? '<button class="bigbtn" data-a="rec-stop" aria-label="Terminer l\'enregistrement"><svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg></button>' :
          '<button class="bigbtn" data-a="rec-start" aria-label="Démarrer l\'enregistrement">' + I(IC.voice, 34) + '</button>') +
        '</div><div class="actions"><label class="btn" for="afile" style="cursor:pointer">' + I(IC.upload, 18) + 'Importer un fichier audio</label></div><input id="afile" type="file" accept="audio/*" style="position:absolute;width:1px;height:1px;opacity:0">' +
        '<div class="help">' + I(IC.spark, 14) + '<span>' + (st.trigger.transcr === 'auto' ? 'Le vocal est transcrit une seule fois, puis classé à partir du texte.' : 'Transcription manuelle : le vocal attendra votre clic sur « Analyser ».') + '</span></div>';
      go = on ? '<button class="btn primary" data-a="rec-stop">Terminer</button>' : '<button class="btn primary" data-a="rec-start">' + I(IC.voice, 20) + 'Enregistrer</button>';
    }
  } else {
    body = '<div class="actions"><label class="btn" for="ifile" style="cursor:pointer">' + I(IC.upload, 18) + 'Choisir ou photographier</label></div><input id="ifile" type="file" accept="image/*" multiple style="position:absolute;width:1px;height:1px;opacity:0">' +
      (add.images.length ? '<div class="thumbs">' + add.images.map(function (im, i) { return '<img alt="Image ' + (i + 1) + '" src="' + im.url + '">'; }).join('') + '</div>' : '') +
      '<div><label class="l" for="icap">Légende (facultative)</label><textarea id="icap" class="field" rows="2" placeholder="Ce que montre la photo, pourquoi vous la gardez…">' + esc(add.caption) + '</textarea>' +
      '<div class="help">' + I(IC.spark, 14) + '<span>' + (st.trigger.vision === 'auto' ? 'La photo ' + (st.reduceImage ? 'réduite ' : '') + 'sera décrite automatiquement.' : st.trigger.vision === 'off' ? 'Description d\'image désactivée : la note est classée sur la légende.' : 'Avec une légende, la photo est classée sans description payante. Sinon, la description se lance à la demande.') + (st.providers.vision !== 'infomaniak' && st.trigger.vision !== 'off' ? ' Cette photo sera envoyée à ' + PROV[st.providers.vision] + ' si une description est demandée.' : '') + '</span></div></div>';
    go = '<button class="btn primary" data-a="add-img"' + (add.images.length ? '' : ' disabled') + '>' + I(IC.check, 20) + 'Ajouter ' + (add.images.length > 1 ? 'les images' : 'l\'image') + '</button>';
  }
  // Carnet de destination : pastilles à faire défiler du pouce (la valeur part dans #addcat).
  var cb = function (id, label, cls) { return '<button type="button" class="qchip' + (cls ? ' ' + cls : '') + '" data-a="addcat" data-id="' + id + '" aria-pressed="' + ((add.notebookId || '') === id) + '">' + label + '</button>'; };
  var cats = cb('', I(IC.spark, 15) + 'Choisi par l\'IA', 'ai') + S.notebooks.map(function (c) { return cb(c.id, '<i class="dot"></i>' + esc(c.name) + (st.defaultNotebook === c.id ? ' <small>· défaut</small>' : ''), 'cat-' + c.color); }).join('');
  var opts = '<div class="addopts"><div class="l">Carnet</div><input type="hidden" id="addcat" value="' + esc(add.notebookId || '') + '"><div class="qchips inline" role="group" aria-label="Carnet de destination">' + cats + '</div>' +
    '<div class="pills"><label class="pill"><input type="checkbox" id="addread"' + (addReadOn() ? ' checked' : '') + '>' + I(IC.bookmark, 16) + 'À lire plus tard</label>' +
    (st.trigger.enrich !== 'off' ? '<label class="pill"><input type="checkbox" id="addenrich"' + (add.enrich ? ' checked' : '') + '>' + I(IC.spark, 16) + 'Enrichir</label>' : '') + '</div></div>';
  openSheet(shead('Nouvelle note') + body + opts + '<div class="actions sfoot">' + modes + go + '</div>', 'Nouvelle note');
  if (add.tab === 'text') initPreview('ntext');
}
// « À lire » : choix explicite, sinon déduit de la présence d'un lien (règle locale, sans IA).
function hasLink(v) { URL_RE.lastIndex = 0; return URL_RE.test(String(v || '')); }
function addReadOn() {
  if (add.read !== null) return add.read;
  return add.tab === 'text' ? hasLink(add.text) : add.tab === 'image' ? hasLink(add.caption) : false;
}
function addRead() { var b = $('#addread'); return b ? b.checked : false; }

// Valeur envoyée seulement si elle diffère du réglage général (sinon le réglage décide).
function addEnrich() {
  var box = $('#addenrich');
  if (!box) return undefined;
  return box.checked === (S.settings.trigger.enrich === 'auto') ? undefined : box.checked;
}

function addText() {
  var t = $('#ntext').value.trim();
  if (!t) { toast('La note est vide.'); return; }
  queueNote({ type: 'text', content: t, todos: add.todos && add.todos.length ? add.todos : undefined, notebookId: $('#addcat').value, enrich: addEnrich(), read: addRead() });
  closeModal();
  toast(online ? 'Note ajoutée' : 'Note enregistrée sur l\'appareil');
}

/* Enregistrement vocal (MediaRecorder), arrêt automatique à la durée maximale. */
var recorder = null, recStream = null;
function pickAudioType() {
  var types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
  for (var i = 0; i < types.length; i++) { if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) return types[i]; }
  return '';
}
function startRecording() {
  if (!navigator.mediaDevices || !window.MediaRecorder) { toast('L\'enregistrement n\'est pas disponible sur ce navigateur : importez un fichier audio.'); return; }
  navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
    recStream = stream;
    var type = pickAudioType();
    recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
    var chunks = [];
    recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    recorder.onstop = function () {
      stream.getTracks().forEach(function (t) { t.stop(); });
      if (recorder && recorder._discard) { recorder = null; return; }
      var blob = new Blob(chunks, { type: (recorder.mimeType || type || 'audio/webm').split(';')[0] });
      var dur = add.rec ? add.rec.sec : 0;
      recorder = null;
      if (!add) return;
      add.rec = null;
      add.audio = { blob: blob, dur: Math.max(1, dur), url: URL.createObjectURL(blob) };
      if (modal === 'add') renderAdd();
    };
    recorder.start(1000);
    add.rec = { on: true, sec: 0, t0: Date.now() };
    renderAdd();
    timers.rec = setInterval(function () {
      if (!add || !add.rec) return;
      add.rec.sec = Math.floor((Date.now() - add.rec.t0) / 1000);
      var el = $('#rtime'); if (el) el.textContent = fmtDur(add.rec.sec);
      if (add.rec.sec >= S.settings.maxVoiceSec) { stopRecording(); toast('Durée maximale atteinte : enregistrement arrêté.'); }
    }, 250);
  }, function () { toast('Micro refusé ou indisponible.'); });
}
function stopRecording(discard) {
  if (timers.rec) { clearInterval(timers.rec); delete timers.rec; }
  if (recorder && recorder.state !== 'inactive') { recorder._discard = !!discard; recorder.stop(); }
  else if (discard && recStream) recStream.getTracks().forEach(function (t) { t.stop(); });
}
function importAudio(file) {
  if (!file) return;
  var url = URL.createObjectURL(file);
  var a = new Audio();
  a.preload = 'metadata';
  a.onloadedmetadata = function () {
    var d = a.duration;
    if (!isFinite(d)) d = 0;
    if (d > S.settings.maxVoiceSec + 1) { toast('Fichier trop long : ' + fmtDur(S.settings.maxVoiceSec) + ' maximum.'); URL.revokeObjectURL(url); return; }
    add.audio = { blob: file, dur: Math.max(1, Math.round(d)), url: url };
    renderAdd();
  };
  a.onerror = function () { toast('Fichier audio illisible.'); };
  a.src = url;
}
function addVoice() {
  if (!add.audio) return;
  var b = add.audio.blob;
  var type = (b.type || 'audio/webm').split(';')[0];
  var blob = b.type === type ? b : new Blob([b], { type: type });
  queueNote({ type: 'voice', content: '', notebookId: $('#addcat').value, enrich: addEnrich(), read: addRead(), dur: add.audio.dur, files: [{ original: blob }] });
  closeModal();
  toast(online ? 'Vocal ajouté' : 'Vocal enregistré sur l\'appareil');
}

/* Images : version d'origine (recompressée seulement si trop lourde) et version réduite pour l'IA. */
function loadImage(file) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () { resolve({ img: img, url: url }); };
    img.onerror = function () { reject(new Error('Image illisible (format non pris en charge par ce navigateur).')); };
    img.src = url;
  });
}
function shrink(img, max, quality) {
  var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  var c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise(function (resolve) { c.toBlob(function (b) { resolve(b); }, 'image/jpeg', quality); });
}
function pickImages(files) {
  var st = S.settings;
  var list = Array.prototype.slice.call(files || []).slice(0, 6);
  var chain = Promise.resolve();
  list.forEach(function (file) {
    chain = chain.then(function () { return loadImage(file); }).then(function (r) {
      var origP = file.size > st.maxImageMb * 1024 * 1024 || ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].indexOf(file.type) < 0 ? shrink(r.img, 2560, 0.85) : Promise.resolve(file);
      var aiP = st.reduceImage ? shrink(r.img, 1024, 0.8) : Promise.resolve(null);
      return Promise.all([origP, aiP]).then(function (b) { add.images.push({ original: b[0], ai: b[1], url: r.url }); });
    }).catch(function (e) { toast(e.message); });
  });
  chain.then(function () { if (modal === 'add') { add.caption = ($('#icap') || {}).value || add.caption; renderAdd(); } });
}
function addImages() {
  if (!add.images.length) return;
  queueNote({ type: 'image', content: $('#icap').value.trim(), notebookId: $('#addcat').value, enrich: addEnrich(), read: addRead(), files: add.images.map(function (im) { return { original: im.original, ai: im.ai }; }) });
  closeModal();
  toast(online ? 'Image ajoutée' : 'Image enregistrée sur l\'appareil');
}

/* ---------- Détail d'une note ---------- */
var curId = null, detailSnap = null, detailEdit = false;
function curNote() { return noteById(curId); }
// Une carte s'ouvre en lecture ; « Modifier » passe en édition. Sans mode précisé,
// une note déjà ouverte garde son mode (mise à jour après analyse, par exemple).
function openDetail(id, edit) {
  var n = noteById(id);
  if (!n) return;
  if (edit === undefined) edit = modal === 'detail' && curId === id ? detailEdit : false;
  detailEdit = !!edit;
  curId = id;
  modal = 'detail';
  detailSnap = JSON.parse(JSON.stringify(n));
  var st = S.settings;
  var media = '';
  if (n.type === 'voice' && n.media.length) media = '<audio controls preload="none" src="api/media/' + n.id + '/' + n.media[0].id + '"></audio>';
  if (n.type === 'image' && n.media.length) media = '<div class="gallery' + (n.media.length > 1 ? ' multi' : '') + '">' + n.media.map(function (m, i) { return '<button type="button" class="gimg" data-a="zoom" data-src="api/media/' + n.id + '/' + m.id + '" aria-label="Agrandir l\'image' + (n.media.length > 1 ? ' ' + (i + 1) : '') + '"><img alt="" src="api/media/' + n.id + '/' + m.id + '?ai=1"></button>'; }).join('') + '</div>';
  var busy = n.status === 'queued' || n.status === 'analyzing' || n.status === 'uploading';
  var fields = '';
  if (n.type === 'text' || n.type === 'synthesis') fields += '<div><label class="l" for="d-content">Texte</label>' + (n.type === 'text' ? blocksBar('d-content') : '') + '<textarea id="d-content" class="field" rows="7">' + esc(n.content) + '</textarea>' + (n.type === 'text' ? slashMenu('d-content') : '') + '</div>';
  if (n.type === 'voice') fields += '<div><label class="l" for="d-transcript">Transcription</label><textarea id="d-transcript" class="field" rows="6" placeholder="Pas encore transcrite">' + esc(n.transcript) + '</textarea>' + (n.transcript ? '<div class="help">' + I(IC.spark, 14) + '<span>Générée par l\'IA' + (n.provider && n.provider.transcr ? ' (' + PROV[n.provider.transcr] + ')' : '') + (n.lang ? ', langue : ' + esc(n.lang) : '') + '. Modifiable ; l\'audio d\'origine est conservé.</span></div>' : '') + '</div>';
  if (n.type === 'image') {
    fields += '<div><label class="l" for="d-content">Légende</label><textarea id="d-content" class="field" rows="2">' + esc(n.content) + '</textarea></div>';
    fields += '<div><label class="l" for="d-description">Description de l\'image</label><textarea id="d-description" class="field" rows="4" placeholder="Pas encore décrite">' + esc(n.description) + '</textarea>' + (n.description ? '<div class="help">' + I(IC.spark, 14) + '<span>Générée par l\'IA' + (n.provider && n.provider.vision ? ' (' + PROV[n.provider.vision] + ')' : '') + ', modifiable.</span></div>' : '') + '</div>';
  }
  var opts = '<option value="">Sans carnet (à vérifier)</option>' + S.notebooks.map(function (c) { return '<option value="' + c.id + '"' + (n.notebookId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('');
  var sg = n.suggestion;
  var sugg = sg ? '<div class="panel" style="margin:0"><div class="l" style="margin:0">' + I(IC.spark, 14) + ' Suggestions de l\'IA</div>' + (sg.notebook ? '<div class="actions"><button class="btn" data-a="sg" data-id="notebook">Créer le carnet « ' + esc(sg.notebook) + ' » et y ranger la note</button></div>' : '') + (sg.tag ? '<div class="actions"><button class="btn" data-a="sg" data-id="tag">Créer le tag #' + esc(sg.tag) + ' et l\'ajouter</button></div>' : '') + '<div class="actions"><button class="btn ghost" data-a="sg" data-id="ignore">Ignorer</button></div></div>' : '';
  var analyzeBtns = '';
  if (!busy && n.type !== 'synthesis') {
    if (n.status === 'pending' || n.status === 'error') analyzeBtns += '<button class="btn primary" data-a="analyze" data-id="' + n.id + '">' + I(IC.spark, 18) + (n.status === 'error' ? 'Relancer l\'analyse' : 'Analyser avec l\'IA') + '</button>';
    if (n.type === 'image' && !n.description && st.trigger.vision !== 'off') analyzeBtns += '<button class="btn" data-a="describe" data-id="' + n.id + '">' + I(IC.image, 18) + 'Décrire l\'image' + (st.providers.vision !== 'infomaniak' ? ' (' + PROV[st.providers.vision] + ')' : '') + '</button>';
    if (n.status === 'error' && st.recours === 'ask') {
      S.providers.filter(function (p) { return p.id !== st.providers.classif && p.enabled && p.hasKey; }).forEach(function (p) {
        analyzeBtns += '<button class="btn" data-a="analyze-with" data-id="' + p.id + '">Réessayer avec ' + esc(p.label) + '</button>';
      });
    }
  }
  var linksBlock = n.links && n.links.length ? '<div><div class="l">' + (n.links.length > 1 ? 'Liens' : 'Lien') + '</div><div style="display:flex;flex-direction:column;gap:8px">' + n.links.map(function (l) { return linkCard(l, false); }).join('') + '</div>' +
      (n.links.some(function (l) { return l.aiDescription; }) ? '<div class="help">' + I(IC.spark, 14) + '<span>Descriptif rédigé par l\'IA pendant le classement, à partir de la page.</span></div>' : '') + '</div>' : '';
  var meta = TYPE_LABEL[n.type] + ' · ' + fmtFull(n.createdAt) + (n.updatedAt - n.createdAt > 60000 ? ' · modifiée ' + fmtDate(n.updatedAt) : '') + (provLabel(n) ? ' · IA : ' + provLabel(n) : '') + (n.confidence != null && n.ai ? ' · confiance ' + Math.round(n.confidence * 100) + ' %' : '');
  var banners = (n.trashedAt ? '<div class="banner warn">Cette note est dans la corbeille.<button data-a="restore" data-id="' + n.id + '">Restaurer</button></div>' : '') +
    (busy ? '<div class="status">' + I(IC.spark) + 'Analyse en cours…</div>' : '') +
    (n.status === 'error' && n.error ? '<div class="err">' + esc(n.error) + '</div>' : '') +
    (n.status === 'pending' && (n.pendingReason === 'budget' || n.pendingReason === 'config' || n.pendingReason === 'quota') ? '<div class="err">' + esc((n.error || 'Analyse en attente.').replace(/ Nouvel essai.*$/, '')) + (n.retryAt ? ' Nouvel essai automatique à ' + new Date(n.retryAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) + '.' : '') + '</div>' : '');
  if (!detailEdit) {
    openSheet(readView(n, { meta: meta, banners: banners, media: media, links: linksBlock, analyzeBtns: analyzeBtns, busy: busy }), 'Note');
    return;
  }
  openSheet(shead('Modifier la note') +
    (n.trashedAt ? '<div class="banner warn">Cette note est dans la corbeille.<button data-a="restore" data-id="' + n.id + '">Restaurer</button></div>' : '') +
    '<div><label class="l" for="d-title">Titre</label><input id="d-title" class="field" value="' + esc(n.title) + '" maxlength="200"></div>' +
    '<div class="sub">' + esc(meta) + '</div>' +
    (busy ? '<div class="status">' + I(IC.spark) + 'Analyse en cours…</div>' : '') +
    (n.status === 'error' && n.error ? '<div class="err">' + esc(n.error) + '</div>' : '') +
    (n.status === 'pending' && (n.pendingReason === 'budget' || n.pendingReason === 'config' || n.pendingReason === 'quota') ? '<div class="err">' + esc((n.error || 'Analyse en attente.').replace(/ Nouvel essai.*$/, '')) + (n.retryAt ? ' Nouvel essai automatique à ' + new Date(n.retryAt).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }) + '.' : '') + '</div>' : '') +
    media + fields + (n.type !== 'synthesis' ? mentionPicker() : '') +
    linksBlock +
    (n.type !== 'synthesis' ? '<div><label class="l" for="d-cat">Carnet</label><select id="d-cat" class="field">' + opts + '</select>' + (n.notebookChosen ? '<div class="help"><span>Carnet choisi à la création : l\'IA ne le change pas.</span></div>' : '') + '</div>' +
      '<div><label class="l" for="dtagq">Tags</label><div class="sel" id="dsel"></div><div class="cbx"><input id="dtagq" class="field" role="combobox" aria-expanded="false" aria-controls="dtaglist" aria-autocomplete="list" autocomplete="off" placeholder="Rechercher ou créer un tag…"><div class="list2" id="dtaglist" role="listbox" hidden></div></div></div>' +
      sugg +
      '<div class="switch"><div><b>Verrouiller ce classement</b><span>Un re-tri ne le modifiera plus. Toute correction le verrouille.</span></div><button class="sw" role="switch" aria-checked="' + !!n.locked + '" aria-label="Verrouiller ce classement" data-a="dlock"><i></i></button></div>' : '') +
    '<div class="actions"><button class="btn" data-a="dcancel">Annuler</button><button class="btn primary" data-a="dsave">Enregistrer</button></div>', 'Modifier la note');
  if (n.type !== 'synthesis') dtSel();
  if (n.type === 'text') initPreview('d-content');
}

// Lecture : texte mis en forme, liens cliquables, classement en pastilles.
// Propriétés du carnet de la note, modifiables dans la fiche.
function propsHtml(n) {
  var c = nb(n.notebookId), ps = nbProps(c);
  if (!ps.length || n.type === 'synthesis') return '';
  var ro = n.trashedAt ? ' disabled' : '';
  return '<div class="pgrid"><div class="l" style="grid-column:1/-1;margin:0">Propriétés · ' + esc(c.name) + '</div>' + ps.map(function (p) {
    var v = propValue(n, p), id = 'pp-' + p.id, at = ' id="' + id + '" class="field pinp" data-nid="' + n.id + '" data-pid="' + p.id + '" data-ptype="' + p.type + '"' + ro;
    var input;
    if (p.type === 'select') input = '<select' + at + '><option value="">—</option>' + p.options.map(function (o) { return '<option' + (v === o ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select>';
    else if (p.type === 'checkbox') input = '<input' + at.replace('class="field pinp"', 'class="pinp pchk"') + ' type="checkbox"' + (v ? ' checked' : '') + '>';
    else if (p.type === 'number') input = '<input' + at + ' type="number" step="any" value="' + esc(v) + '">';
    else if (p.type === 'date') input = '<input' + at + ' type="date" value="' + esc(v) + '">';
    else if (p.type === 'url') input = '<input' + at + ' type="url" inputmode="url" placeholder="https://…" value="' + esc(v) + '">' + (/^https?:\/\//i.test(v) ? '<a class="pl" href="' + esc(v) + '" target="_blank" rel="noopener noreferrer">Ouvrir</a>' : '');
    else input = '<input' + at + ' maxlength="500" value="' + esc(v) + '">';
    return '<label class="pk" for="' + id + '">' + esc(p.name) + (n.propsAi && n.propsAi[p.id] ? ' <span class="aimark" title="Proposé par l\'IA, modifiable">' + I(IC.spark, 12) + '</span>' : '') + '</label><div class="pv-in">' + input + '</div>';
  }).join('') + '</div>';
}
// Notes proches proposées par l'IA pendant le classement : un clic pour citer, un pour ignorer.
function relatedHtml(n) {
  if (!linksOn() || n.trashedAt) return '';
  var list = (n.related || []).map(function (id) { return noteById(id); }).filter(function (x) { return x && !x.trashedAt; });
  if (!list.length) return '';
  return '<div><div class="l">' + I(IC.spark, 13) + ' Notes liées suggérées</div><div class="rel">' + list.map(function (x) {
    return '<div class="rel-i"><button type="button" class="mention" data-a="open" data-id="' + x.id + '">' + esc(x.title) + '</button><button type="button" class="btn ghost" style="height:40px;padding:0 10px" data-a="rel-link" data-id="' + x.id + '">Citer</button><button type="button" class="iconbtn" data-a="rel-off" data-id="' + x.id + '" aria-label="Ignorer la suggestion : ' + esc(x.title) + '">' + I(IC.x, 16) + '</button></div>';
  }).join('') + '</div></div>';
}
function backlinksHtml(n) {
  var b = backlinks(n);
  if (!b.length) return '';
  return '<div><div class="l">Citée dans</div><div class="bl">' + b.map(function (x) { return '<button type="button" class="mention" data-a="open" data-id="' + x.id + '">' + esc(x.title) + '</button>'; }).join('') + '</div></div>';
}
// Sélecteur de note à citer (édition) : insère [[Titre]] à l'emplacement du curseur.
function mentionPicker() {
  if (!linksOn()) return '';
  return '<div><button type="button" class="btn" data-a="mention-open">@ Lier une note</button><div id="mbox" hidden><input id="mq" class="field" autocomplete="off" placeholder="Rechercher la note à citer…" aria-label="Rechercher la note à citer"><div id="mlist" class="mlist"></div></div></div>';
}
function mentionList() {
  var q = norm($('#mq').value).trim(), self = curId;
  var list = live().filter(function (n) { return n.id !== self && n.type !== 'synthesis' && n.title && (!q || norm(n.title).indexOf(q) > -1); }).slice(0, 6);
  $('#mlist').innerHTML = list.length ? list.map(function (n) { return '<button type="button" data-a="mention-ins" data-id="' + n.id + '">' + esc(n.title) + '</button>'; }).join('') : '<div class="none muted">Aucune note trouvée</div>';
}
// Section « Tâches » de la fiche : cases à cocher, échéance, ajout.
function todosHtml(n) {
  if (!tasksOn() || n.type === 'synthesis') return '';
  var today = todayStr();
  var list = (n.todos || []).map(function (t) {
    var late = !t.done && t.due && t.due < today;
    return '<li class="todo' + (t.done ? ' done' : '') + '"><button type="button" class="tchk" role="checkbox" aria-checked="' + t.done + '" data-a="todo-toggle" data-id="' + n.id + '" data-tid="' + t.id + '" aria-label="' + (t.done ? 'Rouvrir' : 'Terminer') + ' : ' + esc(t.text) + '">' + (t.done ? I(IC.check, 18) : '') + '</button>' +
      '<span class="ttx">' + esc(t.text) + '</span>' + (t.due ? '<span class="tdue' + (late ? ' late' : t.due === today ? ' today' : '') + '">' + esc(t.due === today ? 'Aujourd\'hui' : fmtDay(t.due)) + '</span>' : '') +
      '<button type="button" class="iconbtn" data-a="todo-del" data-id="' + n.id + '" data-tid="' + t.id + '" aria-label="Supprimer la tâche : ' + esc(t.text) + '">' + I(IC.x, 18) + '</button></li>';
  }).join('');
  var s = todoStats(n);
  return '<div id="todobox"><div class="l">Tâches' + (s.total ? ' · ' + s.done + '/' + s.total : '') + '</div>' + (list ? '<ul class="todos">' + list + '</ul>' : '') +
    (n.trashedAt ? '' : '<div class="todo-add"><input id="todoin" class="field" maxlength="300" placeholder="Ajouter une tâche…" aria-label="Nouvelle tâche" enterkeyhint="done"><input id="todoin-due" class="field" type="date" aria-label="Échéance (facultative)"><button type="button" class="btn" data-a="todo-add" data-id="' + n.id + '">Ajouter</button></div>') + '</div>';
}
function refreshTodos(n) {
  var box = $('#todobox');
  if (!box || modal !== 'detail' || curId !== n.id || detailEdit) return;
  var tmp = document.createElement('div');
  tmp.innerHTML = todosHtml(n);
  box.parentNode.replaceChild(tmp.firstChild, box);
}
function readPick(n) {
  if (n.trashedAt) return '';
  var b = function (id, label) { return '<button type="button" data-a="dread" data-id="' + id + '" aria-pressed="' + ((n.read || '') === id) + '">' + label + '</button>'; };
  return '<div class="readpick"><span class="l" style="margin:0">Lecture</span><div class="modes small" role="group" aria-label="Lecture">' + b('', 'Aucune') + b('todo', I(IC.bookmark, 14) + 'À lire') + b('done', I(IC.check, 14) + 'Lu') + '</div>' +
    (n.read === 'done' && n.readAt ? '<small class="muted">le ' + esc(fmtFull(n.readAt)) + '</small>' : '') + '</div>';
}
function readView(n, x) {
  var block = function (label, text, empty) {
    return '<div>' + (label ? '<div class="l">' + label + '</div>' : '') + (text ? (richText(text, n.id) !== null ? '<div class="readtext rich">' + richText(text, n.id) + '</div>' : '<div class="readtext">' + mentionify(linkify(text), n.id) + '</div>') : '<p class="muted" style="margin:0">' + empty + '</p>') + '</div>';
  };
  var body = '';
  if (n.type === 'text') body = block('', n.content, 'Note vide.');
  else if (n.type === 'synthesis') body = '<div class="report">' + mdToHtml(n.content, []) + '</div>';
  else if (n.type === 'voice') body = block('Transcription', n.transcript, 'Pas encore transcrite.');
  else body = (n.content ? block('Légende', n.content) : '') + block('Description de l\'image', n.description, 'Pas encore décrite.');
  var aiNote = (n.type === 'voice' && n.transcript) || (n.type === 'image' && n.description) ? '<div class="help">' + I(IC.spark, 14) + '<span>' + (n.type === 'voice' ? 'Transcription' : 'Description') + ' générée par l\'IA, modifiable.</span></div>' : '';
  var tags = n.tagIds.map(function (id) { var t = tagById(id); return t ? '<span class="chip">#' + esc(t.name) + '</span>' : ''; }).join('');
  var classif = n.type === 'synthesis' ? '' : '<div class="foot" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">' + catChip(n) + tags +
    (n.locked ? '<span class="chip">' + I(IC.lock, 13) + 'Verrouillé</span>' : n.ai && n.notebookId ? '<span class="chip">' + I(IC.spark, 13) + 'Classé par l\'IA</span>' : '') + '</div>';
  return '<div class="shead"><h2 style="overflow-wrap:anywhere">' + esc(n.title) + '</h2>' + xbtn() + '</div>' +
    '<div class="sub">' + esc(x.meta) + '</div>' + x.banners + classif + propsHtml(n) + readPick(n) + x.media + body + todosHtml(n) + aiNote + relatedHtml(n) + backlinksHtml(n) + x.links +
    (x.busy || n.type === 'synthesis' ? '' : enrichHtml(n)) +
    (x.analyzeBtns ? '<div class="actions">' + x.analyzeBtns + '</div>' : '') +
    (aiOn() && !n.trashedAt && !x.busy && n.type !== 'synthesis' && (n.status === 'ready' || n.type === 'text') && noteText(n).trim() ? '<div class="actions"><button type="button" class="btn" data-a="xf-open" data-id="' + n.id + '">' + I(IC.spark, 18) + 'Transformer avec l\'IA</button></div>' : '') +
    '<div class="actions sfoot"><button type="button" class="rbtn" data-a="close" aria-label="Fermer" title="Fermer">' + I('<path d="m15 6-6 6 6 6"/>', 24) + '</button>' +
    (n.trashedAt ? '<button type="button" class="rbtn danger" data-a="purge" data-id="' + n.id + '" aria-label="Supprimer définitivement" title="Supprimer définitivement">' + I(TRASH, 22) + '</button>' : '<button type="button" class="rbtn" data-a="del" aria-label="Mettre à la corbeille" title="Mettre à la corbeille">' + I(TRASH, 22) + '</button>') +
    '<button class="btn primary" data-a="dedit" autofocus>' + I(IC.text, 18) + 'Modifier</button></div>';
}

// Seuls les champs modifiés dans le formulaire depuis son ouverture sont envoyés :
// un résultat d'IA arrivé entre-temps n'est jamais écrasé par l'ancien contenu.
function detailPatch() {
  var n = detailSnap;
  if (!n || !noteById(n.id)) return {};
  var p = {};
  var v = function (id) { var e = $('#' + id); return e ? e.value : undefined; };
  if (v('d-title') !== undefined && v('d-title').trim() !== n.title) p.title = v('d-title').trim();
  if (v('d-content') !== undefined && v('d-content') !== (n.content || '')) p.content = v('d-content');
  if (v('d-transcript') !== undefined && v('d-transcript') !== (n.transcript || '')) p.transcript = v('d-transcript');
  if (v('d-description') !== undefined && v('d-description') !== (n.description || '')) p.description = v('d-description');
  if (v('d-cat') !== undefined && v('d-cat') !== (n.notebookId || '')) p.notebookId = v('d-cat');
  return p;
}
function saveDetail(close) {
  var p = detailPatch();
  var done = function () { if (close) closeModal(); render(); };
  if (!Object.keys(p).length) { done(); return Promise.resolve(true); }
  return api('PATCH', 'notes/' + curId, p).then(function (r) { upsertNote(r.note); done(); toast('Note enregistrée'); return true; }, function (e) { fail(e); return false; });
}
function patchNote(p) {
  return api('PATCH', 'notes/' + curId, p).then(function (r) { upsertNote(r.note); render(); return r.note; }, fail);
}

/* ---------- Éditeur simplifié : barre de mise en forme et menu « / » ---------- */
var BLOCKS = [['h1', '#', 'Titre 1', 'H1'], ['h2', '##', 'Titre 2', 'H2'], ['h3', '###', 'Titre 3', 'H3'], ['ul', '-', 'Liste à puces', '•'], ['ol', '1.', 'Liste numérotée', '1.'], ['q', '>', 'Citation', '❝'], ['hr', '---', 'Séparateur', '—']];
var INLINES = [['b', 'Gras', 'B', 'Ctrl+B'], ['i', 'Italique', 'I', 'Ctrl+I'], ['s', 'Barré', 'S', ''], ['c', 'Code', '</>', ''], ['l', 'Lien', '🔗', 'Ctrl+K']];
function blocksBar(target) {
  var btn = function (kind, label, ico, key, extra) { return '<button type="button" data-a="' + (extra || 'blk') + '" data-id="' + kind + '" data-target="' + target + '" aria-label="' + label + '" title="' + label + (key ? ' (' + key + ')' : '') + '"><span class="bi">' + ico + '</span><span class="bt">' + label + '</span></button>'; };
  var inl = INLINES.map(function (b) { return btn(b[0], b[1], b[2], b[3], 'fmt'); }).join('');
  var blk = BLOCKS.map(function (b) { return btn(b[0], b[2], b[3]); }).join('');
  var rest = (linksOn() && target !== 'ntext' ? btn('mention', 'Lier une note', '@', '', 'mention-open') : '') + '<button type="button" class="bprev-t" data-a="bprev" data-target="' + target + '" aria-pressed="' + previewOn() + '" title="Afficher l\'aperçu mis en forme"><span class="bi">👁</span><span class="bt">Aperçu</span></button>';
  return '<div class="btools" role="toolbar" aria-label="Mise en forme" data-target="' + target + '"><div class="bgrp">' + inl + '</div><div class="bgrp">' + blk + '</div><div class="bgrp">' + rest + '</div></div>';
}
function previewOn() { try { var v = localStorage.getItem('mainotes-preview'); return v === null ? window.matchMedia('(min-width:760px)').matches : v === '1'; } catch (e) { return false; } }
function previewHtml(text, selfId) { var r = richText(text, selfId); return r !== null ? r : '<p>' + mentionify(linkify(text), selfId) + '</p>'; }
// Aperçu mis en forme sous le champ (ordinateur) : suit la saisie.
function initPreview(target) {
  var ta = $('#' + target), box = $('#prev-' + target);
  if (!ta || !box) return;
  box.hidden = !previewOn();
  box.innerHTML = ta.value.trim() ? previewHtml(ta.value, target === 'd-content' ? curId : null) : '<p class="muted">L\'aperçu apparaît ici.</p>';
}
function slashMenu(target) {
  return '<div class="slashm" id="slashm-' + target + '" hidden role="menu" aria-label="Insérer un bloc">' + BLOCKS.map(function (b) { return '<button type="button" role="menuitem" data-a="blk" data-slash="1" data-id="' + b[0] + '" data-target="' + target + '"><i>' + b[3] + '</i>' + b[2] + '</button>'; }).join('') + (linksOn() && target !== 'ntext' ? '<button type="button" role="menuitem" data-a="mention-open" data-slash="1" data-target="' + target + '"><i>@</i>Lier une note</button>' : '') + '</div>' +
    '<div class="readtext rich bprev" id="prev-' + target + '" hidden aria-label="Aperçu"></div>';
}
// Applique un bloc sur la ligne du curseur (ou le retire s'il y est déjà).
function applyBlock(ta, kind, fromSlash) {
  var v = ta.value, pos = ta.selectionStart == null ? v.length : ta.selectionStart;
  var s = v.lastIndexOf('\n', pos - 1) + 1, e = v.indexOf('\n', pos);
  if (e < 0) e = v.length;
  var line = v.slice(s, e);
  if (fromSlash && line.trim() === '/') line = '';
  var mk = BLOCKS.filter(function (b) { return b[0] === kind; })[0][1];
  var repl, caret;
  if (kind === 'hr') { repl = (line ? line + '\n' : '') + '---\n'; caret = s + repl.length; }
  else {
    var stripped = line.replace(/^(#{1,3} |[-*] |\d+\. |> )/, '');
    var has = kind === 'ol' ? /^\d+\. /.test(line) : line.indexOf(mk + ' ') === 0;
    repl = has ? stripped : mk + ' ' + stripped;
    caret = s + repl.length;
  }
  ta.value = v.slice(0, s) + repl + v.slice(e);
  ta.focus();
  ta.setSelectionRange(caret, caret);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}
// Met la sélection en gras, italique, barré, code ou lien (sans sélection : insère un modèle sélectionné).
function applyInline(ta, kind) {
  var v = ta.value, a = ta.selectionStart == null ? v.length : ta.selectionStart, z = ta.selectionEnd == null ? a : ta.selectionEnd;
  var sel = v.slice(a, z);
  var mk = { b: '**', i: '*', s: '~~', c: '`' }[kind];
  var out, from, to;
  if (kind === 'l') {
    if (/^https?:\/\//i.test(sel)) { out = '[texte](' + sel + ')'; from = a + 1; to = a + 6; }
    else { out = '[' + (sel || 'texte') + '](https://)'; from = a + out.length - 9; to = a + out.length - 1; if (!sel) { from = a + 1; to = a + 6; } }
  } else if (sel && v.slice(a - mk.length, a) === mk && v.slice(z, z + mk.length) === mk) {
    // Déjà mis en forme : on retire les marques.
    ta.value = v.slice(0, a - mk.length) + sel + v.slice(z + mk.length);
    ta.focus(); ta.setSelectionRange(a - mk.length, z - mk.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  } else {
    var inner = sel || { b: 'gras', i: 'italique', s: 'barré', c: 'code' }[kind];
    out = mk + inner + mk; from = a + mk.length; to = from + inner.length;
  }
  ta.value = v.slice(0, a) + out + v.slice(z);
  ta.focus(); ta.setSelectionRange(from, to);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ---------- Fonctions IA sur les notes : transformer une note, interroger ses notes ---------- */
var XF = [
  ['todos', 'En liste de tâches', 'Extrait les tâches du texte et les ajoute à la note.'],
  ['summary', 'Résumer en 3 points', 'Ajoute un court résumé à la fin du texte.', true],
  ['rewrite', 'Reformuler', 'Propose une version plus claire du texte.', true],
  ['continue', 'Continuer le texte', 'Propose une suite de quelques phrases.', true]
];
var xf = null;
function openTransform(id) {
  var n = noteById(id);
  if (!n) return;
  xf = { id: id, busy: false };
  modal = 'xf';
  var prov = S.settings.providers.synth;
  openSheet(shead('Transformer avec l\'IA') + '<div class="sub">' + esc(n.title) + '</div>' +
    '<div class="help">' + I(IC.spark, 14) + '<span>Un seul appel IA par action (' + esc(PROV[prov] || prov) + '), à votre confirmation. Rien n\'est modifié avant que vous validiez le résultat.</span></div>' +
    '<div class="xfl">' + XF.filter(function (a) { return !a[3] || n.type === 'text'; }).map(function (a) { return '<button type="button" class="btn xfb" data-a="xf-run" data-id="' + a[0] + '"><b>' + a[1] + '</b><small>' + a[2] + '</small></button>'; }).join('') + '</div>' +
    '<div class="actions"><button class="btn ghost" data-a="xf-back">Retour à la note</button></div>', 'Transformer');
}
function xfRun(action) {
  if (!xf || xf.busy) return;
  if (!online) { toast('Les fonctions IA demandent une connexion.'); return; }
  xf.busy = true;
  var box = $('.xfl'); if (box) box.innerHTML = '<div class="status">' + I(IC.spark) + 'L\'IA travaille…</div>';
  api('POST', 'notes/' + xf.id + '/transform', { action: action }).then(function (r) {
    xf.result = r.result; xf.busy = false; xfShow();
    sync();
  }, function (e) { xf.busy = false; fail(e); openTransform(xf.id); });
}
function xfShow() {
  var r = xf.result, n = noteById(xf.id);
  var body, acts;
  if (r.kind === 'todos') {
    body = r.todos.length ? '<ul class="todos">' + r.todos.map(function (t) { return '<li class="todo"><span class="ttx">☐ ' + esc(t) + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">Aucune tâche trouvée dans cette note.</p>';
    acts = r.todos.length ? '<button class="btn primary" data-a="xf-apply" data-id="todos">Ajouter ' + plural(r.todos.length, 'tâche', 'tâches') + '</button>' : '';
  } else {
    body = '<div class="readtext" style="background:var(--bg);border-radius:12px;padding:12px 14px">' + esc(r.text) + '</div>';
    acts = (r.action === 'rewrite' ? '<button class="btn primary" data-a="xf-apply" data-id="replace">Remplacer le texte</button>' : '<button class="btn primary" data-a="xf-apply" data-id="append">Ajouter à la fin</button>') +
      (r.action === 'rewrite' ? '<button class="btn" data-a="xf-apply" data-id="append">Ajouter à la fin</button>' : '');
  }
  openSheet(shead('Résultat') + '<div class="sub">' + esc(n.title) + ' · généré par l\'IA (' + esc(PROV[r.provider] || r.provider || '') + '), à relire</div>' + body +
    '<div class="actions">' + acts + '<button class="btn ghost" data-a="xf-back">Annuler</button></div>', 'Résultat');
  modal = 'xf';
}
function xfApply(how) {
  var r = xf && xf.result, n = xf && noteById(xf.id);
  if (!r || !n) return;
  var p;
  if (how === 'todos') p = api('POST', 'notes/' + n.id + '/todos', { texts: r.todos });
  else p = api('PATCH', 'notes/' + n.id, { content: how === 'replace' ? r.text : (n.content ? n.content + '\n\n' : '') + r.text });
  p.then(function (x) { upsertNote(x.note); saveCache(); toast('Note mise à jour'); openDetail(n.id, false); render(); }, fail);
}
var ask = null;
function openAsk() {
  ask = { q: '', res: null, busy: false };
  modal = 'ask';
  renderAsk();
}
function renderAsk() {
  var prov = S.settings.providers.synth, r = ask.res;
  openSheet(shead('Question à mes notes') +
    '<div class="help">' + I(IC.spark, 14) + '<span>Les notes les plus proches sont choisies sur votre appareil, sans IA ; un seul appel (' + esc(PROV[prov] || prov) + ') rédige la réponse, avec ses sources.</span></div>' +
    '<div><label class="l" for="askq">Votre question</label><textarea id="askq" class="field" rows="2" maxlength="300" placeholder="ex. Qu\'ai-je noté sur le plombier ?">' + esc(ask.q) + '</textarea></div>' +
    (ask.busy ? '<div class="status">' + I(IC.spark) + 'L\'IA cherche dans vos notes…</div>' : '') +
    (r ? '<div class="readtext" style="background:var(--bg);border-radius:12px;padding:12px 14px">' + esc(r.answer) + '</div>' +
      (r.sources.length ? '<div><div class="l">Sources</div><div class="bl">' + r.sources.map(function (s) { return '<button type="button" class="mention" data-a="open" data-id="' + s.id + '">' + esc(s.title) + '</button>'; }).join('') + '</div></div>' : '<div class="help"><span>Réponse rédigée sans note citée : à prendre avec prudence.</span></div>') : '') +
    '<div class="actions"><button class="btn primary" data-a="ask-go"' + (ask.busy ? ' disabled' : '') + '>' + I(IC.spark, 18) + (r ? 'Poser une autre question' : 'Demander (1 appel IA)') + '</button><button class="btn ghost" data-a="close">Fermer</button></div>', 'Question à mes notes');
  modal = 'ask';
}
function askGo() {
  var q = $('#askq').value.trim();
  if (!q) { toast('Écrivez une question.'); return; }
  if (!online) { toast('Les fonctions IA demandent une connexion.'); return; }
  ask.q = q; ask.busy = true; ask.res = null; renderAsk();
  api('POST', 'ask', { question: q }).then(function (r) { ask.busy = false; ask.res = r; renderAsk(); sync(); }, function (e) { ask.busy = false; renderAsk(); fail(e); });
}

/* Liste déroulante filtrable des tags (F43, F44). */
var dtI = 0, dtOpts = [];
function dtSel() {
  var n = curNote();
  if (!n || !$('#dsel')) return;
  $('#dsel').innerHTML = n.tagIds.map(function (id) { var t = tagById(id); return t ? '<button type="button" data-a="dtag" data-id="' + t.id + '" aria-label="Retirer le tag ' + esc(t.name) + '">#' + esc(t.name) + ' ' + I(IC.x, 14) + '</button>' : ''; }).join('');
}
function dtList(open) {
  var n = curNote(), inp = $('#dtagq'), box = $('#dtaglist');
  if (!n || !inp) return;
  var raw = inp.value.replace(/^#/, '').trim(), q = norm(raw);
  dtOpts = S.tags.filter(function (t) { return n.tagIds.indexOf(t.id) < 0 && (!q || norm(t.name).indexOf(q) > -1); }).map(function (t) { return { id: t.id, name: t.name }; });
  if (q && !S.tags.some(function (t) { return norm(t.name) === q; })) dtOpts.push({ name: raw, make: true });
  if (dtI >= dtOpts.length) dtI = Math.max(0, dtOpts.length - 1);
  box.innerHTML = dtOpts.length ? dtOpts.map(function (o, i) { return '<div role="option" id="dto' + i + '" data-a="dtpick" data-i="' + i + '" aria-selected="' + (i === dtI) + '">' + (o.make ? 'Créer le tag « ' + esc(o.name) + ' »' : '#' + esc(o.name)) + '</div>'; }).join('') : '<div class="none">Aucun tag disponible</div>';
  box.hidden = !open;
  inp.setAttribute('aria-expanded', String(open));
  if (open && dtOpts.length) inp.setAttribute('aria-activedescendant', 'dto' + dtI); else inp.removeAttribute('aria-activedescendant');
}
function dtPick(i) {
  var o = dtOpts[i], n = curNote();
  if (!o || !n) return;
  var p = o.make ? api('POST', 'tags', { name: o.name }).then(function (r) { if (!tagById(r.tag.id)) S.tags.push(r.tag); return r.tag.id; }) : Promise.resolve(o.id);
  p.then(function (id) {
    var ids = n.tagIds.concat(n.tagIds.indexOf(id) < 0 ? [id] : []);
    return patchNote({ tagIds: ids }).then(function () {
      var inp = $('#dtagq'); if (inp) { inp.value = ''; dtI = 0; dtSel(); dtList(true); inp.focus(); }
      toast('Tag ajouté : #' + (tagById(id) || {}).name);
    });
  }).catch(fail);
}

/* ---------- Carnet ---------- */
var ce = null;
function openNotebook(id) {
  var c = id ? nb(id) : null;
  ce = { id: id || null, color: c ? c.color : COLORS[S.notebooks.length % COLORS.length], props: c && c.properties ? JSON.parse(JSON.stringify(c.properties)) : [] };
  modal = 'cat';
  var sw = COLORS.map(function (k) { return '<button type="button" class="cat-' + k + '" data-a="ccolor" data-id="' + k + '" aria-label="' + CNAME[k] + '" aria-pressed="' + (ce.color === k) + '"><i></i></button>'; }).join('');
  var count = c ? live().filter(function (n) { return n.notebookId === c.id; }).length : 0;
  openSheet(shead(c ? 'Modifier le carnet' : 'Nouveau carnet') +
    '<div><label class="l" for="cname">Nom</label><input id="cname" class="field" value="' + esc(c ? c.name : '') + '" maxlength="40" autofocus></div>' +
    '<div><label class="l" for="cdesc">Ce qu\'il doit contenir</label><textarea id="cdesc" class="field" rows="2" placeholder="ex. Billets, réservations, itinéraires">' + esc(c ? c.desc : '') + '</textarea><div class="help">' + I(IC.spark, 14) + '<span>L\'IA s\'appuie sur cette description pour classer.</span></div></div>' +
    '<div><div class="l">Couleur</div><div class="swatches" id="sw">' + sw + '</div></div>' +
    (propsOn() ? '<div id="peditor">' + propsEditor() + '</div>' : '') +
    '<div class="err" id="cerr" role="alert" hidden></div>' +
    '<div class="actions"><button class="btn primary" data-a="csave">' + (c ? 'Enregistrer' : 'Créer le carnet') + '</button>' + (c ? '<button class="btn danger" data-a="cdel">Supprimer</button>' : '<button class="btn ghost" data-a="close">Annuler</button>') + '</div>' +
    (c ? '<div class="help"><span>Supprimer : ' + plural(count, 'note passe', 'notes passent') + ' « à vérifier ». Pour les garder ensemble, utilisez plutôt la fusion.</span></div>' : '') +
    '<div class="help"><span>Après une création ou une modification, vous pouvez relancer le tri depuis l\'onglet Carnets.</span></div>', 'Carnet');
}
var PTYPES = [['text', 'Texte'], ['number', 'Nombre'], ['date', 'Date'], ['select', 'Sélection'], ['checkbox', 'Case à cocher'], ['url', 'Lien (URL)']];
function propsEditor() {
  var rows = ce.props.map(function (p, i) {
    return '<div class="pe-row" data-i="' + i + '"><input class="field pe-name" maxlength="30" placeholder="Nom" aria-label="Nom de la propriété" value="' + esc(p.name) + '">' +
      '<select class="field pe-type" aria-label="Type">' + PTYPES.map(function (t) { return '<option value="' + t[0] + '"' + (p.type === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select>' +
      '<label class="pe-aiw" title="L\'IA propose la valeur à l\'analyse de la note"><input type="checkbox" class="pe-ai"' + (p.ai ? ' checked' : '') + '>' + I(IC.spark, 14) + 'IA</label>' +
      '<button type="button" class="iconbtn" data-a="pe-del" data-id="' + i + '" aria-label="Supprimer la propriété">' + I(IC.x, 18) + '</button>' +
      (p.type === 'select' ? '<input class="field pe-opts" placeholder="Options séparées par des virgules (ex. À lire, En cours, Lu)" aria-label="Options" value="' + esc((p.options || []).join(', ')) + '">' : '') + '</div>';
  }).join('');
  return '<div><div class="l">Propriétés</div>' + (rows || '<p class="muted" style="margin:0 0 6px">Aucune. Les propriétés (statut, échéance, note…) alimentent les vues Tableau, Kanban et Calendrier.</p>') +
    '<div class="actions"><button type="button" class="btn" data-a="pe-add"' + (ce.props.length >= 12 ? ' disabled' : '') + '>+ Ajouter une propriété</button></div></div>';
}
// Relit le formulaire des propriétés avant de le redessiner ou de l'enregistrer.
function peSync() {
  $$('#peditor .pe-row').forEach(function (row) {
    var p = ce.props[+row.dataset.i];
    if (!p) return;
    p.name = $('.pe-name', row).value;
    p.type = $('.pe-type', row).value;
    p.ai = $('.pe-ai', row).checked;
    var o = $('.pe-opts', row);
    if (p.type === 'select') p.options = o ? o.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean) : (p.options || []);
    else delete p.options;
  });
}
function peRender() { var e = $('#peditor'); if (e) e.innerHTML = propsEditor(); }
function saveNotebook() {
  var body = { name: $('#cname').value.trim(), desc: $('#cdesc').value.trim(), color: ce.color };
  if (propsOn()) { peSync(); body.properties = ce.props.map(function (p) { var o = { id: p.id, name: p.name.trim(), type: p.type, ai: !!p.ai }; if (p.type === 'select') o.options = p.options || []; return o; }); }
  var p = ce.id ? api('PATCH', 'notebooks/' + ce.id, body) : api('POST', 'notebooks', body);
  p.then(function () { closeModal(); return sync(); }).then(function () { askRetri(ce && ce.id ? 'Carnet enregistré.' : 'Carnet créé.'); }, function (e) { var el = $('#cerr'); if (el) { el.textContent = e.message; el.hidden = false; } });
}
function askRetri(msg) {
  toast(msg + ' Relancer le tri ?');
  openRetri(msg);
}

/* ---------- Tag ---------- */
function openTag(id) {
  var t = tagById(id);
  if (!t) return;
  modal = 'tag';
  var count = live().filter(function (n) { return n.tagIds.indexOf(t.id) > -1; }).length;
  openSheet(shead('Modifier le tag') +
    '<div><label class="l" for="tname">Nom</label><input id="tname" class="field" value="' + esc(t.name) + '" maxlength="30" autofocus></div>' +
    '<div><label class="l" for="tdesc">Description (facultative)</label><textarea id="tdesc" class="field" rows="2">' + esc(t.desc) + '</textarea><div class="help">' + I(IC.spark, 14) + '<span>Aide l\'IA à savoir quand poser ce tag.</span></div></div>' +
    '<div class="err" id="terr" role="alert" hidden></div>' +
    '<div class="actions"><button class="btn primary" data-a="tsave" data-id="' + t.id + '">Enregistrer</button><button class="btn danger" data-a="tdel" data-id="' + t.id + '">Supprimer</button></div>' +
    '<div class="help"><span>Supprimer retire #' + esc(t.name) + ' de ' + plural(count, 'note', 'notes') + '.</span></div>', 'Tag');
}

/* ---------- Fusion (F47) ---------- */
var mg = null;
function openMerge(kind) {
  mg = { kind: kind };
  modal = 'merge';
  var items = kind === 'notebook' ? S.notebooks.map(function (c) { return { id: c.id, name: c.name }; }) : S.tags.map(function (t) { return { id: t.id, name: '#' + t.name }; });
  if (items.length < 2) { toast('Il faut au moins deux ' + (kind === 'notebook' ? 'carnets' : 'tags') + '.'); return; }
  var opt = function (sel) { return items.map(function (x, i) { return '<option value="' + x.id + '"' + (i === sel ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join(''); };
  openSheet(shead(kind === 'notebook' ? 'Fusionner des carnets' : 'Fusionner des tags') +
    '<div><label class="l" for="mfrom">Source (disparaît)</label><select id="mfrom" class="field">' + opt(0) + '</select></div>' +
    '<div><label class="l" for="mto">Cible (reçoit les notes)</label><select id="mto" class="field">' + opt(1) + '</select></div>' +
    '<div class="help" id="minfo"></div>' +
    '<div class="actions"><button class="btn ghost" data-a="close">Annuler</button><button class="btn primary" data-a="merge-go">Fusionner</button></div>', 'Fusion');
  mergeInfo();
}
function mergeInfo() {
  var from = $('#mfrom').value, to = $('#mto').value;
  var k = live().filter(function (n) { return mg.kind === 'notebook' ? n.notebookId === from : n.tagIds.indexOf(from) > -1; }).length;
  $('#minfo').innerHTML = from === to ? '<span class="err">Choisissez deux éléments différents.</span>' : '<span>' + plural(k, 'note rejoindra', 'notes rejoindront') + ' la cible. Aucun appel IA. Annulable juste après.</span>';
}

/* ---------- Re-tri (F13) ---------- */
var rt = null;
function openRetri(intro) {
  modal = 'retri';
  rt = { scope: 'unlocked', intro: intro || '' };
  renderRetriConfirm();
}
function renderRetriConfirm() {
  api('GET', 'retri/estimate?scope=' + rt.scope).then(function (e) {
    if (modal !== 'retri') return;
    var sc = function (v, l, d) { return '<button type="button" class="row" role="radio" aria-checked="' + (rt.scope === v) + '" data-a="retri-scope" data-id="' + v + '" style="min-height:56px;' + (rt.scope === v ? 'border:2px solid var(--accent);background:var(--accent-soft)' : '') + '"><span class="rt"><b>' + l + '</b><span>' + d + '</span></span></button>'; };
    openSheet(shead('Relancer le tri') + (rt.intro ? '<p class="sub" style="margin:0">' + esc(rt.intro) + '</p>' : '') +
      '<div><div class="l">Périmètre</div><div style="display:flex;flex-direction:column;gap:6px" role="radiogroup">' + sc('unlocked', 'Notes sans correction manuelle', 'Les classements verrouillés ne bougent pas.') + sc('all', 'Toutes les notes', 'Y compris celles corrigées à la main.') + '</div></div>' +
      '<div class="summary"><div class="big"><b>' + e.count + '</b><span style="font-weight:600">' + (e.count > 1 ? 'notes réexaminées' : 'note réexaminée') + '</span></div><div class="stats"><div><b>' + e.calls + '</b><span>appels IA (' + PROV[S.settings.providers.classif] + ')</span></div><div><b>≈ ' + e.words + '</b><span>mots envoyés, texte déjà extrait</span></div></div></div>' +
      '<div class="help"><span>Aucune retranscription ni nouvelle description : seul le texte enregistré est envoyé. Un carnet choisi à la création n\'est jamais changé. Le récapitulatif permet d\'annuler.</span></div>' +
      '<div class="actions"><button class="btn ghost" data-a="close">Plus tard</button><button class="btn primary" data-a="retri-go"' + (e.count ? '' : ' disabled') + '>' + I(IC.spark, 18) + 'Lancer le tri</button></div>', 'Re-tri');
  }, fail);
}
function renderRetriRecap() {
  var r = S.retri;
  if (!r) return;
  modal = 'retri-recap';
  var running = r.status === 'running';
  var name = function (id) { var c = nb(id); return c ? esc(c.name) : 'À vérifier'; };
  var tags = function (ids) { return ids.map(function (id) { var t = tagById(id); return t ? '#' + esc(t.name) : ''; }).filter(Boolean).join(' ') || '—'; };
  var items = r.items.map(function (it) {
    return '<div class="mv"><div class="mt">' + esc((noteById(it.noteId) || it).title) + '</div><div class="mr"><div class="mc">' + name(it.from.notebookId) + ' ' + tags(it.from.tagIds) + ' → <b>' + name(it.to.notebookId) + '</b> ' + tags(it.to.tagIds) + '</div>' +
      (it.undone ? '<span class="muted">Annulé</span>' : '<button class="btn ghost" style="height:44px" data-a="retri-undo" data-id="' + it.noteId + '">Annuler</button>') + '</div></div>';
  }).join('');
  openSheet(shead('Récapitulatif du re-tri') +
    '<div class="summary"><div class="big"><b>' + r.items.length + '</b><span style="font-weight:600">' + (r.items.length > 1 ? 'notes déplacées' : 'note déplacée') + '</span></div><div class="stats"><div><b>' + r.done + ' / ' + r.total + '</b><span>notes examinées</span></div><div><b>' + (running ? 'En cours' : r.status === 'stopped' ? 'Interrompu' : 'Terminé') + '</b><span>' + fmtDate(r.date) + '</span></div></div></div>' +
    (r.error ? '<div class="err">' + esc(r.error) + '</div>' : '') +
    (running ? '<div class="status">' + I(IC.spark) + 'Tri en cours…</div>' : '') +
    '<div style="display:flex;flex-direction:column;gap:8px">' + (items || '<p class="sub">Aucun déplacement.</p>') + '</div>' +
    '<div class="actions">' + (r.items.some(function (x) { return !x.undone; }) ? '<button class="btn danger" data-a="retri-undo">Tout annuler</button>' : '') + '<button class="btn primary" data-a="close">Fermer</button></div>', 'Récapitulatif du re-tri');
  pollRetri();
}
function pollRetri() {
  clearTimeout(timers.retriPoll);
  if (modal !== 'retri-recap' || !S.retri || S.retri.status !== 'running') return;
  timers.retriPoll = setTimeout(function () {
    api('GET', 'retri/' + S.retri.id).then(function (r) {
      S.retri = r.retri;
      if (modal !== 'retri-recap') return;
      renderRetriRecap();
      if (r.retri.status !== 'running') sync(); else pollRetri();
    }, function () { pollRetri(); });
  }, 1000);
}

/* ---------- Synthèse (F34–F63) ---------- */
var SMODES = [['short', 'Synthèse courte', 'Points clés par carnet', 0.25], ['full', 'Document complet', 'Tout réorganisé, rien n\'est perdu (le plus coûteux)', 1], ['prose', 'Texte rédigé', 'Texte suivi et structuré', 0.5]];
var syn = null;
function filterLabel() {
  var p = [];
  p.push(F.cat === '__none' ? 'À vérifier' : F.cat ? (nb(F.cat) || { name: 'Tous les carnets' }).name : 'Tous les carnets');
  var tg = F.tags.map(function (id) { var t = tagById(id); return t ? '#' + t.name : ''; }).filter(Boolean);
  if (tg.length) p.push(tg.join(F.tagMode === 'any' ? ' ou ' : ' · '));
  if (F.read) p.push(F.read === 'todo' ? 'À lire' : 'Lues');
  if (F.q.trim()) p.push('« ' + F.q.trim() + ' »');
  if (periodLabel()) p.push('Créées : ' + periodLabel());
  return p.join(' · ');
}
function openSynth() {
  var all = filtered().filter(function (n) { return n.type !== 'synthesis'; });
  syn = { ids: all.map(function (n) { return n.id; }), label: filterLabel(), mode: 'short', est: null };
  modal = 'synth';
  renderSynthConfirm();
}
function renderSynthConfirm() {
  api('POST', 'syntheses/estimate', { ids: syn.ids, mode: syn.mode }).then(function (e) {
    if (modal !== 'synth') return;
    syn.est = e;
    var lim = S.settings;
    var over = e.count > lim.synthMaxNotes || e.words > lim.synthMaxWords;
    openSynthSheet(
      '<div><div class="l">Format</div><div style="display:flex;flex-direction:column;gap:6px" role="radiogroup" aria-label="Format de la synthèse">' + SMODES.map(function (m) { return '<button type="button" class="row" role="radio" aria-checked="' + (syn.mode === m[0]) + '" data-a="synth-mode" data-id="' + m[0] + '" style="min-height:56px;' + (syn.mode === m[0] ? 'border:2px solid var(--accent);background:var(--accent-soft)' : '') + '"><span class="rt"><b>' + m[1] + '</b><span>' + m[2] + '</span></span></button>'; }).join('') + '</div></div>' +
      '<div class="summary"><div class="big"><b>' + e.count + '</b><span style="font-weight:600">' + (e.count > 1 ? 'notes seront résumées' : 'note sera résumée') + '</span></div>' +
      '<div class="stats"><div><b>≈ ' + e.words + '</b><span>mots envoyés, texte seulement</span></div><div><b>≈ ' + e.produced + '</b><span>mots produits</span></div><div><b>1</b><span>appel IA (' + PROV[e.provider] + ')</span></div></div></div>' +
      '<div class="help">' + I(IC.search, 14) + '<span>Filtres : ' + esc(syn.label) + '</span></div>' +
      (e.excluded ? '<div class="help">' + I(IC.help, 14) + '<span>' + (e.excluded > 1 ? e.excluded + ' notes non analysées sont exclues.' : '1 note non analysée est exclue.') + '</span></div>' : '') +
      (over ? '<div class="err">Au-delà de la limite (' + lim.synthMaxNotes + ' notes, ' + lim.synthMaxWords + ' mots). Resserrez les filtres ou faites une synthèse par carnet.</div>' : '') +
      (e.duplicateId ? '<div class="banner info">Une synthèse identique (mêmes notes, même format) existe déjà.<button data-a="hist-view" data-id="' + e.duplicateId + '">L\'ouvrir sans appel IA</button></div>' : '') +
      '<div class="actions"><button class="btn" data-a="close">Annuler</button><button class="btn primary" data-a="synth-go"' + (over || !e.count ? ' disabled' : '') + '>' + I(IC.spark, 18) + (e.duplicateId ? 'Régénérer quand même' : 'Générer') + '</button></div>');
  }, fail);
}
function openSynthSheet(body, title) { openSheet(shead(title || 'Synthèse des notes affichées') + body, 'Synthèse'); }
function synthGo() {
  modal = 'synth-loading';
  openSynthSheet('<div class="card busy" aria-busy="true"><div class="bar" style="width:70%"></div><div class="bar" style="width:90%"></div><div class="bar" style="width:55%"></div><div class="status">' + I(IC.spark) + 'Synthèse en cours (un seul appel)…</div></div>');
  api('POST', 'syntheses', { ids: syn.ids, mode: syn.mode, label: syn.label }).then(function (r) {
    S.synthesesCount++;
    cacheSynth(r.synthesis);
    showSynthesis(r.synthesis, false);
  }, function (e) { modal = 'synth'; fail(e); renderSynthConfirm(); });
}

// Markdown simple → HTML sûr, avec les renvois [n] cliquables vers la note d'origine.
function mdToHtml(text, noteIds) {
  var inline = function (s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\[(\d+)\]/g, function (m, k) {
      var id = noteIds[Number(k) - 1];
      return id ? '<button class="ref" data-a="open" data-id="' + id + '" aria-label="Ouvrir la note ' + k + '">' + k + '</button>' : m;
    });
  };
  var out = [], list = false;
  String(text || '').split('\n').forEach(function (l) {
    var m;
    if ((m = l.match(/^\s*[-*]\s+(.*)$/))) { if (!list) { out.push('<ul>'); list = true; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
    if (list) { out.push('</ul>'); list = false; }
    if ((m = l.match(/^#{1,2}\s+(.*)$/))) out.push('<h3>' + inline(m[1]) + '</h3>');
    else if ((m = l.match(/^#{3,}\s+(.*)$/))) out.push('<h4>' + inline(m[1]) + '</h4>');
    else if (l.trim()) out.push('<p>' + inline(l) + '</p>');
  });
  if (list) out.push('</ul>');
  return out.join('');
}
function cacheSynth(x) {
  try { var h = JSON.parse(localStorage.getItem('mainotes-hist') || '{}'); h[x.id] = x; localStorage.setItem('mainotes-hist', JSON.stringify(h)); } catch (e) { /* rien */ }
}
function cachedSynth(id) {
  try { return JSON.parse(localStorage.getItem('mainotes-hist') || '{}')[id] || null; } catch (e) { return null; }
}
var curSynth = null;
function showSynthesis(x, fromHist) {
  curSynth = x;
  modal = 'synth-view';
  var mode = SMODES.filter(function (m) { return m[0] === x.mode; })[0];
  openSynthSheet(
    '<div><label class="l" for="htitle">Titre</label><div class="pw-row"><input id="htitle" class="field" maxlength="120" value="' + esc(x.title) + '"><button class="btn" data-a="hist-title">Renommer</button></div>' +
    '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' + (x.notebooks || []).map(function (c) { return '<span class="chip">' + esc(c) + '</span>'; }).join('') + (x.tags || []).map(function (t) { return '<span class="chip">#' + esc(t) + '</span>'; }).join('') + '</div></div>' +
    '<div class="help" style="margin-top:0">' + I(IC.search, 14) + '<span>' + esc(x.label || '') + ' · ' + plural(x.count, 'note', 'notes') + '</span></div>' +
    '<div class="report">' + mdToHtml(x.text, x.noteIds || []) + '</div>' +
    '<div class="help">' + I(IC.spark, 14) + '<span>' + (fromHist ? 'Enregistrée le ' + fmtFull(x.date) + '. Aucun nouvel appel IA. Vos notes ont pu changer depuis.' : 'Générée par l\'IA (' + PROV[x.provider] + ') et enregistrée dans l\'historique.') + ' Vérifiez les points importants dans les notes d\'origine.</span></div>' +
    '<div class="actions"><button class="btn primary" data-a="synth-copy">Copier le texte</button><a class="btn" href="api/syntheses/' + x.id + '/pdf" download>Télécharger en PDF</a><button class="btn" data-a="synth-note">Enregistrer comme note</button></div>' +
    '<div class="actions"><button class="btn" data-a="hist-pin" aria-pressed="' + !!x.pinned + '">' + (x.pinned ? 'Désépingler' : 'Épingler (pas de purge)') + '</button><button class="btn ghost" data-a="hist-open">Historique</button></div>', mode ? mode[1] : 'Synthèse');
}

var histQ = { q: '', nb: '', tag: '' }, histList = [];
function openHist() {
  modal = 'hist';
  var draw = function () {
    var q = norm(histQ.q);
    var list = histList.filter(function (e) {
      if (q && norm(e.title).indexOf(q) < 0) return false;
      if (histQ.nb && (e.notebooks || []).indexOf(histQ.nb) < 0) return false;
      if (histQ.tag && (e.tags || []).indexOf(histQ.tag) < 0) return false;
      return true;
    });
    var nbs = [], tgs = [];
    histList.forEach(function (e) { (e.notebooks || []).forEach(function (c) { if (nbs.indexOf(c) < 0) nbs.push(c); }); (e.tags || []).forEach(function (t) { if (tgs.indexOf(t) < 0) tgs.push(t); }); });
    var nm = function (m) { var x = SMODES.filter(function (s) { return s[0] === m; })[0]; return x ? x[1] : m; };
    var box = $('#histlist');
    if (!box) return;
    box.innerHTML = list.length ? list.map(function (e) {
      return '<div style="display:flex;gap:8px;align-items:stretch"><button class="row" data-a="hist-view" data-id="' + e.id + '" style="min-height:84px;height:auto"><span class="rt"><b>' + (e.pinned ? 'Épinglée · ' : '') + esc(e.title) + '</b><span>' + nm(e.mode) + ' · ' + plural(e.count, 'note', 'notes') + ' · ' + fmtDate(e.date) + '</span><span style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">' + (e.notebooks || []).map(function (c) { return '<span class="chip" style="height:26px;font-size:12px">' + esc(c) + '</span>'; }).join('') + (e.tags || []).map(function (t) { return '<span class="chip" style="height:26px;font-size:12px">#' + esc(t) + '</span>'; }).join('') + '</span></span></button><button class="btn danger" data-a="hist-del" data-id="' + e.id + '" aria-label="Supprimer cette synthèse" style="height:auto;width:56px;padding:0">' + I(IC.x, 18) + '</button></div>';
    }).join('') : '<div class="empty"><h3>Aucune synthèse</h3><p>Chaque synthèse générée est conservée ici.</p></div>';
    var sel = function (id, arr, cur, all) { return '<select id="' + id + '" class="field"><option value="">' + all + '</option>' + arr.map(function (v) { return '<option' + (v === cur ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('') + '</select>'; };
    var f = $('#histfilters');
    if (f && !f.dataset.done) {
      f.dataset.done = '1';
      f.innerHTML = '<input id="hq" class="field" type="search" placeholder="Mot du titre" value="' + esc(histQ.q) + '">' + sel('hnb', nbs, histQ.nb, 'Tous les carnets') + sel('htag', tgs.map(function (t) { return t; }), histQ.tag, 'Tous les tags');
      f.addEventListener('input', function () { histQ.q = $('#hq').value; histQ.nb = $('#hnb').value; histQ.tag = $('#htag').value; draw(); });
    }
  };
  openSheet(shead('Historique des synthèses') + '<div class="grid2" id="histfilters"></div><div id="histlist" style="display:flex;flex-direction:column;gap:8px"><p class="sub">Chargement…</p></div><div class="help"><span>Ouvrir une synthèse enregistrée ne consomme aucun appel IA. Les ' + S.settings.historyMax + ' dernières sont gardées, plus les épinglées.</span></div>', 'Historique des synthèses');
  api('GET', 'syntheses').then(function (r) { histList = r.syntheses; S.synthesesCount = histList.length; draw(); }, function (e) {
    try { var h = JSON.parse(localStorage.getItem('mainotes-hist') || '{}'); histList = Object.keys(h).map(function (k) { return h[k]; }).sort(function (a, b) { return b.date - a.date; }); } catch (x) { histList = []; }
    draw();
    if (e.network) toast('Hors connexion : seules les synthèses déjà ouvertes sur cet appareil sont listées.');
  });
}
function viewHist(id) {
  var local = histList.filter(function (x) { return x.id === id; })[0] || cachedSynth(id);
  if (local) { cacheSynth(local); showSynthesis(local, true); return; }
  api('GET', 'syntheses').then(function (r) { histList = r.syntheses; var x = histList.filter(function (y) { return y.id === id; })[0]; if (x) { cacheSynth(x); showSynthesis(x, true); } }, fail);
}

/* ---------- Corbeille ---------- */
function openTrash() {
  modal = 'trash';
  var list = S.notes.filter(function (n) { return n.trashedAt; }).sort(function (a, b) { return b.trashedAt - a.trashedAt; });
  openSheet(shead('Corbeille') +
    (list.length ? '<div style="display:flex;flex-direction:column;gap:8px">' + list.map(function (n) {
      return '<div class="row" style="cursor:default"><span class="rt"><b>' + esc(n.title) + '</b><span>' + TYPE_LABEL[n.type] + ' · supprimée ' + fmtDate(n.trashedAt) + '</span></span><button class="btn" style="height:44px" data-a="restore" data-id="' + n.id + '">Restaurer</button></div>';
    }).join('') + '</div><div class="actions"><button class="btn danger" data-a="trash-empty">Vider la corbeille</button></div>' : '<p class="sub">La corbeille est vide.</p>') +
    '<div class="help"><span>Les notes sont supprimées définitivement 30 jours après leur mise à la corbeille, avec leurs fichiers.</span></div>', 'Corbeille');
}

/* Après chaque synchronisation, les fenêtres ouvertes se mettent à jour. */
function onSynced() {
  if (modal === 'detail') {
    var n = curNote();
    var active = document.activeElement && $('#sheet').contains(document.activeElement) && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (n && detailSnap && n.updatedAt !== detailSnap.updatedAt && (!detailEdit || (!Object.keys(detailPatch()).length && !active))) openDetail(curId);
  } else if (modal === 'retri-recap') {
    renderRetriRecap();
  }
}

/* Bloc « Pour aller plus loin » : complément généré par l'IA, liens vérifiés. */
// Toujours présent dans le détail : sans enrichissement, il propose de le lancer
// (le texte modifié est enregistré d'abord, puis l'IA travaille sur la version à jour).
function enrichBtn(n, again) {
  var st = S.settings;
  return '<button class="btn" data-a="enrich" data-id="' + n.id + '">' + I(IC.spark, 18) + (again ? 'Régénérer les pistes' : 'Enrichir cette note') + (st.providers.enrich !== 'infomaniak' ? ' (' + PROV[st.providers.enrich] + ')' : '') + '</button>';
}
function enrichHtml(n) {
  var e = n.enrichment;
  var st = S.settings;
  if (!e) {
    if (st.trigger.enrich === 'off') return '<div class="help">' + I(IC.spark, 14) + '<span>Enrichissement désactivé. <button class="linkbtn" data-a="tab" data-id="set" style="min-height:0;padding:0">Changer le réglage</button></span></div>';
    return '<div class="panel enrich" style="margin:0"><h3>' + I(IC.spark, 16) + ' Pour aller plus loin</h3><p class="sub" style="margin:0">Explication du sujet, pistes, recherches et sources vérifiées. Un appel IA.</p><div class="actions">' + enrichBtn(n, false) + '</div></div>';
  }
  var h = '<div class="panel enrich" style="margin:0"><div class="kv"><h3>' + I(IC.spark, 16) + ' Pour aller plus loin</h3><button class="linkbtn" data-a="enrich-del" data-id="' + n.id + '">Retirer</button></div>';
  if (e.explanation) h += '<p style="margin:0">' + esc(e.explanation) + '</p>';
  if (e.leads && e.leads.length) h += '<div><div class="l">Pistes</div><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px">' + e.leads.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
  if (e.links && e.links.length) h += '<div><div class="l">Sources</div><div style="display:flex;flex-direction:column;gap:8px">' + e.links.map(function (l) { return linkCard({ url: l.url, title: l.title, site: l.site, summary: l.summary }, true); }).join('') + '</div></div>';
  if (e.searches && e.searches.length) h += '<div><div class="l">Rechercher</div><div style="display:flex;flex-direction:column;gap:6px">' + e.searches.map(function (s) {
    return '<div class="kv" style="justify-content:flex-start"><span style="color:var(--ink)">« ' + esc(s.query) + ' »</span><span><a href="' + esc(s.web) + '" target="_blank" rel="noopener noreferrer">Web</a> · <a href="' + esc(s.scholar) + '" target="_blank" rel="noopener noreferrer">Scholar</a></span></div>';
  }).join('') + '</div></div>';
  if (st.trigger.enrich !== 'off') h += '<div class="actions">' + enrichBtn(n, true) + '</div>';
  h += '<div class="help" style="margin:0">' + I(IC.help, 14) + '<span>Généré par l\'IA (' + esc(PROV[e.provider] || e.provider) + ') le ' + fmtFull(e.at) + ' : à vérifier. Les sources proposées ont été ouvertes par le serveur' + (e.rejected ? ' ; ' + plural(e.rejected, 'lien introuvable a été écarté', 'liens introuvables ont été écartés') : '') + '.</span></div></div>';
  return h;
}

/* Actions rapides d'une carte (appui long ou clic droit). */
function openQuick(id) {
  var n = noteById(id);
  if (!n) return;
  modal = 'quick';
  var b = function (act, icon, label, cls) { return '<button type="button" class="qact' + (cls ? ' ' + cls : '') + '" data-a="' + act + '" data-id="' + n.id + '">' + I(icon, 24) + '<span>' + label + '</span></button>'; };
  openSheet(shead(esc(n.title)) + '<div class="qgrid">' +
    b('open', IC.synthesis, 'Ouvrir') + b('qedit', IC.text, 'Modifier') +
    b('qread', n.read === 'todo' ? IC.check : IC.bookmark, n.read === 'todo' ? 'Marquer lue' : 'À lire') +
    b('qtrash', TRASH, 'Corbeille', 'danger') + '</div>', 'Actions rapides');
}
