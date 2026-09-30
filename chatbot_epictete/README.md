# Chatbot Épictète (n8n)

Chatbot n8n qui répond aux questions sur **le Manuel d'Épictète** (*The Enchiridion*) en s'appuyant uniquement sur le texte (RAG).

## Source

- *The Enchiridion*, Epictetus, traduction **Elizabeth Carter (1758)**, libre de droits.
- Version : The Internet Classics Archive (MIT) : http://classics.mit.edu/Epictetus/epicench.html
- Cette version compte **52 chapitres** (d'autres éditions en comptent 53).

## Données

| Fichier | Contenu |
|---|---|
| `data/enchiridion_source.txt` | Texte brut copié depuis la source (fautes d'origine conservées) |
| `data/enchiridion.json` | 52 passages (1 par chapitre) : `id`, `chapitre`, `source`, `nb_mots`, `texte` |
| `data/enchiridion.csv` | Les mêmes données au format CSV |

52 passages, 7 402 mots au total. Le chapitre le plus court fait 23 mots, le plus long 703 (le chapitre 33).

## Régénérer les passages

```bash
node chatbot_epictete/scripts/decouper.mjs
```

Le script refuse d'écrire les fichiers s'il n'obtient pas exactement 52 chapitres dans l'ordre.
