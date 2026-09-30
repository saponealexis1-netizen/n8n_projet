---
name: hostile-review
description: Revue hostile d'un projet ou d'une modification - on attaque le code pour le casser, on teste chaque problème et on ne garde que ce qui est prouvé. À utiliser avant de livrer ou pousser, ou quand on demande "review", "casse-le", "trouve les failles".
---

# Hostile Review

Posture : **tu n'es pas l'auteur, tu es l'attaquant.** Le code est coupable jusqu'à preuve du contraire. Objectif : trouver ce qui casse, produit un résultat faux, ou échoue en silence.

Idéalement, lancer la revue dans un **sous-agent** (`Agent`, type `general-purpose`) qui n'a pas écrit le code, avec ce skill comme consigne.

## 1. Cartographier la surface d'attaque

Lire le code visé en entier, plus la spec dans `specs/` si elle existe. Identifier : les entrées (utilisateur, API, fichiers, dates), les sorties (données, mails, fichiers, appels externes), les branches d'erreur, et ce qui est en dur ou provisoire.

## 2. Attaquer — angles obligatoires

- **Entrées** : vide, nulle, en double, énorme, mal formée, caractères spéciaux / HTML / injection.
- **Temps** : autre jour que prévu, changement d'heure, fin de mois ou d'année, fuseau horaire.
- **Dépendances externes** : service en panne, lent, réponse 200 mais vide, format différent de celui supposé, succès partiel.
- **Logique métier** : bornes exactes (≤ vs <), égalités, arrondis, cas où la règle ne s'applique pas.
- **Erreurs** : chaque erreur est-elle signalée, ou avalée en silence ? Un échec partiel laisse-t-il un état incohérent ?
- **Sécurité** : secrets dans le code, données sensibles loggées ou envoyées, permissions trop larges.
- **Écart avec la spec ou la doc** : ce que le README promet, le code le fait-il vraiment ?

## 3. Prouver chaque attaque

Pas de problème retenu sans preuve. Pour chaque attaque :
1. Construire l'entrée qui casse : fixture, test, ou script jetable.
2. L'exécuter réellement.
3. Noter le résultat obtenu face au résultat attendu.

Si ça ne se teste pas ici (service externe, prod), classer le problème **« à tester manuellement »** avec le scénario exact.

## 4. Rapport

Trier par gravité, sans enrober :

| # | Gravité | Problème | Scénario qui casse | Preuve | Fix proposé |
|---|---|---|---|---|---|
| 1 | 🔴 bloquant / 🟠 important / 🟡 mineur | … | entrée → résultat faux | commande + sortie | … |

Puis :
- **Réfuté** : les attaques tentées qui n'ont rien cassé, preuve à l'appui. Elles comptent aussi.
- **À tester manuellement** : les scénarios non reproductibles ici.

Ne pas corriger soi-même pendant la revue : proposer, et l'utilisateur tranche. Les corrections passent ensuite par `doubt-driven-dev`.
