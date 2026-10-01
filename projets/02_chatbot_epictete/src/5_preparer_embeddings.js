// PRÉPARER LES EMBEDDINGS : regroupe les chunks en requêtes batchEmbedContents pour l'API Gemini
// (100 textes maximum par appel → 1 seul appel pour nos 56 chunks)
const MODELE = 'models/gemini-embedding-002';  // le même modèle doit servir pour les questions
const PAR_APPEL = 100;

const chunks = $input.all().map(i => i.json);
if (chunks.length === 0) throw new Error('Aucun chunk reçu : rien à indexer.');

const lots = [];
for (let i = 0; i < chunks.length; i += PAR_APPEL) {
  const lot = chunks.slice(i, i + PAR_APPEL);
  lots.push({
    json: {
      modele: MODELE,
      chunks: lot,
      requests: lot.map(c => ({ model: MODELE, content: { parts: [{ text: c.texte }] } })),
    },
  });
}
return lots;
