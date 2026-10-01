-- ============================================================================
-- Chatbot RAG Épictète : RECHERCHE HYBRIDE (vecteurs + mots-clés) dans Supabase
-- À coller UNE fois dans Supabase → SQL Editor → Run. Le script est relançable sans risque.
-- Utilisé par workflow_chatbot_epictete_hybride.json (les autres versions ne sont pas touchées).
--
-- 3072 = taille des vecteurs de models/gemini-embedding-002 (confirmée dans Supabase).
-- ============================================================================

create extension if not exists vector;

-- 1. Table des chunks ----------------------------------------------------------
create table if not exists epictete_chunks (
  id         bigserial primary key,
  chapitre   int    not null,
  partie     int    not null,
  content    text   not null,                 -- "Enchiridion – Chapter N" + texte du chunk
  mots_cles  text[] not null default '{}',    -- 8 mots-clés extraits par le node "Mots-clés"
  metadata   jsonb  not null default '{}',    -- livre, traduction, source, nb_mots…
  embedding  vector(3072) not null,           -- vecteur Gemini (sens du texte)
  -- Index plein texte : mots-clés (poids A, plus important) + texte (poids B).
  -- Config 'english' car le livre est en anglais (racines : "Socrates" → "socrat").
  -- Calculé par epictete_reindexer (une colonne "generated" refuse array_to_string).
  fts        tsvector not null
);
create index if not exists epictete_chunks_fts_idx on epictete_chunks using gin (fts);

-- Inaccessible avec la clé publique "anon" ; n8n passe par l'utilisateur postgres.
alter table epictete_chunks enable row level security;

-- 2. Réindexation ATOMIQUE -----------------------------------------------------
-- Reçoit tous les chunks en JSON, vide la table et réinsère dans UNE transaction :
-- si l'insertion échoue (mauvaise dimension, JSON invalide…), les anciennes lignes restent.
create or replace function epictete_reindexer(chunks jsonb)
returns int
language plpgsql
as $$
declare
  nb int;
begin
  delete from epictete_chunks;
  insert into epictete_chunks (chapitre, partie, content, mots_cles, metadata, embedding, fts)
  select x.chapitre, x.partie, x.content, x.mots_cles, x.metadata, x.embedding,
         setweight(to_tsvector('english', array_to_string(x.mots_cles, ' ')), 'A') ||
         setweight(to_tsvector('english', x.content), 'B')
  from (
    select (c->>'chapitre')::int as chapitre,
           (c->>'partie')::int as partie,
           c->>'content' as content,
           array(select jsonb_array_elements_text(c->'mots_cles')) as mots_cles,
           coalesce(c->'metadata', '{}'::jsonb) as metadata,
           (c->>'embedding')::vector as embedding
    from jsonb_array_elements(chunks) as c
  ) as x;
  get diagnostics nb = row_count;
  return nb;
end;
$$;

-- 3. Recherche HYBRIDE ---------------------------------------------------------
-- Deux classements, fusionnés par Reciprocal Rank Fusion (RRF) :
--   score = 1/(k + rang_semantique) + 1/(k + rang_mots_cles)
-- Un chunk bien classé dans les deux remonte ; un chunk trouvé par une seule méthode
-- reste candidat. Les mots de la question sont combinés en OU (pas besoin de tous les avoir).
create or replace function epictete_recherche_hybride(
  question text,
  question_embedding vector(3072),
  nb int default 4,
  k_rrf int default 60
) returns table (
  id bigint,
  chapitre int,
  partie int,
  content text,
  mots_cles text[],
  score float,
  rang_semantique int,
  rang_mots_cles int
)
language sql
stable
as $$
  with requete as (
    select nullif(replace(plainto_tsquery('english', question)::text, '&', '|'), '')::tsquery as q
  ),
  semantique as (
    select c.id, row_number() over (order by c.embedding <=> question_embedding) as rang
    from epictete_chunks c
    order by c.embedding <=> question_embedding
    limit nb * 5
  ),
  mots as (
    select c.id, row_number() over (order by ts_rank_cd(c.fts, r.q) desc, c.id) as rang
    from epictete_chunks c, requete r
    where r.q is not null and c.fts @@ r.q
    order by ts_rank_cd(c.fts, r.q) desc, c.id
    limit nb * 5
  )
  select c.id, c.chapitre, c.partie, c.content, c.mots_cles,
         coalesce(1.0 / (k_rrf + s.rang), 0) + coalesce(1.0 / (k_rrf + m.rang), 0) as score,
         s.rang::int as rang_semantique,
         m.rang::int as rang_mots_cles
  from semantique s
  full outer join mots m on m.id = s.id
  join epictete_chunks c on c.id = coalesce(s.id, m.id)
  order by score desc, c.id
  limit nb;
$$;
