// Tests de la variante Supabase (spec : specs/2026-09-30-chatbot-epictete-rag.md, section Supabase)
// Usage : node projets/02_chatbot_epictete/tests/test_supabase.mjs   (après npm install à la racine)
//
// 1. Structure du workflow Supabase (connexions, ordre, executeOnce, même table partout)
// 2. Exécution RÉELLE de supabase/setup.sql sur Postgres + pgvector (PGlite), puis insertion et
//    recherche exactement comme le fait LangChain SupabaseVectorStore (utilisé par le node n8n) :
//    upsert {content, embedding, metadata} dans `documents`, puis rpc match_documents(query_embedding, match_count, filter)
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';

const racine = new URL('../../../', import.meta.url).pathname;
const P = join(racine, 'projets/02_chatbot_epictete');
const WF = process.env.WF ?? join(P, 'workflow_chatbot_epictete_supabase.json');
const wf = JSON.parse(readFileSync(WF, 'utf8'));
const memoire = JSON.parse(readFileSync(join(P, 'workflow_chatbot_epictete.json'), 'utf8'));
const SQL = readFileSync(join(P, 'supabase/setup.sql'), 'utf8');
const DIM = 3072;

let echecs = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✅' : '❌'} ${msg}`); if (!cond) echecs++; };
const n = nom => wf.nodes.find(x => x.name === nom);
const suivant = nom => wf.connections[nom]?.main?.[0]?.map(c => c.node) ?? [];

// ---------- Structure ----------
console.log('\n## Structure du workflow Supabase');
const noms = new Set(wf.nodes.map(x => x.name));
const cibles = Object.values(wf.connections).flatMap(c => Object.values(c).flat(2)).map(x => x.node);
ok(Object.keys(wf.connections).every(x => noms.has(x)) && cibles.every(x => noms.has(x)), 'toutes les connexions pointent vers des nodes existants');
ok([...noms].every(x => wf.connections[x] || cibles.includes(x)), 'aucun node isolé');
ok(!wf.nodes.some(x => x.type.endsWith('vectorStoreInMemory')), 'plus aucun Simple Vector Store');
ok(JSON.stringify(suivant('Augmentation')) === '["Vider la table documents"]'
  && JSON.stringify(suivant('Vider la table documents')) === '["Reprendre les chunks"]'
  && JSON.stringify(suivant('Reprendre les chunks')) === '["Vectorisation (Supabase)"]',
  'ordre : Augmentation → Vider la table → Reprendre les chunks → Vectorisation (le vidage n\'a lieu que si les 52 chapitres sont validés)');
ok(n('Vider la table documents').executeOnce === true, 'le TRUNCATE ne s\'exécute qu\'une fois (executeOnce), pas 56');
const tables = wf.nodes.filter(x => x.type.endsWith('vectorStoreSupabase')).map(x => x.parameters.tableName?.value);
ok(tables.length === 2 && tables.every(t => t === 'documents'), `les 2 nodes Supabase utilisent la table "documents" (${JSON.stringify(tables)})`);
ok(wf.nodes.filter(x => x.type.endsWith('vectorStoreSupabase')).every(x => x.parameters.options?.queryName === 'match_documents'), 'les 2 nodes Supabase appellent match_documents');
ok(n('Recherche dans le livre').parameters.mode === 'retrieve-as-tool' && n('Recherche dans le livre').parameters.toolName === 'manuel_epictete', 'la recherche reste un outil de l\'agent (manuel_epictete)');
// Tout le reste est identique à la version validée
const pareil = memoire.nodes.filter(x => !/Simple Vector Store|Recherche dans le livre/.test(x.name))
  .every(m => { const s = n(m.name); return s && s.type === m.type && JSON.stringify(s.parameters) === JSON.stringify(m.parameters); });
ok(pareil, 'les autres nodes (formulaire, nettoyage, chunking, augmentation, embeddings, agent…) sont identiques à la version validée');
ok(!/AIza[0-9A-Za-z_-]{20,}|"credentials"|service_role|eyJhbGci/i.test(readFileSync(WF, 'utf8')), 'aucune clé ni credential dans le JSON');

// "Reprendre les chunks" renvoie bien les 56 chunks d'Augmentation
const tmp = mkdtempSync(join(tmpdir(), 'supa-'));
const run = (wfPath, nom, entree, ref) => {
  const f = join(tmp, `${Math.random()}.json`); writeFileSync(f, JSON.stringify(entree));
  const args = [join(racine, 'tools/run-code-node.mjs'), wfPath, nom, f];
  if (ref) { const r = join(tmp, `${Math.random()}.json`); writeFileSync(r, JSON.stringify(ref.data)); args.push('--ref', `${ref.nom}=${r}`); }
  return JSON.parse(execFileSync('node', args, { encoding: 'utf8' }));
};
const extrait = JSON.parse(readFileSync(join(P, 'tests/fixtures/extrait_pdf_repo.json'), 'utf8'));
const chunks = run(WF, 'Augmentation', run(WF, 'Chunking', run(WF, 'Nettoyage', extrait)));
const repris = run(WF, 'Reprendre les chunks', [{ success: true }], { nom: 'Augmentation', data: chunks });
ok(repris.length === 56 && JSON.stringify(repris) === JSON.stringify(chunks), `"Reprendre les chunks" transmet les ${repris.length} chunks intacts après le TRUNCATE (1 item)`);

// ---------- SQL réel (Postgres + pgvector) ----------
console.log('\n## supabase/setup.sql exécuté sur Postgres + pgvector');
const db = await PGlite.create({ extensions: { vector } });
const pgv = (await db.query('select version()')).rows[0].version.split(' ').slice(0, 2).join(' ');
await db.exec(SQL);
await db.exec(SQL);
ok(true, `script exécuté 2 fois sans erreur (relançable) sur ${pgv}, pgvector ${(await db.query("select extversion from pg_extension where extname='vector'")).rows[0].extversion}`);

// Vecteurs factices mais déterministes (on teste la base, pas la qualité de Gemini)
const vec = graine => {
  const v = []; let h = createHash('sha256').update(String(graine)).digest();
  for (let i = 0; i < DIM; i++) { if (i % 32 === 0 && i) h = createHash('sha256').update(h).digest(); v.push(h[i % 32] / 255 - 0.5); }
  return `[${v.join(',')}]`;
};
// Métadonnées comme le Default Data Loader : valeurs en texte
const lignes = chunks.map(c => ({
  content: c.texte,
  embedding: vec(`${c.chapitre}-${c.partie}`),
  metadata: Object.fromEntries(['chapitre', 'partie', 'livre', 'traduction', 'source', 'nb_mots'].map(k => [k, String(c[k])])),
}));
const inserer = async () => { for (const l of lignes) await db.query('insert into documents (content, embedding, metadata) values ($1, $2, $3)', [l.content, l.embedding, l.metadata]); };
await inserer();
ok((await db.query('select count(*)::int c from documents')).rows[0].c === 56, 'insertion des 56 chunks avec les colonnes de LangChain (content, embedding, metadata, id auto)');

// Appel comme PostgREST : paramètres nommés
const chercher = (graine, k, filtre = {}) => db.query('select * from match_documents(query_embedding => $1, match_count => $2, filter => $3)', [vec(graine), k, filtre]);
const r = await chercher('5-1', 4);
ok(r.rows.length === 4, `match_documents renvoie match_count = 4 résultats`);
ok(r.rows[0].metadata.chapitre === '5' && Math.abs(r.rows[0].similarity - 1) < 1e-6, `le plus proche est le bon chunk (chapitre ${r.rows[0].metadata.chapitre}, similarité ${r.rows[0].similarity.toFixed(4)})`);
ok(r.rows.every((x, i) => i === 0 || x.similarity <= r.rows[i - 1].similarity), 'résultats triés par similarité décroissante');
ok(['id', 'content', 'metadata', 'similarity'].every(c => c in r.rows[0]) && r.rows[0].content.startsWith('Enchiridion – Chapter 5'), 'colonnes renvoyées : id, content, metadata, similarity (ce que lit LangChain)');
const f = await chercher('5-1', 4, { chapitre: '33' });
ok(f.rows.length === 3 && f.rows.every(x => x.metadata.chapitre === '33'), `filtre par métadonnées : chapitre 33 → ${f.rows.length} parties`);

// Le TRUNCATE du workflow
const truncate = n('Vider la table documents').parameters.query;
await db.exec(truncate);
await inserer();
const apres = (await db.query('select count(*)::int c, min(id)::int m from documents')).rows[0];
ok(apres.c === 56 && apres.m === 1, `réindexation : "${truncate}" puis insertion → ${apres.c} chunks (pas de doublons), ids repartis à ${apres.m}`);

// Mauvaise dimension : erreur claire (celle que verrait l'utilisateur dans n8n)
let erreur = '';
try { await db.query('insert into documents (content, embedding, metadata) values ($1, $2, $3)', ['x', `[${Array(768).fill(0.1).join(',')}]`, {}]); } catch (e) { erreur = e.message; }
ok(/expected 3072 dimensions, not 768/.test(erreur), `vecteur de mauvaise taille → erreur explicite : « ${erreur} »`);

console.log(`\n${echecs ? `❌ ${echecs} échec(s)` : '✅ Tous les tests Supabase passent'}`);
process.exit(echecs ? 1 : 0);
