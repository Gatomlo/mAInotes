// Nettoyage local (gratuit) d'une transcription : hésitations (« euh », « hum »…), espaces et
// majuscules. Le texte d'origine est gardé à part par l'appelant.
const FILLERS = /(^|[\s,;.!?…])(?:e+uh+|h?e+u+h+|heu+|hum+|hmm+|mmm+|euhm+)(?=$|[\s,;.!?…])[,;…]*/gi;

function cleanSpeech(text) {
  let s = String(text || '');
  s = s.replace(FILLERS, '$1');
  s = s.replace(/\s{2,}/g, ' ').replace(/\s+([,.])/g, '$1').replace(/,\s*([.!?])/g, '$1').trim();
  // Majuscule après un point (pas après « ... »), en gardant l'espace avant « ? » et « ! » du français.
  s = s.replace(/(^|(?<!\.)[.!?]\s+)([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
  return s;
}

module.exports = { cleanSpeech };
