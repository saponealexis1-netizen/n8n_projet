# 📘 Fiche récap : chatbot RAG sur le Manuel d'Épictète (n8n)

Fiche de révision du projet : **(1)** chaque node du flow, **(2)** les étapes de l'ingestion et de l'answering avec des exemples, **(3)** le CLI n8n et le MCP.

Le flow décrit ici est la version la plus complète : [`workflow_chatbot_epictete_answering.json`](projets/02_chatbot_epictete/workflow_chatbot_epictete_answering.json).

---

## Le projet en 30 secondes

- **Le livre** : *The Enchiridion* (le Manuel d'Épictète), traduction anglaise d'Elizabeth Carter (1758), domaine public, **52 chapitres**, environ 7 400 mots.
- **Le but** : un chatbot qui répond aux questions **uniquement à partir du livre**, en **citant les chapitres**, dans la langue de la question.
- **La technique** : du **RAG** (*Retrieval-Augmented Generation*). On **cherche** les bons passages du livre, puis on **demande à une IA de répondre avec ces passages**. L'IA ne répond pas « de tête ».
- **Les outils** :
  - **n8n**, l'automatisation ;
  - **Gemini**, l'IA de Google : `gemini-embedding-2` pour les vecteurs, `gemini-flash-lite-latest` pour le texte ;
  - **Supabase**, une base Postgres avec l'extension pgvector.

Le workflow a **3 parties** sur le même canvas :

```
① INGESTION      Formulaire (PDF) → … → découpe le livre en 56 chunks → les envoie au sous-workflow
② SOUS-WORKFLOW  calcule les vecteurs (Gemini) → enregistre tout dans Supabase
③ CHAT           Input → Context → Routing → Search → Reranking → Generation → Sauvegarde
```

---

# PARTIE 1 : le flow, node par node

### ① Ingestion (ligne du haut) : charger le livre

| # | Node | Type | Ce qu'il fait | Ce qui en sort |
|---|---|---|---|---|
| 1 | **Formulaire : envoyer le livre (PDF)** | Form Trigger | Affiche un formulaire web avec un champ fichier. C'est le point de départ de l'ingestion | Le PDF (binaire `Livre_PDF`) |
| 2 | **Extraire le texte du PDF** | Extract From File | Lit le PDF et en sort le texte brut | 1 item : `{ text, numpages }` |
| 3 | **Nettoyage** | Code | Retire tout ce qui n'est pas le livre : menu du site, en-têtes et pieds de page, URL, numéros de page, « THE END ». Recolle les lignes coupées : 1 ligne par chapitre | 1 item : `{ texte }` propre |
| 4 | **Chunking** | Code | Découpe en chunks : 1 par chapitre ; les chapitres de plus de ~350 mots sont coupés entre deux phrases. **Vérifie qu'il y a exactement 52 chapitres**, sinon tout s'arrête | **56 items** (1 par chunk) |
| 5 | **Augmentation** | Code | Ajoute à chaque chunk l'en-tête « Enchiridion – Chapter N » et des métadonnées (chapitre, partie, livre, traduction, source, nb_mots) | 56 items enrichis |
| 6 | **Mots-clés** | Code | Ajoute les **8 mots les plus importants** de chaque chunk (colonne `mots_cles`) | 56 items + `mots_cles` |
| 7 | **Limit** | Limit | Garde au plus **100** chunks : un garde-fou, et le maximum de textes par appel Gemini. Nos 56 passent tous | 56 items |
| 8 | **Vectoriser (sous-workflow)** | Execute Workflow | Envoie les 56 chunks au sous-workflow ②. Le workflow **s'appelle lui-même** | `{ nb_chunks_enregistres: 56 }` |

### ② Sous-workflow (ligne du bas) : vectoriser et enregistrer

| # | Node | Type | Ce qu'il fait |
|---|---|---|---|
| 9 | **Sous-workflow : indexer** | Execute Workflow Trigger | Reçoit les 56 chunks envoyés par le node 8 |
| 10 | **Préparer les embeddings** | Code | Regroupe les 56 textes en **une seule requête** pour Gemini (100 maximum par appel) |
| 11 | **Embedding des chunks (Gemini)** | HTTP Request | Appelle Gemini (`batchEmbedContents`), qui renvoie **56 vecteurs de 3072 nombres**. C'est un HTTP Request parce que n8n n'a pas de node Gemini qui renvoie un vecteur |
| 12 | **Préparer les lignes** | Code | Associe chaque vecteur à son chunk, vérifie qu'il y en a bien 56, et met tout dans un seul JSON |
| 13 | **Enregistrer dans Supabase (SQL)** | Postgres | Appelle la fonction SQL `epictete_reindexer`, qui **vide la table et réinsère les 56 lignes en une seule transaction** : si ça plante, l'ancien contenu reste |

### ③ Chat (ligne du milieu) : répondre aux questions

| # | Node | Étape | Type | Ce qu'il fait |
|---|---|---|---|---|
| 14 | **1. Input (chat)** | Input | Chat Trigger | Reçoit la question (`chatInput`) et l'identifiant de la conversation (`sessionId`) |
| 15 | **2. Context : historique (SQL)** | Context | Postgres | Lit les **3 derniers échanges** de cette conversation dans `epictete_conversations` |
| 16 | **2. Context : construire** | Context | Code | Met en forme l'historique et prépare le **prompt du routing** |
| 17 | **3. Routing (Gemini)** | Routing | **Google Gemini** | L'IA décide : question sur le **livre**, **conversation** ou **hors sujet**. Elle réécrit la question en **requête de recherche en anglais**. Elle répond en JSON |
| 18 | **3. Routing : lire la décision** | Routing | Code | Lit le JSON et le sécurise : si la réponse est illisible, on cherche quand même dans le livre |
| 19 | **3. Routing : chercher dans le livre ?** | Routing | IF | **oui** (livre) → recherche ; **non** → réponse directe |
| 20 | **4. Search : embedding de la requête (Gemini)** | Search | HTTP Request | Transforme la requête en vecteur (même modèle que les chunks) |
| 21 | **4. Search : recherche hybride (SQL)** | Search | Postgres | Fonction `epictete_recherche_hybride` : **sens + mots-clés** → **10 candidats** |
| 22 | **5. Reranking : préparer** | Reranking | Code | Numérote les 10 candidats et prépare le prompt de notation |
| 23 | **5. Reranking (Gemini)** | Reranking | **Google Gemini** | L'IA **note chaque candidat de 0 à 10** selon sa pertinence (JSON) |
| 24 | **5. Reranking : garder les meilleurs** | Reranking | Code | Garde **au plus 4 passages notés ≥ 5** (le chapitre demandé est toujours gardé) et prépare le prompt de la réponse |
| 25 | **6. Generation (Gemini)** | Generation | **Google Gemini** | L'IA rédige la réponse **uniquement avec ces passages**, en citant les chapitres |
| 26 | **6. Generation : réponse** | Generation | Code | Récupère le texte de la réponse |
| 27 | **Réponse directe (sans recherche)** | (branche « non ») | Code | Pour « merci » ou une question hors sujet : réponse courte, **sans recherche** |
| 28 | **7. Sauvegarder l'échange (SQL)** | Sauvegarde | Postgres | Enregistre question, réponse, route, requête et chapitres utilisés. Renvoie `{ output }`, **la réponse affichée dans le chat** |

### Les 3 tables Supabase de cette version

| Table | Contenu | Remplie par |
|---|---|---|
| `epictete_chunks` | Les 56 chunks : `chapitre`, `partie`, `content`, **`mots_cles`**, `metadata`, **`embedding`** (vecteur), **`fts`** (index de mots) | L'ingestion |
| `epictete_conversations` | L'historique : `session_id`, `question`, `reponse`, `route`, `requete`, `chapitres` | Le chat (node 28) |

(La table `epictete_documents` sert à la version « Supabase » plus simple ; `documents` est une ancienne table, sans rapport.)

---

# PARTIE 2 : les étapes expliquées simplement, avec des exemples

## A. L'INGESTION : transformer un PDF en base de connaissances

> **L'idée** : préparer le livre **une fois pour toutes**, pour que chaque question trouve vite les bons passages.

### 1. Extraction : PDF → texte
Le PDF contient du texte mis en page. On en sort le **texte brut**.

**Exemple** (ce qui sort vraiment, encore sale) :
```
9/30/26, 4:10 PM The Internet Classics Archive | The Enchiridion
1. Some things are in our control and others not. Things in our control are opinion, pursuit,
desire, aversion, and, in a word…
file:///…/mit.html 3/10
```

### 2. Cleaning (nettoyage) : texte brut → texte propre
On retire ce qui n'est **pas le livre**, et on recolle les lignes coupées.
- **Supprimé** : la date et le titre du navigateur (en-tête répété sur chaque page), l'URL et « 3/10 » (pied de page), le menu du site, « THE END », ©.
- **Recollé** : les lignes coupées au milieu des phrases, pour obtenir **1 ligne = 1 chapitre**.
```
1. Some things are in our control and others not. Things in our control are opinion, pursuit, desire, aversion…
2. Remember that following desire promises the attainment of that of which you are desirous…
```

### 3. Chunking (découpage) : texte → morceaux
On découpe en **chunks**, des morceaux de taille raisonnable que l'IA pourra lire.
- **Règle** : **1 chunk = 1 chapitre**, puisque chaque chapitre d'Épictète est une idée complète.
- **Chapitres trop longs** (plus de ~350 mots) : coupés **entre deux phrases**. Le 24 et le 29 donnent 2 parties, le 33 en donne 3.
- **Résultat** : **56 chunks** de 23 à 348 mots, médiane 109.
- **Contrôle** : s'il n'y a pas exactement 52 chapitres (mauvais livre, PDF abîmé), **tout s'arrête** et rien n'est enregistré.

**Exemple** : le chapitre 8 tient en 1 chunk de 23 mots, *« Don't demand that things happen as you wish, but wish that they happen as they do happen, and you will go on well. »* Le chapitre 33 (703 mots) devient 3 chunks de 269, 230 et 204 mots.

### 4. Augmentation (enrichissement) : morceaux → morceaux étiquetés
On ajoute à chaque chunk des **informations utiles pour la recherche et pour citer la source**.
```
texte     : "Enchiridion – Chapter 49
             When anyone shows himself overly confident in ability to understand… Chrysippus…"
metadata  : { chapitre: 49, partie: 1, traduction: "Elizabeth Carter (1758)", nb_mots: 158, … }
mots_cles : ["chrysippus", "understand", "interpret", "overly", "confident", "ability", "works", "written"]
```
Les **mots-clés** sont les mots les plus fréquents du chunk, sans les mots vides (*the, that, which*…).

### 5. Vectorisation : morceaux → vecteurs en base
- Gemini transforme chaque chunk en **vecteur** : une liste de **3072 nombres** qui représente son **sens**.
- **Image simple** : chaque chunk est placé sur une « carte des idées ». Deux passages qui parlent de la même chose sont **proches** sur cette carte.
  ```
  « Le chat dort sur le canapé »        → (2, 8)
  « Le chien se repose dans le salon »  → (3, 7)   ← proche : même idée
  « La bourse a chuté »                 → (9, 1)   ← loin : autre sujet
  ```
  En vrai, la carte a 3072 dimensions, mais le principe est le même.
- On enregistre dans Supabase : le texte, les mots-clés, les métadonnées, le vecteur, et l'index de mots **`fts`** (*Full-Text Search*). Cet index liste les mots du chunk ramenés à leur racine : *disturbed* → `disturb`, *Socrates* → `socrat`.

---

## B. L'ANSWERING : répondre à une question

> **L'idée** : comprendre la question, trouver les bons passages, garder les meilleurs, et répondre **avec eux**.

On suit une question tout au long du pipeline.

### 1. Input : la question
L'utilisateur écrit dans le chat : **« Que dit le chapitre 8 ? »**
Le chat transmet `chatInput = "Que dit le chapitre 8 ?"` et `sessionId = "5bdfa…"`, l'identifiant de la conversation.

### 2. Context : se souvenir de la conversation
On relit les **3 derniers échanges** de cette conversation dans Supabase.
- Première question : `(début de la conversation)`.
- **Pourquoi c'est utile** : si l'utilisateur demande ensuite **« Et le chapitre suivant ? »**, on sait qu'on parlait du chapitre 8. L'historique indique `[chapitres utilisés : 8]`.

### 3. Routing : décider quoi faire
Gemini lit la question avec l'historique et répond en JSON :
```json
{ "route": "livre", "requete": "Enchiridion – Chapter 8 demand wish happen", "chapitre": 8, "langue": "fr" }
```
- **route** :
  - `livre` → on cherche ;
  - `conversation` (« merci ») ou `hors_sujet` (« capitale du Japon ? ») → **réponse directe, sans recherche**.
- **requete** : la question **réécrite en anglais** (le livre est en anglais) et **autonome**. « Et le chapitre suivant ? » devient `Enchiridion – Chapter 9`.

| Question | Route | Que se passe-t-il ? |
|---|---|---|
| « Que dit le chapitre 8 ? » | `livre` | Recherche → réponse sur le chapitre 8 |
| « Et le chapitre suivant ? » | `livre` | Grâce au contexte → requête `Enchiridion – Chapter 9` |
| « Merci ! » | `conversation` | « Avec plaisir ! … », sans recherche |
| « Quelle est la capitale du Japon ? » | `hors_sujet` | « Je ne réponds qu'aux questions sur le Manuel d'Épictète. » |

### 4. Search : trouver des candidats (recherche hybride)
On cherche les passages de **deux façons**, puis on **fusionne** :

| Recherche | Comment | Bonne pour | Exemple |
|---|---|---|---|
| **Sémantique** (vecteurs) | La requête devient un vecteur ; on prend les chunks **les plus proches sur la carte** | Le **sens**, même avec d'autres mots ou une autre langue | « rester calme face aux insultes » → les chapitres qui parlent des insultes (par ex. 20), sans aucun mot commun |
| **Mots-clés** (plein texte, `fts`) | On cherche les chunks qui **contiennent les mots** de la requête | Les **mots exacts**, rares, les noms propres | « Chrysippus » → chapitre 49 |

**Fusion (RRF, *Reciprocal Rank Fusion*)** : chaque passage reçoit `1/(60 + rang sémantique) + 1/(60 + rang mots-clés)`. Un passage bien classé **par les deux** méthodes passe devant.
**Bonus** : si la question cite un chapitre (« chapter 8 »), ce chapitre passe **en tête**.
→ On garde **10 candidats**.

### 5. Reranking : garder les meilleurs
La recherche ratisse large (10 candidats) ; le reranking **trie finement**. Gemini lit la question et note chaque candidat de **0 à 10** :
```json
{ "scores": [ {"id": 1, "score": 9}, {"id": 2, "score": 3}, {"id": 3, "score": 7}, … ] }
```
On garde **au plus 4 passages notés ≥ 5**, du meilleur au moins bon. Le chapitre explicitement demandé est toujours gardé.
**Pourquoi** : la recherche trouve des passages *proches* ; le reranking vérifie qu'ils **répondent vraiment** à la question.

### 6. Generation : rédiger la réponse
Gemini reçoit la question, l'historique et **uniquement les passages gardés**, avec ces consignes :
- répondre **seulement à partir des passages**, sans connaissances extérieures et sans inventer ;
- si les passages ne suffisent pas : dire « je ne trouve pas cette information dans le Manuel » ;
- répondre **dans la langue de la question** ;
- **citer les chapitres**.

**Exemple de réponse** : *« Le chapitre 8 enseigne de ne pas exiger que les choses arrivent comme on le souhaite, mais de souhaiter qu'elles arrivent comme elles arrivent : « wish that they happen as they do happen » (Chapitre 8). »*

### 7. Sauvegarde : se souvenir pour la suite
L'échange est enregistré dans `epictete_conversations` : question, réponse, route, requête, chapitres utilisés. C'est le **Context** de la question suivante. Le node renvoie `{ output }`, c'est le texte affiché dans le chat.

### Coût par question
| Type de question | Appels Gemini |
|---|---|
| Sur le livre | **4** : routing + embedding + reranking + generation |
| « Merci » / hors sujet | **1** : routing seulement |

---

# PARTIE 3 : le CLI n8n et le MCP

## A. Le CLI n8n, c'est quoi ?

Le **CLI** (*Command Line Interface*) est la commande **`n8n`** que l'on tape dans un **terminal**. Elle permet de gérer n8n **sans l'interface web** : lister, exporter, importer, exécuter et publier des workflows, faire des sauvegardes…

⚠️ **Le CLI n'existe que pour un n8n auto-hébergé** : installé sur un serveur, un PC, ou dans Docker. Sur **n8n Cloud**, on n'a pas accès à la machine, donc pas de CLI. On passe par l'interface ou par l'API REST.

**Où taper les commandes :**
```bash
# n8n installé avec npm
n8n list:workflow

# n8n dans Docker (le cas le plus courant) : on « entre » dans le conteneur
docker exec -it n8n n8n list:workflow
#          │   │    └── la commande n8n
#          │   └────── nom du conteneur (voir : docker ps)
#          └────────── -it = mode interactif
```

### Rappel : se déplacer dans un terminal
| Commande | Ça sert à | Exemple |
|---|---|---|
| `pwd` | Savoir où je suis | `/home/user/n8n_projet` |
| `ls` / `ls -la` | Voir les fichiers (avec les cachés) | `ls projets/` |
| `cd dossier` / `cd ..` | Entrer dans un dossier / remonter | `cd projets/02_chatbot_epictete` |
| `cat fichier` | Afficher un fichier | `cat README.md` |
| `mkdir dossier` | Créer un dossier | `mkdir backups` |
| **Tab** | Compléter un nom automatiquement | `cd pro` + Tab → `cd projets/` |
| **↑** | Rappeler la commande précédente | |
| **Ctrl+C** | Arrêter une commande | |

### Les commandes n8n (vérifiées dans n8n 2.41.3)

**Se repérer**
```bash
n8n --help                          # toutes les commandes disponibles
n8n export:workflow --help          # l'aide d'une commande
n8n --version                       # la version de n8n
n8n license:info                    # informations de licence
```

**Lister les workflows** : le `ls` de n8n
```bash
n8n list:workflow                   # tous les workflows :  ID|Nom
n8n list:workflow --active=true     # seulement ceux qui sont publiés
n8n list:workflow --active=true --onlyId   # juste les IDs, un par ligne
```
→ Note l'**ID** du workflow (par ex. `GdRmpBrAkqDakahQ`) : toutes les autres commandes l'utilisent.

**Exécuter un workflow**
```bash
n8n execute --id=GdRmpBrAkqDakahQ               # exécute le workflow
n8n execute --id=GdRmpBrAkqDakahQ --rawOutput   # n'affiche que le JSON de sortie
```

**Publier / dépublier** (activer / désactiver)
```bash
n8n publish:workflow --id=GdRmpBrAkqDakahQ      # publier la version actuelle
n8n unpublish:workflow --id=GdRmpBrAkqDakahQ    # dépublier
n8n unpublish:workflow --all                    # tout dépublier (urgence)
```
(L'ancienne commande `update:workflow --active=true` existe encore mais est **dépréciée**.)

**Exporter** : sauvegarder vers des fichiers, par exemple pour Git
```bash
n8n export:workflow --id=GdRmpBrAkqDakahQ --output=workflow.json --pretty   # 1 workflow, lisible
n8n export:workflow --id=GdRmpBrAkqDakahQ --published --output=prod.json    # la version publiée
n8n export:workflow --all --output=backups/tous.json                        # tous dans 1 fichier
n8n export:workflow --backup --output=backups/latest/                       # sauvegarde : 1 fichier par workflow
```

**Importer** : recharger depuis des fichiers
```bash
n8n import:workflow --input=workflow.json                        # 1 fichier
n8n import:workflow --separate --input=backups/latest/           # tout un dossier
```

**Credentials** (clés API, mots de passe)
```bash
n8n export:credentials --all --output=backups/creds.json                     # exportées CHIFFRÉES
n8n export:credentials --all --decrypted --output=backups/creds_clair.json   # ⚠️ EN CLAIR
n8n import:credentials --input=backups/creds.json
```
⚠️ **Ne jamais mettre un export de credentials sur GitHub**, encore moins la version `--decrypted`.

**Administration**
```bash
n8n audit                          # rapport de sécurité de l'instance
n8n user-management:reset          # réinitialise les comptes si on est bloqué dehors
n8n start                          # démarre le serveur n8n
```

### Une « balade » typique sur une instance inconnue
```bash
n8n --version                                          # 1. quelle version ?
n8n list:workflow                                      # 2. qu'est-ce qui existe ?
n8n list:workflow --active=true                        # 3. qu'est-ce qui tourne ?
n8n export:workflow --id=<ID> --pretty --output=w.json # 4. je récupère un workflow pour le lire
cat w.json | head -50                                  # 5. je regarde son contenu
n8n execute --id=<ID>                                  # 6. je le lance pour voir
```

### Le lien avec notre projet
```
modif dans n8n   → n8n export:workflow --id=<ID> --pretty --output=… → git add / commit / push
modif dans Git   → git pull → n8n import:workflow --input=…
```

---

## B. Le MCP, c'est quoi ?

**MCP** (*Model Context Protocol*) est un **standard pour brancher une IA sur des outils**. Image simple : c'est une **prise universelle**. Une IA compatible MCP (Claude, par exemple) peut utiliser n'importe quel outil qui expose un serveur MCP : lire des fichiers, interroger une base, lancer des workflows n8n…

Dans n8n, le MCP existe sous **3 formes** :

| Forme | Sens | À quoi ça sert | Exemple |
|---|---|---|---|
| **MCP Server Trigger** (node) | n8n → IA | **Exposer un workflow comme outil** pour une IA extérieure | Claude peut appeler « recherche dans le Manuel d'Épictète » qui tourne dans n8n |
| **MCP Client Tool** (node) | IA de n8n → serveur MCP | Un **AI Agent de n8n** utilise les outils d'un serveur MCP externe | Notre agent pourrait utiliser un serveur MCP de calendrier ou de fichiers |
| **Serveur MCP de l'instance** (paramètres n8n) | IA → **tout n8n** | Une IA (Claude Desktop, Claude Code…) **pilote n8n** : chercher, lire, exécuter, tester, publier des workflows | « Claude, liste mes workflows et lance le chatbot Épictète » |

### Le serveur MCP de l'instance (n8n 2.41)
- **Adresse** : `https://<ton-instance-n8n>/mcp-server/http`.
- **Authentification** : un **jeton** (*Bearer token*) généré dans les paramètres n8n. Chaque workflow doit être **autorisé** pour le MCP (réglage « MCP access »).
- **Outils exposés**, entre autres : chercher des workflows, voir le détail d'un workflow, **exécuter** et **tester** un workflow, voir les exécutions, **publier / dépublier**, lister les credentials (sans les secrets), gérer dossiers et tags, construire des workflows.

**Brancher Claude Code dessus** (exemple) :
```bash
claude mcp add --transport http n8n https://<ton-instance-n8n>/mcp-server/http \
  --header "Authorization: Bearer <ton-jeton-mcp>"
```
Ensuite, dans Claude Code : *« liste mes workflows n8n »*, *« exécute le workflow Chatbot RAG »*…

### CLI ou MCP ?
| | CLI n8n | MCP |
|---|---|---|
| Qui l'utilise | **Toi**, dans un terminal | **Une IA** (Claude…) |
| Où | Sur la machine qui héberge n8n | À distance, via l'URL de l'instance |
| Pour quoi | Sauvegardes, import/export, scripts, administration | Laisser une IA explorer, exécuter et modifier les workflows |
| n8n Cloud | ❌ Non | ✅ Oui |

---

## Pour la démo : questions à poser
1. **« Que dit le chapitre 8 ? »** → montre le routing (chapitre détecté) et la recherche par chapitre.
2. **« Et le chapitre suivant ? »** → montre le **context** (chapitre 9 trouvé grâce à l'historique).
3. **« What does Epictetus say about Chrysippus? »** → montre la **recherche par mots-clés** (chapitre 49) et la réponse en anglais.
4. **« Comment rester calme quand on m'insulte ? »** → montre la **recherche sémantique** : elle doit trouver les passages sur les insultes (chapitres 20, 42…), sans aucun mot en commun.
5. **« Merci ! »** puis **« Quelle est la capitale du Japon ? »** → montre la **réponse directe** et le **refus hors sujet**.

Dans **Executions**, ouvre chaque étape pour montrer ce qu'elle a décidé : route, requête réécrite, 10 candidats, notes du reranking, passages gardés.
