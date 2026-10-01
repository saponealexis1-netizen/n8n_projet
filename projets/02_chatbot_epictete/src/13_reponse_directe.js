// RÉPONSE DIRECTE (route "conversation" ou "hors_sujet") : pas de recherche, pas d'appel en plus
const r = $input.first().json;
const PAR_DEFAUT = {
  conversation: {
    fr: "Avec plaisir ! Pose-moi tes questions sur le Manuel d'Épictète, je réponds en citant les chapitres.",
    en: "My pleasure! Ask me anything about Epictetus' Enchiridion, I answer citing the chapters.",
  },
  hors_sujet: {
    fr: "Je ne réponds qu'aux questions sur le Manuel d'Épictète.",
    en: "I only answer questions about Epictetus' Enchiridion.",
  },
};
const defaut = PAR_DEFAUT[r.route] ?? PAR_DEFAUT.hors_sujet;
const reponse = r.reponse_directe || defaut[r.langue] || defaut.en;

return [{ json: { sessionId: r.sessionId, question: r.question, reponse, route: r.route, requete: '', chapitres: [] } }];
