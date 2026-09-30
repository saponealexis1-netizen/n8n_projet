# 🏇 Récap Top 5 courses du week-end (démo)

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
