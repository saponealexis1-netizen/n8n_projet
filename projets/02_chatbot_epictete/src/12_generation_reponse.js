// 6. GENERATION : récupère le texte de Gemini et prépare l'enregistrement de l'échange
const r = $('3. Routing : lire la décision').first().json;
const { chapitres } = $('5. Reranking : garder les meilleurs').first().json;
const texte = ($input.first().json?.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('').trim();

const reponse = texte || (r.langue === 'en'
  ? "Sorry, I couldn't generate an answer. Please try again."
  : "Désolé, je n'ai pas pu générer de réponse. Réessaie.");

return [{ json: { sessionId: r.sessionId, question: r.question, reponse, route: r.route, requete: r.requete, chapitres } }];
