// Depot d'une photo : reduction (cote le plus long = 1280 px, JPEG 0,82) puis envoi.
// Renvoie le chemin a enregistrer ; afficher avec <img src="api/<chemin>">.
export async function uploadPhoto(file, maxSide = 1280) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82));
  const res = await fetch('api/photos', { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: blob });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || 'Envoi impossible.');
  return data.path;
}
