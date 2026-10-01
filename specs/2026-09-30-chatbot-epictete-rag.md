# Chatbot RAG sur le Manuel d'Épictète (n8n)

## Objectif
Un chatbot n8n qui répond aux questions sur *The Enchiridion* d'Épictète (traduction E. Carter, 52 chapitres) **uniquement à partir du livre**, en citant les chapitres. Le livre est chargé en PDF via un formulaire, qui déclenche toute la chaîne d'ingestion RAG : extraction → nettoyage → chunking → augmentation → vectorisation.

## Architecture (un seul workflow, importable en JSON)

```
INGESTION
On form submission (PDF) → Extract from File (PDF → texte) → Nettoyage (Code) → Chunking (Code)
  → Augmentation (Code) → Simple Vector Store [insert] ← Embeddings Google Gemini
                                                       ← Default Data Loader

CHAT
When chat message received → AI Agent ← Google Gemini Chat Model
                                     ← Simple Memory (historique de la conversation)
                                     ← Simple Vector Store [outil de recherche] ← Embeddings Google Gemini
```

Les deux parties utilisent la **même clé de mémoire** du Simple Vector Store (`enchiridion`).

## Choix validés
| Sujet | Choix |
|---|---|
| Chunking | Par chapitre. Un chapitre de plus de ~350 mots est redécoupé par groupes de **phrases** (voir « Écarts ») |
| Augmentation | Métadonnées (`chapitre`, `partie`, `livre`, `traduction`, `source`, `nb_mots`) + en-tête « Enchiridion – Chapter N » dans le texte vectorisé |
| Langue | Le bot répond dans la langue de la question et cite les passages en anglais d'origine |
| Chat | AI Agent + mémoire de conversation + recherche dans le livre |
| Vector store | Simple Vector Store de n8n (en mémoire) |
| Modèles | Google Gemini (embeddings + chat), ceux des nodes déjà présents |

## Choix par défaut (non discutés, à contester si besoin)
- Formulaire : un seul champ fichier, obligatoire, `.pdf` uniquement.
- Chaque nouvel envoi **vide la base avant d'indexer**, pour ne pas créer de doublons.
- Recherche : les 4 passages les plus proches (top K = 4).
- Question hors sujet : le bot répond qu'il ne trouve pas l'information dans le Manuel, sans inventer.

## Affirmations (doivent toutes être vraies à la fin)
- **A1** : le JSON s'importe dans n8n sans erreur, et tous les nodes sont reliés (plus aucun node isolé comme sur la capture). — Vérif : `jq` (JSON valide, chaque connexion pointe vers un node existant) + import manuel dans n8n.
- **A2** : le nettoyage supprime tout ce qui n'est pas le livre (menu du site, « Commentary », « Download », « THE END », ©, numéros de page), recolle les mots coupés en fin de ligne et normalise les espaces. — Vérif : exécution hors n8n des nodes Code sur le texte d'un PDF de test ; aucune de ces chaînes ne reste.
- **A3** : le chunking produit exactement 52 chapitres, numérotés 1 à 52 dans l'ordre, sans chunk vide ; aucun chunk ne dépasse ~350 mots, sauf une phrase unique plus longue. — Vérif : script sur le PDF de test, comparé à `projets/02_chatbot_epictete/data/enchiridion.json`.
- **A4** : chaque chunk porte les métadonnées `chapitre`, `partie`, `livre`, `traduction`, `source`, `nb_mots`, et son texte commence par l'en-tête du chapitre. — Vérif : sortie du node Augmentation.
- **A5** : si le PDF n'est pas le Manuel (moins de 52 chapitres détectés, ou aucun), l'ingestion s'arrête avec un message d'erreur clair (visible dans *Executions* ; le formulaire, lui, affiche seulement « Problem submitting response ») et **rien n'est indexé**. — Vérif : exécution avec un texte sans chapitres → erreur levée avant le vector store.
- **A6** : un deuxième envoi du PDF ne double pas les chunks. — Vérif : option « Clear Store » activée dans le node d'insertion ; test manuel dans n8n (2 envois, puis une question : pas de passages en double).
- **A7** : à la question « What is in our control? » ou « Qu'est-ce qui dépend de nous ? », le bot répond à partir du chapitre 1 et le cite. — Vérif : test manuel dans le chat n8n.
- **A8** : une question hors livre (« Quelle est la capitale du Japon ? ») donne une réponse du type « je ne trouve pas cela dans le Manuel », sans réponse inventée. — Vérif : test manuel.
- **A9** : le bot répond en français à une question en français, et en anglais à une question en anglais. — Vérif : test manuel.
- **A10** : il garde le fil de la conversation : après A7, « Et le chapitre suivant ? » parle du chapitre 2. — Vérif : test manuel.
- **A11** : aucune clé API dans le JSON, seulement des références aux credentials n8n. — Vérif : `grep` sur le JSON exporté.

## Cas limites
- PDF vide ou scanné (pas de texte extractible) → erreur « aucun texte extrait », rien d'indexé.
- Mauvais livre ou autre traduction (53 chapitres) → erreur « N chapitres trouvés au lieu de 52 », rien d'indexé.
- Question posée avant tout envoi de PDF (base vide) → le bot dit qu'il n'a pas trouvé l'information.
- Redémarrage de n8n → base vidée (limite connue du Simple Vector Store) ; il faut renvoyer le PDF.
- Numéros de page ou lignes coupées dans le PDF → gérés par le nettoyage (A2).
- Échec de Gemini pendant un ré-envoi (quota, clé) → la base a déjà été vidée : l'ancien livre est perdu, il faut renvoyer le PDF (limite du Simple Vector Store v1.1, qui vide avant d'insérer).
- n8n en mode queue (plusieurs workers) → store en mémoire par processus : le chat peut ne rien trouver.

## Hors périmètre
- Base vectorielle persistante (Pinecone, Qdrant, Supabase…).
- Plusieurs livres ou plusieurs utilisateurs avec des bases séparées.
- OCR de PDF scannés.
- Résumés ou mots-clés générés par IA pendant l'ingestion.
- Interface de chat autre que le chat intégré de n8n.

## Écarts découverts pendant le développement
- **Paragraphes → phrases** : l'extraction PDF de n8n (pdf.js + `parseText`) ne garde pas les paragraphes, seulement un retour à la ligne par ligne visuelle. Les chapitres longs sont donc recoupés entre deux phrases, en parties équilibrées (24 et 29 en 2 parties, 33 en 3 parties : 56 chunks au total).

- **Modèle de chat** : `gemini-2.5-flash` renvoie 404 pour les nouveaux utilisateurs (constaté dans n8n) → config validée dans n8n : `models/gemini-flash-lite-latest` (chat) et `models/gemini-embedding-002` (embeddings, identique dans les 2 nodes, livre réindexé après le changement).

## Revue hostile (sous-agent)
6 problèmes trouvés : 3 corrigés dans le code et testés (le filtre des en-têtes supprimait du texte en mise en page étroite ; les traits d'union étaient perdus ; « 12. » seul sur sa ligne faisait échouer l'ingestion avec un message trompeur), 3 documentés (procédure « Test step » qui n'indexe rien, erreur générique dans le formulaire, base vidée avant les embeddings).

## Évolution : Supabase (2026-10-01)

Choix validés : **nouveau workflow** `workflow_chatbot_epictete_supabase.json` (la version Simple Vector Store reste intacte), **table vidée avant chaque indexation** (Supabase n'a pas de « Clear Store »), table créée **une fois via le SQL Editor** (`supabase/setup.sql`).

- **S1** : seuls les 2 vector stores changent ; tous les autres nodes sont identiques à la version validée. — Vérif : `test_supabase.mjs` compare les deux JSON.
- **S2** : la table n'est vidée (`TRUNCATE … RESTART IDENTITY`, une seule fois grâce à executeOnce) qu'après validation des 52 chapitres ; une réindexation donne 56 lignes, pas 112 (une indexation à la fois : deux envois simultanés peuvent créer des doublons, documenté). — Vérif : ordre des connexions + exécution réelle du TRUNCATE puis réinsertion sur Postgres/pgvector.
- **S3** : `setup.sql` crée exactement ce qu'attend LangChain SupabaseVectorStore (vérifié dans @langchain/community 1.1.27, utilisé par n8n 2.41.3) : table `epictete_documents(id, content, metadata, embedding)` et fonction `match_epictete_documents(query_embedding, match_count, filter)` (noms dédiés pour ne jamais vider la table `documents` d'un autre projet ; RLS activée) qui renvoie `id, content, metadata, similarity`. — Vérif : script exécuté sur PostgreSQL 18 + pgvector 0.8.1 (PGlite), insertion de 56 chunks et recherche.
- **S4** : vecteurs de **3072** dimensions (gemini-embedding-002 : 12288 valeurs pour 4 vecteurs dans n8n) ; une mauvaise taille donne une erreur explicite « expected 3072 dimensions, not N ». — Vérif : test + confirmation à la première indexation dans n8n.
- **S5** : après indexation, la table contient 56 lignes visibles dans Supabase (Table Editor), et le chat répond comme avant. — Vérif : test manuel dans n8n.

- **Validation** (2026-10-01) : version Supabase testée dans n8n + Supabase, tout fonctionne (S4 et S5 confirmées).
- **Revue hostile Supabase** : aucun bloquant. Corrigé : noms dédiés (une table `documents` préexistante aurait été vidée), RLS, dépannage du README. Documenté : une indexation à la fois, table vide si Gemini échoue après le vidage, credential Postgres via le Session pooler.

## Questions ouvertes
- (aucune)

## Préparer le PDF
Ouvrir http://classics.mit.edu/Epictetus/epicench.html → Ctrl+P → « Enregistrer au format PDF ».
