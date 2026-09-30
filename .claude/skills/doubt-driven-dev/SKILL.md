---
name: doubt-driven-dev
description: Mode de travail où chaque résultat est mis en doute et vérifié avant d'être présenté - le premier jet n'est jamais le rendu final. À utiliser pour toute implémentation ou modification de code.
---

# Doubt-Driven Development

Principe : **le premier résultat n'est pas le résultat.** L'IA se trompe sans le savoir. On critique son propre travail jusqu'à ce qu'il soit prouvé bon.

Référence : la spec dans `specs/`. S'il n'y en a pas et que la demande n'est pas triviale, lancer d'abord `interview-spec`.

## La boucle (à répéter jusqu'à ce que tout soit vert)

### 1. Faire
Implémenter au plus simple ce que demande la spec.

### 2. Douter — se poser ces questions explicitement
- **Qu'ai-je supposé sans le vérifier ?** Format d'une API, nom d'un champ, comportement d'une librairie, fuseau horaire, version d'un outil… Lister chaque hypothèse.
- **Ai-je lu le code existant, ou l'ai-je deviné ?** Relire le vrai fichier, pas le souvenir qu'on en a.
- **Qu'est-ce qui casse si l'entrée est vide, nulle, en double, énorme, mal formée, ou arrive au mauvais moment ?**
- **Qu'est-ce que ma modif touche d'autre ?** Appelants, références par nom, config, tests existants.
- **Est-ce que je réponds à la spec, ou à ce que je crois être la spec ?** Reprendre chaque affirmation A1, A2…

### 3. Vérifier — avec des preuves, pas des impressions
- Lancer les vérifications du projet : tests, lint, typecheck, validation du format (ex : `jq empty fichier.json`).
- Exécuter réellement le code modifié sur des données de test, **y compris les cas limites de la spec**. S'il n'existe pas de test, en écrire un petit ou un script jetable.
- Vérifier chaque hypothèse de l'étape 2 : lire la doc ou la source, faire un appel réel si c'est possible.
- Ce qui ne peut pas être testé ici (service externe, envoi réel, UI) : le dire explicitement et donner à l'utilisateur le test manuel exact à faire, avec ce qu'il doit observer.

### 4. Critiquer
Relire son diff comme si quelqu'un d'autre l'avait écrit. Chercher : code mort, cas oublié, comportement changé sans le vouloir, secret ou placeholder laissé, sur-ingénierie.
S'il reste un doute, retour à l'étape 1.

## Rendu à l'utilisateur

Toujours terminer par un tableau honnête :

| Affirmation | Statut | Preuve |
|---|---|---|
| A1 … | ✅ vérifié / ⚠️ non testable ici / ❌ échoue | commande + résultat |

Ajouter la liste des hypothèses **non vérifiées**. Ne jamais écrire « ça marche » sans preuve à côté.
Pour une attaque plus poussée avant de livrer : skill `hostile-review`.
