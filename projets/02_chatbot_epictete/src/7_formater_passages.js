// FORMATER LES PASSAGES : transforme les lignes de la recherche hybride en texte pour l'agent
// (renvoyé à l'agent comme résultat de l'outil "manuel_epictete")
const lignes = $input.all().map(i => i.json).filter(r => r.content);

if (lignes.length === 0) {
  return [{ json: { passages: "Aucun passage du Manuel d'Épictète ne correspond à cette recherche." } }];
}

const rang = r => (r == null ? '-' : `#${r}`);
const passages = lignes.map((r, i) => [
  `--- Passage ${i + 1} : Chapitre ${r.chapitre}` + (r.content.includes('(part ') ? `, partie ${r.partie}` : ''),
  `(score hybride ${Number(r.score).toFixed(4)} · rang sémantique ${rang(r.rang_semantique)} · rang mots-clés ${rang(r.rang_mots_cles)} · mots-clés : ${(r.mots_cles ?? []).join(', ')})`,
  r.content,
].join('\n')).join('\n\n');

return [{ json: { passages } }];
