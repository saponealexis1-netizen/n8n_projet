-- ============================================================================
-- Chatbot RAG Épictète : pipeline d'ANSWERING (Input → Context → Routing → Search → Reranking → Generation)
-- À coller UNE fois dans Supabase → SQL Editor → Run, APRÈS setup_hybride.sql (même table epictete_chunks).
-- Relançable sans risque. Utilisé par workflow_chatbot_epictete_answering.json.
-- ============================================================================

-- 1. CONTEXT : historique des conversations ---------------------------------
create table if not exists epictete_conversations (
  id          bigserial primary key,
  session_id  text not null,                     -- identifiant de la conversation (donné par le chat n8n)
  question    text not null,
  reponse     text not null,
  route       text,                              -- décision du routing : livre / conversation / hors_sujet
  requete     text,                              -- requête de recherche réécrite par le routing
  chapitres   int[] not null default '{}',       -- chapitres utilisés pour répondre
  created_at  timestamptz not null default now()
);
create index if not exists epictete_conversations_session_idx on epictete_conversations (session_id, id desc);
-- La table garde tout l'historique. Pour purger : delete from epictete_conversations where created_at < now() - interval '30 days';
alter table epictete_conversations enable row level security;   -- inaccessible avec la clé anon

-- Les N derniers échanges d'une session, du plus ancien au plus récent (avec les chapitres utilisés,
-- pour résoudre « le chapitre suivant »). Drop : Postgres refuse de changer le type de retour avec "replace".
drop function if exists epictete_historique(text, int);
create or replace function epictete_historique(p_session text, p_nb int default 3)
returns table (question text, reponse text, chapitres int[])
language sql
stable
as $$
  select question, reponse, chapitres
  from (
    select question, reponse, chapitres, id
    from epictete_conversations
    where session_id = p_session
    order by id desc
    limit p_nb
  ) as derniers
  order by id;
$$;

-- Enregistre l'échange et renvoie la réponse dans un champ "output" :
-- c'est ce champ que le chat n8n affiche (mode "lastNode").
create or replace function epictete_sauvegarder_echange(
  p_session text, p_question text, p_reponse text, p_route text, p_requete text, p_chapitres int[]
)
returns table (output text)
language sql
as $$
  insert into epictete_conversations (session_id, question, reponse, route, requete, chapitres)
  values (p_session, p_question, p_reponse, p_route, p_requete, coalesce(p_chapitres, '{}'))
  returning reponse;
$$;
