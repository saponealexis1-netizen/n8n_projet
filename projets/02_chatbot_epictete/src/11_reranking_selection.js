// 5. RERANKING (sélection) : garde les meilleurs passages, puis prépare le prompt de la GENERATION
const NB_MAX = 4;     // passages envoyés à la génération
const NOTE_MIN = 5;   // note minimale sur 10

const r = $('3. Routing : lire la décision').first().json;
const { candidats } = $('5. Reranking : préparer').first().json;
// Sortie du node Google Gemini (simplify désactivé) : { candidates: [{ content: { parts: [{ text }] } }] }
const brut = $input.first().json?.candidates?.[0]?.content?.parts?.map(p => p.text ?? '').join('') ?? '';

// Notes valides uniquement : id = numéro de passage existant (1 à N), score lisible entre 0 et 10.
// Accepte {id, score} ou {passage, note}, et les scores en texte ("8/10" → 8).
let notes = new Map();
try {
  const d = JSON.parse(brut.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, ''));
  for (const s of d.scores ?? d.notes ?? []) {
    const idPassage = Number(s.id ?? s.passage);
    const note = parseFloat(String(s.score ?? s.note));
    if (Number.isInteger(idPassage) && idPassage >= 1 && idPassage <= candidats.length && Number.isFinite(note)) {
      notes.set(idPassage, Math.min(10, Math.max(0, note)));
    }
  }
} catch (e) {
  notes = new Map();
}

let gardes;
if (notes.size) {
  gardes = candidats
    .map((c, i) => ({ ...c, note: notes.get(i + 1) ?? 0, rang_hybride: i + 1 }))
    .filter(c => c.note >= NOTE_MIN || (r.chapitre && c.chapitre === r.chapitre))  // chapitre demandé : toujours gardé
    .sort((a, b) => (b.chapitre === r.chapitre) - (a.chapitre === r.chapitre) || b.note - a.note || a.rang_hybride - b.rang_hybride)
    .slice(0, NB_MAX);
} else {
  // aucune note valide (JSON illisible ou mal formé) : on se fie à l'ordre de la recherche hybride
  gardes = candidats.slice(0, NB_MAX).map((c, i) => ({ ...c, note: null, rang_hybride: i + 1 }));
}

const CONSIGNES_GENERATION = `Tu es un guide du Manuel d'Épictète (The Enchiridion, traduction d'Elizabeth Carter).
Règles :
1. Réponds UNIQUEMENT à partir des passages fournis. N'utilise jamais tes connaissances générales et n'invente rien.
2. Si les passages ne permettent pas de répondre, dis simplement que tu ne trouves pas cette information dans le Manuel d'Épictète.
3. ${r.langue === 'fr' ? 'Réponds en français' : r.langue === 'en' ? 'Réponds en anglais' : `Réponds dans cette langue : ${r.langue}`}, de façon claire et concise.
4. Cite tes sources avec le numéro de chapitre, par ex. (Chapitre 5) ou (Chapter 5). Tu peux citer de courts extraits en anglais d'origine, entre guillemets.`;

const passages = gardes.map(c => `--- Chapitre ${c.chapitre}${c.content.includes('(part ') ? `, partie ${c.partie}` : ''}\n${c.content}`).join('\n\n');

return [{
  json: {
    gardes: gardes.map(c => ({ chapitre: c.chapitre, partie: c.partie, note: c.note, rang_hybride: c.rang_hybride })),
    chapitres: [...new Set(gardes.map(c => c.chapitre))],
    prompt_generation: {
      systeme: CONSIGNES_GENERATION,
      message: `Historique de la conversation :\n${r.historique}\n\nQuestion : ${r.question}\n\nPassages du Manuel :\n\n${passages || '(aucun passage pertinent trouvé)'}`,
    },
  },
}];
