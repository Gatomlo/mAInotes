// Cadre de l'app : ecran de creation du compte / connexion, puis vues.
import { get, post, patch, del } from './api.js';
import { h, mount } from './ui.js';

const root = document.getElementById('app');

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

function authScreen(state) {
  const err = h('p', { class: 'err' });
  const name = h('input', { placeholder: 'Nom affiché', autocomplete: 'name' });
  const login = h('input', { placeholder: 'Identifiant', autocomplete: 'username', required: true });
  const password = h('input', { type: 'password', placeholder: 'Mot de passe (10 caractères min.)', autocomplete: state.setup ? 'new-password' : 'current-password', required: true });
  const token = h('input', { placeholder: 'Code d’installation' });
  const form = h('form', { class: 'card', onsubmit: async (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      await post(state.setup ? 'auth/setup' : 'auth/login', { name: name.value, login: login.value, password: password.value, setupToken: token.value });
      start();
    } catch (x) { err.textContent = x.message; }
  } },
  state.setup ? name : null, login, password, state.setupToken ? token : null, err,
  h('button', { class: 'btn' }, state.setup ? 'Créer le compte' : 'Se connecter'));
  mount(root, h('h1', {}, state.setup ? 'Bienvenue' : '__NAME__'), form);
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
  mount(root,
    h('h1', {}, '__NAME__'),
    h('p', { class: 'muted' }, `Connecté : ${user.name}`),
    h('form', { class: 'row', onsubmit: async (e) => { e.preventDefault(); if (!title.value.trim()) return; await post('items', { title: title.value }); title.value = ''; refresh(); } },
      title, h('button', { class: 'btn' }, 'Ajouter')),
    list,
    h('button', { class: 'btn ghost', onclick: async () => { await post('auth/logout'); start(); } }, 'Se déconnecter'));
  refresh();
}

async function start() {
  const state = await get('auth/state');
  if (state.user) home(state.user); else authScreen(state);
}
start().catch((e) => mount(root, h('p', { class: 'err' }, e.message)));
