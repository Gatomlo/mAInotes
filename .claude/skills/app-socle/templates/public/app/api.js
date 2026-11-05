// Appels API : URL TOUJOURS relatives (l'app peut vivre sous /<slug>/ dans la passerelle).
export async function api(method, url, body) {
  const res = await fetch(`api/${url}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error((data && data.error) || 'Erreur réseau.'), { status: res.status });
  return data;
}
export const get = (u) => api('GET', u);
export const post = (u, b) => api('POST', u, b || {});
export const patch = (u, b) => api('PATCH', u, b || {});
export const del = (u) => api('DELETE', u);
