# 📖 Chatbot RAG - Manuel d'Épictète (n8n)

Chatbot n8n qui répond aux questions sur **le Manuel d'Épictète** (*The Enchiridion*, trad. Elizabeth Carter, 52 chapitres), **uniquement à partir du livre**, en citant les chapitres. Il répond dans la langue de la question et refuse ce qui n'est pas dans le livre.

✅ **Validé dans n8n** : ingestion des 56 chunks et réponses du chat.

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
| Embeddings Google Gemini (ingestion) | `models/gemini-embedding-002` |
| Embeddings Google Gemini (chat) | `models/gemini-embedding-002` |

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
| `supabase/setup.sql` | Script SQL à exécuter une fois dans Supabase |
| `src/1_nettoyage.js`, `2_chunking.js`, `3_augmentation.js` | Code des 3 nodes Code |
| `scripts/build-workflow.mjs` | Régénère les 2 JSON à partir de `src/` |
| `scripts/decouper.mjs` | Régénère le texte de référence `data/enchiridion.json` / `.csv` |
| `tests/test.mjs` | Tests automatiques (structure, nettoyage, chunking, augmentation, cas d'erreur) |
| `tests/test_supabase.mjs` | Tests de la version Supabase (structure + SQL exécuté sur Postgres/pgvector) |
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

Fichier : [`workflow_chatbot_epictete_supabase.json`](workflow_chatbot_epictete_supabase.json). C'est le même workflow, seuls les 2 vector stores passent sur **Supabase**. Le livre survit aux redémarrages de n8n et les chunks sont visibles dans Supabase.

```
… Augmentation → Vider la table documents (Postgres, TRUNCATE, 1 seule fois) → Reprendre les chunks → Vectorisation (Supabase)
Chat → Agent ← … ← Recherche dans le livre (Supabase) ← Embeddings Gemini
```

### Mise en place (une seule fois)
1. **Supabase → SQL Editor → New query** : coller [`supabase/setup.sql`](supabase/setup.sql) → **Run**. Ça crée l'extension `vector`, la table `documents` et la fonction `match_documents`.
2. **n8n → Import from File** → `workflow_chatbot_epictete_supabase.json`.
3. Sélectionner les credentials :
   - **Google Gemini** dans les 3 nodes Google ;
   - **Postgres** (ta connexion Supabase) dans **Vider la table documents** ;
   - **Supabase API** dans **Vectorisation (Supabase)** et **Recherche dans le livre**.
4. Vérifier les modèles : `models/gemini-flash-lite-latest` et `models/gemini-embedding-002` (×2). Enregistrer.

### Utilisation
Exactement comme la version Simple Vector Store : bouton orange **« Execute workflow »** du Formulaire → envoyer le PDF → **Open chat**. Dans Supabase, **Table Editor → documents** doit montrer **56 lignes**. Une réindexation remplace ces lignes sans créer de doublons.

### Si ça coince
| Erreur | Cause | Solution |
|---|---|---|
| `expected 3072 dimensions, not N` | Le modèle d'embeddings ne produit pas 3072 valeurs | Dans `setup.sql`, remplacer `3072` par `N` (table + fonction), exécuter `drop table if exists documents;` puis relancer le script |
| `relation "public.documents" does not exist` | `setup.sql` n'a pas été exécuté | Étape 1 |
| `Could not find the function public.match_documents` | Fonction absente ou paramètres différents | Relancer `setup.sql` |
| Le chat ne trouve rien | Table vide, ou modèle d'embeddings différent entre ingestion et chat | Réindexer ; même modèle dans les 2 nodes |

### Vérifié hors n8n
- `setup.sql` a été exécuté sur PostgreSQL 18 + pgvector 0.8.1 (PGlite) : insertion des 56 chunks exactement comme LangChain (le code utilisé par n8n), recherche, filtre, réindexation sans doublons, erreur explicite en cas de mauvaise taille.
- Le JSON a été vérifié : ordre des nodes, TRUNCATE exécuté une seule fois, même table des deux côtés, autres nodes identiques à la version validée.

Pour lancer ces tests : `npm test` (voir « Développer »).

## Source

*The Enchiridion*, Epictetus, trad. Elizabeth Carter (1758), domaine public. Texte : The Internet Classics Archive (MIT), http://classics.mit.edu/Epictetus/epicench.html
