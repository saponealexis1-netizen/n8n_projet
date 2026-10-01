// 2. CONTEXT : rassemble la question, la session et les derniers échanges, puis prépare le prompt du ROUTING
// Entrée : lignes de "Context : historique (SQL)" (0 à 3 échanges, du plus ancien au plus récent)
const { chatInput, sessionId } = $('1. Input (chat)').first().json;
const question = String(chatInput ?? '').trim();
const echanges = $input.all().map(i => i.json).filter(e => e.question);
const historique = echanges.length
  ? echanges.map(e => `Utilisateur : ${e.question}\nAssistant : ${e.reponse}` + (e.chapitres?.length ? `\n[chapitres utilisés : ${e.chapitres.join(', ')}]` : '')).join('\n\n')
  : '(début de la conversation)';

const CONSIGNES_ROUTING = `Tu es le module de ROUTING d'un chatbot sur le Manuel d'Épictète (The Enchiridion, trad. Elizabeth Carter, 52 chapitres, en anglais).
Analyse la dernière question en tenant compte de l'historique, puis réponds UNIQUEMENT avec ce JSON :
{"route": "livre" | "conversation" | "hors_sujet", "requete": "...", "chapitre": nombre ou null, "langue": "code à 2 lettres (fr, en, es…)", "reponse_directe": "..."}

- route = "livre" : la question porte sur le contenu du Manuel, sur Épictète ou le stoïcisme tel qu'il est présenté dans le livre, ou demande un chapitre.
- route = "conversation" : salutation, remerciement, question sur toi-même (« bonjour », « merci », « tu sais faire quoi ? »).
- route = "hors_sujet" : tout le reste (actualité, maths, autre livre, code…).
- requete (si route = "livre") : requête de recherche AUTONOME, EN ANGLAIS, avec les mots importants. Résous les références grâce à l'historique et aux « chapitres utilisés » (« et le suivant ? » après le chapitre 8 → "Enchiridion – Chapter 9"). Si un chapitre est demandé, commence par "Enchiridion – Chapter N".
- chapitre : le numéro du chapitre demandé explicitement (ou déduit de l'historique), sinon null.
- langue : la langue de la DERNIÈRE question.
- reponse_directe (si route ≠ "livre") : réponse courte et polie dans cette langue. Pour "hors_sujet", explique que tu ne réponds qu'aux questions sur le Manuel d'Épictète.`;

return [{
  json: {
    sessionId,
    question,
    historique,
    prompt_routing: {
      systeme: CONSIGNES_ROUTING,
      message: `Historique :\n${historique}\n\nDernière question : ${question}`,
    },
  },
}];
