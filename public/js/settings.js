/* Onglets Réglages (IA, clés, budget, limites) et Compte (édition du compte unique). */
'use strict';

var setDirty = false, accountLoaded = false;

/* Cartes des onglets Réglages et Compte en accordéons, fermés par défaut. L'état
   ouvert/fermé est retenu pendant la session, pour survivre aux réaffichages. */
var accOpen = {};
function accordionize(root) {
  if (!root) return;
  $$('.panel', root).forEach(function (panel) {
    if (panel.parentElement !== root) return;
    if (panel.querySelector(':scope > details.acc-d')) return;
    var first = panel.firstElementChild;
    if (!first) return;
    var head = first.tagName === 'H3' || (first.classList.contains('kv') && first.querySelector('h3')) ? first : null;
    if (!head) return;
    var key = root.id + ':' + (head.querySelector('h3') || head).textContent.trim();
    var d = document.createElement('details');
    d.className = 'acc-d';
    if (accOpen[key]) d.open = true;
    var sum = document.createElement('summary');
    sum.appendChild(head);
    d.appendChild(sum);
    var body = document.createElement('div');
    body.className = 'acc-b';
    while (panel.firstChild) body.appendChild(panel.firstChild);
    d.appendChild(body);
    panel.appendChild(d);
    panel.classList.add('acc');
    d.addEventListener('toggle', function () { accOpen[key] = d.open; });
  });
}
var FN = [['classif', 'Classement des notes'], ['transcr', 'Transcription des vocaux'], ['vision', 'Description des images'], ['synth', 'Synthèse des notes affichées'], ['enrich', 'Enrichissement des notes']];

// Menu des modèles réellement disponibles (liste lue au dernier test de connexion).
// Le modèle en place reste choisi même s'il n'y figure plus, avec un avertissement.
function modelSelect(p, k, cur) {
  var list = p.models && p.models[k] ? p.models[k] : [];
  var h = '';
  if (cur && list.indexOf(cur) < 0) h += opt(cur, cur, esc(cur) + (list.length ? ' – absent de la liste, à remplacer' : ''));
  h += list.map(function (m) { return opt(m, cur, esc(m)); }).join('');
  return '<select id="m-' + p.id + '-' + k + '" class="field" data-set="models.' + p.id + '.' + k + '">' + h + '</select>';
}

// Quotas du fournisseur : limites saisies, compteur du jour, limites annoncées par
// l'API et dernier blocage (avec l'heure du nouvel essai).
function quotaHtml(p) {
  var q = p.quota || {};
  var set = q.set || {};
  var hhmm = function (t) { return new Date(t).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }); };
  var h = '<details' + (set.perDay || set.perMinute || q.lastQuota || q.observed ? ' open' : '') + '><summary class="l">Quotas du fournisseur</summary><div style="display:flex;flex-direction:column;gap:10px">';
  if (q.lastQuota) h += '<div class="banner warn" style="margin:0">' + esc(q.lastQuota.message.replace(/ Nouvel essai.*$/, '')) + ' Nouvel essai à ' + hhmm(q.lastQuota.retryAt) + '.</div>';
  h += '<div class="grid2"><div><label class="l" for="qm-' + p.id + '">Requêtes par minute</label><input id="qm-' + p.id + '" class="field" type="number" min="1" data-set="quotas.' + p.id + '.perMinute" data-num="1" value="' + (set.perMinute || '') + '" placeholder="Sans limite"></div>' +
    '<div><label class="l" for="qd-' + p.id + '">Requêtes par jour</label><input id="qd-' + p.id + '" class="field" type="number" min="1" data-set="quotas.' + p.id + '.perDay" data-num="1" value="' + (set.perDay || '') + '" placeholder="Sans limite"></div></div>';
  if (set.perDay) {
    var r = Math.min(1, q.today / set.perDay);
    h += '<div class="meter' + (r >= 1 ? ' blocked' : r >= 0.8 ? ' alert' : '') + '"><i style="width:' + Math.round(r * 100) + '%"></i></div>';
  }
  h += '<div class="kv"><span>Aujourd\'hui</span><span>' + q.today + (set.perDay ? ' sur ' + set.perDay : '') + ' requête' + (q.today > 1 ? 's' : '') + ' · remise à zéro dans ' + esc(q.resetIn || '') + '</span></div>';
  if (q.observed) h += observedHtml(p.id, q.observed);
  h += '<div class="help"><span>' + (p.id === 'gemini' ? 'Clé gratuite : vos limites exactes (par minute et par jour, selon le modèle) sont dans <a href="https://aistudio.google.com" target="_blank" rel="noopener noreferrer">Google AI Studio</a>. Le jour se compte à partir de minuit, heure du Pacifique (9 h en Belgique). ' : '') +
    'Au-delà du quota par minute, l\'application patiente ; au-delà du quota du jour, les notes attendent le lendemain. Si le fournisseur bloque quand même, elles repartent seules après le délai qu\'il indique.</span></div></div></details>';
  return h;
}
function observedHtml(id, o) {
  var hd = o.headers || {};
  var at = new Date(o.at).toLocaleString('fr-BE', { dateStyle: 'short', timeStyle: 'short' });
  var rows = [];
  var pair = function (label, base) {
    var lim = hd[base + '-limit'], rem = hd[base + '-remaining'];
    if (lim || rem) rows.push('<div class="kv"><span>' + label + '</span><span>' + (rem != null ? esc(rem) + ' restant' + (Number(rem) > 1 ? 's' : '') : '') + (lim ? ' sur ' + esc(lim) : '') + '</span></div>');
  };
  if (id === 'claude') {
    pair('Requêtes par minute', 'anthropic-ratelimit-requests');
    pair('Jetons d\'entrée par minute', 'anthropic-ratelimit-input-tokens');
    pair('Jetons de sortie par minute', 'anthropic-ratelimit-output-tokens');
  } else {
    // Forme courante des API compatibles OpenAI : x-ratelimit-limit-requests, x-ratelimit-remaining-requests…
    [['requests', 'Requêtes'], ['tokens', 'Jetons']].forEach(function (k) {
      var lim = hd['x-ratelimit-limit-' + k[0]], rem = hd['x-ratelimit-remaining-' + k[0]];
      if (lim || rem) rows.push('<div class="kv"><span>' + k[1] + '</span><span>' + (rem != null ? esc(rem) + ' restants' : '') + (lim ? ' sur ' + esc(lim) : '') + '</span></div>');
    });
    if (!rows.length) Object.keys(hd).forEach(function (k) { rows.push('<div class="kv"><span>' + esc(k) + '</span><span>' + esc(hd[k]) + '</span></div>'); });
  }
  if (!rows.length) return '';
  return '<div><div class="l">Limites annoncées par le fournisseur <small class="muted">(dernier appel, ' + at + ')</small></div>' + rows.join('') + '</div>';
}

function opt(v, cur, l) { return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + l + '</option>'; }

function renderSet() {
  var st = S.settings;
  if (!st) return;
  var pv = function (id) { return S.providers.filter(function (p) { return p.id === id; })[0] || {}; };
  var fn = FN.map(function (f) {
    var opts = Object.keys(PROV).filter(function (k) { return pv(k).supports && pv(k).supports[f[0]]; }).map(function (k) { return opt(k, st.providers[f[0]], PROV[k] + (k === 'infomaniak' ? ' (par défaut)' : '') + (pv(k).enabled && pv(k).hasKey ? '' : ' – inactif')); }).join('');
    return '<div><label class="l" for="prov-' + f[0] + '">' + f[1] + '</label><select id="prov-' + f[0] + '" class="field" data-set="providers.' + f[0] + '">' + opts + '</select></div>';
  }).join('');
  var trig = function (k, label, values) {
    return '<div><div class="l">' + label + '</div><div class="modes" role="group" aria-label="' + label + '">' + values.map(function (v) { return '<button type="button" data-a="set-trig" data-k="' + k + '" data-id="' + v[0] + '" aria-pressed="' + (st.trigger[k] === v[0]) + '">' + v[1] + '</button>'; }).join('') + '</div></div>';
  };
  var provPanels = S.providers.map(function (p) {
    var b = p.budget || {};
    var ratio = b.cap ? Math.min(1, b.ratio) : 0;
    var models = st.models[p.id] || {};
    var mfield = function (k, l) { return '<div><label class="l" for="m-' + p.id + '-' + k + '">' + l + '</label>' + modelSelect(p, k, models[k]) + '</div>'; };
    return '<div class="panel"><div class="kv"><h3>' + esc(p.label) + '</h3><span>' + (p.hasKey ? 'Clé enregistrée' : 'Aucune clé') + '</span></div>' +
      '<div class="switch" style="border:0;padding:0"><div><b>Activé</b><span>' + (p.id === 'infomaniak' ? 'Fournisseur principal.' : 'Rien ne part chez ' + esc(p.label) + ' tant que ce n\'est pas activé.') + '</span></div><button class="sw" role="switch" aria-checked="' + !!p.enabled + '" aria-label="Activer ' + esc(p.label) + '" data-a="set-enable" data-id="' + p.id + '"><i></i></button></div>' +
      (p.id === 'infomaniak' ? '<div><label class="l" for="ik-product">Identifiant du produit IA</label><input id="ik-product" class="field" inputmode="numeric" data-set="infomaniak.productId" value="' + esc(st.infomaniak.productId) + '" placeholder="ex. 104812"><div class="help"><span>Visible dans le manager Infomaniak, rubrique IA (« product_id »).</span></div></div>' +
        '<details><summary class="l">Adresse de l\'API (avancé)</summary><input id="ik-url" class="field" data-set="infomaniak.baseUrl" value="' + esc(st.infomaniak.baseUrl) + '"><div class="help"><span>{product_id} est remplacé automatiquement. À changer seulement si Infomaniak modifie son adresse.</span></div></details>' : '') +
      '<div><label class="l" for="key-' + p.id + '">Clé API</label><div class="pw-row"><input id="key-' + p.id + '" type="password" class="field" autocomplete="off" placeholder="' + (p.hasKey ? '•••••••• (remplacer)' : 'Coller la clé') + '"><button type="button" class="btn" data-a="key-save" data-id="' + p.id + '">Enregistrer</button></div>' +
      '<div class="actions" style="margin-top:8px"><button type="button" class="btn" data-a="key-test" data-id="' + p.id + '"' + (p.hasKey ? '' : ' disabled') + '>Tester la connexion</button>' + (p.hasKey ? '<button type="button" class="btn danger" data-a="key-del" data-id="' + p.id + '">Effacer la clé</button>' : '') + '</div><div class="help" id="ktest-' + p.id + '"></div></div>' +
      '<details' + (p.hasKey ? ' open' : '') + '><summary class="l">Modèles</summary><div class="grid2" id="models-' + p.id + '">' + mfield('chat', 'Texte (classement, synthèse)') + mfield('vision', 'Images') + (models.audio !== undefined ? mfield('audio', 'Audio') : '') + '</div>' +
      '<div class="help"><span>' + (p.models ? 'Modèles ouverts à votre compte, lus le ' + fmtFull(p.models.at) + '. ' : 'Enregistrez la clé puis cliquez « Tester la connexion » pour charger les modèles disponibles. ') + 'Le plus petit modèle suffit pour classer : c\'est le réglage le plus sobre.</span></div>' +
      (p.hasKey ? '<div class="actions"><button type="button" class="btn" data-a="key-test" data-id="' + p.id + '">Actualiser la liste</button></div>' : '') + '</details>' +
      '<div><label class="l" for="bud-' + p.id + '">Plafond mensuel (€)</label><input id="bud-' + p.id + '" class="field" type="number" min="0" step="0.5" data-set="budgets.' + p.id + '" value="' + (b.cap != null ? b.cap : '') + '" placeholder="Aucun plafond"></div>' +
      '<div class="meter' + (b.blocked ? ' blocked' : b.alert ? ' alert' : '') + '"><i style="width:' + Math.round(ratio * 100) + '%"></i></div>' +
      '<div class="kv"><span>Ce mois-ci</span><span>' + fmtEur(p.usage.cost) + (b.cap ? ' sur ' + fmtEur(b.cap) + ' (' + Math.round(b.ratio * 100) + ' %)' : '') + ' · ' + plural(p.usage.calls, 'appel', 'appels') + '</span></div>' + quotaHtml(p) + '</div>';
  }).join('');

  $('#view-set').innerHTML =
    '<div class="sec"><h2>Réglages</h2></div>' +
    '<div class="panel" id="installpanel"></div>' +
    '<p class="sub">Tout ce qui pilote l\'IA et la consommation. Les clés restent sur le serveur, chiffrées, et ne sont jamais réaffichées.</p>' +
    '<div class="sec"><h2 style="font-size:18px">Fournisseurs, clés et budget</h2><button class="btn" data-a="log-open">Journal des appels</button></div>' +
    '<p class="sub">Coûts estimés à partir des jetons consommés ; seule la facture du fournisseur fait foi. Alerte à 80 %, blocage à 100 % : les notes restent alors en attente, sans perte.</p>' +
    provPanels +
    '<div class="panel"><h3>Choix des IA</h3>' + fn +
    '<div><label class="l" for="recours">Recours à un autre fournisseur</label><select id="recours" class="field" data-set="recours">' + opt('never', st.recours, 'Jamais') + opt('fail', st.recours, 'En cas d\'échec') + opt('ask', st.recours, 'À la demande (bouton sur la note)') + '</select></div></div>' +
    '<div class="panel"><h3>Déclenchement de l\'analyse</h3>' +
    trig('transcr', 'Transcription', [['auto', 'Automatique'], ['manual', 'Manuel']]) +
    trig('classif', 'Classement', [['auto', 'Automatique'], ['manual', 'Manuel']]) +
    trig('vision', 'Description des images', [['off', 'Désactivée'], ['demand', 'À la demande'], ['auto', 'Automatique']]) +
    trig('enrich', 'Enrichissement des notes', [['off', 'Désactivé'], ['demand', 'À la demande'], ['auto', 'Automatique']]) +
    '<div class="help">' + I(IC.spark, 14) + '<span>Enrichissement : explication du sujet, pistes, recherches et liens vérifiés. Automatique : demandé dans l\'appel de classement (aucun appel en plus, réponse plus longue, fournisseur du classement), seulement pour les notes qui s\'y prêtent. À la demande : bouton « Enrichir » sur la note, un appel par clic.</span></div>' +
    '<div class="help"><span>En manuel, la note est enregistrée sans appel IA, avec le statut « À analyser ». Le re-tri et la synthèse restent toujours lancés par vous.</span></div></div>' +
    '<div class="panel"><h3>Création par l\'IA</h3>' +
    '<div><label class="l" for="pr-nb">Carnets</label><select id="pr-nb" class="field" data-set="propose.notebook" data-bool="1">' + opt('0', st.propose.notebook ? '1' : '0', 'Strict : seulement les carnets existants') + opt('1', st.propose.notebook ? '1' : '0', 'L\'IA peut proposer un nouveau carnet') + '</select></div>' +
    '<div><label class="l" for="pr-tag">Tags</label><select id="pr-tag" class="field" data-set="propose.tag" data-bool="1">' + opt('0', st.propose.tag ? '1' : '0', 'Strict : seulement les tags existants') + opt('1', st.propose.tag ? '1' : '0', 'L\'IA peut proposer de nouveaux tags') + '</select></div>' +
    '<div class="help"><span>Une proposition n\'est jamais créée sans votre clic. Aucun appel IA en plus.</span></div></div>' +
    '<div class="panel"><h3>Audio et images</h3>' +
    '<div><label class="l" for="maxsec">Durée maximale d\'un vocal</label><select id="maxsec" class="field" data-set="maxVoiceSec" data-num="1">' + opt(30, st.maxVoiceSec, '30 secondes') + opt(60, st.maxVoiceSec, '1 minute') + opt(120, st.maxVoiceSec, '2 minutes (maximum)') + '</select></div>' +
    '<div><label class="l" for="maxmb">Taille maximale d\'une image (Mo)</label><input id="maxmb" class="field" type="number" min="1" max="30" data-set="maxImageMb" data-num="1" value="' + st.maxImageMb + '"></div>' +
    '<div class="switch"><div><b>Réduire la photo avant envoi à l\'IA</b><span>1024 pixels de large : moins de données, coût plus bas.</span></div><button class="sw" role="switch" aria-checked="' + !!st.reduceImage + '" data-a="set-sw" data-id="reduceImage"><i></i></button></div></div>' +
    '<div class="panel"><h3>Synthèses</h3><div class="grid2">' +
    '<div><label class="l" for="smn">Notes maximum</label><input id="smn" class="field" type="number" min="5" data-set="synthMaxNotes" data-num="1" value="' + st.synthMaxNotes + '"></div>' +
    '<div><label class="l" for="smw">Mots maximum envoyés</label><input id="smw" class="field" type="number" min="500" step="500" data-set="synthMaxWords" data-num="1" value="' + st.synthMaxWords + '"></div>' +
    '<div><label class="l" for="hmax">Synthèses gardées dans l\'historique</label><input id="hmax" class="field" type="number" min="5" max="200" data-set="historyMax" data-num="1" value="' + st.historyMax + '"></div></div>' +
    '<div class="actions"><button class="btn" data-a="hist-open">Ouvrir l\'historique</button></div></div>' +

    '<div class="panel"><h3>Carnets et tags</h3><div class="actions"><button class="btn" data-a="tab" data-id="cats">Gérer les carnets et les tags</button></div></div>' +
    '<div class="savebar" id="savebar" hidden><span>Modifications non enregistrées</span><button class="btn primary" data-a="set-save" id="setsave">Enregistrer les réglages</button></div>';
  setDirty = false;
  renderInstall();
  autoRefreshModels();
}

/* Installer sur cet appareil : ouverture sur l'accueil ou directement sur « Nouvelle note ». */
function installPref() { try { return localStorage.getItem('mainotes-install') === 'new' ? 'new' : 'home'; } catch (e) { return 'home'; } }
function renderInstall() {
  var box = $('#installpanel');
  if (!box) return;
  var pref = installPref();
  var ua = navigator.userAgent;
  var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
  var android = /Android/.test(ua);
  var choice = function (v, img, title, sub) {
    return '<button type="button" data-a="install-pref" data-id="' + v + '" aria-pressed="' + (pref === v) + '"><img src="icons/' + img + '" alt="">' + title + '<small>' + sub + '</small></button>';
  };
  var how = installPrompt ? '<div class="actions"><button class="btn primary" data-a="install-go">' + I(IC.upload, 18) + 'Installer « ' + (pref === 'new' ? 'Nouvelle note' : 'Mes notes') + ' »</button></div>'
    : ios ? '<div class="help"><span>Sur iPhone ou iPad, dans <b>Safari</b> : bouton <b>Partager</b> (carré avec une flèche) › <b>Sur l\'écran d\'accueil</b> › Ajouter.</span></div>'
    : android ? '<div class="help"><span>Dans <b>Chrome</b> : menu <b>⋮</b> › <b>Installer l\'application</b> (ou « Ajouter à l\'écran d\'accueil »).</span></div>'
    : '<div class="help"><span>Dans Chrome ou Edge : icône d\'installation à droite de la barre d\'adresse, ou menu › Installer.</span></div>';
  box.innerHTML = '<h3>Installer sur cet appareil</h3>' +
    (isInstalled() ? '<p class="sub" style="margin:0">' + I(IC.check || '<path d="m5 12 5 5 9-10"/>', 14) + ' Vous utilisez l\'application installée, en plein écran.</p>' : '<p class="sub" style="margin:0">L\'application s\'ouvre en plein écran, comme une application du téléphone. Choisissez sur quoi elle s\'ouvre :</p>') +
    '<div class="install-choice">' + choice('home', 'icon-192.png', 'Mes notes', 'Ouvre l\'accueil') + choice('new', 'new-192.png', 'Nouvelle note', 'Ouvre directement la création d\'une note') + '</div>' +
    how +
    '<div class="help"><span>Pour avoir les deux icônes, installez une fois avec chaque choix. Sur Android, un appui long sur l\'icône « Mes notes » propose aussi les raccourcis Écrire, Parler et Photo.</span></div>';
  accordionize(box.parentNode);
}
function setInstallPref(v) {
  try { localStorage.setItem('mainotes-install', v); } catch (e) { /* rien */ }
  $('#manifest-link').href = v === 'new' ? 'manifest-new.json' : 'manifest.json';
  $('#apple-icon').href = v === 'new' ? 'icons/new-apple-touch-icon.png' : 'icons/apple-touch-icon.png';
  $('#apple-title').content = v === 'new' ? 'Nouvelle note' : 'Mes notes';
  // Safari (iPhone) installe l'adresse affichée : on la fait correspondre au choix.
  try { history.replaceState(null, '', v === 'new' ? './?action=new' : './'); } catch (e) { /* rien */ }
  renderInstall();
}

// Charge d'office la liste des modèles de chaque fournisseur qui a une clé, si elle
// manque ou date de plus de 7 jours (une seule fois par ouverture de l'application).
var modelsTried = {};
function autoRefreshModels() {
  var todo = S.providers.filter(function (p) {
    return p.hasKey && !modelsTried[p.id] && (!p.models || Date.now() - p.models.at > 7 * 864e5);
  });
  var chain = Promise.resolve();
  todo.forEach(function (p) {
    modelsTried[p.id] = true;
    chain = chain.then(function () { return testKey(p.id); });
  });
}

function collectSettings() {
  var out = {};
  $$('#view-set [data-set]').forEach(function (el) {
    var path = el.getAttribute('data-set').split('.');
    var v = el.value;
    if (el.hasAttribute('data-num')) v = Number(v);
    if (el.hasAttribute('data-bool')) v = v === '1';
    var o = out;
    for (var i = 0; i < path.length - 1; i++) o = o[path[i]] = o[path[i]] || {};
    o[path[path.length - 1]] = v;
  });
  return out;
}
function saveSettings(extra) {
  var body = extra || collectSettings();
  return api('PATCH', 'settings', body).then(function (r) {
    S.settings = r.settings; S.providers = r.providers; saveCache();
    setDirty = false;
    if (tab === 'set') renderSet();
    render();
    if (!extra) toast('Réglages enregistrés');
  }, fail);
}

/* ---------- Compte ---------- */
function renderAccount() {
  accountLoaded = true;
  $('#view-account').innerHTML = '<p class="sub">Chargement…</p>';
  api('GET', 'account').then(function (r) {
    var u = r.user;
    S.user = u;
    $('#view-account').innerHTML =
      '<div class="sec"><h2>Compte</h2><button class="btn" data-a="logout">Se déconnecter</button></div>' +
      '<p class="sub">Compte unique de cette application, créé le ' + fmtFull(u.createdAt) + '.</p>' +
      '<form class="panel" id="f-profile"><h3>Profil</h3>' +
      '<div><label class="l" for="acc-name">Nom affiché</label><input id="acc-name" class="field" maxlength="80" value="' + esc(u.name) + '" autocomplete="name"></div>' +
      '<div><label class="l" for="acc-login">Identifiant de connexion</label><input id="acc-login" class="field" maxlength="120" value="' + esc(u.login) + '" autocomplete="username"></div>' +
      '<div id="acc-pw-wrap" hidden><label class="l" for="acc-pw">Mot de passe actuel (pour changer l\'identifiant)</label><input id="acc-pw" type="password" class="field" autocomplete="current-password"></div>' +
      '<div class="err" id="acc-err" role="alert" hidden></div>' +
      '<div class="actions"><button type="submit" class="btn primary">Enregistrer le profil</button></div></form>' +
      '<form class="panel" id="f-password"><h3>Mot de passe</h3>' +
      '<p class="sub" style="margin:0">Dernier changement : ' + fmtFull(u.passwordChangedAt || u.createdAt) + '.</p>' +
      '<div><label class="l" for="pw-cur">Mot de passe actuel</label><input id="pw-cur" type="password" class="field" autocomplete="current-password" required></div>' +
      '<div><label class="l" for="pw-new">Nouveau mot de passe</label><input id="pw-new" type="password" class="field" autocomplete="new-password" minlength="10" required><div class="help"><span>10 caractères au moins.</span></div></div>' +
      '<div><label class="l" for="pw-new2">Confirmer</label><input id="pw-new2" type="password" class="field" autocomplete="new-password" minlength="10" required></div>' +
      '<div class="switch" style="border:0;padding:0"><div><b>Déconnecter les autres appareils</b><span>Recommandé si le mot de passe a pu être vu.</span></div><button type="button" class="sw" role="switch" aria-checked="true" id="pw-others" data-a="sw-local"><i></i></button></div>' +
      '<div class="err" id="pw-err" role="alert" hidden></div>' +
      '<div class="actions"><button type="submit" class="btn primary">Changer le mot de passe</button></div></form>' +
      '<div class="panel"><h3>Appareils connectés</h3><div style="display:flex;flex-direction:column;gap:8px">' +
      r.sessions.map(function (s) {
        return '<div class="row" style="cursor:default"><span class="rt"><b>' + esc(s.device) + (s.current ? ' <small>· cet appareil</small>' : '') + '</b><span>Connecté le ' + fmtFull(s.createdAt) + ' · actif ' + fmtDate(s.lastSeen) + '</span></span>' + (s.current ? '' : '<button class="btn" style="height:44px" data-a="sess-del" data-id="' + s.id + '">Déconnecter</button>') + '</div>';
      }).join('') + '</div>' +
      (r.sessions.length > 1 ? '<div class="actions"><button class="btn" data-a="sess-others">Déconnecter tous les autres appareils</button></div>' : '') + '</div>' +
      '<div class="panel"><h3>Vos données</h3><p class="sub" style="margin:0">Export complet : notes, médias (encodés dans le fichier), carnets, tags, synthèses et réglages. Les clés API n\'y figurent pas.</p>' +
      '<div class="actions"><a class="btn" href="api/export" download>Exporter mes données (JSON)</a></div></div>' +
      '<form class="panel" id="f-delete" style="border-color:var(--danger)"><h3>Supprimer le compte</h3><p class="sub" style="margin:0">Efface définitivement toutes les notes, fichiers, synthèses, réglages et clés API. L\'application revient à l\'écran de création de compte. Pensez à exporter d\'abord.</p>' +
      '<div><label class="l" for="del-pw">Mot de passe</label><input id="del-pw" type="password" class="field" autocomplete="current-password" required></div>' +
      '<div><label class="l" for="del-confirm">Tapez SUPPRIMER</label><input id="del-confirm" class="field" autocomplete="off" required></div>' +
      '<div class="err" id="del-err" role="alert" hidden></div>' +
      '<div class="actions"><button type="submit" class="btn danger">Supprimer définitivement</button></div></form>';
    bindAccountForms(u);
    accordionize($('#view-account'));
  }, function (e) { $('#view-account').innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
}

function bindAccountForms(u) {
  var showErr = function (id, m) { var el = $('#' + id); el.textContent = m; el.hidden = !m; };
  $('#acc-login').addEventListener('input', function () { $('#acc-pw-wrap').hidden = this.value.trim() === u.login; });
  $('#f-profile').addEventListener('submit', function (e) {
    e.preventDefault();
    showErr('acc-err', '');
    api('PATCH', 'account', { name: $('#acc-name').value.trim(), login: $('#acc-login').value.trim(), currentPassword: $('#acc-pw').value })
      .then(function (r) { S.user = r.user; toast('Profil enregistré'); render(); renderAccount(); }, function (er) { showErr('acc-err', er.message); });
  });
  $('#f-password').addEventListener('submit', function (e) {
    e.preventDefault();
    showErr('pw-err', '');
    if ($('#pw-new').value !== $('#pw-new2').value) return showErr('pw-err', 'Les deux mots de passe ne correspondent pas.');
    api('POST', 'account/password', { current: $('#pw-cur').value, next: $('#pw-new').value, logoutOthers: $('#pw-others').getAttribute('aria-checked') === 'true' })
      .then(function () { toast('Mot de passe changé'); renderAccount(); }, function (er) { showErr('pw-err', er.message); });
  });
  $('#f-delete').addEventListener('submit', function (e) {
    e.preventDefault();
    showErr('del-err', '');
    if (!confirm('Supprimer définitivement le compte et toutes les notes ?')) return;
    api('DELETE', 'account', { password: $('#del-pw').value, confirm: $('#del-confirm').value.trim() })
      .then(function () {
        clearCache();
        outbox = [];
        S = { user: null, notebooks: [], tags: [], notes: [], settings: null, providers: [], retri: null, synthesesCount: 0 };
        showAuth('setup', {});
        toast('Compte supprimé.');
      }, function (er) { showErr('del-err', er.message); });
  });
}

function openLog() {
  modal = 'log';
  openSheet(shead('Journal des appels IA') + '<div class="loglist" id="loglist"><p class="sub">Chargement…</p></div>', 'Journal des appels');
  api('GET', 'log').then(function (r) {
    var lbl = { classif: 'Classement', transcr: 'Transcription', vision: 'Description', synth: 'Synthèse' };
    $('#loglist').innerHTML = r.log.length ? r.log.map(function (l) {
      return '<div><span>' + fmtFull(l.date) + '</span><b>' + (lbl[l.fn] || l.fn) + '</b><span>' + PROV[l.provider] + '</span><span>' + fmtEur(l.cost) + '</span>' + (l.ok ? '<span class="ok">OK</span>' : '<span class="ko" title="' + esc(l.error || '') + '">Échec</span>') + '</div>';
    }).join('') : '<p class="sub">Aucun appel pour l\'instant.</p>';
  }, fail);
}
