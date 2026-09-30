// Découpe enchiridion_source.txt en un passage par chapitre -> enchiridion.json + enchiridion.csv
// Usage : node chatbot_epictete/scripts/decouper.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../data/', import.meta.url);
const NB_ATTENDU = 52; // la traduction Carter (version MIT) compte 52 chapitres

const brut = readFileSync(new URL('enchiridion_source.txt', dir), 'utf8');
const corps = brut.slice(brut.search(/^1\. /m), brut.indexOf('THE END'));

// Un chapitre commence par "N. " en début de ligne
const morceaux = corps.split(/^(?=\d+\. )/m).map(s => s.trim()).filter(Boolean);

const passages = morceaux.map(m => {
  const chapitre = Number(m.match(/^(\d+)\. /)[1]);
  const texte = m.replace(/^\d+\. /, '').trim();
  return {
    id: `enchiridion-${String(chapitre).padStart(2, '0')}`,
    chapitre,
    source: `Epictetus, The Enchiridion, chapter ${chapitre} (trans. Elizabeth Carter)`,
    nb_mots: texte.split(/\s+/).length,
    texte,
  };
});

// Vérifications : on refuse d'écrire un fichier faux
const erreurs = [];
if (passages.length !== NB_ATTENDU) erreurs.push(`${passages.length} passages au lieu de ${NB_ATTENDU}`);
passages.forEach((p, i) => {
  if (p.chapitre !== i + 1) erreurs.push(`ordre cassé : chapitre ${p.chapitre} en position ${i + 1}`);
  if (p.nb_mots < 10) erreurs.push(`chapitre ${p.chapitre} suspect (${p.nb_mots} mots)`);
});
if (erreurs.length) {
  console.error('ÉCHEC :\n- ' + erreurs.join('\n- '));
  process.exit(1);
}

writeFileSync(new URL('enchiridion.json', dir), JSON.stringify(passages, null, 2) + '\n');

const csv = v => `"${String(v).replace(/"/g, '""')}"`;
writeFileSync(
  new URL('enchiridion.csv', dir),
  ['id,chapitre,source,nb_mots,texte', ...passages.map(p => [p.id, p.chapitre, p.source, p.nb_mots, p.texte].map(csv).join(','))].join('\n') + '\n'
);

const mots = passages.map(p => p.nb_mots);
console.log(`OK : ${passages.length} passages, ${mots.reduce((a, b) => a + b, 0)} mots, min ${Math.min(...mots)}, max ${Math.max(...mots)}`);
