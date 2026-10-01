// RÉPONSE DIRECTE (route "conversation" ou "hors_sujet") : pas de recherche, pas d'appel en plus
const r = $input.first().json;
const PAR_DEFAUT = {
  conversation: {
    fr: "Bonjour ! Je réponds à tes questions sur le Manuel d'Épictète, en citant les chapitres.",
    en: "Hello! I answer your questions about Epictetus' Enchiridion, citing the chapters.",
  },
  hors_sujet: {
    fr: "Je ne réponds qu'aux questions sur le Manuel d'Épictète.",
    en: "I only answer questions about Epictetus' Enchiridion.",
  },
};
const reponse = r.reponse_directe || PAR_DEFAUT[r.route]?.[r.langue] || PAR_DEFAUT.hors_sujet.fr;

return [{ json: { sessionId: r.sessionId, question: r.question, reponse, route: r.route, requete: '', chapitres: [] } }];
