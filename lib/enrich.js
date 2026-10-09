// Enrichissement d'une note : explication, pistes complémentaires, recherches et liens.
// Un modèle sans accès au web peut inventer des adresses : chaque lien proposé est
// ouvert par le serveur et écarté s'il ne répond pas. Les recherches (Web, Scholar)
// sont des adresses construites ici, donc toujours valides.
const { fetchPreview } = require('./links');

// Consigne partagée : champ du classement (mode automatique) ou appel seul (à la demande).
const ENRICH_FIELD = '"enrichissement": null si la note est personnelle ou pratique (courses, rappel, tâche) et n\'appelle pas de complément ; sinon un objet {'
  + '"explication": "2 à 4 phrases qui expliquent le sujet et son contexte (auteurs, date, résultats clés), seulement ce dont tu es sûr", '
  + '"pistes": ["2 à 4 pistes complémentaires à explorer, une phrase chacune"], '
  + '"recherches": ["1 à 3 requêtes de recherche précises, dans la langue la plus utile"], '
  + '"liens": [{"titre": "...", "url": "adresse exacte d\'une source fiable que tu connais avec certitude (article, DOI, page officielle) ; liste vide si tu n\'es pas sûr"}]}';

const str = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

function searchLinks(query) {
  const q = encodeURIComponent(query);
  return { query, web: `https://duckduckgo.com/?q=${q}`, scholar: `https://scholar.google.com/scholar?q=${q}` };
}

async function finalizeEnrichment(raw, provider) {
  if (!raw || typeof raw !== 'object') return null;
  const explanation = str(raw.explication || raw.explanation, 900);
  const leads = (Array.isArray(raw.pistes) ? raw.pistes : []).map((x) => str(x, 300)).filter(Boolean).slice(0, 4);
  const searches = (Array.isArray(raw.recherches) ? raw.recherches : []).map((x) => str(x, 120)).filter(Boolean).slice(0, 3).map(searchLinks);
  const proposed = (Array.isArray(raw.liens) ? raw.liens : [])
    .map((l) => ({ title: str(l && (l.titre || l.title), 200), url: str(l && l.url, 500) }))
    .filter((l) => /^https?:\/\//i.test(l.url))
    .slice(0, 3);
  const checked = await Promise.all(proposed.map(async (l) => {
    const p = await fetchPreview(l.url);
    return p.error ? null : { url: l.url, title: p.title && p.title !== p.site ? p.title : l.title || p.title, site: p.site, summary: p.summary };
  }));
  const links = checked.filter(Boolean);
  if (!explanation && !leads.length && !searches.length && !links.length) return null;
  return { at: Date.now(), provider, explanation, leads, searches, links, rejected: proposed.length - links.length };
}

module.exports = { ENRICH_FIELD, finalizeEnrichment };
