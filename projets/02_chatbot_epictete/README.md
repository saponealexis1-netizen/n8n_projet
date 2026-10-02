# 📖 Chatbot RAG - Manuel d'Épictète (n8n)

Chatbot n8n qui répond aux questions sur **le Manuel d'Épictète** (*The Enchiridion*, trad. Elizabeth Carter, 1758, 52 chapitres) **uniquement à partir du livre**, en **citant les chapitres**, dans la langue de la question. Il comprend les questions de suite (« et le chapitre suivant ? ») et refuse poliment ce qui n'est pas dans le livre.

✅ **Validé dans n8n + Supabase** (version finale : nodes Google Gemini natifs, toutes les étapes vertes).

| | |
|---|---|
| **Workflow à importer** | [`workflow_chatbot_epictete_answering.json`](workflow_chatbot_epictete_answering.json) |
| **SQL à exécuter dans Supabase** | [`supabase/setup_hybride.sql`](supabase/setup_hybride.sql) puis [`supabase/setup_answering.sql`](supabase/setup_answering.sql) |
| **Livre à envoyer dans le formulaire** | [`data/enchiridion.pdf`](data/enchiridion.pdf) |
| **Explication détaillée, node par node, avec exemples** | [`FICHE_RECAP.md`](../../FICHE_RECAP.md) |
| **Spec** (objectifs + affirmations vérifiables) | [`specs/2026-09-30-chatbot-epictete-rag.md`](../../specs/2026-09-30-chatbot-epictete-rag.md) |
| **Versions précédentes** (Simple Vector Store, Supabase, hybride) | [`docs/versions_precedentes.md`](docs/versions_precedentes.md) |

---

## 1. Vue d'ensemble

Un seul workflow, en **3 parties** :

```
① INGESTION      Formulaire (PDF) → Extraire → Nettoyage → Chunking → Augmentation → Mots-clés → Limit (100) → Vectoriser (sous-workflow)
② SOUS-WORKFLOW  Sous-workflow : indexer → Préparer les embeddings → Embedding des chunks (HTTP Gemini) → Préparer les lignes → Enregistrer dans Supabase (SQL)
③ CHAT           1. Input
                  → 2. Context    : historique (SQL) → construire
                  → 3. Routing    : Gemini → lire la décision → chercher dans le livre ?
                        ├─ oui → 4. Search     : embedding de la requête (HTTP Gemini) → recherche hybride (SQL, 10 candidats)
                        │        5. Reranking  : préparer → Gemini (note 0-10) → garder les meilleurs (≤ 4)
                        │        6. Generation : Gemini → réponse
                        └─ non → Réponse directe (sans recherche)
                  → 7. Sauvegarder l'échange (SQL) → la réponse s'affiche dans le chat
```

**Les outils**
| Outil | Rôle |
|---|---|
| **n8n** | Orchestration : 28 nodes, tous les détails dans la [fiche récap](../../FICHE_RECAP.md#partie-1--le-flow-node-par-node) |
| **Gemini** `gemini-embedding-2` | Transforme un texte en **vecteur** (3072 nombres = son sens), via HTTP Request |
| **Gemini** `gemini-flash-lite-latest` | Routing, reranking et génération, via le **node Google Gemini natif** |
| **Supabase** (Postgres + pgvector) | Stocke les chunks et l'historique ; fait la **recherche hybride** en SQL |

**Les tables Supabase**
| Table | Contenu | Remplie par |
|---|---|---|
| `epictete_chunks` | 56 chunks : `chapitre`, `partie`, `content`, `mots_cles`, `metadata`, `embedding` (vecteur), `fts` (index de mots) | L'ingestion |
| `epictete_conversations` | Historique : `session_id`, `question`, `reponse`, `route`, `requete`, `chapitres` | Le chat |

---

## 2. Comment ça marche

### L'ingestion : transformer le PDF en base de connaissances (une fois)
| Étape | Ce qui se passe | Exemple |
|---|---|---|
| **Extraction** | PDF → texte brut | Texte avec en-têtes de navigateur, URL, lignes coupées |
| **Cleaning** | On retire tout ce qui n'est pas le livre, on recolle les lignes | 1 ligne propre par chapitre |
| **Chunking** | 1 chunk par chapitre, les chapitres longs sont coupés entre deux phrases. Contrôle : exactement 52 chapitres | **56 chunks** (le chapitre 33 en donne 3) |
| **Augmentation** | En-tête « Enchiridion – Chapter N », métadonnées, **8 mots-clés** | Chapitre 49 → `chrysippus, understand, interpret…` |
| **Vectorisation** | Gemini calcule un vecteur par chunk ; tout est enregistré **en une transaction** | 56 lignes dans `epictete_chunks` |

### L'answering : répondre à une question
| Étape | Ce qui se passe | Exemple avec « Et le chapitre suivant ? » (après une question sur le chapitre 8) |
|---|---|---|
| **1. Input** | La question et l'identifiant de la conversation | `chatInput`, `sessionId` |
| **2. Context** | Les 3 derniers échanges de la conversation | `[chapitres utilisés : 8]` |
| **3. Routing** | Gemini décide : `livre` / `conversation` / `hors_sujet`, et réécrit la question en requête anglaise autonome | `route: livre`, `requete: "Enchiridion – Chapter 9"` |
| **4. Search** | Recherche **hybride** : sens (vecteurs) + mots exacts (plein texte), fusionnés (RRF) → 10 candidats | Les parties du chapitre 9 en tête |
| **5. Reranking** | Gemini note chaque candidat de 0 à 10 ; on garde au plus 4 passages notés ≥ 5 | Chapitre 9 gardé |
| **6. Generation** | Gemini répond **uniquement** avec ces passages, en citant les chapitres | « … (Chapitre 9) » |
| **7. Sauvegarde** | L'échange est enregistré : c'est le contexte de la question suivante | 1 ligne dans `epictete_conversations` |

« Merci » ou une question hors sujet → **réponse directe**, sans recherche : 1 seul appel Gemini au lieu de 4.

---

## 3. Installation (depuis zéro)

**Prérequis** : un compte n8n, un projet Supabase et une clé API Gemini gratuite ([aistudio.google.com/apikey](https://aistudio.google.com/apikey)). Ne mets jamais la clé sur GitHub.

1. **Supabase → SQL Editor** : exécuter [`supabase/setup_hybride.sql`](supabase/setup_hybride.sql), puis [`supabase/setup_answering.sql`](supabase/setup_answering.sql). Les deux scripts peuvent être relancés sans risque.
2. **n8n → Workflows → Import from File** → `workflow_chatbot_epictete_answering.json`.
3. **Credentials** :
   - **Google Gemini (PaLM) API** dans les 3 nodes **Google Gemini** (*3. Routing*, *5. Reranking*, *6. Generation*) et les 2 **HTTP Request** d'embedding (*Embedding des chunks*, *4. Search : embedding de la requête*) ;
   - **Postgres** dans les 4 nodes SQL. Dans Supabase → **Connect** → **Session pooler** : host `aws-….pooler.supabase.com`, port `5432`, base `postgres`, utilisateur `postgres.<ref>`, mot de passe de la base, SSL activé.
4. **Ctrl+S**. Inutile de publier.
5. **Indexer le livre** : cliquer sur le **bouton orange « Execute workflow » à gauche du Formulaire** (pas « Test step »), puis envoyer `data/enchiridion.pdf`. Supabase → `epictete_chunks` doit montrer **56 lignes**.
6. **Open chat** et poser une question.

## 4. Démo : 5 questions qui montrent chaque étape
| Question | Ce qu'elle montre |
|---|---|
| « Que dit le chapitre 8 ? » | Routing (chapitre détecté) + recherche par chapitre |
| « Et le chapitre suivant ? » | **Context** : le chapitre 9 est trouvé grâce à l'historique |
| « What does Epictetus say about Chrysippus? » | Recherche par **mots-clés** (chapitre 49) + réponse en anglais |
| « Comment rester calme quand on m'insulte ? » | Recherche **sémantique** : aucun mot en commun avec le livre |
| « Merci ! » puis « Quelle est la capitale du Japon ? » | **Réponse directe** et refus hors sujet, sans recherche |

Dans **Executions**, chaque étape montre ce qu'elle a décidé : la route, la requête réécrite, les 10 candidats, les notes du reranking, les passages gardés.

## 5. Si ça coince
| Situation | Cause / solution |
|---|---|
| Triangle rouge sur un node | Credential non sélectionné dans ce node |
| Le formulaire dit « succès » mais `epictete_chunks` est vide | « Test step » a été utilisé au lieu du bouton orange « Execute workflow » (étape 5) |
| Le formulaire affiche « Problem submitting response » | Mauvais PDF : le message exact (« 30 chapitres trouvés au lieu de 52… ») est dans **Executions** |
| `404` sur un appel Gemini | Nom de modèle indisponible pour ta clé : choisir un modèle dans la liste du node (texte) ou corriger `MODELE` dans « Préparer les embeddings » **et** l'URL de « 4. Search : embedding » (embeddings), puis réindexer |
| `expected 3072 dimensions, not N` | Le modèle d'embeddings produit N valeurs : remplacer 3072 par N dans `setup_hybride.sql`, `drop table epictete_chunks;`, relancer le script, réindexer |
| Quota Gemini (429) / Gemini surchargé (503) | Chaque appel du chat réessaie 3 fois à 5 s d'intervalle ; sinon attendre une minute |
| Le chat ne trouve rien | Table vide (réindexer) ou modèle d'embeddings différent entre ingestion et recherche |

## 6. Limites connues
- **Une seule langue de recherche** : le livre est en anglais. Le routing traduit la requête en anglais, et la réponse est rédigée dans la langue de la question.
- **Historique** : `epictete_conversations` garde tout. Pour purger : `delete from epictete_conversations where created_at < now() - interval '30 days';`.
- **Coût** : 4 appels Gemini par question sur le livre. Le reranking est appelé même si la recherche ne trouve rien (table vide).
- **Pourquoi autant de nodes** : chaque étape demandée a son node, et les petits nodes Code rendent chaque décision visible dans *Executions*. L'allègement utile : passer de 10 à 6 candidats dans « 4. Search : recherche hybride (SQL) ».
- **Pourquoi les embeddings restent en HTTP** : n8n n'a pas de node Gemini qui renvoie un vecteur. Le node natif ne fait pas d'embeddings, et le sous-node « Embeddings Google Gemini » ne se branche que sur un vector store.

---

## 7. Comment le projet a été construit

**4 versions**, chacune ajoutant une brique (détails : [`docs/versions_precedentes.md`](docs/versions_precedentes.md)) :

| # | Version | Ce qu'elle apporte | Statut |
|---|---|---|---|
| 1 | Simple Vector Store | Ingestion RAG complète + agent Gemini, base en mémoire | ✅ validée |
| 2 | Supabase | Base persistante (pgvector) | ✅ validée |
| 3 | Hybride | Flow du prof (Limit, sous-workflow, HTTP, SQL) + recherche vecteurs + mots-clés | ✅ validée |
| 4 | **Answering** | Pipeline explicite Context → Routing → Search → Reranking → Generation, nodes Gemini natifs | ✅ **validée, version finale** |

Chaque évolution a suivi les **3 skills du repo** ([`.claude/skills/`](../../.claude/skills/)) :
1. **`/interview-spec`** : questions à choix et spec avec des **affirmations vérifiables** (A1-A11, S1-S5, H1-H7, R1-R7).
2. **`/doubt-driven-dev`** :
   - chaque hypothèse est vérifiée dans le **code source de n8n 2.41.3** (la doc était inaccessible) ;
   - le SQL est **réellement exécuté** sur Postgres + pgvector ;
   - les **tests de mutation** prouvent que les tests savent échouer.
3. **`/hostile-review`** : un sous-agent indépendant attaque chaque version, à partir de la version hybride **dans un vrai n8n 2.41.3**. Aucun bloquant n'est resté non traité.

**Exemples de pièges évités grâce à cette méthode :**
- la v1 du Simple Vector Store vidait la base **avant chaque chunk** ;
- le découpage « simple » de n8n aurait recoupé les chapitres ;
- un premier SQL refusé par Postgres (colonne calculée « non immuable ») a été corrigé avant d'être livré ;
- une notation de reranking mal formée effaçait tous les passages ;
- le modèle `gemini-2.5-flash` était fermé aux nouveaux utilisateurs.

---

## 8. Fichiers

| Fichier | Rôle |
|---|---|
| **`workflow_chatbot_epictete_answering.json`** | **Le workflow final à importer** (généré : ne pas modifier à la main) |
| `workflow_chatbot_epictete.json`, `_supabase.json`, `_hybride.json` | Versions précédentes (voir `docs/`) |
| `supabase/setup_hybride.sql` | Table `epictete_chunks`, fonctions `epictete_reindexer` et `epictete_recherche_hybride` |
| `supabase/setup_answering.sql` | Table `epictete_conversations`, fonctions `epictete_historique` et `epictete_sauvegarder_echange` |
| `supabase/setup.sql` | SQL de la version 2 (Supabase) |
| `src/1_nettoyage.js` … `3_augmentation.js` | Nodes Code de l'ingestion (toutes versions) |
| `src/4_mots_cles.js` … `7_formater_passages.js` | Nodes Code des mots-clés, embeddings et lignes SQL (versions 3-4) |
| `src/8_contexte.js` … `13_reponse_directe.js` | Nodes Code du pipeline d'answering, **prompts inclus** |
| `scripts/build-workflow.mjs` | Génère les 4 JSON à partir de `src/` |
| `scripts/decouper.mjs` | Régénère le texte de référence `data/enchiridion.json` / `.csv` |
| `tests/test.mjs`, `test_supabase.mjs`, `test_hybride.mjs`, `test_answering.mjs` | Tests automatiques des 4 versions |
| `tests/extraire_comme_n8n.mjs` | Extrait un PDF exactement comme n8n (pdf.js 5.4.296 + même `parseText`) |
| `tests/fixtures/` | Textes extraits de PDF de test : livre, version navigateur, mise en page étroite, autre livre, vide, tronqué… |
| `data/enchiridion.pdf` | Le livre à envoyer dans le formulaire |
| `data/enchiridion_source.txt`, `.json`, `.csv` | Texte de référence, 1 passage par chapitre |
| `docs/versions_precedentes.md` | Documentation des versions 1 à 3 |

## 9. Développer

Depuis la racine du repo :
```bash
npm install                 # une fois
npm run build:chatbot       # régénère les 4 JSON après une modif dans src/
npm test                    # 4 suites de tests ; doit finir par « ✅ Tous les tests … passent »
```

Les tests vérifient :
- la structure des workflows ;
- les nodes Code, exécutés hors n8n sur le vrai PDF ;
- le SQL, exécuté sur Postgres 18 + pgvector (PGlite) ;
- des conversations complètes, avec un Gemini simulé.

## Source

*The Enchiridion*, Epictetus, trad. Elizabeth Carter (1758), domaine public. Texte : The Internet Classics Archive (MIT), http://classics.mit.edu/Epictetus/epicench.html
