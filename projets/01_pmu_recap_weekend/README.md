# 🏇 Récap Top 5 courses du week-end (démo)

> Premier projet n8n du repo. Le projet principal est le [chatbot RAG Épictète](../02_chatbot_epictete/).

Flow n8n qui envoie chaque lundi aux joueurs un récap personnalisé des **5 plus grosses courses françaises du week-end**, avec leurs arrivées.

## Objectif

| But | Cible | Message |
|---|---|---|
| **Fidéliser** | Actifs | Rester connecté aux temps forts hippiques |
| **Réactiver** | Inactifs (3 à 6 mois sans jouer) | Montrer ce qu'ils ont raté |

L'impact se mesure sur l'évolution des enjeux avant et après l'envoi, comparée à celle d'un **groupe témoin**.

## Fonctionnement

```
Lundi 9h30 ─┬─► 50 clients fictifs ─┬─► Excel ─► Google Drive (archive)
            │                       └─► Filtre actifs + inactifs ──┐
            │                                                      ├─► Clients × Top 5 ─► Mail HTML ─► Gmail
            └─► Dates du week-end ─► API PMU ─► Courses FR ─► Top 5 ┘
                                        └──── en cas d'échec ────► Alerte échec (mail interne)
```

| | |
|---|---|
| **Hébergement** | n8n Cloud |
| **Déclenchement** | Chaque lundi à 9h30 (Europe/Paris) sur le week-end précédent, ou via « Test manuel » |
| **Courses** | API turfinfo PMU, courses françaises (`FRA`) uniquement, top 5 par allocation |
| **Fallback** | Seuil 30 000 € → 15 000 € → sans seuil, jusqu'à avoir 5 courses |
| **Clients** | 50 comptes fictifs régénérés à chaque exécution, Excel archivé sur Google Drive |
| **Envoi** | Gmail, 1 mail par segment en démo (`DEMO_UN_PAR_SEGMENT = true`) vers une adresse de test (`EMAIL_TEST`) |

## Le flow, node par node

Deux chaînes partent en parallèle du déclencheur, puis se rejoignent dans « Clients x Top 5 » :

| # | Node | Type | Ce qu'il fait |
|---|---|---|---|
| 1 | **Lundi 9h30** | Schedule Trigger | Lance le flow automatiquement chaque lundi à 9h30 (heure de Paris) |
| 2 | **Test manuel** | Manual Trigger | Même chose, à la main, pour tester |
| | *Chaîne « clients »* | | |
| 3 | **Génération clients fictifs** | Code | Crée 50 comptes fictifs (prénom, date de dernière activité, segment). Le compte n°1 est toujours actif et le n°2 toujours inactif |
| 4 | **Convertir en Excel** | Convert to File | Transforme les 50 comptes en fichier `.xlsx` |
| 5 | **Archiver sur Google Drive** | Google Drive | Dépose l'Excel sur le Drive (trace de chaque envoi) |
| 6 | **Garder actifs + inactifs** | Filter | Retire les comptes « hors cible » (61-90 jours) |
| | *Chaîne « courses »* | | |
| 7 | **Dates du week-end** | Code | Calcule le samedi et le dimanche précédents, au format de l'API (`ddMMyyyy`) |
| 8 | **Programme PMU** | HTTP Request | Appelle l'API PMU pour chaque jour (3 tentatives ; en cas d'échec → « Alerte échec ») |
| 9 | **Aplatir les courses** | Code | Transforme la réponse de l'API (réunions → courses) en 1 item par course : hippodrome, heure, allocation, gagnant, arrivée |
| 10 | **Courses françaises** | Filter | Ne garde que les courses en France (`FRA`) |
| 11 | **Top 5 + fallback** | Code | Trie par allocation et garde les 5 plus grosses, avec un seuil de 30 000 €, puis 15 000 €, puis sans seuil. Aucune course → erreur → « Alerte échec » |
| | *Fusion et envoi* | | |
| 12 | **Clients x Top 5** | Merge | Associe le top 5 à chaque client ciblé |
| 13 | **Construire le mail** | Code | Construit le mail HTML : objet, bandeau, intro, bouton et P.S. selon le segment (actif ou inactif), tableau des 5 courses commun, mention ANJ et désinscription. En démo : 1 mail par segment |
| 14 | **Envoyer (Gmail)** | Gmail | Envoie le mail |
| 15 | **Alerte échec** | Gmail | Prévient l'équipe si l'API PMU ou le top 5 échoue (1 seul mail) |

**Exemple** : lundi 28/09 à 9h30, le flow calcule les dates du 26 et du 27/09. Il récupère les courses françaises du week-end et garde par exemple 5 courses à plus de 30 000 €. Il envoie ensuite 2 mails de démo : « 🏇 Lucas, les 5 courses phares du week-end » (actif) et « Emma, voici ce que tu as raté ce week-end 🏇 » (inactif).

## Segmentation

Basée sur `dt_hr_reference_hippique` (date de la dernière activité hippique).

| Segment | Jours sans activité | Mail |
|---|---|---|
| Actif | 0 – 60 | Fidélisation |
| Hors cible | 61 – 90 | Aucun |
| Inactif | 91 – 180 | Réactivation |
| Exclu | > 180 | Aucun |

## Personnalisation du mail

- **Selon le segment** : objet, bandeau, couleur, intro, bouton et P.S.
- **Commun** : le tableau des 5 courses (jour, heure, course, hippodrome, allocation, gagnant, arrivée).

## Sécurité

- **API PMU** : 3 tentatives espacées de 5 s, puis un mail d'alerte interne.
- **Aucune course française** : pas d'envoi aux clients et un mail d'alerte.
- **Pied de mail** : mention jeu responsable ANJ (09 74 75 13 13) et lien de désinscription.

## KPIs

1. Taux d'ouverture et taux de clic.
2. Enjeux avant / après l'envoi (Dataiku), comparés au groupe témoin.

## Passage en prod

| Élément | Démo | Prod |
|---|---|---|
| Clients | 50 comptes fictifs | Scénario **Dataiku** : actifs 0-60 j, inactifs 91-180 j, exclusion des non opt-in et des auto-exclus, groupe témoin |
| Liaison | — | n8n lance le scénario via l'API Dataiku, puis lit le dataset produit |
| Hébergement | n8n Cloud | n8n **auto-hébergé PMU** |
| Accès | — | Clé API Dataiku (dans les credentials n8n, jamais dans le code) |
| Envoi | 1 mail par segment vers l'adresse de test | Tous les comptes ciblés, liens réels à la place des `href="#"` |

## Limites connues (démo)

- Si l'API échoue pour **un seul** des deux jours, le mail part quand même avec l'autre jour (et l'alerte est envoyée).
- Un « Test manuel » lancé un **dimanche** prend le week-end précédent, pas celui en cours. Pour forcer des dates, remplir `FORCE` dans « Dates du week-end ».
## Fichiers

| Fichier | Rôle |
|---|---|
| `workflow_recap_weekend.json` | **Le workflow à importer dans n8n** |
| `tests/fixtures/` | Données de test pour exécuter les nodes Code hors n8n (dates, programme PMU simulé) |

## Installation dans n8n

1. **Workflows → Import from File** → `workflow_recap_weekend.json`.
2. Connecter les credentials **Gmail** et **Google Drive**.
3. Remplacer `ton.email@exemple.com` dans les nodes « Génération clients fictifs » et « Alerte échec ».
4. Lancer via **Test manuel**, ou activer le workflow pour l'envoi du lundi 9h30.

## Tester un node Code hors n8n

Depuis la racine du repo, après `npm install` :

```bash
node tools/run-code-node.mjs projets/01_pmu_recap_weekend/workflow_recap_weekend.json "Dates du week-end" projets/01_pmu_recap_weekend/tests/fixtures/vide.json --now 2026-09-28T09:30
node tools/run-code-node.mjs projets/01_pmu_recap_weekend/workflow_recap_weekend.json "Aplatir les courses" projets/01_pmu_recap_weekend/tests/fixtures/programme_pmu.json --ref "Dates du week-end=projets/01_pmu_recap_weekend/tests/fixtures/dates.json"
```

`--now` fige la date du jour (heure de Paris) ; `--ref` simule la sortie d'un autre node lue par `$('Nom')`.
