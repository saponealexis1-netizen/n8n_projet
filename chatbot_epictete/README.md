# Chatbot RAG - Manuel d'Épictète (n8n)

Chatbot n8n qui répond aux questions sur **le Manuel d'Épictète** (*The Enchiridion*, trad. Elizabeth Carter, 52 chapitres), **uniquement à partir du livre**, en citant les chapitres.

Spec : [`specs/2026-09-30-chatbot-epictete-rag.md`](../specs/2026-09-30-chatbot-epictete-rag.md)

## Le workflow

```
INGESTION
Formulaire (PDF) → Extraire le texte du PDF → Nettoyage → Chunking → Augmentation → Vectorisation (Simple Vector Store)
                                                                                    ↑ Embeddings Gemini  ↑ Chargeur de documents ← Pas de re-découpage
CHAT
Chat → Agent Épictète ← Google Gemini Chat Model
                      ← Mémoire de la conversation
                      ← Recherche dans le livre (Simple Vector Store) ← Embeddings Gemini
```

| Étape RAG | Node | Ce qu'il fait |
|---|---|---|
| Extraction | Extraire le texte du PDF | PDF → texte brut |
| Nettoyage | Nettoyage (Code) | Retire le menu du site, les en-têtes/pieds de page du navigateur, les URL, les numéros de page, « THE END », © ; recolle les lignes coupées ; 1 ligne par chapitre |
| Chunking | Chunking (Code) | 1 chunk par chapitre ; les chapitres de plus de ~350 mots sont recoupés entre deux phrases → 56 chunks. Vérifie qu'il y a exactement 52 chapitres, sinon arrête tout |
| Augmentation | Augmentation (Code) | Ajoute l'en-tête « Enchiridion – Chapter N » au texte + métadonnées `chapitre`, `partie`, `livre`, `traduction`, `source`, `nb_mots` |
| Vectorisation | Simple Vector Store (insert) | Embeddings Gemini, clé `enchiridion`, base vidée avant chaque nouvel envoi (pas de doublons) |
| Recherche | Recherche dans le livre | Les 4 passages les plus proches, utilisés par l'agent comme outil |

## Installation dans n8n

1. **Workflows → Import from File** → `workflow_chatbot_epictete.json`
2. Ouvrir les 3 nodes Google (2 × Embeddings, 1 × Chat Model) et choisir ton credential **Google Gemini (PaLM) API** (clé gratuite sur https://aistudio.google.com/apikey).
3. Enregistrer le workflow.
4. Télécharger le livre : [`data/enchiridion.pdf`](data/enchiridion.pdf).

## Utilisation

1. Ouvrir le node **Formulaire** → *Test step* (ou l'URL de production si le workflow est activé) → envoyer `enchiridion.pdf` → « Livre indexé ✅ ».
2. Cliquer sur **Open chat** et poser les questions.

⚠️ Le Simple Vector Store est en mémoire : après un redémarrage de n8n, il faut renvoyer le PDF.

## Tests manuels à faire dans n8n

| # | Action | Résultat attendu |
|---|---|---|
| A1 | Importer le JSON | Aucun message d'erreur, 15 nodes tous reliés |
| A6 | Envoyer le PDF 2 fois, puis demander « What is in our control? » | Pas deux fois le même passage dans les sources de l'outil |
| A7 | « Qu'est-ce qui dépend de nous ? » | Réponse fondée sur le chapitre 1, qui cite « (Chapitre 1) » |
| A8 | « Quelle est la capitale du Japon ? » | « Je ne trouve pas cette information dans le Manuel… », pas de « Tokyo » |
| A9 | « What does Epictetus say about death? » | Réponse en anglais, avec des chapitres cités (ex : 5, 21) |
| A10 | Après A7 : « Et le chapitre suivant ? » | Parle du chapitre 2 |
| A5 | Envoyer un autre PDF dans le formulaire | Message d'erreur, et le chat répond toujours avec l'ancien livre |

## Fichiers

| Fichier | Rôle |
|---|---|
| `workflow_chatbot_epictete.json` | **Le workflow à importer** (généré, ne pas modifier à la main) |
| `src/1_nettoyage.js`, `2_chunking.js`, `3_augmentation.js` | Code des 3 nodes Code |
| `scripts/build-workflow.mjs` | Régénère le JSON à partir de `src/` |
| `tests/test.mjs` | Tests automatiques (nettoyage, chunking, augmentation, structure, cas d'erreur) |
| `tests/extraire_comme_n8n.mjs` | Extrait un PDF exactement comme n8n (pdf.js 5.4.296 + même `parseText`) |
| `tests/fixtures/` | Textes extraits de PDF de test (livre, version navigateur avec menus/en-têtes, autre livre, vide, tronqué…) |
| `data/enchiridion.pdf` | Le livre à envoyer dans le formulaire |
| `data/enchiridion_source.txt`, `.json`, `.csv` | Texte de référence, 1 passage par chapitre |

## Développer

```bash
npm install                                        # une fois, à la racine
node chatbot_epictete/scripts/build-workflow.mjs   # après toute modif dans src/
node chatbot_epictete/tests/test.mjs               # doit finir par ✅ Tous les tests passent
```

## Source

*The Enchiridion*, Epictetus, trad. Elizabeth Carter (1758), domaine public. Texte : The Internet Classics Archive (MIT), http://classics.mit.edu/Epictetus/epicench.html
