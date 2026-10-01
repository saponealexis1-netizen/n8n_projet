// 3. ROUTING : lit la décision du LLM et la sécurise (une réponse illisible ne doit jamais bloquer le chat)
const ctx = $('2. Context : construire').first().json;
const brut = $input.first().json?.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';

let d = {};
try {
  d = JSON.parse(brut.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));  // tolère un bloc ```json
} catch (e) {
  d = {};
}

const ROUTES = ['livre', 'conversation', 'hors_sujet'];
const route = ROUTES.includes(d.route) ? d.route : 'livre';  // en cas de doute : on cherche dans le livre
const chapitre = Number.isInteger(Number(d.chapitre)) && Number(d.chapitre) >= 1 && Number(d.chapitre) <= 52 ? Number(d.chapitre) : null;
const langue = /^[a-z]{2}$/.test(String(d.langue ?? '').toLowerCase()) ? String(d.langue).toLowerCase() : 'fr';  // code à 2 lettres
let requete = String(d.requete ?? '').trim() || ctx.question;
if (chapitre && !/chapter\s+\d+/i.test(requete)) requete = `Enchiridion – Chapter ${chapitre} ${requete}`;

return [{
  json: {
    sessionId: ctx.sessionId,
    question: ctx.question,
    historique: ctx.historique,
    route,
    requete,
    chapitre,
    langue,
    reponse_directe: String(d.reponse_directe ?? '').trim(),
    routing_lisible: Object.keys(d).length > 0,
  },
}];
