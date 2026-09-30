---
name: doubt-driven-dev
description: Mode de travail où chaque résultat est mis en doute et vérifié avant d'être présenté - le premier jet n'est jamais le rendu final. À utiliser pour toute modif du flow n8n recap_weekend_complet (nodes Code, filtres, expressions, mails).
---

# Doubt-Driven Development

Principe : **le premier résultat n'est pas le résultat.** L'IA se trompe sans le savoir ; on critique son propre travail jusqu'à ce qu'il soit prouvé bon.

Référence : la spec dans `specs/` (sinon lancer d'abord le skill `interview-spec`).

## La boucle (à répéter jusqu'à ce que tout soit vert)

### 1. Faire
Modifier `workflows/recap_weekend_complet.json` au plus simple pour satisfaire la spec.

### 2. Douter — se poser ces questions à voix haute
- **Qu'est-ce que j'ai supposé sans le vérifier ?** (format de l'API PMU, nom d'un champ, comportement d'un node n8n, fuseau horaire…) Lister chaque hypothèse.
- **Est-ce que j'ai lu le code existant ou je l'ai deviné ?** Relire le node réel, pas le souvenir qu'on en a.
- **Qu'est-ce qui casse si l'entrée est vide, nulle, en double, énorme, ou arrive un autre jour ?**
- **Est-ce que ça touche un autre node ?** (noms utilisés dans `$('...')`, `connections`, Merge `Clients x Top 5`, `Alerte échec`).
- **Est-ce que je réponds à la spec ou à ce que je crois être la spec ?** Reprendre chaque affirmation A1, A2…

### 3. Vérifier — avec des preuves, pas des impressions
- JSON valide : `jq empty workflows/recap_weekend_complet.json`
- Chaque node Code modifié est exécuté sur fixtures :
  ```bash
  npm install   # une fois (luxon)
  node tools/run-code-node.mjs workflows/recap_weekend_complet.json "Top 5 + fallback" tools/fixtures/<entree>.json
  node tools/run-code-node.mjs workflows/recap_weekend_complet.json "Dates du week-end" tools/fixtures/vide.json --now 2026-09-28T09:30
  node tools/run-code-node.mjs workflows/recap_weekend_complet.json "Aplatir les courses" tools/fixtures/programme_pmu.json --ref "Dates du week-end=tools/fixtures/dates.json"
  ```
- Ajouter une fixture par cas limite de la spec (liste vide, pas de FRA, `ordreArrivee` absent, < 5 courses…).
- Les connexions : chaque nom référencé existe (`jq '.connections | keys'`, `jq '[.nodes[].name]'`).
- Ce qui ne peut pas être testé ici (Gmail, Drive, vraie API PMU) → le dire explicitement et donner à l'utilisateur le test manuel à faire dans n8n (« Test manuel » + ce qu'il doit voir).

### 4. Critiquer
Relire son diff comme si un autre l'avait écrit. Chercher : code mort, cas oublié, texte du mail incohérent avec le segment, mention jeu responsable supprimée, `EMAIL_TEST`/`DEMO_UN_PAR_SEGMENT` modifiés sans le vouloir.
S'il reste un doute → retour à l'étape 1.

## Rendu à l'utilisateur

Toujours terminer par un tableau honnête :

| Affirmation | Statut | Preuve |
|---|---|---|
| A1 … | ✅ vérifié / ⚠️ non testable ici / ❌ échoue | commande + résultat |

Plus la liste des hypothèses **non vérifiées**. Ne jamais écrire « ça marche » sans preuve à côté.
Pour une attaque plus poussée avant livraison : skill `hostile-review`.
