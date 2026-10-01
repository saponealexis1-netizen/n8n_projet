// Tests de la variante ANSWERING (spec : section « Évolution : pipeline d'answering », R1-R7)
// Usage : node projets/02_chatbot_epictete/tests/test_answering.mjs   (après npm install à la racine)
// Simule des conversations complètes : vrai SQL (PGlite + pgvector) + vrais nodes Code du JSON,
// avec des réponses Gemini simulées (on teste le pipeline, pas la qualité du LLM).
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

const racine = new URL('../../../', import.meta.url).pathname;
const P = join(racine, 'projets/02_chatbot_epictete');
const WF = process.env.WF ?? join(P, 'workflow_chatbot_epictete_answering.json');
const wf = JSON.parse(readFileSync(WF, 'utf8'));
const hybride = JSON.parse(readFileSync(join(P, 'workflow_chatbot_epictete_hybride.json'), 'utf8'));
const DIM = 3072;

let echecs = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) echecs++; };
const n = nom => wf.nodes.find(x => x.name === nom);
const suivants = (nom, sortie = 0) => wf.connections[nom]?.main?.[sortie]?.map(c => c.node) ?? [];
const tmp = mkdtempSync(join(tmpdir(), 'ans-'));
const run = (nom, entree, refs = {}) => {
  const f = join(tmp, `${Math.random()}.json`); writeFileSync(f, JSON.stringify(entree));
  const args = [join(racine, 'tools/run-code-node.mjs'), WF, nom, f];
  for (const [r, data] of Object.entries(refs)) { const g = join(tmp, `${Math.random()}.json`); writeFileSync(g, JSON.stringify(data)); args.push('--ref', `${r}=${g}`); }
  try { return JSON.parse(execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })); }
  catch (e) { throw new Error(`${nom} : ${(e.stderr || e.message).trim()}`); }
};
const gemini = texte => [{ candidates: [{ content: { parts: [{ text: texte }], role: 'model' } }] }];
const vec = graine => {
  const v = []; let h = createHash('sha256').update(String(graine)).digest();
  for (let i = 0; i < DIM; i++) { if (i % 32 === 0 && i) h = createHash('sha256').update(h).digest(); v.push(+(h[i % 32] / 255 - 0.5).toFixed(4)); }
  return v;
};

// ---------- Structure ----------
console.log('\n## Structure : Input → Context → Routing → Search → Reranking → Generation');
const noms = new Set(wf.nodes.map(x => x.name));
const cibles = Object.values(wf.connections).flatMap(c => Object.values(c).flat(2)).map(x => x.node);
ok(Object.keys(wf.connections).every(x => noms.has(x)) && cibles.every(x => noms.has(x)), 'toutes les connexions pointent vers des nodes existants');
ok([...noms].every(x => wf.connections[x] || cibles.includes(x)), 'aucun node isolé');
const chaine = ['1. Input (chat)', '2. Context : historique (SQL)', '2. Context : construire', '3. Routing (Gemini)', '3. Routing : lire la décision', '3. Routing : chercher dans le livre ?',
  '4. Search : embedding de la requête (Gemini)', '4. Search : recherche hybride (SQL)', '5. Reranking : préparer', '5. Reranking (Gemini)', '5. Reranking : garder les meilleurs',
  '6. Generation (Gemini)', '6. Generation : réponse', "7. Sauvegarder l'échange (SQL)"];
ok(chaine.slice(0, -1).every((nom, i) => suivants(nom).includes(chaine[i + 1])), 'les 6 étapes s\'enchaînent dans l\'ordre, puis la sauvegarde');
ok(JSON.stringify(suivants('3. Routing : chercher dans le livre ?', 1)) === '["Réponse directe (sans recherche)"]' && JSON.stringify(suivants('Réponse directe (sans recherche)')) === `["7. Sauvegarder l'échange (SQL)"]`,
  'R6 : conversation / hors sujet → réponse directe, sans recherche');
ok(!wf.nodes.some(x => /agent|toolWorkflow|memoryBufferWindow|vectorStore/.test(x.type)), 'plus d\'agent, d\'outil ni de mémoire n8n : chaque étape est un node visible');
ok(!wf.connections["7. Sauvegarder l'échange (SQL)"], 'la sauvegarde est le dernier node (le chat affiche son champ output)');
const llm = ['3. Routing (Gemini)', '5. Reranking (Gemini)', '6. Generation (Gemini)'].map(n);
ok(llm.every(x => x.parameters.url.endsWith('models/gemini-flash-lite-latest:generateContent') && x.parameters.nodeCredentialType === 'googlePalmApi'),
  'les 3 appels LLM : generateContent sur gemini-flash-lite-latest, avec le credential Gemini existant');
ok(/epictete_recherche_hybride\(\$1, \$2::vector, 10\)/.test(n('4. Search : recherche hybride (SQL)').parameters.query), 'R3 : la recherche hybride renvoie 10 candidats au reranking');
const modeleIngestion = n('Préparer les embeddings').parameters.jsCode.match(/MODELE = '([^']+)'/)[1];
ok(n('4. Search : embedding de la requête (Gemini)').parameters.url.includes(modeleIngestion), `même modèle d'embeddings pour l'ingestion et la recherche (${modeleIngestion})`);
const ingestionPareille = ['Nettoyage', 'Chunking', 'Augmentation', 'Mots-clés', 'Limit', 'Préparer les embeddings', 'Préparer les lignes', 'Enregistrer dans Supabase (SQL)']
  .every(nom => JSON.stringify(n(nom).parameters) === JSON.stringify(hybride.nodes.find(x => x.name === nom).parameters));
ok(ingestionPareille, 'ingestion identique à la version hybride validée (même table epictete_chunks)');
ok(!/AIza[0-9A-Za-z_-]{20,}|"credentials"|service_role|eyJhbGci/i.test(readFileSync(WF, 'utf8')), 'aucune clé ni credential dans le JSON');

// ---------- Nodes Code isolés ----------
console.log('\n## Routing et reranking : cas limites');
const ctx = [{ sessionId: 's', question: 'Qu\'est-ce qui dépend de nous ?', historique: '(début de la conversation)' }];
const lire = texte => run('3. Routing : lire la décision', gemini(texte), { '2. Context : construire': ctx })[0];
let d = lire('{"route":"livre","requete":"what is in our control","chapitre":null,"langue":"fr","reponse_directe":""}');
ok(d.route === 'livre' && d.requete === 'what is in our control' && d.chapitre === null && d.routing_lisible, 'R2 : décision JSON valide lue telle quelle');
d = lire('```json\n{"route":"conversation","requete":"","langue":"en","reponse_directe":"Hi!"}\n```');
ok(d.route === 'conversation' && d.langue === 'en' && d.reponse_directe === 'Hi!', 'R2 : JSON entouré de ```json toléré');
d = lire('désolé je ne peux pas');
ok(d.route === 'livre' && d.requete === ctx[0].question && d.routing_lisible === false, 'R2 : réponse illisible → route « livre » avec la question brute (pas de crash)');
d = lire('{"route":"autre","chapitre":"8","requete":"demand wish"}');
ok(d.route === 'livre' && d.chapitre === 8 && d.requete.startsWith('Enchiridion – Chapter 8'), 'R2 : route inconnue → « livre » ; chapitre « 8 » → 8 et ajouté à la requête');
ok(lire('{"route":"livre","chapitre":99,"requete":"x"}').chapitre === null, 'R2 : chapitre impossible (99) ignoré');

const routage = { sessionId: 's', question: 'q', historique: 'h', route: 'livre', requete: 'r', chapitre: null, langue: 'fr' };
const cands = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, chapitre: i + 1, partie: 1, content: `Enchiridion – Chapter ${i + 1}\ntexte ${i + 1}` }));
const prep = run('5. Reranking : préparer', cands, { '3. Routing : lire la décision': [routage] });
ok(prep[0].candidats.length === 10 && /\[10\] \(chapitre 10\)/.test(prep[0].corps_reranking.contents[0].parts[0].text), 'R4 : les 10 candidats sont numérotés et envoyés au reranking');
const garder = (texte, r = routage) => run('5. Reranking : garder les meilleurs', gemini(texte), { '3. Routing : lire la décision': [r], '5. Reranking : préparer': prep })[0];
let g = garder(JSON.stringify({ scores: [{ id: 1, score: 3 }, { id: 2, score: 9 }, { id: 3, score: 6 }, { id: 4, score: 10 }, { id: 5, score: 5 }, { id: 6, score: 8 }, { id: 7, score: 1 }] }));
ok(JSON.stringify(g.chapitres) === '[4,2,6,3]', `R4 : garde au plus 4 passages notés ≥ 5, triés par note (${g.chapitres})`);
g = garder(JSON.stringify({ scores: [{ id: 1, score: 9 }, { id: 8, score: 2 }] }), { ...routage, chapitre: 8 });
ok(g.chapitres[0] === 8 && g.chapitres.includes(1), `R4 : le chapitre demandé (8) est gardé et placé en tête, même mal noté (${g.chapitres})`);
g = garder('pas du JSON');
ok(JSON.stringify(g.chapitres) === '[1,2,3,4]', `R4 : notation illisible → les 4 premiers de la recherche hybride (${g.chapitres})`);
g = garder(JSON.stringify({ scores: [{ id: 1, score: 1 }, { id: 2, score: 0 }] }));
ok(g.chapitres.length === 0 && /aucun passage pertinent/.test(g.corps_generation.contents[0].parts[0].text), 'R5 : aucun passage pertinent → la génération le sait (et doit dire qu\'elle ne trouve pas)');
ok(/Réponds en anglais/.test(garder('{}', { ...routage, langue: 'en' }).corps_generation.systemInstruction.parts[0].text), 'R5 : la génération répond dans la langue de la question');
const vide = run('6. Generation : réponse', [{ candidates: [] }], { '3. Routing : lire la décision': [{ ...routage, langue: 'en' }], '5. Reranking : garder les meilleurs': [{ chapitres: [] }] })[0];
ok(/couldn't generate/.test(vide.reponse), 'réponse Gemini vide → message d\'excuse au lieu d\'une bulle vide');

// ---------- Conversations complètes ----------
console.log('\n## Conversations complètes (SQL réel + nodes Code + Gemini simulé)');
const db = await PGlite.create({ extensions: { vector } });
for (const f of ['setup_hybride.sql', 'setup_answering.sql']) { const sql = readFileSync(join(P, 'supabase', f), 'utf8'); await db.exec(sql); await db.exec(sql); }
ok(true, 'setup_hybride.sql puis setup_answering.sql exécutés 2 fois sans erreur');
ok((await db.query("select relrowsecurity r from pg_class where relname = 'epictete_conversations'")).rows[0].r, 'RLS activée sur epictete_conversations');
// Livre indexé comme le fait l'ingestion
const extrait = JSON.parse(readFileSync(join(P, 'tests/fixtures/extrait_pdf_repo.json'), 'utf8'));
const chunks = run('Mots-clés', run('Augmentation', run('Chunking', run('Nettoyage', extrait))));
const lignes = run('Préparer les lignes', [{ embeddings: chunks.map(c => ({ values: vec(`${c.chapitre}-${c.partie}`) })) }], { 'Préparer les embeddings': run('Préparer les embeddings', chunks) });
await db.query('select epictete_reindexer($1::jsonb)', [lignes[0].payload]);

// Exécute une requête Postgres du workflow comme n8n (valeurs du queryReplacement, alwaysOutputData)
const sqlNode = async (nom, valeurs) => {
  const rows = (await db.query(n(nom).parameters.query.replace(/;\s*$/, ''), valeurs)).rows;
  return rows.length ? rows : (n(nom).alwaysOutputData ? [{}] : []);
};
async function conversation(sessionId, question, { routing, vecteur, reranking, generation }) {
  const input = [{ sessionId, action: 'sendMessage', chatInput: question }];
  const histo = await sqlNode('2. Context : historique (SQL)', [sessionId]);
  const contexte = run('2. Context : construire', histo, { '1. Input (chat)': input });
  const decision = run('3. Routing : lire la décision', gemini(routing), { '2. Context : construire': contexte });
  let final, trace = { contexte: contexte[0], decision: decision[0] };
  // Branche choisie d'après la configuration RÉELLE du node IF (et non en dur dans le test)
  const cond = n('3. Routing : chercher dans le livre ?').parameters.conditions.conditions[0];
  const gauche = cond.leftValue === '={{ $json.route }}' ? decision[0].route : undefined;
  if (cond.operator.operation === 'equals' && gauche === cond.rightValue) {
    const candidats = await sqlNode('4. Search : recherche hybride (SQL)', [decision[0].requete, `[${vec(vecteur).join(',')}]`]);
    const prep = run('5. Reranking : préparer', candidats, { '3. Routing : lire la décision': decision });
    const choix = run('5. Reranking : garder les meilleurs', gemini(reranking(prep[0].candidats)), { '3. Routing : lire la décision': decision, '5. Reranking : préparer': prep });
    final = run('6. Generation : réponse', gemini(generation), { '3. Routing : lire la décision': decision, '5. Reranking : garder les meilleurs': choix });
    trace = { ...trace, candidats, choix: choix[0] };
  } else {
    final = run('Réponse directe (sans recherche)', decision);
  }
  const j = final[0];
  const sortie = await sqlNode("7. Sauvegarder l'échange (SQL)", [j.sessionId, j.question, j.reponse, j.route, j.requete, `{${j.chapitres.join(',')}}`]);
  return { ...trace, final: j, sortie };
}
// Le reranker simulé note 9 le chapitre visé, 2 les autres
const noter = chapitre => cs => JSON.stringify({ scores: cs.map((c, i) => ({ id: i + 1, score: c.chapitre === chapitre ? 9 : 2 })) });

const t1 = await conversation('A', 'Qu\'est-ce qui dépend de nous ?', {
  routing: '{"route":"livre","requete":"things in our control","chapitre":null,"langue":"fr","reponse_directe":""}',
  vecteur: '1-1', reranking: noter(1), generation: 'Selon Épictète, nos opinions et nos désirs dépendent de nous (Chapitre 1).',
});
ok(t1.contexte.historique === '(début de la conversation)', 'R1 : nouvelle session → pas d\'historique');
ok(t1.contexte.corps_routing.contents[0].parts[0].text.endsWith("Dernière question : Qu'est-ce qui dépend de nous ?"), 'R2 : le routing reçoit bien la question posée');
ok(t1.candidats?.length === 10 && t1.candidats[0].chapitre === 1, `R3 : 10 candidats, le chapitre 1 en tête (${t1.candidats?.map(c => c.chapitre).join(',') ?? 'AUCUNE RECHERCHE'})`);
ok(JSON.stringify(t1.choix?.chapitres) === '[1]', 'R4 : le reranking ne garde que le passage pertinent (chapitre 1)');
ok(t1.sortie.length === 1 && t1.sortie[0].output === t1.final.reponse, 'R7 : le chat reçoit { output } = la réponse générée');

const t2 = await conversation('A', 'Et le chapitre suivant ?', {
  routing: '{"route":"livre","requete":"Enchiridion – Chapter 2","chapitre":2,"langue":"fr","reponse_directe":""}',
  vecteur: '30-1', reranking: () => JSON.stringify({ scores: [{ id: 1, score: 3 }] }), generation: 'Le chapitre 2 parle du désir et de l\'aversion (Chapitre 2).',
});
ok(/Utilisateur : Qu'est-ce qui dépend de nous \?/.test(t2.contexte.corps_routing.contents[0].parts[0].text), 'R1/R2 : le routing reçoit l\'échange précédent pour résoudre « le chapitre suivant »');
ok(t2.candidats?.[0]?.chapitre === 2 && t2.choix?.chapitres[0] === 2, 'R2-R4 : « Chapter 2 » → chapitre 2 en tête de la recherche et gardé malgré une note de 3');

const t3 = await conversation('A', 'Merci beaucoup !', { routing: '{"route":"conversation","requete":"","chapitre":null,"langue":"fr","reponse_directe":"Avec plaisir !"}' });
ok(!t3.candidats && t3.sortie[0].output === 'Avec plaisir !', 'R6 : « merci » → réponse directe, aucune recherche');
const t4 = await conversation('B', 'Quelle est la capitale du Japon ?', { routing: '{"route":"hors_sujet","requete":"","chapitre":null,"langue":"fr","reponse_directe":""}' });
ok(!t4.candidats && /ne réponds qu'aux questions sur le Manuel/.test(t4.sortie[0].output), 'R6 : hors sujet → refus poli par défaut, aucune recherche');

const enregistre = (await db.query("select route, requete, chapitres from epictete_conversations where session_id = 'A' order by id")).rows;
ok(enregistre.length === 3 && enregistre[0].chapitres.join() === '1' && enregistre[1].requete === 'Enchiridion – Chapter 2' && enregistre[2].route === 'conversation',
  'R7 : chaque échange est enregistré avec sa route, sa requête et ses chapitres');
for (let i = 1; i <= 5; i++) await db.query("select * from epictete_sauvegarder_echange('C', $1, $2, 'livre', 'x', '{}'::int[])", [`q${i}`, `r${i}`]);
const h = await sqlNode('2. Context : historique (SQL)', ['C']);
ok(h.map(x => x.question).join() === 'q3,q4,q5', `R1 : seuls les 3 derniers échanges, dans l'ordre (${h.map(x => x.question)})`);
const virgules = await sqlNode("7. Sauvegarder l'échange (SQL)", ['D', "l'âme, le corps ; « $1 »", 'réponse, avec virgules', 'livre', 'q', '{}']);
ok(virgules[0].output === 'réponse, avec virgules', 'virgules, apostrophes et « $1 » dans le texte enregistrés intacts');

console.log(`\n${echecs ? `❌ ${echecs} échec(s)` : '✅ Tous les tests answering passent'}`);
process.exit(echecs ? 1 : 0);
