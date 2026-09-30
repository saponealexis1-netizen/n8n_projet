// NETTOYAGE du texte extrait du PDF
// Entrée : 1 item { text, numpages } (sortie de "Extraire le texte du PDF")
// Sortie : 1 item { texte } avec un chapitre par ligne ("1. ...", "2. ...")
const { text = '', numpages = 1 } = $input.first().json;
if (!text.trim()) {
  throw new Error("Aucun texte extrait du PDF (PDF vide ou scanné) : rien n'a été indexé.");
}

// Les pages sont séparées par une ligne vide (extraction n8n)
const pages = text.replace(/\r/g, '').split('\n\n')
  .map(p => p.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean));

// 1. En-têtes / pieds de page du navigateur : lignes qui reviennent au BORD de plusieurs pages
//    (3 premières / 3 dernières lignes ; chiffres ignorés pour attraper "1/10", "2/10", la date…).
//    On ne regarde que les bords pour ne jamais supprimer une ligne du livre qui se répète.
const cle = l => l.replace(/\d+/g, '#');
const bords = pages.flatMap(p => [...new Set([...p.slice(0, 3), ...p.slice(-3)])]);
const freq = {};
for (const l of bords) freq[cle(l)] = (freq[cle(l)] ?? 0) + 1;
const estEnTete = (l, i, page) => (i < 3 || i >= page.length - 3) && numpages >= 3 && freq[cle(l)] >= 3 && l.length < 200;
const estParasite = l =>
  /^(https?|file):\/\//i.test(l) ||                  // URL
  /^(page\s*)?\d+\s*(\/|of|sur)\s*\d+$/i.test(l) ||  // "3/10", "Page 3 of 10"
  /^\d+$/.test(l);                                   // numéro de page seul
let lignes = pages.flatMap(p => p.filter((l, i) => !estEnTete(l, i, p) && !estParasite(l)));

// 2. Garder uniquement le livre : du chapitre 1 jusqu'à "THE END" (menu du site, ©, etc. supprimés)
const debut = lignes.findIndex(l => /^1\.( |$)/.test(l));
if (debut === -1) {
  throw new Error("Chapitre 1 introuvable : ce PDF n'est pas le Manuel d'Épictète (rien n'a été indexé).");
}
const fin = lignes.findIndex((l, i) => i > debut && /^THE END$/i.test(l));
lignes = lignes.slice(debut, fin === -1 ? undefined : fin);

// 3. Recoller les lignes coupées : mots coupés par un tiret, puis une ligne par chapitre
const texte = lignes.join('\n')
  .replace(/([a-z])-\n([a-z])/g, '$1-$2')  // "self-\nrestraint" -> "self-restraint" (tiret gardé)
  .replace(/\n(?!\d+\.(?: |\n|$))/g, ' ') // retour à la ligne hors début de chapitre -> espace
  .replace(/^(\d+)\.(?=\S)/gm, '$1. ')      // "12." seul sur sa ligne -> "12. " + texte
  .replace(/ {2,}/g, ' ')
  .trim();

return [{ json: { texte, nb_caracteres: texte.length, nb_pages: numpages } }];
