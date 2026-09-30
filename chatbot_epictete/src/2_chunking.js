// CHUNKING : 1 chunk par chapitre, les chapitres trop longs sont redécoupés par groupes de phrases
// (le PDF ne conserve pas les paragraphes, on coupe donc entre deux phrases)
const NB_CHAPITRES = 52;  // traduction E. Carter (version MIT)
const MAX_MOTS = 350;

const { texte } = $input.first().json;

// Un nouveau chapitre = une ligne "N. ..." avec N = chapitre précédent + 1
// (un "12. " isolé au milieu du texte ne crée donc pas de faux chapitre)
const chapitres = [];
for (const ligne of texte.split('\n')) {
  const m = ligne.match(/^(\d+)\. ([\s\S]*)$/);
  if (m && Number(m[1]) === chapitres.length + 1) {
    chapitres.push({ chapitre: Number(m[1]), texte: m[2].trim() });
  } else if (chapitres.length) {
    chapitres.at(-1).texte += ' ' + ligne.trim();
  }
}

if (chapitres.length !== NB_CHAPITRES) {
  throw new Error(`${chapitres.length} chapitres trouvés au lieu de ${NB_CHAPITRES} : mauvais livre ou autre traduction (rien n'a été indexé).`);
}
const vide = chapitres.find(c => !c.texte);
if (vide) throw new Error(`Chapitre ${vide.chapitre} vide : PDF mal extrait (rien n'a été indexé).`);

const nbMots = s => s.split(/\s+/).filter(Boolean).length;

function decouper(texte) {
  const total = nbMots(texte);
  if (total <= MAX_MOTS) return [texte];
  const cible = total / Math.ceil(total / MAX_MOTS);  // parties de taille équilibrée
  const phrases = texte.match(/[^.!?]+[.!?]+["'’”)\]]*\s*|[^.!?]+$/g) ?? [texte];
  const parties = [];
  let courante = '';
  for (const p of phrases) {
    if (courante && nbMots(courante) + nbMots(p) > cible * 1.15) {
      parties.push(courante.trim());
      courante = '';
    }
    courante += p;
  }
  if (courante.trim()) parties.push(courante.trim());
  return parties;
}

return chapitres.flatMap(c => {
  const parties = decouper(c.texte);
  return parties.map((texte, i) => ({
    json: { chapitre: c.chapitre, partie: i + 1, nb_parties: parties.length, texte },
  }));
});
