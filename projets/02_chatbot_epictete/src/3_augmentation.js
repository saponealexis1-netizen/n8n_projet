// AUGMENTATION : métadonnées + en-tête de chapitre ajouté au texte vectorisé
// (l'en-tête aide la recherche sur "chapitre 5" et permet au bot de citer sa source)
const LIVRE = "The Enchiridion (Manuel d'Épictète)";
const AUTEUR = 'Epictetus';
const TRADUCTION = 'Elizabeth Carter (1758)';

return $input.all().map(({ json: c }) => {
  const entete = `Enchiridion – Chapter ${c.chapitre}` + (c.nb_parties > 1 ? ` (part ${c.partie}/${c.nb_parties})` : '');
  return {
    json: {
      texte: `${entete}\n${c.texte}`,
      chapitre: c.chapitre,
      partie: c.partie,
      nb_parties: c.nb_parties,
      livre: LIVRE,
      auteur: AUTEUR,
      traduction: TRADUCTION,
      source: `${AUTEUR}, ${entete}, trans. ${TRADUCTION}`,
      nb_mots: c.texte.split(/\s+/).filter(Boolean).length,
    },
  };
});
