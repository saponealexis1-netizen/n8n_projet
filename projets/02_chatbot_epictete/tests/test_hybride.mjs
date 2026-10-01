// Tests de la variante HYBRIDE (spec : section « Évolution : recherche hybride », H1-H6)
// Usage : node projets/02_chatbot_epictete/tests/test_hybride.mjs   (après npm install à la racine)
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

const racine = new URL('../../../', import.meta.url).pathname;
const P = join(racine, 'projets/02_chatbot_epictete');
const WF = process.env.WF ?? join(P, 'workflow_chatbot_epictete_hybride.json');
const wf = JSON.parse(readFileSync(WF, 'utf8'));
const SQL = readFileSync(process.env.SQL ?? join(P, 'supabase/setup_hybride.sql'), 'utf8');
const DIM = 3072;

let echecs = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) echecs++; };
const n = nom => wf.nodes.find(x => x.name === nom);
const suivants = (nom, sortie = 0) => wf.connections[nom]?.main?.[sortie]?.map(c => c.node) ?? [];
const tmp = mkdtempSync(join(tmpdir(), 'hyb-'));
const run = (nom, entree, refs = {}) => {
  const f = join(tmp, `${Math.random()}.json`); writeFileSync(f, JSON.stringify(entree));
  const args = [join(racine, 'tools/run-code-node.mjs'), WF, nom, f];
  for (const [r, data] of Object.entries(refs)) { const g = join(tmp, `${Math.random()}.json`); writeFileSync(g, JSON.stringify(data)); args.push('--ref', `${r}=${g}`); }
  try { return { sortie: JSON.parse(execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })) }; }
  catch (e) { return { erreur: (e.stderr || e.message).trim() }; }
};

// ---------- Structure ----------
console.log('\n## Structure (flow du prof : … Chunking → Limit → sous-workflow → Embedding HTTP → SQL)');
const noms = new Set(wf.nodes.map(x => x.name));
const cibles = Object.values(wf.connections).flatMap(c => Object.values(c).flat(2)).map(x => x.node);
ok(Object.keys(wf.connections).every(x => noms.has(x)) && cibles.every(x => noms.has(x)), 'toutes les connexions pointent vers des nodes existants');
ok([...noms].every(x => wf.connections[x] || cibles.includes(x)), 'aucun node isolé');
ok(wf.nodes.filter(x => x.type === 'n8n-nodes-base.executeWorkflowTrigger').length === 1, 'un seul déclencheur de sous-workflow (limite n8n : maxNodes = 1)');
ok(JSON.stringify(suivants('Augmentation')) === '["Mots-clés"]' && JSON.stringify(suivants('Mots-clés')) === '["Limit"]' && JSON.stringify(suivants('Limit')) === '["Vectoriser (sous-workflow)"]',
  'ingestion : Augmentation → Mots-clés → Limit → Vectoriser (sous-workflow)');
ok(n('Limit').parameters.maxItems === 100, 'H2 : Limit = 100 (borne haute du prof, = max de textes par appel batchEmbedContents)');
ok([n('Vectoriser (sous-workflow)'), n('Recherche hybride dans le livre')].every(x => x.parameters.workflowId?.value === '={{ $workflow.id }}'), 'l\'ingestion et l\'outil de l\'agent appellent ce même workflow ($workflow.id), rien à sélectionner');
ok(JSON.stringify(suivants('Rechercher ?', 0)) === '["Embedding de la question (Gemini)"]' && JSON.stringify(suivants('Rechercher ?', 1)) === '["Préparer les embeddings"]',
  'aiguillage : action = rechercher → branche recherche, sinon → branche indexation');
ok(n('Recherche hybride dans le livre').parameters.fields.values.some(f => f.name === 'action' && f.stringValue === 'rechercher'), 'l\'outil de l\'agent envoie action = rechercher');
const modeleCode = n('Préparer les embeddings').parameters.jsCode.match(/MODELE = '([^']+)'/)?.[1];
ok(modeleCode && n('Embedding de la question (Gemini)').parameters.url.includes(modeleCode) && n('Embedding de la question (Gemini)').parameters.jsonBody.includes(modeleCode),
  `même modèle d'embeddings pour les chunks et les questions (${modeleCode})`);
ok(wf.nodes.filter(x => x.type.endsWith('httpRequest')).every(x => x.parameters.nodeCredentialType === 'googlePalmApi'), 'les 2 HTTP Request utilisent le credential Gemini existant');
ok(n('Recherche hybride (SQL)').alwaysOutputData === true, '0 résultat SQL → l\'agent reçoit quand même une réponse');
ok(!/AIza[0-9A-Za-z_-]{20,}|"credentials"|service_role|eyJhbGci/i.test(readFileSync(WF, 'utf8')), 'H6 : aucune clé ni credential dans le JSON');

// ---------- Nodes Code (pipeline complet sur le vrai PDF) ----------
console.log('\n## Nodes Code');
const extrait = JSON.parse(readFileSync(join(P, 'tests/fixtures/extrait_pdf_repo.json'), 'utf8'));
const aug = run('Augmentation', run('Chunking', run('Nettoyage', extrait).sortie).sortie).sortie;
const mc = run('Mots-clés', aug);
const chunks = mc.sortie ?? [];
const VIDES = ['that', 'with', 'which', 'what', 'shall', 'upon', 'there', 'their', 'this', 'from'];
ok(chunks.length === 56 && chunks.every(c => Array.isArray(c.mots_cles) && c.mots_cles.length >= 1 && c.mots_cles.length <= 8),
  `H1 : 56 chunks, chacun avec 1 à 8 mots-clés (${mc.erreur ?? 'ex. ch1 : ' + chunks[0]?.mots_cles.join(', ')})`);
ok(chunks.every(c => c.mots_cles.every(m => !VIDES.includes(m) && m.length >= 4 && c.texte.toLowerCase().includes(m))), 'H1 : mots-clés sans mots vides, tous présents dans le texte du chunk');
const ch49 = chunks.find(c => c.chapitre === 49);
ok(ch49?.mots_cles.includes('chrysippus'), `H1 : le chapitre 49 a « chrysippus » dans ses mots-clés (${ch49?.mots_cles.join(', ')})`);

const prep = run('Préparer les embeddings', chunks).sortie;
ok(prep.length === 1 && prep[0].requests.length === 56 && prep[0].requests[0].content.parts[0].text === chunks[0].texte, 'H2 : 56 chunks → 1 seul appel batchEmbedContents de 56 textes');
const prep150 = run('Préparer les embeddings', Array.from({ length: 150 }, (_, i) => ({ ...chunks[i % 56] }))).sortie;
ok(prep150.length === 2 && prep150[0].requests.length === 100 && prep150[1].requests.length === 50, 'si le Limit était relevé : 150 chunks → 2 appels (100 + 50)');

// Vecteurs factices déterministes (on teste la base, pas Gemini)
const vec = graine => {
  const v = []; let h = createHash('sha256').update(String(graine)).digest();
  for (let i = 0; i < DIM; i++) { if (i % 32 === 0 && i) h = createHash('sha256').update(h).digest(); v.push(+(h[i % 32] / 255 - 0.5).toFixed(4)); }
  return v;
};
const reponseGemini = [{ embeddings: chunks.map(c => ({ values: vec(`${c.chapitre}-${c.partie}`) })) }];
const lignes = run('Préparer les lignes', reponseGemini, { 'Préparer les embeddings': prep });
const payload = lignes.sortie?.[0]?.payload;
ok(lignes.sortie?.[0]?.nb_chunks === 56 && lignes.sortie[0].dimension === DIM, `les 56 vecteurs sont associés à leur chunk (dimension ${lignes.sortie?.[0]?.dimension})`);
const manque = run('Préparer les lignes', [{ embeddings: reponseGemini[0].embeddings.slice(0, 50) }], { 'Préparer les embeddings': prep });
ok(/50 vecteurs pour 56 chunks/.test(manque.erreur ?? ''), `réponse Gemini incomplète → erreur claire, base non modifiée : « ${(manque.erreur ?? 'AUCUNE ERREUR').replace(/^ERREUR dans "[^"]+" : /, '')} »`);

const vide = run('Formater les passages', [{}]).sortie;
ok(/Aucun passage/.test(vide?.[0]?.passages ?? ''), 'aucun résultat → message explicite pour l\'agent');

// ---------- SQL réel ----------
console.log('\n## supabase/setup_hybride.sql exécuté sur Postgres + pgvector');
const db = await PGlite.create({ extensions: { vector } });
await db.exec(SQL); await db.exec(SQL);
ok(true, 'script exécuté 2 fois sans erreur (relançable)');
ok((await db.query("select relrowsecurity r from pg_class where relname = 'epictete_chunks'")).rows[0].r === true, 'RLS activée');
const reindexer = async p => (await db.query('select epictete_reindexer($1::jsonb) as nb', [p])).rows[0].nb;
ok(await reindexer(payload) === 56 && await reindexer(payload) === 56 && (await db.query('select count(*)::int c from epictete_chunks')).rows[0].c === 56,
  'H3 : réindexer 2 fois → 56 lignes, pas 112 (la requête exacte du node « Enregistrer » prend le payload en $1)');
const casse = JSON.parse(payload); casse[30].embedding = `[${Array(768).fill(0.1).join(',')}]`;
let err = ''; try { await reindexer(JSON.stringify(casse)); } catch (e) { err = e.message; }
ok(/expected 3072 dimensions, not 768/.test(err) && (await db.query('select count(*)::int c from epictete_chunks')).rows[0].c === 56,
  `H3 : réindexation ratée (« ${err} ») → transaction annulée, les 56 anciennes lignes sont intactes`);

const chercher = async (question, graine) => (await db.query(
  n('Recherche hybride (SQL)').parameters.query.replace(';', ''), [question, `[${vec(graine).join(',')}]`])).rows;
const top = r => r.map(x => `ch${x.chapitre}.${x.partie}(s${x.rang_semantique ?? '-'}/m${x.rang_mots_cles ?? '-'})`).join(' ');

let r = await chercher('xyzzy', '5-1');
ok(r.length === 4 && r[0].chapitre === 5 && r[0].rang_mots_cles === null, `H4 : question sans mot du livre → la partie sémantique trouve le chapitre visé : ${top(r)}`);
r = await chercher('Chrysippus', '1-1');
ok(r.some(x => x.chapitre === 49 && x.rang_mots_cles === 1) && r.some(x => x.chapitre === 1), `H4 : « Chrysippus » + vecteur du ch1 → ch49 remonté par les mots-clés ET ch1 par le sens : ${top(r)}`);
r = await chercher('Olympic games', '7-1');
ok(r.some(x => x.chapitre === 29 && x.rang_mots_cles != null), `H4 : « Olympic games » → chapitre 29 trouvé par mots-clés : ${top(r)}`);
r = await chercher('Chrysippus Olympic', '3-1');
ok(r.some(x => x.chapitre === 49 && x.rang_mots_cles != null) && r.some(x => x.chapitre === 29 && x.rang_mots_cles != null), `les mots de la question sont combinés en OU (aucun chunk ne contient les deux) : ${top(r)}`);
r = await chercher('death', '21-1');
ok(r[0].chapitre === 21 && r[0].rang_semantique === 1 && r[0].rang_mots_cles != null, `H4 : fusion RRF : trouvé par les deux méthodes → 1er : ${top(r)}`);
r = await chercher('Socrate', '2-1');
ok(r.some(x => x.rang_mots_cles != null && /Socrates/.test(x.content)), `« Socrate » (français) trouve « Socrates » grâce aux racines anglaises : ${top(r)}`);
r = await chercher('the and of', '3-1');
ok(r.length === 4 && r.every(x => x.rang_mots_cles === null), 'question faite uniquement de mots vides → pas d\'erreur, recherche sémantique seule');

// Revue hostile #2 : "Chapter N" doit ramener le chapitre N en tête, même avec un vecteur qui pointe ailleurs
let rates = [];
for (const N of [1, 8, 21, 33, 40, 52]) {
  for (const q of [`Enchiridion – Chapter ${N}`, `que dit le chapitre ${N} ?`]) {
    const rr = await chercher(q, 'neutre-' + N);
    if (rr[0]?.chapitre !== N) rates.push(`${q} → ${top(rr)}`);
  }
}
ok(rates.length === 0, `« Chapter N » / « chapitre N » → chapitre N en tête (12 cas)${rates.length ? ' : ' + rates.slice(0, 2).join(' | ') : ''}`);
const ch33 = await chercher('Enchiridion – Chapter 33', 'neutre');
ok(ch33.slice(0, 3).map(x => x.partie).join() === '1,2,3', `chapitre recoupé (33) → ses 3 parties dans l'ordre : ${top(ch33)}`);
const nbChapter = (await db.query("select count(*)::int c from epictete_chunks where fts @@ to_tsquery('english', 'chapter')")).rows[0].c;
ok(nbChapter === 0, `l'en-tête « Enchiridion – Chapter N » n'est pas dans l'index plein texte (${nbChapter} chunks contiennent « chapter »)`);

const f = run('Formater les passages', (await chercher('Chrysippus', '1-1')).map(x => ({ ...x }))).sortie?.[0]?.passages ?? '';
ok(/Chapitre 49/.test(f) && /rang mots-clés #1/.test(f) && /chrysippus/.test(f) && /Enchiridion – Chapter 49/.test(f), 'H5 : l\'agent reçoit chapitre, scores/rangs, mots-clés et texte de chaque passage');

console.log(`\n${echecs ? `❌ ${echecs} échec(s)` : '✅ Tous les tests hybrides passent'}`);
process.exit(echecs ? 1 : 0);
