# n8n_projet

Projets d'automatisation **n8n**, construits avec Claude Code et 3 **skills** maison qui imposent une méthode de travail : **spec → développement dans le doute → revue hostile**.

## 📖 Projet principal : chatbot RAG sur le Manuel d'Épictète

**[`projets/02_chatbot_epictete/`](projets/02_chatbot_epictete/)**, ✅ validé dans n8n + Supabase.

Un chatbot qui répond aux questions sur *The Enchiridion* d'Épictète **uniquement à partir du livre**, en **citant les chapitres** :

```
INGESTION   PDF → Extraction → Cleaning → Chunking → Augmentation (+ mots-clés) → Vectorisation (Gemini → Supabase)
ANSWERING   Question → Context → Routing → Search (hybride : sens + mots-clés) → Reranking → Generation
```

| Pour… | Aller à |
|---|---|
| Installer et lancer le chatbot | [README du chatbot](projets/02_chatbot_epictete/README.md) |
| Comprendre chaque node et chaque étape, avec des exemples | 📘 **[Fiche récap](FICHE_RECAP.md)** (contient aussi le CLI n8n et le MCP) |
| Voir les objectifs et les affirmations vérifiées | [Spec](specs/2026-09-30-chatbot-epictete-rag.md) |
| Voir les 3 versions qui ont mené à la version finale | [Versions précédentes](projets/02_chatbot_epictete/docs/versions_precedentes.md) |

## 🏇 Premier projet : récap du week-end PMU

**[`projets/01_pmu_recap_weekend/`](projets/01_pmu_recap_weekend/)** (démo). Chaque lundi à 9h30, le flow récupère les courses françaises du week-end via l'API PMU et sélectionne le top 5 par allocation. Il envoie ensuite un mail personnalisé selon le segment du client : *fidélisation* pour les actifs, *réactivation* pour les inactifs. Le README l'explique node par node.

---

## Structure du repo

```
n8n_projet/
├── README.md                      ← ce fichier
├── FICHE_RECAP.md                 ← fiche de révision : flow node par node, ingestion, answering, CLI n8n, MCP
├── .claude/skills/                ← les 3 skills Claude Code (génériques)
│   ├── interview-spec/SKILL.md
│   ├── doubt-driven-dev/SKILL.md
│   └── hostile-review/SKILL.md
├── specs/
│   └── 2026-09-30-chatbot-epictete-rag.md   ← spec du chatbot (écrite avec /interview-spec)
├── projets/
│   ├── 01_pmu_recap_weekend/                ← premier projet
│   │   ├── README.md
│   │   ├── workflow_recap_weekend.json      ← à importer dans n8n
│   │   └── tests/fixtures/
│   └── 02_chatbot_epictete/                 ← PROJET PRINCIPAL
│       ├── README.md
│       ├── workflow_chatbot_epictete_answering.json   ← ★ version finale à importer
│       ├── workflow_chatbot_epictete*.json            ← versions précédentes (Simple Vector Store, Supabase, hybride)
│       ├── supabase/                        ← scripts SQL à exécuter dans Supabase
│       ├── src/                             ← code des nodes Code (prompts inclus)
│       ├── scripts/                         ← génération des workflows
│       ├── tests/                           ← tests automatiques + fixtures
│       ├── data/                            ← le livre (PDF + texte de référence)
│       └── docs/versions_precedentes.md
├── tools/run-code-node.mjs        ← exécute un node Code n8n hors de n8n (partagé)
└── package.json                   ← scripts npm + dépendances de test
```

## Les skills Claude Code

Les skills sont **génériques** : on peut les réutiliser sur n'importe quel projet en copiant `.claude/skills/`. Dans Claude Code, on les lance dans cet ordre :

| Skill | Rôle | Ce qu'il produit |
|---|---|---|
| **[`/interview-spec`](.claude/skills/interview-spec/SKILL.md)** | Explore l'existant, interviewe par petits lots, challenge les réponses vagues | Une spec `specs/*.md` : objectif, **affirmations vérifiables**, cas limites, hors périmètre |
| **[`/doubt-driven-dev`](.claude/skills/doubt-driven-dev/SKILL.md)** | Implémente en doutant de chaque résultat : hypothèses vérifiées à la source, code exécuté sur des cas limites, tests de mutation | Le code + un tableau honnête affirmation / statut / preuve |
| **[`/hostile-review`](.claude/skills/hostile-review/SKILL.md)** | Attaque le projet pour le casser, via un sous-agent qui n'a pas écrit le code ; ne garde que ce qui est prouvé | Un rapport trié par gravité : scénario, preuve, correctif proposé |

**Appliqués au chatbot** : 4 versions, chacune spécifiée (30 affirmations au total), développée dans le doute puis attaquée par une revue hostile, dont 2 exécutées dans un vrai n8n. Le détail est dans la section [« Comment le projet a été construit »](projets/02_chatbot_epictete/README.md#7-comment-le-projet-a-été-construit).
