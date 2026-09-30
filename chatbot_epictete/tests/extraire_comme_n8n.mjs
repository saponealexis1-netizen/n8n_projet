// Reproduit l'extraction PDF du node n8n "Extract from File" (opération PDF) :
// même librairie (pdfjs-dist 5.4.296) et même fonction parseText que n8n-nodes-base 2.41.3 (utils/binary.js).
// Usage : node extraire_comme_n8n.mjs <fichier.pdf>  -> écrit le JSON { text, numpages } sur la sortie standard
import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const parseText = (textContent) => {
  let lastY = undefined;
  const text = [];
  for (const item of textContent.items) {
    if ('str' in item) {
      if (lastY == item.transform[5] || !lastY) text.push(item.str);
      else text.push(`\n${item.str}`);
      lastY = item.transform[5];
    }
  }
  return text.join('');
};

const doc = await getDocument({ data: new Uint8Array(readFileSync(process.argv[2])) }).promise;
const pages = [];
for (let i = 1; i <= doc.numPages; i++) pages.push(await (await doc.getPage(i)).getTextContent().then(parseText));
console.log(JSON.stringify([{ text: pages.join('\n\n'), numpages: doc.numPages }]));
