-- ============================================================================
-- Chatbot RAG Épictète : création de la base vectorielle dans Supabase
-- À coller UNE fois dans Supabase → SQL Editor → Run. Le script est relançable sans risque.
--
-- Contrat imposé par le node n8n "Supabase Vector Store" (LangChain SupabaseVectorStore) :
--   - insertion dans la table `documents`, colonnes content / embedding / metadata (id auto)
--   - recherche via la fonction `match_documents(query_embedding, match_count, filter)`
--     qui renvoie id, content, metadata, similarity
--
-- 3072 = taille des vecteurs de models/gemini-embedding-002 (12288 valeurs pour 4 vecteurs
-- dans n8n). Si l'insertion échoue avec "expected 3072 dimensions, not N", remplacer
-- 3072 par N aux DEUX endroits ci-dessous (table + fonction), puis relancer le script
-- après avoir supprimé l'ancienne table : drop table if exists documents;
-- ============================================================================

-- 1. Extension pgvector (type "vector" et distance cosinus <=>)
create extension if not exists vector;

-- 2. Table des chunks
create table if not exists documents (
  id bigserial primary key,
  content text,                 -- texte du chunk (avec l'en-tête "Enchiridion – Chapter N")
  metadata jsonb,               -- chapitre, partie, livre, traduction, source, nb_mots
  embedding vector(3072)        -- vecteur Gemini
);
-- Pas d'index vectoriel : pgvector n'indexe pas au-delà de 2000 dimensions, et avec
-- 56 chunks la recherche exacte est instantanée.

-- 3. Fonction de recherche appelée par n8n (similarité cosinus, la plus proche d'abord)
create or replace function match_documents (
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
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where metadata @> filter
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
