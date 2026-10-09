/* Écrans de création du compte (première ouverture) et de connexion. */
'use strict';

function showAuth(mode, st) {
  st = st || {};
  S.user = null;
  $('#app').hidden = true;
  $('#fab').hidden = true;
  var el = $('#auth');
  el.hidden = false;
  var h = '';
  if (mode === 'setup') {
    h = '<div class="auth"><form class="panel" id="authform" autocomplete="on">' +
      '<h1>Bienvenue</h1>' +
      '<p class="sub" style="margin:0">Première ouverture : créez le compte qui protège vos notes. Il sera le seul compte de cette application ; vous pourrez le modifier ensuite dans l\'onglet Compte.</p>' +
      (st.setupTokenRequired ? '<div><label class="l" for="a-token">Code d\'installation</label><input id="a-token" class="field" autocomplete="off" required><div class="help"><span>Valeur de MAINOTES_SETUP_TOKEN définie sur le serveur.</span></div></div>' : '') +
      '<div><label class="l" for="a-name">Votre nom</label><input id="a-name" class="field" autocomplete="name" maxlength="80"></div>' +
      '<div><label class="l" for="a-login">Identifiant (adresse e-mail ou nom d\'utilisateur)</label><input id="a-login" class="field" autocomplete="username" required minlength="3" maxlength="120"></div>' +
      '<div><label class="l" for="a-pw">Mot de passe</label><div class="pw-row"><input id="a-pw" type="password" class="field" autocomplete="new-password" required minlength="10"><button type="button" class="btn" data-a="pw-toggle" data-id="a-pw">Afficher</button></div><div class="help"><span>10 caractères au moins. Une phrase facile à retenir convient très bien.</span></div></div>' +
      '<div><label class="l" for="a-pw2">Confirmer le mot de passe</label><input id="a-pw2" type="password" class="field" autocomplete="new-password" required minlength="10"></div>' +
      '<div class="err" id="a-err" role="alert" hidden></div>' +
      '<button type="submit" class="btn primary">Créer mon compte</button>' +
      '</form></div>';
  } else if (mode === 'login') {
    h = '<div class="auth"><form class="panel" id="authform" autocomplete="on">' +
      '<h1>Mes notes</h1><p class="sub" style="margin:0">Connectez-vous pour retrouver vos notes sur cet appareil.</p>' +
      '<div><label class="l" for="a-login">Identifiant</label><input id="a-login" class="field" autocomplete="username" required></div>' +
      '<div><label class="l" for="a-pw">Mot de passe</label><div class="pw-row"><input id="a-pw" type="password" class="field" autocomplete="current-password" required><button type="button" class="btn" data-a="pw-toggle" data-id="a-pw">Afficher</button></div></div>' +
      '<div class="err" id="a-err" role="alert" hidden></div>' +
      '<button type="submit" class="btn primary">Se connecter</button>' +
      '<p class="help" style="margin:0"><span>Mot de passe oublié : depuis le serveur, lancez <code>npm run reset-password</code> dans le dossier de l\'application (voir la documentation de déploiement).</span></p>' +
      '</form></div>';
  } else {
    h = '<div class="auth"><div class="panel"><h1>Hors connexion</h1><p class="sub" style="margin:0">Le serveur est injoignable et aucune note n\'est encore enregistrée sur cet appareil. Réessayez quand le réseau revient.</p><button class="btn primary" data-a="reload">Réessayer</button></div></div>';
  }
  el.innerHTML = h;
  var f = $('#authform');
  if (f) {
    f.addEventListener('submit', function (e) { e.preventDefault(); submitAuth(mode); });
    var first = $('input', f); if (first) first.focus();
  }
}

function submitAuth(mode) {
  var err = $('#a-err');
  var show = function (m) { err.textContent = m; err.hidden = false; };
  err.hidden = true;
  var login = $('#a-login').value.trim(), pw = $('#a-pw').value;
  var p;
  if (mode === 'setup') {
    if (pw !== $('#a-pw2').value) return show('Les deux mots de passe ne correspondent pas.');
    if (pw.length < 10) return show('Le mot de passe doit compter au moins 10 caractères.');
    p = api('POST', 'auth/setup', { name: $('#a-name').value.trim(), login: login, password: pw, setupToken: $('#a-token') ? $('#a-token').value.trim() : undefined }, { allow401: true });
  } else {
    p = api('POST', 'auth/login', { login: login, password: pw }, { allow401: true });
  }
  var btn = $('#authform button[type=submit]');
  btn.disabled = true;
  p.then(function (r) {
    S.user = r.user;
    clearCache();
    tab = mode === 'setup' ? 'set' : 'home';
    showApp();
    if (mode === 'setup') { toast('Compte créé. Renseignez maintenant la clé Infomaniak pour activer l\'IA.'); }
    return sync().then(flushOutbox);
  }, function (e) { show(e.message); btn.disabled = false; });
}
