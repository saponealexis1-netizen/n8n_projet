# 📖 Chatbot RAG - Manuel d'Épictète (n8n)

Chatbot n8n qui répond aux questions sur **le Manuel d'Épictète** (*The Enchiridion*, trad. Elizabeth Carter, 52 chapitres), **uniquement à partir du livre**, en citant les chapitres. Il répond dans la langue de la question et refuse ce qui n'est pas dans le livre.

✅ **Validé dans n8n**, dans les 3 versions : ingestion des 56 chunks et réponses du chat.

| Version | Base vectorielle | Persistance | Fichier |
|---|---|---|---|
| Simple Vector Store | En mémoire dans n8n | Perdue au redémarrage de n8n | `workflow_chatbot_epictete.json` |
| **Supabase** | Table Postgres + pgvector | Permanente, visible dans Supabase | `workflow_chatbot_epictete_supabase.json` |
| **Hybride** | Supabase + recherche **vecteurs + mots-clés** | Permanente | `workflow_chatbot_epictete_hybride.json` |

- Spec : [`specs/2026-09-30-chatbot-epictete-rag.md`](../../specs/2026-09-30-chatbot-epictete-rag.md)
- Workflow à importer : [`workflow_chatbot_epictete.json`](workflow_chatbot_epictete.json)
- Livre à envoyer dans le formulaire : [`data/enchiridion.pdf`](data/enchiridion.pdf)

## Le workflow

Un seul workflow en deux parties. Elles doivent rester ensemble, car le Simple Vector Store range ses données sous une clé préfixée par l'ID du workflow.

```
INGESTION
Formulaire (PDF) → Extraire le texte du PDF → Nettoyage → Chunking → Augmentation → Vectorisation (Simple Vector Store)
                                                                                    ↑ Embeddings Gemini  ↑ Chargeur de documents ← Pas de re-découpage
CHAT
Chat → Agent Épictète ← Google Gemini Chat Model
                      ← Mémoire de la conversation
                      ← Recherche dans le livre (Simple Vector Store) ← Embeddings Gemini
```

| Étape RAG | Node | Ce qu'il fait |
|---|---|---|
| Extraction | Extraire le texte du PDF | PDF → texte brut |
| Nettoyage | Nettoyage (Code) | Retire le menu du site, les en-têtes/pieds de page du navigateur (lignes répétées au bord des pages), les URL, les numéros de page, « THE END », © ; recolle les lignes coupées ; 1 ligne par chapitre |
| Chunking | Chunking (Code) | 1 chunk par chapitre ; les chapitres de plus de ~350 mots sont recoupés entre deux phrases (24 et 29 en 2 parties, 33 en 3) → **56 chunks**. Vérifie qu'il y a exactement 52 chapitres, sinon arrête tout en indiquant le chapitre manquant |
| Augmentation | Augmentation (Code) | Ajoute l'en-tête « Enchiridion – Chapter N » au texte + métadonnées `chapitre`, `partie`, `livre`, `traduction`, `source`, `nb_mots` |
| Vectorisation | Simple Vector Store (insert) | Embeddings Gemini, clé `enchiridion`, base vidée avant chaque nouvel envoi (pas de doublons) |
| Recherche | Recherche dans le livre | Les 4 passages les plus proches, utilisés par l'agent comme outil |
| Réponse | Agent Épictète | Gemini + mémoire des 10 derniers échanges ; consignes : chercher d'abord, citer les chapitres, ne rien inventer |

## Modèles (config validée dans n8n)

| Node | Modèle |
|---|---|
| Google Gemini Chat Model | `models/gemini-flash-lite-latest` |
| Embeddings Google Gemini (ingestion) | `models/gemini-embedding-2` |
| Embeddings Google Gemini (chat) | `models/gemini-embedding-2` |

- `gemini-2.5-flash`, prévu au départ, renvoie **404 aux nouveaux utilisateurs** : Google l'a fermé.
- ⚠️ **Les 2 nodes d'embeddings doivent utiliser le même modèle.** Les vecteurs de deux modèles différents ne sont pas comparables : le chat ne trouverait plus rien.
- ⚠️ **Après tout changement de modèle d'embeddings, il faut réindexer le PDF.**

## Installation dans n8n

1. **Workflows → Import from File** → `workflow_chatbot_epictete.json`
2. Créer une clé API gratuite sur https://aistudio.google.com/apikey (ne jamais la mettre sur GitHub).
3. Ouvrir **Embeddings Google Gemini (ingestion)** → *Credential* → *Create new credential* → coller la clé → *Save*.
4. Sélectionner ce même credential dans **Embeddings Google Gemini (chat)** et **Google Gemini Chat Model**.
5. Enregistrer le workflow (Ctrl+S).

## Utilisation

### 1. Indexer le livre
Cliquer sur le **bouton orange « Execute workflow » collé à gauche du node Formulaire**.

⚠️ N'utilise pas « Test step » dans le node Formulaire : il n'exécute que le formulaire, **rien n'est indexé**, et le message de succès s'affiche quand même.

Envoyer `data/enchiridion.pdf` dans le formulaire qui s'ouvre, puis attendre que toute la ligne du haut soit verte. Chunking, Augmentation et Vectorisation doivent afficher **56 items**.

### 2. Poser des questions
Cliquer sur **Open chat**, puis par exemple :
- « Qu'est-ce qui dépend de nous ? » → répond à partir du chapitre 1 ;
- « What does Epictetus say about death? » → répond en anglais ;
- « Quelle est la capitale du Japon ? » → « je ne trouve pas cette information dans le Manuel ».

## Limites connues

| Limite | Conséquence | Que faire |
|---|---|---|
| Le Simple Vector Store est en mémoire | Après un redémarrage de n8n, la base est vide | Réindexer le PDF, ou utiliser la version Supabase |
| La base est vidée **avant** le calcul des embeddings | Si Gemini échoue pendant une réindexation (quota 429, clé invalide), l'ancien livre est perdu | Réindexer une fois l'erreur passée |
| Le formulaire n'affiche pas le détail des erreurs | Avec un mauvais PDF, il affiche « Problem submitting response » | Le message exact (« 30 chapitres trouvés au lieu de 52… ») est dans **Executions** |
| n8n en mode queue (plusieurs workers) | Chaque worker a sa propre mémoire : le chat peut ne rien trouver | Utiliser un vector store persistant (Supabase) |
| Recherche par numéro (« le chapitre suivant ») | La recherche est sémantique, elle peut ramener un autre chapitre | Poser une question sur le contenu plutôt que sur le numéro |

## Comment il a été construit (skills du repo)

1. **`/interview-spec`** : choix validés (chunking par chapitre, augmentation par métadonnées, langue de la question, agent avec mémoire) et spec avec **11 affirmations vérifiables**.
2. **`/doubt-driven-dev`** : chaque hypothèse a été vérifiée dans le **code source de n8n 2.41.3** (types et versions des nodes, paramètres, extraction PDF). Trois pièges évités :
   - en v1 du Simple Vector Store, « Clear Store » vide la base **avant chaque chunk** : le workflow utilise la v1.1 ;
   - le découpage « simple » du chargeur de documents recoupe tout à 1 000 caractères : remplacé par un splitter qui ne recoupe pas ;
   - l'extraction PDF de n8n **perd les paragraphes** : les chapitres longs sont coupés entre deux phrases.

   Les tests repèrent bien les erreurs : 6 cassages volontaires du code ont tous été détectés.
3. **`/hostile-review`** (sous-agent indépendant) : 6 problèmes trouvés.
   - 3 corrigés et testés : le filtre des en-têtes supprimait du texte en mise en page étroite ; les traits d'union étaient perdus ; un « 12. » seul sur sa ligne faisait échouer l'ingestion avec un message trompeur.
   - 3 documentés ci-dessus : « Test step » n'indexe rien, erreur générique dans le formulaire, base vidée avant les embeddings.

## Fichiers

| Fichier | Rôle |
|---|---|
| `workflow_chatbot_epictete.json` | **Le workflow à importer** : version Simple Vector Store (généré, ne pas modifier à la main) |
| `workflow_chatbot_epictete_supabase.json` | **Version Supabase** (générée par le même script) |
| `supabase/setup.sql` | Script SQL à exécuter une fois dans Supabase (version Supabase) |
| `workflow_chatbot_epictete_hybride.json` | **Version hybride** (générée par le même script) |
| `supabase/setup_hybride.sql` | Script SQL de la version hybride (table `epictete_chunks`, réindexation, recherche hybride) |
| `src/4_mots_cles.js` … `7_formater_passages.js` | Code des nodes Code de la version hybride |
| `src/1_nettoyage.js`, `2_chunking.js`, `3_augmentation.js` | Code des 3 nodes Code |
| `scripts/build-workflow.mjs` | Régénère les 3 JSON à partir de `src/` |
| `scripts/decouper.mjs` | Régénère le texte de référence `data/enchiridion.json` / `.csv` |
| `tests/test.mjs` | Tests automatiques (structure, nettoyage, chunking, augmentation, cas d'erreur) |
| `tests/test_supabase.mjs` | Tests de la version Supabase (structure + SQL exécuté sur Postgres/pgvector) |
| `tests/test_hybride.mjs` | Tests de la version hybride (structure, nodes Code, SQL hybride) |
| `tests/extraire_comme_n8n.mjs` | Extrait un PDF exactement comme n8n (pdf.js 5.4.296 + même `parseText`) |
| `tests/fixtures/` | Textes extraits de PDF de test : livre, version navigateur avec menus/en-têtes, mise en page étroite, autre livre, vide, tronqué, chapitre manquant… |
| `data/enchiridion.pdf` | Le livre à envoyer dans le formulaire |
| `data/enchiridion_source.txt`, `.json`, `.csv` | Texte de référence, 1 passage par chapitre |

## Développer

Depuis la racine du repo :

```bash
npm install                        # une fois
npm run build:chatbot              # après toute modif dans src/
npm test                           # doit finir par ✅ Tous les tests passent
```

## Version Supabase (base persistante)

✅ **Validé dans n8n et Supabase.**

Fichier : [`workflow_chatbot_epictete_supabase.json`](workflow_chatbot_epictete_supabase.json). C'est le même workflow, seuls les 2 vector stores passent sur **Supabase**. Le livre survit aux redémarrages de n8n et les chunks sont visibles dans Supabase.

```
… Augmentation → Vider la table epictete_documents (Postgres, TRUNCATE, 1 seule fois) → Reprendre les chunks → Vectorisation (Supabase)
Chat → Agent ← … ← Recherche dans le livre (Supabase) ← Embeddings Gemini
```

La table et la fonction ont des **noms dédiés** (`epictete_documents`, `match_epictete_documents`). Le workflow **vide cette table à chaque indexation**, et ces noms garantissent qu'il ne touchera jamais une table `documents` créée par un autre tutoriel dans le même projet Supabase.

### La table `epictete_documents`

C'est la **mémoire du chatbot** : les 56 chunks du livre, chacun avec son vecteur. C'est là que le chat cherche les passages pertinents avant de répondre.

| Colonne | Type | Contenu | Rempli par |
|---|---|---|---|
| `id` | `bigserial` | Numéro de ligne, de 1 à 56 (automatique) | Postgres |
| `content` | `text` | Texte du chunk, précédé de « Enchiridion – Chapter N » | Node Augmentation |
| `metadata` | `jsonb` | `chapitre`, `partie`, `livre`, `traduction`, `source`, `nb_mots` | Chargeur de documents |
| `embedding` | `vector(3072)` | Le **sens** du texte, en 3072 nombres | Embeddings Gemini |

- **Indexation** : la table est vidée, puis Gemini calcule un vecteur par chunk et n8n insère les 56 lignes.
- **Question** : Gemini transforme la question en vecteur, puis la fonction `match_epictete_documents` renvoie les 4 chunks les plus proches en sens, avec un score de similarité. L'agent répond à partir de ces chunks en citant les chapitres.

Pour voir le contenu dans le SQL Editor :
```sql
select id, metadata->>'chapitre' as chapitre, metadata->>'partie' as partie, left(content, 80) as debut
from epictete_documents order by id;
```

### Mise en place (une seule fois)
1. **Supabase → SQL Editor → New query** : coller [`supabase/setup.sql`](supabase/setup.sql) → **Run**. Ça crée l'extension `vector`, la table `epictete_documents` (avec RLS activé) et la fonction `match_epictete_documents`.
2. **n8n → Import from File** → `workflow_chatbot_epictete_supabase.json`.
3. Créer et sélectionner les credentials :
   - **Google Gemini** dans les 3 nodes Google ;
   - **Supabase API** dans **Vectorisation (Supabase)** et **Recherche dans le livre**. Host = URL du projet (`https://<ref>.supabase.co`), clé = **service_role / secret**, jamais la clé anon ;
   - **Postgres** dans **Vider la table epictete_documents**. Dans Supabase → **Connect** → **Session pooler**, recopier : host `aws-….pooler.supabase.com`, port `5432`, database `postgres`, user `postgres.<ref>`, le mot de passe de la base, SSL activé. La connexion directe `db.<ref>.supabase.co` ne marche qu'en IPv6 : à éviter.
4. Vérifier les modèles : `models/gemini-flash-lite-latest` et `models/gemini-embedding-2` (×2). Enregistrer.

### Utilisation
Exactement comme la version Simple Vector Store : bouton orange **« Execute workflow »** du Formulaire → envoyer le PDF → **Open chat**. Dans Supabase, **Table Editor → epictete_documents** doit montrer **56 lignes**. Une réindexation les remplace sans doublons.

⚠️ **Une indexation à la fois** : deux envois du formulaire en même temps (double clic) peuvent créer des doublons. Dans ce cas, réindexer une fois.

⚠️ **Si l'indexation échoue après le vidage** (quota Gemini 429, clé invalide), la table reste vide et le chat répond « je ne trouve pas ». Il suffit de relancer l'indexation.

### Si ça coince
| Erreur | Cause | Solution |
|---|---|---|
| `expected X dimensions, not Y` | La table a été créée pour des vecteurs de X valeurs, le modèle en produit Y | Dans `setup.sql`, remplacer `3072` par **Y** (table + fonction), exécuter `drop table if exists epictete_documents; drop function if exists match_epictete_documents;` puis relancer le script, puis réindexer |
| `relation "public.epictete_documents" does not exist` | `setup.sql` n'a pas été exécuté | Étape 1 |
| `Could not find the function public.match_epictete_documents` | Fonction absente | Relancer `setup.sql` |
| `cannot change return type of existing function` | Une ancienne version de la fonction existe avec d'autres colonnes | `drop function if exists match_epictete_documents;` puis relancer `setup.sql` |
| Le node Postgres n'arrive pas à se connecter | Connexion directe IPv6 ou mauvais user | Utiliser le **Session pooler** (étape 3) |
| `new row violates row-level security policy` | Credential Supabase avec la clé anon | Utiliser la clé **service_role** |
| Le chat ne trouve rien | Table vide, ou modèle d'embeddings différent entre ingestion et chat | Réindexer ; même modèle dans les 2 nodes |

Pour vérifier la taille des vecteurs dans Supabase : `select vector_dims(embedding) from epictete_documents limit 1;` → `3072`.

### Vérifié hors n8n
- `setup.sql` a été exécuté sur PostgreSQL 18 + pgvector 0.8.1 (PGlite), et peut être relancé sans erreur.
- Insertion des 56 chunks exactement comme LangChain (le code utilisé par n8n), puis recherche, filtre et réindexation sans doublons.
- Erreur explicite en cas de mauvaise taille de vecteur. RLS est activé.
- Une table `documents` d'un autre projet n'est jamais touchée.
- JSON : ordre des nodes, TRUNCATE exécuté une seule fois, même table des deux côtés, autres nodes identiques à la version validée.
- Revue hostile (sous-agent) : aucun bloquant. Les 6 problèmes trouvés sont corrigés ou documentés ci-dessus.

Pour lancer ces tests : `npm test` (voir « Développer »).

## Version hybride (vecteurs + mots-clés)

✅ **Validé dans n8n et Supabase** : 56 lignes dans `epictete_chunks` (mots-clés, vecteurs, index plein texte), et « que dit le chapitre 8 ? » répond avec le chapitre 8.

Fichier : [`workflow_chatbot_epictete_hybride.json`](workflow_chatbot_epictete_hybride.json) · SQL : [`supabase/setup_hybride.sql`](supabase/setup_hybride.sql). Construite sur le modèle du flow présenté par le prof.

```
INGESTION      Formulaire → Extraire → Nettoyage → Chunking → Augmentation → Mots-clés → Limit (100) → Vectoriser (sous-workflow)
SOUS-WORKFLOW  Déclencheur → Rechercher ? ─ non → Préparer les embeddings → Embedding des chunks (HTTP Gemini) → Préparer les lignes → Enregistrer (SQL)
                                          └ oui → Embedding de la question (HTTP Gemini) → Recherche hybride (SQL) → Formater les passages
CHAT           Chat → Agent Épictète ← Gemini Chat Model + Mémoire + outil « Recherche hybride dans le livre » (appelle le sous-workflow)
```

### Ce qui change par rapport à la version Supabase
| | Version Supabase | Version hybride |
|---|---|---|
| Recherche | Sens seulement (vecteurs) | **Sens + mots-clés**, fusionnés |
| Embeddings | Nodes LangChain | **HTTP Request** direct vers l'API Gemini (comme le prof) |
| Écriture en base | Node Supabase Vector Store | **SQL** (fonction `epictete_reindexer`) |
| Colonne mots-clés | — | **`mots_cles`** : 8 mots par chunk |
| Réindexation | Vider puis insérer (table vide si Gemini échoue) | **Atomique** : une seule transaction, l'ancien contenu reste en cas d'erreur |

### La recherche hybride, simplement
- **Recherche sémantique** (vecteurs) : trouve les passages **de même sens**, même avec d'autres mots, dans une autre langue.
- **Recherche par mots-clés** (plein texte Postgres) : trouve les **mots exacts**, comme « Chrysippus », « Olympic » ou « Diogenes ». Elle porte sur la colonne `mots_cles` (poids fort) et sur le texte (poids normal).
- **Fusion (RRF, Reciprocal Rank Fusion)** : chaque passage reçoit `1/(60 + rang sémantique) + 1/(60 + rang mots-clés)`. Un passage bien classé par les deux méthodes passe devant ; un passage trouvé par une seule méthode reste candidat. On garde les 4 meilleurs.

Exemple (testé) : « Chrysippus » + le sens du chapitre 1 → le chapitre 49 remonte grâce au mot exact, et le chapitre 1 grâce au sens.

- **Question sur un chapitre précis** (« Chapter 8 », « chapitre 8 ») : les parties de ce chapitre passent **en tête**, dans l'ordre du texte. L'en-tête « Enchiridion – Chapter N » n'est volontairement **pas** dans l'index plein texte : sinon le mot « chapter » correspondrait aux 56 chunks et fausserait le classement.
- **Deux indexations en même temps** (double clic) : la seconde attend la fin de la première (verrou SQL), donc pas de doublons.

### Le Limit (100)
- C'est la **borne haute du prof** (10 à 100 chunks), et aussi le **maximum de textes par appel** `batchEmbedContents` de Gemini. Nos 56 chunks passent donc tous, en **un seul appel**.
- C'est un **garde-fou** : un PDF qui produirait des centaines de chunks ne ferait pas exploser le quota.
- Pour tester sans consommer de quota, le mettre à **3**. ⚠️ La table ne contiendra alors que 3 chunks : remettre **100** et réindexer avant d'utiliser le chat.
- Au-delà de 100 chunks, le Limit couperait sans prévenir. Pour ce livre, c'est impossible : le Chunking exige exactement 52 chapitres, ce qui donne 56 chunks.

### La table `epictete_chunks`
| Colonne | Contenu |
|---|---|
| `id` | Numéro de ligne (automatique) |
| `chapitre`, `partie` | Position dans le livre |
| `content` | « Enchiridion – Chapter N » + texte du chunk |
| **`mots_cles`** | Les 8 mots les plus importants du chunk (ex. ch49 : `chrysippus, understand, interpret, …`) |
| `metadata` | Livre, traduction, source, nombre de mots |
| `embedding` | Vecteur Gemini (3072 nombres) |
| `fts` | Index plein texte (mots-clés + texte), calculé à l'insertion |

### Mise en place
1. **Supabase → SQL Editor** : coller [`supabase/setup_hybride.sql`](supabase/setup_hybride.sql) → **Run**. Ça crée la table `epictete_chunks` et les fonctions `epictete_reindexer` et `epictete_recherche_hybride`. Les tables des autres versions ne sont pas touchées.
2. **n8n → Import from File** → `workflow_chatbot_epictete_hybride.json`.
3. Credentials :
   - **Google Gemini** dans **Google Gemini Chat Model**, **Embedding de la question (Gemini)** et **Embedding des chunks (Gemini)**. Dans les 2 HTTP Request, l'authentification « Google Gemini(PaLM) Api » est déjà choisie : il suffit de sélectionner ton credential ;
   - **Postgres** (Session pooler) dans **Recherche hybride (SQL)** et **Enregistrer dans Supabase (SQL)**.
4. ⚠️ **Enregistrer (Ctrl+S) puis PUBLIER le workflow** (bouton **Publish** en haut à droite). L'outil de l'agent appelle toujours la version **publiée** du workflow, même en test depuis l'éditeur. Sans publication, le chat répond « je ne trouve pas » : dans *Executions*, l'outil affiche `Workflow is not active and cannot be executed`.
5. Bouton orange **« Execute workflow »** du Formulaire → envoyer le PDF. Supabase → `epictete_chunks` doit montrer **56 lignes**, avec la colonne `mots_cles` remplie.
6. **Open chat** : la réponse de l'outil montre, pour chaque passage, son rang sémantique et son rang mots-clés.

⚠️ **Après chaque modification du workflow : enregistrer ET republier.** L'ingestion utilise la version en cours d'édition, mais l'outil du chat garde l'ancienne version publiée tant qu'on n'a pas republié.

### Si ça coince
| Erreur | Solution |
|---|---|
| Le chat répond « je ne trouve pas » et l'outil affiche `Workflow is not active and cannot be executed` | **Publier** le workflow (étape 4) |
| Le chat utilise une ancienne version après une modification | **Republier** le workflow |
| `404` sur l'embedding | Le nom du modèle (`models/gemini-embedding-2`) diffère de celui de ton compte : le changer dans « Préparer les embeddings » **et** dans l'URL + le body de « Embedding de la question », puis réindexer |
| `expected 3072 dimensions, not N` | Dans `setup_hybride.sql`, remplacer 3072 par N (table + fonction), `drop table epictete_chunks;`, relancer le script |
| `function epictete_recherche_hybride does not exist` | Étape 1 |

### Vérifié hors n8n (`tests/test_hybride.mjs`)
- **Structure** : ordre des nodes, Limit à 100, un seul déclencheur, aiguillage indexer / rechercher, même modèle d'embeddings des deux côtés, aucune clé dans le JSON.
- **Nodes Code sur le vrai PDF** : 56 chunks, 8 mots-clés sans mots vides, 1 seul appel Gemini, erreur claire si Gemini renvoie moins de vecteurs.
- **SQL exécuté sur Postgres 18 + pgvector** : réindexation atomique (une erreur laisse les 56 anciennes lignes) ; mot exact rare retrouvé ; question sans mot du livre servie par le sens ; fusion RRF ; mots combinés en OU ; « Socrate » trouve « Socrates » ; « Chapter N » / « chapitre N » met le chapitre en tête (12 cas).
- **Revue hostile dans un vrai n8n 2.41.3** (sous-agent : Postgres + pgvector, faux Gemini) : l'auto-appel, l'aiguillage, le HTTP avec le credential Gemini, les paramètres SQL de 1,7 Mo et le retour vers l'agent fonctionnent. Ses 3 problèmes sont corrigés ou documentés ci-dessus (publication obligatoire, recherche par chapitre, Limit à 3).
- **Mutations** : 8 erreurs introduites exprès, toutes détectées.

## Source

*The Enchiridion*, Epictetus, trad. Elizabeth Carter (1758), domaine public. Texte : The Internet Classics Archive (MIT), http://classics.mit.edu/Epictetus/epicench.html
