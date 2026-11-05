// Cadre de l'app : creation du 1er compte / connexion / inscription par invitation, puis vues.
import { get, post, patch, del } from './api.js';
import { h, mount } from './ui.js';

const root = document.getElementById('app');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

const inviteToken = new URLSearchParams(location.search).get('invite');

async function authScreen(state) {
  const mode = state.setup ? 'setup' : inviteToken ? 'register' : 'login';
  const invited = mode === 'register' ? await get(`auth/invite?token=${encodeURIComponent(inviteToken)}`).catch((e) => ({ error: e.message })) : {};
  const err = h('p', { class: 'err' }, invited.error || '');
  const name = h('input', { placeholder: 'Nom affiché', autocomplete: 'name' });
  const mail = h('input', { type: 'email', placeholder: 'Adresse e-mail', autocomplete: 'email', required: true, value: invited.email || '', readonly: !!invited.email });
  const password = h('input', { type: 'password', placeholder: 'Mot de passe (10 caractères min.)', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true });
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      const path = { setup: 'auth/setup', register: 'auth/register', login: 'auth/login' }[mode];
      await post(path, { name: name.value, email: mail.value, password: password.value, invite: inviteToken });
      if (inviteToken) history.replaceState(null, '', location.pathname);
      start();
    } catch (x) { err.textContent = x.message; }
  } }, mode !== 'login' ? name : null, mail, password, err,
  h('button', { class: 'btn' }, { setup: 'Créer le compte administrateur', register: 'Rejoindre', login: 'Se connecter' }[mode]));
  mount(root, h('h1', {}, mode === 'login' ? '__NAME__' : 'Bienvenue'), form);
}

async function home(user) {
  const list = h('ul');
  const title = h('input', { placeholder: 'Nouvel élément' });
  async function refresh() {
    const items = await get('items');
    list.replaceChildren(...items.map((it) => h('li', { class: it.done ? 'done' : '' },
      h('input', { type: 'checkbox', checked: !!it.done, style: 'width:auto', onchange: async (e) => { await patch(`items/${it.id}`, { done: e.target.checked }); refresh(); } }),
      h('span', {}, it.title),
      h('button', { class: 'btn ghost', onclick: async () => { await del(`items/${it.id}`); refresh(); } }, '✕'))));
  }
  const invite = h('p', { class: 'muted' });
  const admin = user.isAdmin ? h('div', { class: 'card' },
    h('strong', {}, 'Inviter quelqu’un'),
    h('button', { class: 'btn ghost', onclick: async () => { invite.textContent = (await post('invitations', {})).url; } }, 'Créer un lien d’invitation'), invite) : null;
  mount(root,
    h('h1', {}, '__NAME__'),
    h('p', { class: 'muted' }, `Connecté : ${user.name}`),
    h('form', { class: 'row', onsubmit: async (e) => { e.preventDefault(); if (!title.value.trim()) return; await post('items', { title: title.value }); title.value = ''; refresh(); } },
      title, h('button', { class: 'btn' }, 'Ajouter')),
    list, admin,
    h('button', { class: 'btn ghost', onclick: async () => { await post('auth/logout'); start(); } }, 'Se déconnecter'));
  refresh();
}

async function start() {
  const state = await get('auth/state');
  if (state.user) home(state.user); else authScreen(state);
}
start().catch((e) => mount(root, h('p', { class: 'err' }, e.message)));
