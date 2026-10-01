// Assemble le workflow n8n importable à partir des nodes Code de src/
// Usage : node projets/02_chatbot_epictete/scripts/build-workflow.mjs
//   -> workflow_chatbot_epictete.json           (Simple Vector Store, en mémoire)
//   -> workflow_chatbot_epictete_supabase.json  (Supabase Vector Store, persistant)
//   -> workflow_chatbot_epictete_hybride.json   (Supabase + recherche hybride vecteurs + mots-clés,
//                                                sur le modèle du flow du prof : Limit + sous-workflow
//                                                + embeddings en HTTP Request + SQL)
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
    modelName: 'models/gemini-embedding-2', // doit être le MÊME dans les 2 nodes d'embeddings
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
    modelName: 'models/gemini-embedding-2', // doit être le MÊME dans les 2 nodes d'embeddings
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

const ecrire = (fichier, wf) => {
  writeFileSync(new URL(fichier, racine), JSON.stringify(wf, null, 2) + '\n');
  console.log(`OK : ${fichier} : ${wf.nodes.length} nodes, ${Object.keys(wf.connections).length} connexions`);
};
ecrire('workflow_chatbot_epictete.json', workflow);

// ---------- Variante SUPABASE ----------
// Même workflow, seuls les 2 vector stores changent + vidage de la table avant insertion
// (Supabase n'a pas d'option "Clear Store"). Table/fonction : supabase/setup.sql
// Noms dédiés : le workflow vide la table, il ne doit jamais toucher la table d'un autre projet
const TABLE = { __rl: true, mode: 'list', value: 'epictete_documents', cachedResultName: 'epictete_documents' };
const SUPABASE_OPTIONS = { queryName: 'match_epictete_documents' };
const decaler = (n, dx) => ({ ...n, position: [n.position[0] + dx, n.position[1]] });
const sousNodesIngestion = ['Embeddings Google Gemini (ingestion)', 'Chargeur de documents', 'Pas de re-découpage (chunks déjà prêts)'];

const supabaseNodes = nodes.flatMap(n => {
  if (n.name === 'Vectorisation (Simple Vector Store)') {
    return [
      { ...node('Vider la table epictete_documents', 'n8n-nodes-base.postgres', 2.5, [1320, 0], {
        operation: 'executeQuery',
        query: 'TRUNCATE TABLE public.epictete_documents RESTART IDENTITY;',
        options: {},
      }), executeOnce: true },  // une seule fois, pas 56
      node('Reprendre les chunks', 'n8n-nodes-base.code', 2, [1560, 0], {
        jsCode: "// Le TRUNCATE ne renvoie qu'un item : on repart des chunks produits par Augmentation\nreturn $('Augmentation').all().map(item => ({ json: item.json }));",
      }),
      node('Vectorisation (Supabase)', '@n8n/n8n-nodes-langchain.vectorStoreSupabase', 1.1, [1820, 0], {
        mode: 'insert',
        tableName: TABLE,
        options: SUPABASE_OPTIONS,
      }),
    ];
  }
  if (n.name === 'Recherche dans le livre') {
    const { memoryKey, ...params } = n.parameters;
    return [node(n.name, '@n8n/n8n-nodes-langchain.vectorStoreSupabase', 1.1, n.position, {
      ...params,
      tableName: TABLE,
      options: SUPABASE_OPTIONS,
    })];
  }
  return [sousNodesIngestion.includes(n.name) ? decaler(n, 500) : n];
});

const supabaseConnections = {
  ...connections,
  'Augmentation': main('Vider la table epictete_documents'),
  'Vider la table epictete_documents': main('Reprendre les chunks'),
  'Reprendre les chunks': main('Vectorisation (Supabase)'),
  'Embeddings Google Gemini (ingestion)': ai('ai_embedding', 'Vectorisation (Supabase)'),
  'Chargeur de documents': ai('ai_document', 'Vectorisation (Supabase)'),
};

ecrire('workflow_chatbot_epictete_supabase.json', {
  ...workflow,
  name: "Chatbot RAG - Manuel d'Épictète (Supabase)",
  nodes: supabaseNodes,
  connections: supabaseConnections,
});

// ---------- Variante HYBRIDE (vecteurs + mots-clés) ----------
// Structure du flow du prof : … Chunking → Limit → sous-workflow → Embedding (HTTP) → SQL.
// n8n n'autorise qu'UN déclencheur "appelé par un autre workflow" par workflow : le sous-workflow
// sert donc à indexer (appelé par l'ingestion) ET à rechercher (appelé par l'outil de l'agent).
// Table et fonctions SQL : supabase/setup_hybride.sql
const MODELE_EMBEDDING = 'models/gemini-embedding-2';
const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const LUI_MEME = { __rl: true, mode: 'id', value: '={{ $workflow.id }}' };  // le workflow s'appelle lui-même
const TRIGGER_SOUS_WF = 'Sous-workflow : indexer ou rechercher';
const httpGemini = (name, position, url, jsonBody) => node(name, 'n8n-nodes-base.httpRequest', 4.2, position, {
  method: 'POST',
  url,
  authentication: 'predefinedCredentialType',
  nodeCredentialType: 'googlePalmApi',   // même credential Gemini que le chat (clé ajoutée en ?key=)
  sendBody: true,
  specifyBody: 'json',
  jsonBody,
  options: {},
});
const postgres = (name, position, query, valeurs, extra = {}) => ({
  ...node(name, 'n8n-nodes-base.postgres', 2.5, position, {
    operation: 'executeQuery',
    query,
    options: { queryReplacement: valeurs },
  }),
  ...extra,
});

const garder = ['Formulaire : envoyer le livre (PDF)', 'Extraire le texte du PDF', 'Nettoyage', 'Chunking', 'Augmentation',
  'Chat : question sur le livre', 'Google Gemini Chat Model', 'Mémoire de la conversation'];
const hybrideNodes = [
  ...nodes.filter(n => garder.includes(n.name)),

  // INGESTION (suite) : comme le prof, Limit puis appel du sous-workflow
  node('Mots-clés', 'n8n-nodes-base.code', 2, [1300, 0], { jsCode: code('4_mots_cles.js') }),
  // 100 = borne haute du prof (10 à 100 chunks) ET maximum de textes par appel batchEmbedContents.
  // Nos 56 chunks passent tous ; mettre 3 pour tester sans consommer de quota.
  node('Limit', 'n8n-nodes-base.limit', 1, [1560, 0], { maxItems: 100, keep: 'firstItems' }),
  node('Vectoriser (sous-workflow)', 'n8n-nodes-base.executeWorkflow', 1.2, [1820, 0], {
    source: 'database',
    workflowId: LUI_MEME,
    mode: 'once',
    options: { waitForSubWorkflow: true },
  }),

  // SOUS-WORKFLOW
  node(TRIGGER_SOUS_WF, 'n8n-nodes-base.executeWorkflowTrigger', 1.1, [0, 1400], { inputSource: 'passthrough' }),
  node('Rechercher ?', 'n8n-nodes-base.if', 2.2, [260, 1400], {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      conditions: [{
        id: id('condition-rechercher'),
        leftValue: '={{ $json.action }}',
        rightValue: 'rechercher',
        operator: { type: 'string', operation: 'equals' },
      }],
      combinator: 'and',
    },
    options: {},
  }),
  // … branche RECHERCHER (appelée par l'outil de l'agent)
  httpGemini('Embedding de la question (Gemini)', [560, 1300], `=${GEMINI}/${MODELE_EMBEDDING}:embedContent`,
    `={{ JSON.stringify({ model: '${MODELE_EMBEDDING}', content: { parts: [{ text: $json.query }] } }) }}`),
  postgres('Recherche hybride (SQL)', [820, 1300],
    'select * from epictete_recherche_hybride($1, $2::vector, 4);',
    `={{ [ $('${TRIGGER_SOUS_WF}').item.json.query, '[' + $json.embedding.values.join(',') + ']' ] }}`,
    { alwaysOutputData: true }),  // 0 résultat → 1 item vide, pour que l'agent reçoive quand même une réponse
  node('Formater les passages', 'n8n-nodes-base.code', 2, [1080, 1300], { jsCode: code('7_formater_passages.js') }),
  // … branche INDEXER (appelée par l'ingestion)
  node('Préparer les embeddings', 'n8n-nodes-base.code', 2, [560, 1520], { jsCode: code('5_preparer_embeddings.js') }),
  httpGemini('Embedding des chunks (Gemini)', [820, 1520], `=${GEMINI}/{{ $json.modele }}:batchEmbedContents`,
    '={{ JSON.stringify({ requests: $json.requests }) }}'),
  node('Préparer les lignes', 'n8n-nodes-base.code', 2, [1080, 1520], { jsCode: code('6_preparer_lignes.js') }),
  postgres('Enregistrer dans Supabase (SQL)', [1340, 1520],
    'select epictete_reindexer($1::jsonb) as nb_chunks_enregistres;',
    '={{ [ $json.payload ] }}'),

  // CHAT : même agent, l'outil passe par le sous-workflow (recherche hybride)
  node('Agent Épictète', '@n8n/n8n-nodes-langchain.agent', 2.2, [520, 700], {
    promptType: 'define',
    text: '={{ $json.chatInput }}',
    options: {
      systemMessage: SYSTEM_MESSAGE.replace('5. Si on te parle',
        "5. L'outil fait une recherche hybride (sens + mots-clés). Le livre est en anglais : envoie-lui une requête courte EN ANGLAIS avec les mots importants de la question (ex. « death fear Socrates »), même si la question est en français.\n6. Si on te parle").replace('6. Sois clair', '7. Sois clair'),
    },
  }),
  node('Recherche hybride dans le livre', '@n8n/n8n-nodes-langchain.toolWorkflow', 1.3, [760, 940], {
    name: 'manuel_epictete',
    description: "Recherche hybride (sens + mots-clés) dans le Manuel d'Épictète (The Enchiridion, trad. E. Carter, en anglais). Entrée : une requête courte en anglais avec les mots importants. Sortie : les 4 passages les plus pertinents avec leur chapitre. À utiliser pour toute question sur le contenu du livre.",
    source: 'database',
    workflowId: LUI_MEME,
    fields: { values: [{ name: 'action', type: 'stringValue', stringValue: 'rechercher' }] },
  }),
];

const hybrideConnections = {
  'Formulaire : envoyer le livre (PDF)': main('Extraire le texte du PDF'),
  'Extraire le texte du PDF': main('Nettoyage'),
  'Nettoyage': main('Chunking'),
  'Chunking': main('Augmentation'),
  'Augmentation': main('Mots-clés'),
  'Mots-clés': main('Limit'),
  'Limit': main('Vectoriser (sous-workflow)'),
  [TRIGGER_SOUS_WF]: main('Rechercher ?'),
  'Rechercher ?': { main: [
    [{ node: 'Embedding de la question (Gemini)', type: 'main', index: 0 }],
    [{ node: 'Préparer les embeddings', type: 'main', index: 0 }],
  ] },
  'Embedding de la question (Gemini)': main('Recherche hybride (SQL)'),
  'Recherche hybride (SQL)': main('Formater les passages'),
  'Préparer les embeddings': main('Embedding des chunks (Gemini)'),
  'Embedding des chunks (Gemini)': main('Préparer les lignes'),
  'Préparer les lignes': main('Enregistrer dans Supabase (SQL)'),
  'Chat : question sur le livre': main('Agent Épictète'),
  'Google Gemini Chat Model': ai('ai_languageModel', 'Agent Épictète'),
  'Mémoire de la conversation': ai('ai_memory', 'Agent Épictète'),
  'Recherche hybride dans le livre': ai('ai_tool', 'Agent Épictète'),
};

ecrire('workflow_chatbot_epictete_hybride.json', {
  ...workflow,
  name: "Chatbot RAG - Manuel d'Épictète (recherche hybride)",
  nodes: hybrideNodes,
  connections: hybrideConnections,
});
