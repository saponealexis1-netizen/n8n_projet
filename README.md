# n8n_projet

Projets d'automatisation **n8n**, construits avec Claude Code et 3 skills maison qui imposent une méthode : **spec → développement dans le doute → revue hostile**.

## Projets

| # | Projet | Description | Statut |
|---|---|---|---|
| 01 | [🏇 Récap Top 5 courses du week-end (PMU)](projets/01_pmu_recap_weekend/) | Chaque lundi 9h30, récupère les courses françaises du week-end (API PMU), sélectionne le top 5 par allocation et envoie un mail personnalisé selon le segment client (actif / inactif) | Démo |
| 02 | [📖 Chatbot RAG - Manuel d'Épictète](projets/02_chatbot_epictete/) | Chatbot qui répond aux questions sur le Manuel d'Épictète uniquement à partir du livre, en citant les chapitres. Ingestion RAG complète : extraction → nettoyage → chunking → augmentation → vectorisation. Quatre versions : Simple Vector Store, **Supabase**, **recherche hybride** (vecteurs + mots-clés, sur le modèle du flow du prof) et **answering** (Context → Routing → Search → Reranking → Generation) | ✅ Validé dans n8n (3 versions) · answering à valider |

Chaque projet a son propre README : installation dans n8n, fonctionnement, limites connues.

## Structure du repo

```
n8n_projet/
├── README.md                      ← ce fichier
├── .claude/skills/                ← les 3 skills Claude Code (génériques)
│   ├── interview-spec/
│   ├── doubt-driven-dev/
│   └── hostile-review/
├── specs/                         ← specs écrites avec /interview-spec
│   └── 2026-09-30-chatbot-epictete-rag.md
├── projets/
│   ├── 01_pmu_recap_weekend/
│   │   ├── README.md
│   │   ├── workflow_recap_weekend.json     ← à importer dans n8n
│   │   └── tests/fixtures/
│   └── 02_chatbot_epictete/
│       ├── README.md
│       ├── workflow_chatbot_epictete.json           ← à importer (Simple Vector Store)
│       ├── workflow_chatbot_epictete_supabase.json  ← à importer (Supabase)
│       ├── workflow_chatbot_epictete_hybride.json   ← à importer (Supabase + recherche hybride)
│       ├── workflow_chatbot_epictete_answering.json ← à importer (hybride + Context → Routing → Search → Reranking → Generation)
│       ├── supabase/setup.sql                       ← à exécuter une fois dans Supabase (table epictete_documents)
│       ├── supabase/setup_hybride.sql               ← idem pour la version hybride (table epictete_chunks)
│       ├── supabase/setup_answering.sql             ← en plus, pour la version answering (table epictete_conversations)
│       ├── data/                            ← le livre (PDF + texte de référence)
│       ├── src/                             ← code des nodes Code
│       ├── scripts/                         ← génération du workflow
│       └── tests/                           ← tests automatiques + fixtures
├── tools/
│   └── run-code-node.mjs          ← exécute un node Code n8n hors de n8n (partagé)
└── package.json                   ← dépendances de test (luxon, pdfjs-dist, PGlite + pgvector)
```

## Les skills Claude Code

Skills **génériques**, réutilisables sur n'importe quel projet : il suffit de copier `.claude/skills/`. Dans Claude Code, on les lance dans cet ordre :

| Skill | Rôle | Ce qu'il produit |
|---|---|---|
| **`/interview-spec`** | Explore l'existant, interviewe par petits lots, challenge les réponses vagues | Une spec `specs/*.md` : objectif, **affirmations vérifiables**, cas limites, hors périmètre |
| **`/doubt-driven-dev`** | Implémente en doutant de chaque résultat : hypothèses listées et vérifiées, code exécuté sur des cas limites, diff relu comme celui d'un autre | Le code + un tableau honnête affirmation / statut / preuve |
| **`/hostile-review`** | Attaque le projet pour le casser, idéalement via un sous-agent qui n'a pas écrit le code ; ne garde que ce qui est prouvé | Un rapport trié par gravité : scénario qui casse, preuve, correctif proposé |

Exemple concret : le [chatbot Épictète](projets/02_chatbot_epictete/#comment-il-a-été-construit-skills-du-repo) a été construit avec les 3 skills (11 affirmations, 3 pièges n8n évités, 6 problèmes trouvés par la revue hostile).

## Tests

```bash
npm install
npm test                 # tests du chatbot Épictète (les 4 versions)
```

Pour exécuter un node Code d'un workflow hors de n8n :

```bash
node tools/run-code-node.mjs <workflow.json> "<Nom du node>" <input.json> [--ref "Node=fichier.json"] [--now 2026-09-28T09:30]
```
