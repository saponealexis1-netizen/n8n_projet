// Tests du workflow (spec : specs/2026-09-30-chatbot-epictete-rag.md)
// Usage : node chatbot_epictete/tests/test.mjs   (après npm install à la racine du repo)
// Exécute les nodes Code DU JSON (via tools/run-code-node.mjs) sur des textes extraits
// exactement comme n8n le fait (tests/extraire_comme_n8n.mjs).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const racine = new URL('../../', import.meta.url).pathname;
const WF = process.env.WF ?? join(racine, 'chatbot_epictete/workflow_chatbot_epictete.json');
const FIX = join(racine, 'chatbot_epictete/tests/fixtures');
const tmp = mkdtempSync(join(tmpdir(), 'epictete-'));
const wf = JSON.parse(readFileSync(WF, 'utf8'));
const reference = JSON.parse(readFileSync(join(racine, 'chatbot_epictete/data/enchiridion.json'), 'utf8'));

let echecs = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) echecs++; };

// Exécute un node Code ; renvoie { sortie } ou { erreur }
function executer(nomNode, entree) {
  const f = join(tmp, `${Math.random()}.json`);
  writeFileSync(f, JSON.stringify(entree));
  try {
    const out = execFileSync('node', [join(racine, 'tools/run-code-node.mjs'), WF, nomNode, f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { sortie: JSON.parse(out) };
  } catch (e) {
    return { erreur: (e.stderr || e.message).trim() };
  }
}
function pipeline(fixture) {
  const entree = JSON.parse(readFileSync(join(FIX, fixture), 'utf8'));
  const n = executer('Nettoyage', entree);
  if (n.erreur) return { etape: 'Nettoyage', erreur: n.erreur };
  const c = executer('Chunking', n.sortie);
  if (c.erreur) return { etape: 'Chunking', erreur: c.erreur, nettoye: n.sortie[0].texte };
  const a = executer('Augmentation', c.sortie);
  if (a.erreur) return { etape: 'Augmentation', erreur: a.erreur };
  return { nettoye: n.sortie[0].texte, chunks: c.sortie, docs: a.sortie };
}

// ---------- A1 : structure du workflow ----------
console.log('\n## A1 - structure du workflow');
const noms = new Set(wf.nodes.map(n => n.name));
ok(noms.size === wf.nodes.length, 'noms de nodes uniques');
ok(new Set(wf.nodes.map(n => n.id)).size === wf.nodes.length, 'IDs de nodes uniques');
const cibles = Object.values(wf.connections).flatMap(c => Object.values(c).flat(2)).map(x => x.node);
ok(Object.keys(wf.connections).every(n => noms.has(n)) && cibles.every(n => noms.has(n)), 'toutes les connexions pointent vers des nodes existants');
const relies = new Set([...Object.keys(wf.connections), ...cibles]);
const isoles = [...noms].filter(n => !relies.has(n));
ok(isoles.length === 0, `aucun node isolé ${isoles.length ? JSON.stringify(isoles) : ''}`);
const store = n => wf.nodes.find(x => x.name === n).parameters;
ok(store('Vectorisation (Simple Vector Store)').memoryKey === store('Recherche dans le livre').memoryKey, 'ingestion et chat utilisent la même clé de vector store');
ok(wf.nodes.find(n => n.name === 'Vectorisation (Simple Vector Store)').typeVersion >= 1.1, 'Simple Vector Store en v1.1+ (clearStore une seule fois par lot)');
const form = wf.nodes.find(n => n.type === 'n8n-nodes-base.formTrigger');
const binaire = form.parameters.formFields.values[0].fieldLabel.replace(/\W/g, '_');
ok(store('Extraire le texte du PDF').binaryPropertyName === binaire, `l'extraction lit le binaire du formulaire ("${binaire}")`);

// ---------- A2 / A3 / A4 : le vrai PDF (celui du repo) ----------
for (const [fixture, titre] of [['extrait_pdf_repo.json', 'PDF du repo'], ['extrait_pdf_navigateur.json', 'PDF imprimé depuis le navigateur (menu du site, en-têtes, pieds de page)']]) {
  console.log(`\n## ${titre}`);
  const r = pipeline(fixture);
  if (r.erreur) { ok(false, `pipeline sans erreur (${r.etape} : ${r.erreur})`); continue; }

  // A2 - nettoyage
  const parasites = ['Go to home page', 'Browse', 'Commentary', 'Download', 'THE END', '©', 'file://', 'http', 'Internet Classics Archive', 'Written 135', 'Translated by'];
  const restes = parasites.filter(p => r.nettoye.includes(p));
  ok(restes.length === 0, `A2 nettoyage : aucun parasite restant ${restes.length ? JSON.stringify(restes) : ''}`);
  ok(!/\n(?!\d+\. )/.test(r.nettoye), 'A2 nettoyage : plus de lignes coupées (1 ligne par chapitre)');
  ok(!/ {2,}/.test(r.nettoye), 'A2 nettoyage : espaces normalisés');

  // A3 - chunking
  const chapitres = [...new Set(r.chunks.map(c => c.chapitre))];
  ok(chapitres.length === 52 && chapitres.every((c, i) => c === i + 1), 'A3 chunking : 52 chapitres, dans l\'ordre 1 → 52');
  ok(r.chunks.every(c => c.texte.trim()), 'A3 chunking : aucun chunk vide');
  const mots = r.chunks.map(c => c.texte.split(/\s+/).length);
  // exception de la spec : une seule phrase plus longue que la limite
  const unePhrase = t => (t.match(/[.!?]+["'’”)\]]*\s/g) ?? []).length === 0;
  const tropLongs = r.chunks.filter((c, i) => mots[i] > 350 * 1.15 && !unePhrase(c.texte));
  ok(tropLongs.length === 0, `A3 chunking : aucun chunk > ~350 mots (max ${Math.max(...mots)} mots, ${r.chunks.length} chunks)`);
  // Fidélité : on retrouve exactement les mots du livre de référence, chapitre par chapitre
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const differents = reference.filter(ref => norm(r.chunks.filter(c => c.chapitre === ref.chapitre).map(c => c.texte).join(' ')) !== norm(ref.texte));
  ok(differents.length === 0, `A3 fidélité : texte identique au livre de référence pour les 52 chapitres ${differents.length ? '(différents : ' + differents.map(d => d.chapitre).join(', ') + ')' : ''}`);
  if (differents.length) {
    const d = differents[0];
    const a = norm(r.chunks.filter(c => c.chapitre === d.chapitre).map(c => c.texte).join(' ')), b = norm(d.texte);
    const i = [...a].findIndex((ch, k) => ch !== b[k]);
    console.log(`   chapitre ${d.chapitre}, 1re différence : extrait « …${a.slice(i - 30, i + 30)}… » / référence « …${b.slice(i - 30, i + 30)}… »`);
  }

  // A4 - augmentation
  const champs = ['chapitre', 'partie', 'livre', 'traduction', 'source', 'nb_mots'];
  ok(r.docs.every(d => champs.every(k => d[k] !== undefined && d[k] !== '')), `A4 métadonnées présentes sur les ${r.docs.length} chunks`);
  ok(r.docs.every(d => d.texte.startsWith(`Enchiridion – Chapter ${d.chapitre}`)), 'A4 chaque texte commence par son en-tête de chapitre');
  const maxCar = Math.max(...r.docs.map(d => d.texte.length));
  const splitter = store('Pas de re-découpage (chunks déjà prêts)').chunkSize;
  ok(maxCar < splitter, `A4 le splitter (${splitter} car.) ne redécoupe aucun chunk (max ${maxCar} car.)`);
}

// ---------- A5 / cas limites ----------
console.log('\n## A5 - mauvais PDF : erreur claire, rien d\'indexé');
for (const [fixture, attendu] of [['extrait_pdf_autre_livre.json', /chapitres trouvés au lieu de 52|Chapitre 1 introuvable/], ['extrait_pdf_vide.json', /Aucun texte extrait/]]) {
  const r = pipeline(fixture);
  ok(r.erreur && attendu.test(r.erreur), `${fixture} → ${r.erreur ? `erreur à l'étape ${r.etape} : « ${r.erreur.replace(/^ERREUR dans "[^"]+" : /, '')} »` : 'AUCUNE ERREUR'}`);
}
// Livre tronqué : chapitres 1 à 30 seulement
const repo = JSON.parse(readFileSync(join(FIX, 'extrait_pdf_repo.json'), 'utf8'));
const tronque = [{ ...repo[0], text: repo[0].text.slice(0, repo[0].text.search(/^31\. /m)) }];
writeFileSync(join(FIX, 'extrait_pdf_tronque.json'), JSON.stringify(tronque));
const rt = pipeline('extrait_pdf_tronque.json');
ok(rt.erreur && /30 chapitres trouvés au lieu de 52/.test(rt.erreur), `livre tronqué (30 chapitres) → ${rt.erreur ? '« ' + rt.erreur.replace(/^ERREUR dans "[^"]+" : /, '') + ' »' : 'AUCUNE ERREUR'}`);

// Faux début de chapitre : une ligne du PDF commence par "50. " au milieu du chapitre 25
console.log('\n## Faux début de chapitre au milieu du texte');
const faux = [{ ...repo[0], text: repo[0].text.replace('Fifty cents, for instance.', 'Fifty cents, for\n50. instance.') }];
if (faux[0].text === repo[0].text) ok(false, 'fixture faux chapitre non construite');
writeFileSync(join(FIX, 'extrait_pdf_faux_chapitre.json'), JSON.stringify(faux));
const rf = pipeline('extrait_pdf_faux_chapitre.json');
ok(!rf.erreur && new Set(rf.chunks.map(c => c.chapitre)).size === 52 && rf.chunks.filter(c => c.chapitre === 25).map(c => c.texte).join(' ').includes('50. instance'),
  `une ligne "50. ..." dans le chapitre 25 reste dans le chapitre 25 ${rf.erreur ? '(erreur : ' + rf.erreur + ')' : ''}`);

// ---------- A11 : pas de secret ----------
console.log('\n## A11 - aucun secret dans le JSON');
const brut = readFileSync(WF, 'utf8');
ok(!/AIza[0-9A-Za-z_-]{20,}|api[_-]?key"\s*:\s*"[^"]+"|"credentials"/i.test(brut), 'pas de clé API ni de credentials embarqués');

console.log(`\n${echecs ? `❌ ${echecs} échec(s)` : '✅ Tous les tests passent'}`);
process.exit(echecs ? 1 : 0);
