---
name: interview-spec
description: Interviewe l'utilisateur pour produire une spec claire (objectif + affirmations vérifiables) avant de toucher au flow n8n recap_weekend_complet. À utiliser dès qu'on demande une nouvelle fonctionnalité, une modif du flow, ou "faire une spec".
---

# Interview → Spec

But : ne rien construire tant qu'on n'a pas une spec **objectif + affirmations testables**.
On dit tout ce qu'on sait, on challenge, on creuse, on explore ce qui existe.

Périmètre : uniquement `workflows/recap_weekend_complet.json` (flow « PMU - Récap Top 5 courses du week-end »).

## Étape 1 — Explorer l'existant AVANT de poser des questions

Lire le flow (ou lancer un sous-agent `Explore` si la question est large) et noter :
- les nodes concernés par la demande et ce qu'ils font aujourd'hui ;
- les règles déjà codées (segments actif ≤ 60 j / inactif > 90 j, top 5 avec seuils 30 000 € → 15 000 € → 0, courses FRA uniquement, envoi lundi 9h30 heure de Paris, alerte en cas d'échec) ;
- ce qui est fictif/démo (`EMAIL_TEST`, `DEMO_UN_PAR_SEGMENT`, clients générés au hasard, liens `href="#"`).

Ne jamais demander à l'utilisateur ce qu'on peut lire soi-même dans le JSON.

## Étape 2 — Interviewer (par petits lots, 3-4 questions max)

Dire d'abord ce qu'on a compris et ce qui existe, puis poser des questions **fermées ou à choix**, avec une recommandation. Couvrir :

1. **Objectif** : quel problème métier ? Pour qui (client actif, inactif, équipe CRM) ? Comment sait-on que c'est réussi ?
2. **Entrées** : d'où viennent les données (API PMU, base clients, Drive) ? Réelles ou fictives ?
3. **Sorties** : qu'est-ce qui change dans le mail / l'Excel / l'alerte ? Exemple concret attendu.
4. **Cas limites** : week-end sans course FRA, API PMU en panne, arrivée pas encore dispo, moins de 5 courses, 0 client ciblé, lancement un autre jour que lundi.
5. **Contraintes** : mention jeu responsable, désinscription, volume de mails, heure d'envoi, fuseau Europe/Paris.
6. **Hors périmètre** : ce qu'on NE fait PAS.

Challenger chaque réponse vague (« ça doit être joli », « les meilleures courses ») : « meilleures selon quoi ? allocation, nombre de partants, Quinté ? ».
Proposer des alternatives quand une demande semble coûteuse ou risquée.

## Étape 3 — Écrire la spec

Créer `specs/<AAAA-MM-JJ>-<sujet>.md` avec exactement :

```markdown
# <Titre>

## Objectif
Une ou deux phrases : quoi, pour qui, pourquoi.

## Affirmations (doivent toutes être vraies à la fin)
- A1 : <fait vérifiable> — Vérif : <comment on le prouve : fixture + tools/run-code-node.mjs, exécution n8n, lecture du mail>
- A2 : ...

## Cas limites
- <situation> → <comportement attendu>

## Hors périmètre
- ...

## Questions ouvertes
- ... (vide avant de coder)
```

Règle d'or : une affirmation qu'on ne sait pas vérifier n'est pas une affirmation, la reformuler.
Bon : « Si aucune course FRA n'est trouvée, aucun mail client ne part et l'alerte est envoyée une seule fois. »
Mauvais : « Le flow gère bien les erreurs. »

## Étape 4 — Valider

Relire la spec à l'utilisateur, lui faire confirmer. Tant que « Questions ouvertes » n'est pas vide, on ne code pas.
Ensuite, enchaîner avec le skill `doubt-driven-dev` pour l'implémentation.
