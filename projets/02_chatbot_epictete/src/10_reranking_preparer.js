// 5. RERANKING (préparation) : numérote les candidats de la recherche hybride et demande à Gemini de les noter
const r = $('3. Routing : lire la décision').first().json;
const candidats = $input.all().map(i => i.json).filter(c => c.content);

const CONSIGNES_RERANKING = `Tu es le module de RERANKING d'un chatbot sur le Manuel d'Épictète.
Pour chaque passage, note de 0 à 10 à quel point il aide à répondre à la question (10 = répond directement, 0 = sans rapport).
Réponds UNIQUEMENT avec ce JSON : {"scores": [{"id": <numéro du passage>, "score": <0 à 10>}, ...]} en notant TOUS les passages.`;

const liste = candidats.map((c, i) => `[${i + 1}] (chapitre ${c.chapitre})\n${c.content}`).join('\n\n');

return [{
  json: {
    candidats,
    corps_reranking: {
      systemInstruction: { parts: [{ text: CONSIGNES_RERANKING }] },
      contents: [{ role: 'user', parts: [{ text: `Question : ${r.question}\nRequête de recherche : ${r.requete}\n\nPassages :\n\n${liste || '(aucun)'}` }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json' },
    },
  },
}];
