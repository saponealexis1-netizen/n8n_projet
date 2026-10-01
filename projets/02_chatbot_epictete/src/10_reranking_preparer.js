// 5. RERANKING (préparation) : numérote les candidats de la recherche hybride et demande à Gemini de les noter
const r = $('3. Routing : lire la décision').first().json;
const candidats = $input.all().map(i => i.json).filter(c => c.content);

const CONSIGNES_RERANKING = `Tu es le module de RERANKING d'un chatbot sur le Manuel d'Épictète.
Pour chaque passage, note de 0 à 10 à quel point il aide à répondre à la question (10 = répond directement, 0 = sans rapport).
Réponds UNIQUEMENT avec ce JSON, en notant TOUS les passages :
{"scores": [{"id": 1, "score": 8}, {"id": 2, "score": 0}, ...]}
"id" = le numéro entre crochets du passage (pas le numéro de chapitre), "score" = un nombre de 0 à 10.`;

const liste = candidats.map((c, i) => `[${i + 1}] (chapitre ${c.chapitre})\n${c.content}`).join('\n\n');

return [{
  json: {
    candidats,
    prompt_reranking: {
      systeme: CONSIGNES_RERANKING,
      message: `Question : ${r.question}\nRequête de recherche : ${r.requete}\n\nPassages :\n\n${liste || '(aucun)'}`,
    },
  },
}];
