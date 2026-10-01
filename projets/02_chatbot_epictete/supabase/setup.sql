-- ============================================================================
-- Chatbot RAG Épictète : création de la base vectorielle dans Supabase
-- À coller UNE fois dans Supabase → SQL Editor → Run. Le script est relançable sans risque.
--
-- Contrat imposé par le node n8n "Supabase Vector Store" (LangChain SupabaseVectorStore) :
--   - insertion dans la table, colonnes content / embedding / metadata (id auto)
--   - recherche via une fonction (query_embedding, match_count, filter)
--     qui renvoie id, content, metadata, similarity
--
-- Noms DÉDIÉS à ce projet (epictete_documents / match_epictete_documents) : le workflow vide
-- cette table à chaque indexation, il ne doit jamais toucher une table "documents" créée
-- par un autre tutoriel ou projet dans le même Supabase.
--
-- 3072 = taille des vecteurs de models/gemini-embedding-002 (12288 valeurs pour 4 vecteurs
-- dans n8n). Si l'insertion échoue avec "expected 3072 dimensions, not N", remplacer
-- 3072 par N aux DEUX endroits ci-dessous (table + fonction), exécuter
--   drop table if exists epictete_documents; drop function if exists match_epictete_documents;
-- puis relancer ce script.
-- ============================================================================

-- 1. Extension pgvector (type "vector" et distance cosinus <=>)
create extension if not exists vector;

-- 2. Table des chunks
create table if not exists epictete_documents (
  id bigserial primary key,
  content text,                 -- texte du chunk (avec l'en-tête "Enchiridion – Chapter N")
  metadata jsonb,               -- chapitre, partie, livre, traduction, source, nb_mots
  embedding vector(3072)        -- vecteur Gemini
);
-- Sécurité : RLS activée sans aucune règle → la table est inaccessible avec la clé "anon"
-- (API publique). n8n utilise la clé service_role et l'utilisateur postgres, qui ne sont
-- pas concernés par RLS.
alter table epictete_documents enable row level security;

-- Pas d'index vectoriel : pgvector n'indexe pas au-delà de 2000 dimensions, et avec
-- 56 chunks la recherche exacte est instantanée.

-- 3. Fonction de recherche appelée par n8n (similarité cosinus, la plus proche d'abord)
create or replace function match_epictete_documents (
  query_embedding vector(3072),
  match_count int default null,
  filter jsonb default '{}'
) returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
#variable_conflict use_column
begin
  return query
  select
    id,
    content,
    metadata,
    1 - (epictete_documents.embedding <=> query_embedding) as similarity
  from epictete_documents
  where metadata @> filter
  order by epictete_documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
