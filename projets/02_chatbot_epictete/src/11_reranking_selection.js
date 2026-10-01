// 5. RERANKING (sélection) : garde les meilleurs passages, puis prépare l'appel de GENERATION
const NB_MAX = 4;     // passages envoyés à la génération
const NOTE_MIN = 5;   // note minimale sur 10

const r = $('3. Routing : lire la décision').first().json;
const { candidats } = $('5. Reranking : préparer').first().json;
const brut = $input.first().json?.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';

let notes = null;
try {
  const d = JSON.parse(brut.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
  notes = new Map((d.scores ?? []).map(s => [Number(s.id), Number(s.score)]));
} catch (e) {
  notes = null;
}

let gardes;
if (notes && notes.size) {
  gardes = candidats
    .map((c, i) => ({ ...c, note: notes.get(i + 1) ?? 0, rang_hybride: i + 1 }))
    .filter(c => c.note >= NOTE_MIN || (r.chapitre && c.chapitre === r.chapitre))  // chapitre demandé : toujours gardé
    .sort((a, b) => (b.chapitre === r.chapitre) - (a.chapitre === r.chapitre) || b.note - a.note || a.rang_hybride - b.rang_hybride)
    .slice(0, NB_MAX);
} else {
  // notation illisible : on se fie à l'ordre de la recherche hybride
  gardes = candidats.slice(0, NB_MAX).map((c, i) => ({ ...c, note: null, rang_hybride: i + 1 }));
}

const CONSIGNES_GENERATION = `Tu es un guide du Manuel d'Épictète (The Enchiridion, traduction d'Elizabeth Carter).
Règles :
1. Réponds UNIQUEMENT à partir des passages fournis. N'utilise jamais tes connaissances générales et n'invente rien.
2. Si les passages ne permettent pas de répondre, dis simplement que tu ne trouves pas cette information dans le Manuel d'Épictète.
3. Réponds en ${r.langue === 'en' ? 'anglais' : 'français'}, de façon claire et concise.
4. Cite tes sources avec le numéro de chapitre, par ex. (Chapitre 5) ou (Chapter 5). Tu peux citer de courts extraits en anglais d'origine, entre guillemets.`;

const passages = gardes.map(c => `--- Chapitre ${c.chapitre}${c.content.includes('(part ') ? `, partie ${c.partie}` : ''}\n${c.content}`).join('\n\n');

return [{
  json: {
    gardes: gardes.map(c => ({ chapitre: c.chapitre, partie: c.partie, note: c.note, rang_hybride: c.rang_hybride })),
    chapitres: [...new Set(gardes.map(c => c.chapitre))],
    corps_generation: {
      systemInstruction: { parts: [{ text: CONSIGNES_GENERATION }] },
      contents: [{ role: 'user', parts: [{ text: `Historique de la conversation :\n${r.historique}\n\nQuestion : ${r.question}\n\nPassages du Manuel :\n\n${passages || '(aucun passage pertinent trouvé)'}` }] }],
      generationConfig: { temperature: 0.2 },
    },
  },
}];
