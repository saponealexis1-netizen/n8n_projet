---
name: interview-spec
description: Interviewe l'utilisateur pour produire une spec claire (objectif + affirmations vérifiables) avant de coder. À utiliser dès qu'on demande une nouvelle fonctionnalité, une modification importante, ou "faire une spec".
---

# Interview → Spec

But : ne rien construire tant qu'on n'a pas une spec **objectif + affirmations testables**.
On dit tout ce qu'on sait, on challenge, on creuse, on explore ce qui existe.

## Étape 1 — Explorer l'existant AVANT de poser des questions

Lire le code, la doc, les tests et l'historique git liés à la demande (ou lancer un sous-agent `Explore` si c'est large). Noter :
- ce qui existe déjà et fait (peut-être) déjà une partie du travail ;
- les règles métier déjà codées et les conventions du projet ;
- ce qui est provisoire, fictif ou en dur (placeholders, données de démo, TODO).

Ne jamais demander à l'utilisateur ce qu'on peut trouver soi-même.

## Étape 2 — Interviewer (par petits lots, 3-4 questions max)

Commencer par dire ce qu'on a compris et ce qui existe, puis poser des questions **fermées ou à choix**, avec une recommandation. Couvrir :

1. **Objectif** : quel problème ? Pour qui ? Comment sait-on que c'est réussi ?
2. **Entrées** : quelles données, d'où, réelles ou fictives, quel volume ?
3. **Sorties** : qu'est-ce qui change concrètement ? Demander un exemple attendu.
4. **Cas limites** : vide, erreur, doublon, très gros volume, panne d'un service externe, date ou fuseau particulier.
5. **Contraintes** : sécurité, légal, performance, délais, outils imposés.
6. **Hors périmètre** : ce qu'on NE fait PAS.

Challenger chaque réponse vague (« rapide », « joli », « les meilleurs ») : « rapide = combien ? meilleurs selon quel critère ? ».
Proposer des alternatives quand une demande semble coûteuse ou risquée.

## Étape 3 — Écrire la spec

Créer `specs/<AAAA-MM-JJ>-<sujet>.md` :

```markdown
# <Titre>

## Objectif
Une ou deux phrases : quoi, pour qui, pourquoi.

## Affirmations (doivent toutes être vraies à la fin)
- A1 : <fait vérifiable> — Vérif : <test, commande, ou manip manuelle qui le prouve>
- A2 : ...

## Cas limites
- <situation> → <comportement attendu>

## Hors périmètre
- ...

## Questions ouvertes
- ... (vide avant de coder)
```

Règle d'or : une affirmation qu'on ne sait pas vérifier n'est pas une affirmation. Il faut la reformuler.
Bon : « Si l'API renvoie une erreur 3 fois, aucun mail client ne part et une alerte est envoyée. »
Mauvais : « Les erreurs sont bien gérées. »

## Étape 4 — Valider

Relire la spec avec l'utilisateur et la lui faire confirmer. Tant que la section « Questions ouvertes » n'est pas vide, on ne code pas.
Ensuite, enchaîner avec le skill `doubt-driven-dev`.
