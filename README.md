# n8n_projet

Flow n8n **PMU - Récap Top 5 courses du week-end** (`workflows/recap_weekend_complet.json`) : chaque lundi 9h30, récupère les courses françaises du week-end via l'API PMU, sélectionne le top 5 par allocation et envoie un mail adapté au segment client (actif / inactif).

## Skills Claude Code (`.claude/skills/`)

Le cycle de travail sur le flow :

1. **`interview-spec`** : explorer l'existant, interviewer, challenger → spec `specs/*.md` (objectif + affirmations vérifiables).
2. **`doubt-driven-dev`** : implémenter en doutant de chaque résultat ; rien n'est « fini » sans preuve.
3. **`hostile-review`** : attaquer le flow pour le casser, prouver chaque problème, rapport trié par gravité.

Dans Claude Code : `/interview-spec`, `/doubt-driven-dev`, `/hostile-review`.

## Tester un node Code hors n8n

```bash
npm install
node tools/run-code-node.mjs workflows/recap_weekend_complet.json "Dates du week-end" tools/fixtures/vide.json --now 2026-09-28T09:30
node tools/run-code-node.mjs workflows/recap_weekend_complet.json "Aplatir les courses" tools/fixtures/programme_pmu.json --ref "Dates du week-end=tools/fixtures/dates.json"
```

Les fixtures sont dans `tools/fixtures/`.
