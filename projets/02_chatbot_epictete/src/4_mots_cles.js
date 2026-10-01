// MOTS-CLÉS : ajoute à chaque chunk ses 8 mots les plus importants (colonne mots_cles)
// Méthode : mots de 4 lettres ou plus, hors mots vides, classés par fréquence dans le chunk
// (à égalité : ordre d'apparition). Gratuit, instantané et toujours le même résultat.
const NB_MOTS_CLES = 8;
const MOTS_VIDES = new Set(`
about above after again against also among another anything appear appears because been before
being both cannot could does doing done down each either else even ever every from further have
having hence here into itself just less like made make many more most much must myself neither
never none only other others ought over same shall should since some such than that their theirs
them themselves then there therefore these they thing things this those though through thus till
together under unless until upon very what whatever when whenever where whether which while whom
whose will with within without would your yours yourself yourselves said says whoever thee thou
thy thine hath doth also wherein whereby anyone anybody someone somebody nothing something
everything everyone himself herself instead rather indeed still well word words show shows
shown seem seems another always often perhaps already enough
`.split(/\s+/).filter(Boolean));

return $input.all().map(({ json: c }) => {
  const corps = c.texte.split('\n').slice(1).join(' ');  // sans l'en-tête "Enchiridion – Chapter N"
  const mots = corps.toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g) ?? [];
  const compte = new Map();
  mots.forEach((m, i) => {
    if (m.length < 4 || MOTS_VIDES.has(m) || m.includes("'")) return;
    const e = compte.get(m) ?? { n: 0, premier: i };
    e.n++;
    compte.set(m, e);
  });
  const mots_cles = [...compte.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[1].premier - b[1].premier)
    .slice(0, NB_MOTS_CLES)
    .map(([m]) => m);
  return { json: { ...c, mots_cles } };
});
