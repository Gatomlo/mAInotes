// Abonnement aux notifications depuis le navigateur (a appeler depuis un bouton).
import { get, post } from './api.js';

const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), (c) => c.charCodeAt(0));

export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Notifications non prises en charge sur cet appareil.');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications refusées.');
  const reg = await navigator.serviceWorker.ready;
  const { key } = await get('push/key');
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) }));
  await post('push/subscribe', sub.toJSON());
}
