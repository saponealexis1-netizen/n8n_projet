// NETTOYAGE du texte extrait du PDF
// Entrée : 1 item { text, numpages } (sortie de "Extraire le texte du PDF")
// Sortie : 1 item { texte } avec un chapitre par ligne ("1. ...", "2. ...")
const { text = '', numpages = 1 } = $input.first().json;
if (!text.trim()) {
  throw new Error("Aucun texte extrait du PDF (PDF vide ou scanné) : rien n'a été indexé.");
}

let lignes = text.replace(/\r/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim());

// 1. En-têtes / pieds de page du navigateur : lignes qui reviennent sur plusieurs pages
//    (les chiffres sont ignorés pour attraper "1/10", "2/10", la date, etc.)
const cle = l => l.replace(/\d+/g, '#');
const freq = {};
for (const l of lignes) if (l) freq[cle(l)] = (freq[cle(l)] ?? 0) + 1;
const estRepetee = l => numpages >= 3 && freq[cle(l)] >= 3 && l.length < 200;
const estParasite = l =>
  /^(https?|file):\/\//i.test(l) ||                  // URL
  /^(page\s*)?\d+\s*(\/|of|sur)\s*\d+$/i.test(l) ||  // "3/10", "Page 3 of 10"
  /^\d+$/.test(l);                                   // numéro de page seul
lignes = lignes.filter(l => l && !estRepetee(l) && !estParasite(l));

// 2. Garder uniquement le livre : du chapitre 1 jusqu'à "THE END" (menu du site, ©, etc. supprimés)
const debut = lignes.findIndex(l => /^1\. /.test(l));
if (debut === -1) {
  throw new Error("Chapitre 1 introuvable : ce PDF n'est pas le Manuel d'Épictète (rien n'a été indexé).");
}
const fin = lignes.findIndex((l, i) => i > debut && /^THE END$/i.test(l));
lignes = lignes.slice(debut, fin === -1 ? undefined : fin);

// 3. Recoller les lignes coupées : mots coupés par un tiret, puis une ligne par chapitre
const texte = lignes.join('\n')
  .replace(/([a-z])-\n([a-z])/g, '$1$2')   // "philo-\nsophy" -> "philosophy"
  .replace(/\n(?!\d+\. )/g, ' ')           // retour à la ligne hors début de chapitre -> espace
  .replace(/ {2,}/g, ' ')
  .trim();

return [{ json: { texte, nb_caracteres: texte.length, nb_pages: numpages } }];
