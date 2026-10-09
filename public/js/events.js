/* Gestion des clics, saisies et raccourcis clavier (délégation sur le document). */
'use strict';

function analyze(id, extra) {
  return api('POST', 'notes/' + id + '/analyze', extra || {}).then(function (r) { upsertNote(r.note); render(); scheduleSync(); if (modal === 'detail') openDetail(id); }, fail);
}

// Teste la clé et recharge la liste des modèles disponibles dans les menus.
function testKey(p) {
  var out = $('#ktest-' + p);
  if (out) out.textContent = 'Test en cours…';
  var pending = setDirty ? saveSettings() : Promise.resolve();
  return pending.then(function () { return api('POST', 'keys/' + p + '/test', {}); }).then(function (r) {
    return api('GET', 'state').then(function (d) {
      S.providers = d.providers; saveCache();
      var prov = S.providers.filter(function (x) { return x.id === p; })[0];
      var box = $('#models-' + p);
      if (box && prov) {
        $$('select', box).forEach(function (sel) {
          var k = sel.id.split('-').pop();
          var tmp = document.createElement('div');
          tmp.innerHTML = modelSelect(prov, k, sel.value);
          sel.innerHTML = tmp.firstChild.innerHTML;
        });
      }
      var n = (r.models && r.models.chat || []).length;
      var o = $('#ktest-' + p);
      if (o) o.innerHTML = '<span class="ok">Connexion réussie.</span> ' + n + (n > 1 ? ' modèles disponibles' : ' modèle disponible') + ' : choisissez-les dans « Modèles ».';
    });
  }, function (e) { var o = $('#ktest-' + p); if (o) o.innerHTML = '<span class="ko">' + esc(e.message) + '</span>'; });
}

var ACTIONS = {
  reload: function () { location.reload(); },
  'pw-toggle': function (el) { var i = $('#' + el.dataset.id); var show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.textContent = show ? 'Masquer' : 'Afficher'; },
  tab: function (el) { closeModal(); setTab(el.dataset.id); window.scrollTo(0, 0); },
  add: function () { openAdd('text'); },
  close: function () { if (modal === 'detail') saveDetail(true); else closeModal(); },
  flush: function () { flushOutbox(); },
  'outbox-del': function (el) { outbox = outbox.filter(function (x) { return x.clientId !== el.dataset.id; }); idbDel(el.dataset.id); render(); },

  fcat: function (el) { var id = el.dataset.id || null; F.cat = F.cat === id ? null : id; renderHome(); },
  ftag: function (el) { var id = el.dataset.id, i = F.tags.indexOf(id); if (i > -1) F.tags.splice(i, 1); else F.tags.push(id); renderHome(); },
  clearf: function () { F = { q: '', cat: null, tags: [] }; $('#q').value = ''; renderHome(); },
  qclear: function () { F.q = ''; $('#q').value = ''; renderHome(); $('#q').focus(); },
  open: function (el) { if (modal === 'detail' && curId !== el.dataset.id) saveDetail(false); openDetail(el.dataset.id); },
  analyze: function (el) { analyze(el.dataset.id); },
  enrich: function (el) {
    el.disabled = true;
    el.textContent = 'Enrichissement en cours…';
    var save = modal === 'detail' ? saveDetail(false) : Promise.resolve();
    save.then(function () { return api('POST', 'notes/' + el.dataset.id + '/enrich', {}); }).then(function (r) {
      upsertNote(r.note); render(); if (modal === 'detail') openDetail(el.dataset.id);
      toast(r.empty ? 'Rien à ajouter pour cette note, selon l\'IA.' : 'Pistes ajoutées à la note');
    }, function (e) { fail(e); if (modal === 'detail') openDetail(el.dataset.id); });
  },
  'enrich-del': function (el) { api('DELETE', 'notes/' + el.dataset.id + '/enrichment').then(function (r) { upsertNote(r.note); render(); openDetail(el.dataset.id); }, fail); },
  describe: function (el) { analyze(el.dataset.id, { describe: true }); },
  'analyze-with': function (el) { analyze(curId, { provider: el.dataset.id }); },
  'analyze-all': function () {
    api('POST', 'notes-analyze-all', {}).then(function (r) { toast(plural(r.count, 'note envoyée', 'notes envoyées') + ' à l\'analyse'); return sync(); }, fail);
  },

  addtab: function (el) { if (add.rec && add.rec.on) return; if ($('#ntext')) add.text = $('#ntext').value; if ($('#icap')) add.caption = $('#icap').value; add.notebookId = $('#addcat').value; add.tab = el.dataset.id; renderAdd(); },
  'add-text': addText,
  'rec-start': function () { add.notebookId = $('#addcat').value; startRecording(); },
  'rec-stop': function () { stopRecording(); },
  'rec-discard': function () { if (add.audio) URL.revokeObjectURL(add.audio.url); add.audio = null; renderAdd(); },
  'add-voice': addVoice,
  'add-img': addImages,

  dsave: function () { saveDetail(false).then(function (ok) { if (ok) openDetail(curId, false); }); },
  dedit: function () { openDetail(curId, true); },
  dcancel: function () { openDetail(curId, false); },
  dlock: function (el) { var on = el.getAttribute('aria-checked') !== 'true'; el.setAttribute('aria-checked', String(on)); patchNote({ locked: on }); },
  dtag: function (el) { var n = curNote(); patchNote({ tagIds: n.tagIds.filter(function (x) { return x !== el.dataset.id; }) }).then(function () { dtSel(); dtList(false); }); },
  dtpick: function (el) { dtPick(Number(el.dataset.i)); },
  sg: function (el) {
    saveDetail(false).then(function () {
      return api('POST', 'notes/' + curId + '/suggestion', { action: el.dataset.id });
    }).then(function (r) {
      upsertNote(r.note); S.notebooks = r.notebooks; S.tags = r.tags; render(); openDetail(curId);
      if (el.dataset.id === 'notebook') toast('Carnet créé : complétez sa description dans l\'onglet Carnets.');
    }, fail);
  },
  del: function () {
    api('DELETE', 'notes/' + curId).then(function () { var n = curNote(); if (n) n.trashedAt = Date.now(); closeModal(); render(); toast('Note mise à la corbeille'); }, fail);
  },
  purge: function (el) {
    if (!confirm('Supprimer définitivement cette note et ses fichiers ?')) return;
    api('DELETE', 'notes/' + el.dataset.id + '?purge=1').then(function () { S.notes = S.notes.filter(function (n) { return n.id !== el.dataset.id; }); closeModal(); render(); }, fail);
  },
  restore: function (el) { api('POST', 'notes/' + el.dataset.id + '/restore', {}).then(function (r) { upsertNote(r.note); render(); if (modal === 'trash') openTrash(); else if (modal === 'detail') openDetail(el.dataset.id); toast('Note restaurée'); }, fail); },
  'trash-open': openTrash,
  'trash-empty': function () { if (!confirm('Vider la corbeille ? Les notes et leurs fichiers seront supprimés définitivement.')) return; api('POST', 'trash/empty', {}).then(function () { S.notes = S.notes.filter(function (n) { return !n.trashedAt; }); closeModal(); render(); }, fail); },

  'cat-new': function () { openNotebook(null); },
  'cat-edit': function (el) { openNotebook(el.dataset.id); },
  ccolor: function (el) { ce.color = el.dataset.id; $$('#sw button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.id === ce.color)); }); },
  csave: saveNotebook,
  cdel: function () {
    var c = nb(ce.id);
    if (!c || !confirm('Supprimer le carnet « ' + c.name + ' » ? Ses notes passeront « à vérifier ».')) return;
    api('DELETE', 'notebooks/' + c.id).then(function (r) { closeModal(); toast('Carnet supprimé · ' + plural(r.moved, 'note', 'notes') + ' à vérifier'); return sync(); }, fail);
  },
  'tag-edit': function (el) { openTag(el.dataset.id); },
  tsave: function (el) {
    api('PATCH', 'tags/' + el.dataset.id, { name: $('#tname').value, desc: $('#tdesc').value }).then(function () { closeModal(); return sync(); }, function (e) { var x = $('#terr'); x.textContent = e.message; x.hidden = false; });
  },
  tdel: function (el) {
    var t = tagById(el.dataset.id);
    if (!t || !confirm('Supprimer le tag #' + t.name + ' ? Il sera retiré de toutes les notes.')) return;
    api('DELETE', 'tags/' + t.id).then(function () { F.tags = F.tags.filter(function (x) { return x !== t.id; }); closeModal(); toast('Tag supprimé'); return sync(); }, fail);
  },
  'merge-open': function (el) { openMerge(el.dataset.id); },
  'merge-go': function () {
    var from = $('#mfrom').value, to = $('#mto').value;
    if (from === to) return;
    api('POST', (mg.kind === 'notebook' ? 'notebooks' : 'tags') + '/merge', { from: from, to: to }).then(function (r) {
      closeModal();
      if (F.cat === from) F.cat = to;
      F.tags = F.tags.map(function (x) { return x === from ? to : x; });
      openSheet(shead('Fusion effectuée') + '<p>' + plural(r.moved, 'note a rejoint', 'notes ont rejoint') + ' la cible.</p><div class="actions"><button class="btn" data-a="merge-undo">Annuler la fusion</button><button class="btn primary" data-a="close">Fermer</button></div>', 'Fusion');
      modal = 'merged';
      return sync();
    }, fail);
  },
  'merge-undo': function () { api('POST', 'merge/undo', {}).then(function () { closeModal(); toast('Fusion annulée'); return sync(); }, fail); },

  'retri-open': function () { openRetri(''); },
  'retri-scope': function (el) { rt.scope = el.dataset.id; renderRetriConfirm(); },
  'retri-go': function () {
    api('POST', 'retri', { scope: rt.scope }).then(function (r) { S.retri = r.retri; renderRetriRecap(); scheduleSync(); }, fail);
  },
  'retri-recap': function () { renderRetriRecap(); },
  'retri-undo': function (el) {
    api('POST', 'retri/' + S.retri.id + '/undo', el.dataset.id ? { noteId: el.dataset.id } : {}).then(function (r) { S.retri = r.retri; return sync().then(renderRetriRecap); }, fail);
  },

  synth: openSynth,
  'synth-mode': function (el) { syn.mode = el.dataset.id; renderSynthConfirm(); },
  'synth-go': synthGo,
  'synth-copy': function () {
    var t = curSynth.title + '\n\n' + curSynth.text.replace(/\[(\d+)\]/g, '');
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Texte copié'); }, function () { toast('Copie impossible sur ce navigateur.'); });
  },
  'synth-note': function () { api('POST', 'syntheses/' + curSynth.id + '/note', {}).then(function (r) { upsertNote(r.note); render(); toast('Synthèse enregistrée comme note'); }, fail); },
  'hist-open': openHist,
  'hist-view': function (el) { viewHist(el.dataset.id); },
  'hist-del': function (el) {
    if (!confirm('Supprimer cette synthèse de l\'historique ?')) return;
    api('DELETE', 'syntheses/' + el.dataset.id).then(openHist, fail);
  },
  'hist-title': function () { api('PATCH', 'syntheses/' + curSynth.id, { title: $('#htitle').value }).then(function (r) { curSynth = r.synthesis; cacheSynth(r.synthesis); toast('Titre enregistré'); }, fail); },
  'hist-pin': function () { api('PATCH', 'syntheses/' + curSynth.id, { pinned: !curSynth.pinned }).then(function (r) { cacheSynth(r.synthesis); showSynthesis(r.synthesis, true); }, fail); },

  'set-save': function () { saveSettings(); },
  'set-trig': function (el) { var t = {}; t[el.dataset.k] = el.dataset.id; saveSettings({ trigger: t }); },
  'set-enable': function (el) { var e = {}; e[el.dataset.id] = el.getAttribute('aria-checked') !== 'true'; saveSettings({ enabled: e }); },
  'set-sw': function (el) { var b = {}; b[el.dataset.id] = el.getAttribute('aria-checked') !== 'true'; saveSettings(b); },
  'key-save': function (el) {
    var p = el.dataset.id, v = $('#key-' + p).value.trim();
    if (!v) { toast('Collez d\'abord la clé.'); return; }
    var pending = setDirty ? saveSettings() : Promise.resolve();
    pending.then(function () { return api('PUT', 'keys/' + p, { key: v }); }).then(function (r) {
      S.providers = r.providers;
      var en = {}; en[p] = true;
      return saveSettings({ enabled: en });
    }).then(function () { toast('Clé enregistrée (chiffrée sur le serveur)'); return testKey(p); }, fail);
  },
  'key-del': function (el) {
    if (!confirm('Effacer la clé ' + PROV[el.dataset.id] + ' ?')) return;
    api('PUT', 'keys/' + el.dataset.id, { key: '' }).then(function (r) { S.providers = r.providers; renderSet(); render(); }, fail);
  },
  'key-test': function (el) { testKey(el.dataset.id); },
  'log-open': openLog,

  logout: function () {
    api('POST', 'auth/logout', {}).then(function () { clearCache(); S.user = null; showAuth('login', {}); }, fail);
  },
  'sess-del': function (el) { api('DELETE', 'account/sessions/' + el.dataset.id).then(renderAccount, fail); },
  'sess-others': function () { api('POST', 'account/sessions/revoke-others', {}).then(function () { toast('Autres appareils déconnectés'); renderAccount(); }, fail); },
  'sw-local': function (el) { el.setAttribute('aria-checked', String(el.getAttribute('aria-checked') !== 'true')); }
};

document.addEventListener('click', function (e) {
  if (e.target.closest('a[href]')) return; // un vrai lien s'ouvre, sans ouvrir la carte
  var el = e.target.closest('[data-a]');
  if (el && ACTIONS[el.dataset.a]) {
    if (el.tagName === 'A') return;
    e.preventDefault();
    ACTIONS[el.dataset.a](el, e);
    return;
  }
  if (e.target.id === 'ov') { if (modal === 'detail') saveDetail(true); else if (!(add && add.rec && add.rec.on)) closeModal(); }
  if (!e.target.closest('.cbx') && $('#dtaglist')) dtList(false);
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && !$('#ov').hidden) {
    if ($('#dtaglist') && !$('#dtaglist').hidden) { dtList(false); return; }
    if (modal === 'detail') saveDetail(true); else closeModal();
    return;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('card') && e.target.dataset.a === 'open') { e.preventDefault(); openDetail(e.target.dataset.id); return; }
  if (e.target.id === 'dtagq') {
    if (e.key === 'ArrowDown') { e.preventDefault(); dtI = Math.min(dtI + 1, dtOpts.length - 1); dtList(true); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); dtI = Math.max(dtI - 1, 0); dtList(true); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!$('#dtaglist').hidden || e.target.value.trim()) { dtList(true); dtPick(dtI); } }
  }
  if (e.target.id === 'ntext' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) addText();
});

document.addEventListener('input', function (e) {
  var t = e.target;
  if (t.id === 'q') { F.q = t.value; renderHome(); return; }
  if (t.id === 'dtagq') { dtI = 0; dtList(true); return; }
  if (t.id === 'mfrom' || t.id === 'mto') { mergeInfo(); return; }
  if (t.closest && t.closest('#view-set') && t.hasAttribute('data-set')) { setDirty = true; var b = $('#savebar'); if (b) b.hidden = false; }
});
document.addEventListener('change', function (e) {
  var t = e.target;
  if (t.id === 'afile') importAudio(t.files[0]);
  if (t.id === 'ifile') { add.notebookId = $('#addcat').value; pickImages(t.files); }
  if (t.id === 'addcat' && add) add.notebookId = t.value;
  if (t.id === 'addenrich' && add) add.enrich = t.checked;
  if (t.id === 'defcat') saveSettings({ defaultNotebook: t.value }).then(function () { renderCats(); toast('Carnet par défaut enregistré'); });
  if (t.closest && t.closest('#view-set') && t.tagName === 'SELECT' && t.hasAttribute('data-set')) { setDirty = true; var b = $('#savebar'); if (b) b.hidden = false; }
});
document.addEventListener('focusin', function (e) { if (e.target.id === 'dtagq') dtList(true); });
document.addEventListener('submit', function (e) {
  if (e.target.id === 'ctxform') {
    e.preventDefault();
    saveSettings({ context: $('#ctx').value }).then(function () { toast('Description enregistrée'); renderCats(); });
    return;
  }
  if (e.target.id === 'tagform') {
    e.preventDefault();
    var v = $('#newtag').value.trim();
    if (!v) return;
    api('POST', 'tags', { name: v }).then(function (r) { if (r.existed) toast('Ce tag existe déjà.'); return sync().then(function () { if (!r.existed) askRetri('Tag #' + r.tag.name + ' ajouté.'); }); }, fail);
  }
});

boot();
