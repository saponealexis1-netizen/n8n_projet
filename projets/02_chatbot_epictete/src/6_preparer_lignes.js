// PRÉPARER LES LIGNES : associe chaque vecteur Gemini à son chunk → 1 seul JSON pour la fonction SQL
// epictete_reindexer, qui vide et réinsère la table dans une seule transaction.
const lignes = [];
$input.all().forEach((reponse, i) => {
  const { chunks } = $('Préparer les embeddings').itemMatching(i).json;
  const vecteurs = reponse.json.embeddings ?? [];
  if (vecteurs.length !== chunks.length) {
    throw new Error(`Gemini a renvoyé ${vecteurs.length} vecteurs pour ${chunks.length} chunks : rien n'a été modifié dans la base.`);
  }
  chunks.forEach((c, j) => lignes.push({
    chapitre: c.chapitre,
    partie: c.partie,
    content: c.texte,
    mots_cles: c.mots_cles,
    metadata: { livre: c.livre, auteur: c.auteur, traduction: c.traduction, source: c.source, nb_mots: c.nb_mots, nb_parties: c.nb_parties },
    embedding: `[${vecteurs[j].values.join(',')}]`,
  }));
});

const dimensions = [...new Set(lignes.map(l => l.embedding.split(',').length))];
if (dimensions.length !== 1) throw new Error(`Vecteurs de tailles différentes (${dimensions.join(', ')}) : rien n'a été modifié.`);

return [{ json: { nb_chunks: lignes.length, dimension: dimensions[0], payload: JSON.stringify(lignes) } }];
