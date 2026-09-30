// Assemble le workflow n8n importable à partir des nodes Code de src/
// Usage : node chatbot_epictete/scripts/build-workflow.mjs  -> chatbot_epictete/workflow_chatbot_epictete.json
//
// Types et versions des nodes vérifiés dans les définitions officielles
// (@n8n/n8n-nodes-langchain 2.41.3 et n8n-nodes-base 2.41.3, dossier dist/node-definitions).
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const racine = new URL('../', import.meta.url);
const code = f => readFileSync(new URL(`src/${f}`, racine), 'utf8');

const MEMORY_KEY = 'enchiridion';
const BINAIRE_PDF = 'Livre_PDF'; // formTrigger 2.2 : nom du binaire = libellé du champ, \W remplacé par "_"

// ID stable pour chaque node (réimporter donne les mêmes IDs)
const id = nom => {
  const h = createHash('sha1').update(nom).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const node = (name, type, typeVersion, position, parameters = {}) =>
  ({ parameters, id: id(name), name, type, typeVersion, position });

const SYSTEM_MESSAGE = `Tu es un guide du Manuel d'Épictète (« The Enchiridion », traduction anglaise d'Elizabeth Carter, 52 chapitres).

Règles :
1. Pour toute question sur le contenu, cherche TOUJOURS d'abord dans le livre avec l'outil « manuel_epictete ».
2. Réponds UNIQUEMENT à partir des passages trouvés. S'ils ne contiennent pas la réponse, dis simplement que tu ne trouves pas cette information dans le Manuel d'Épictète. N'utilise jamais tes connaissances générales et n'invente rien.
3. Réponds dans la langue de la question (français → français, anglais → anglais).
4. Cite toujours tes sources avec le numéro de chapitre, par ex. (Chapitre 5) ou (Chapter 5). Tu peux citer de courts extraits en anglais d'origine, entre guillemets.
5. Si on te parle d'un chapitre précis (« chapitre 8 », « le chapitre suivant »), utilise l'historique de la conversation pour trouver son numéro et cherche « Enchiridion – Chapter N ».
6. Sois clair et concis.`;

const nodes = [
  // ---------- INGESTION ----------
  node('Formulaire : envoyer le livre (PDF)', 'n8n-nodes-base.formTrigger', 2.2, [0, 0], {
    formTitle: "Chatbot Épictète : charger le livre",
    formDescription: "Envoie le PDF du Manuel d'Épictète (The Enchiridion, trad. E. Carter). Il sera nettoyé, découpé et indexé ; les indexations précédentes sont remplacées.",
    formFields: {
      values: [{ fieldLabel: 'Livre PDF', fieldType: 'file', acceptFileTypes: '.pdf', multipleFiles: false, requiredField: true }],
    },
    responseMode: 'lastNode',
    options: {
      appendAttribution: false,
      buttonLabel: 'Indexer le livre',
      respondWithOptions: {
        values: { respondWith: 'text', formSubmittedText: 'Livre indexé ✅ Tu peux maintenant poser tes questions dans le chat.' },
      },
    },
  }),
  node('Extraire le texte du PDF', 'n8n-nodes-base.extractFromFile', 1, [260, 0], {
    operation: 'pdf',
    binaryPropertyName: BINAIRE_PDF,
    options: {},
  }),
  node('Nettoyage', 'n8n-nodes-base.code', 2, [520, 0], { jsCode: code('1_nettoyage.js') }),
  node('Chunking', 'n8n-nodes-base.code', 2, [780, 0], { jsCode: code('2_chunking.js') }),
  node('Augmentation', 'n8n-nodes-base.code', 2, [1040, 0], { jsCode: code('3_augmentation.js') }),
  node('Vectorisation (Simple Vector Store)', '@n8n/n8n-nodes-langchain.vectorStoreInMemory', 1.1, [1320, 0], {
    mode: 'insert',
    memoryKey: MEMORY_KEY,
    clearStore: true,        // v1.1 : vidé une seule fois par lot (v1 viderait avant CHAQUE chunk)
    embeddingBatchSize: 200, // tous les chunks (~60) dans un seul lot
  }),
  node('Embeddings Google Gemini (ingestion)', '@n8n/n8n-nodes-langchain.embeddingsGoogleGemini', 1, [1240, 240], {
    modelName: 'models/gemini-embedding-002', // doit être le MÊME dans les 2 nodes d'embeddings
  }),
  node('Chargeur de documents', '@n8n/n8n-nodes-langchain.documentDefaultDataLoader', 1.1, [1480, 240], {
    jsonMode: 'expressionData',
    jsonData: '={{ $json.texte }}',
    textSplittingMode: 'custom',
    options: {
      metadata: {
        metadataValues: ['chapitre', 'partie', 'livre', 'traduction', 'source', 'nb_mots']
          .map(name => ({ name, value: `={{ $json.${name} }}` })),
      },
    },
  }),
  // Le mode "simple" redécouperait tout à 1000 caractères : on garde nos chunks tels quels
  node('Pas de re-découpage (chunks déjà prêts)', '@n8n/n8n-nodes-langchain.textSplitterRecursiveCharacterTextSplitter', 1, [1560, 440], {
    chunkSize: 6000,
    chunkOverlap: 0,
    options: {},
  }),

  // ---------- CHAT ----------
  node('Chat : question sur le livre', '@n8n/n8n-nodes-langchain.chatTrigger', 1.1, [0, 700], {
    options: {},
  }),
  node('Agent Épictète', '@n8n/n8n-nodes-langchain.agent', 2.2, [520, 700], {
    promptType: 'define',
    text: '={{ $json.chatInput }}',
    options: { systemMessage: SYSTEM_MESSAGE },
  }),
  node('Google Gemini Chat Model', '@n8n/n8n-nodes-langchain.lmChatGoogleGemini', 1, [300, 940], {
    modelName: 'models/gemini-flash-lite-latest', // modèle validé dans n8n (gemini-2.5-flash : 404 pour les nouveaux utilisateurs)
    options: { temperature: 0.2 },
  }),
  node('Mémoire de la conversation', '@n8n/n8n-nodes-langchain.memoryBufferWindow', 1.3, [520, 940], {
    contextWindowLength: 10,
  }),
  node('Recherche dans le livre', '@n8n/n8n-nodes-langchain.vectorStoreInMemory', 1.1, [760, 940], {
    mode: 'retrieve-as-tool',
    toolName: 'manuel_epictete',
    toolDescription: "Recherche les passages du Manuel d'Épictète (The Enchiridion, trad. E. Carter) les plus proches de la question. Chaque passage indique son chapitre. À utiliser pour toute question sur le contenu du livre.",
    memoryKey: MEMORY_KEY,
    topK: 4,
  }),
  node('Embeddings Google Gemini (chat)', '@n8n/n8n-nodes-langchain.embeddingsGoogleGemini', 1, [760, 1160], {
    modelName: 'models/gemini-embedding-002', // doit être le MÊME dans les 2 nodes d'embeddings
  }),
];

const main = to => ({ main: [[{ node: to, type: 'main', index: 0 }]] });
const ai = (type, to) => ({ [type]: [[{ node: to, type, index: 0 }]] });

const connections = {
  'Formulaire : envoyer le livre (PDF)': main('Extraire le texte du PDF'),
  'Extraire le texte du PDF': main('Nettoyage'),
  'Nettoyage': main('Chunking'),
  'Chunking': main('Augmentation'),
  'Augmentation': main('Vectorisation (Simple Vector Store)'),
  'Embeddings Google Gemini (ingestion)': ai('ai_embedding', 'Vectorisation (Simple Vector Store)'),
  'Chargeur de documents': ai('ai_document', 'Vectorisation (Simple Vector Store)'),
  'Pas de re-découpage (chunks déjà prêts)': ai('ai_textSplitter', 'Chargeur de documents'),
  'Chat : question sur le livre': main('Agent Épictète'),
  'Google Gemini Chat Model': ai('ai_languageModel', 'Agent Épictète'),
  'Mémoire de la conversation': ai('ai_memory', 'Agent Épictète'),
  'Recherche dans le livre': ai('ai_tool', 'Agent Épictète'),
  'Embeddings Google Gemini (chat)': ai('ai_embedding', 'Recherche dans le livre'),
};

const workflow = {
  name: "Chatbot RAG - Manuel d'Épictète",
  nodes,
  connections,
  settings: { executionOrder: 'v1' },
  pinData: {},
};

writeFileSync(new URL('workflow_chatbot_epictete.json', racine), JSON.stringify(workflow, null, 2) + '\n');
console.log(`OK : ${nodes.length} nodes, ${Object.keys(connections).length} connexions`);
