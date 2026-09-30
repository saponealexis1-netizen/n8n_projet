---
name: hostile-review
description: Revue hostile du flow n8n recap_weekend_complet - on attaque le projet pour le casser, on teste chaque problème et on ne garde que ce qui est prouvé. À utiliser avant de livrer/pousser une modif, ou quand on demande "review", "casse-le", "trouve les failles".
---

# Hostile Review

Posture : **tu n'es pas l'auteur, tu es l'attaquant.** Le flow est coupable jusqu'à preuve du contraire. Objectif : trouver ce qui casse, envoie un mauvais mail, ou échoue en silence.

Idéalement, lancer la revue dans un **sous-agent** (`Agent`, type `general-purpose`) qui n'a pas écrit le code, avec ce skill comme consigne.

## 1. Surface d'attaque

Lire `workflows/recap_weekend_complet.json` en entier + la spec dans `specs/` si elle existe. Cartographier : triggers → clients fictifs → filtre segments → dates → API PMU → aplatir → FRA → top 5 → merge → mail → Gmail, et les branches d'erreur vers `Alerte échec`.

## 2. Attaquer — angles obligatoires

**Dates / temps**
- Lancer le « Test manuel » un dimanche, un samedi, un mardi : quel week-end est pris ?
- Passage heure d'été/hiver (dernier dimanche de mars/octobre), fin d'année, `FORCE` rempli.

**API PMU**
- Une seule des deux dates en échec : le mail part-il avec un seul jour sans le dire ? L'alerte part-elle ?
- Réponse 200 mais `programme` vide, `reunions` sans `courses`, `montantPrix` absent, `ordreArrivee` absent (course pas encore courue).
- Structure de l'API différente de celle supposée (vérifier le vrai JSON si le réseau le permet).

**Logique métier**
- Moins de 5 courses FRA, aucune, égalités d'allocation, doublons.
- Bornes des segments : 60, 61, 90, 91 jours. `hors_cible` bien exclu ?
- Le texte « actif » part-il bien aux actifs et « tu nous as manqué » aux inactifs ?

**Mail**
- Caractères spéciaux / HTML dans `libelle` ou `hippodrome` (pas d'échappement).
- Mention jeu responsable + désinscription toujours présentes.
- `EMAIL_TEST` / `DEMO_UN_PAR_SEGMENT` : risque d'envoyer 50 mails ou à une vraie adresse.

**Erreurs**
- `Alerte échec` : `$prevNode.name` affiche-t-il le bon node ? `executeOnce` masque-t-il une 2ᵉ erreur ?
- Un échec du merge/Gmail/Drive est-il alerté ou silencieux ?

## 3. Prouver chaque attaque

Pas de finding sans preuve. Pour chaque attaque :
1. Construire une fixture dans `tools/fixtures/`.
2. Exécuter : `node tools/run-code-node.mjs workflows/recap_weekend_complet.json "<Node>" <fixture> [--ref "Node=f.json"] [--now ISO]`
3. Noter le résultat réel.

Si ça ne se teste pas hors n8n (Gmail, Drive, Merge, `$prevNode`), le classer **« à tester dans n8n »** avec le scénario exact à reproduire.

## 4. Rapport

Trier par gravité, sans enrober :

| # | Gravité | Problème | Scénario qui casse | Preuve | Fix proposé |
|---|---|---|---|---|---|
| 1 | 🔴 bloquant / 🟠 important / 🟡 mineur | … | entrée → résultat faux | commande + sortie | … |

Puis :
- **Réfuté** : attaques tentées qui n'ont rien cassé (preuve à l'appui) — ça compte aussi.
- **À tester dans n8n** : scénarios non reproductibles ici.

Ne pas corriger soi-même pendant la revue : proposer, l'utilisateur tranche. Les corrections passent ensuite par `doubt-driven-dev`.
