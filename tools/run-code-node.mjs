// Exécute un node Code d'un workflow n8n hors de n8n, avec des entrées simulées.
// Usage :
//   node tools/run-code-node.mjs <workflow.json> "<Nom du node>" <input.json> [--ref "Nom=fichier.json"] [--now 2026-09-28T09:30]
// - input.json : tableau d'objets (le contenu de chaque item.json)
// - --ref      : sortie simulée d'un autre node, lue par $('Nom') (répétable)
// - --now      : fige DateTime.now() / $now (heure de Paris) pour tester une date précise
import { readFileSync } from 'node:fs';
import { DateTime, Settings } from 'luxon';

const [wfPath, nodeName, inputPath, ...rest] = process.argv.slice(2);
if (!wfPath || !nodeName || !inputPath) {
  console.error('Usage: node tools/run-code-node.mjs <workflow.json> "<Nom du node>" <input.json> [--ref "Nom=f.json"] [--now ISO]');
  process.exit(2);
}

const readJson = p => JSON.parse(readFileSync(p, 'utf8'));
const toItems = arr => arr.map((json, i) => ({ json, pairedItem: { item: i } }));

const refs = {};
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === '--ref') {
    const [name, file] = rest[++i].split('=');
    refs[name] = toItems(readJson(file));
  } else if (rest[i] === '--now') {
    const fixed = DateTime.fromISO(rest[++i], { zone: 'Europe/Paris' }).toMillis();
    Settings.now = () => fixed;
  }
}

const node = readJson(wfPath).nodes.find(n => n.name === nodeName);
if (!node?.parameters?.jsCode) {
  console.error(`Node Code introuvable : "${nodeName}"`);
  process.exit(2);
}

const items = toItems(readJson(inputPath));
const $input = { all: () => items, first: () => items[0], last: () => items.at(-1) };
const $ = name => {
  const out = refs[name];
  if (!out) throw new Error(`$('${name}') non simulé : ajoute --ref "${name}=fichier.json"`);
  return {
    all: () => out,
    first: () => out[0],
    item: out[0],
    itemMatching: i => out[items[i]?.pairedItem?.item ?? i],
  };
};

const run = new Function('$input', '$', 'DateTime', '$now', `return (async () => {\n${node.parameters.jsCode}\n})();`);
try {
  const result = await run($input, $, DateTime, DateTime.now().setZone('Europe/Paris'));
  console.log(JSON.stringify(result.map(r => r.json), null, 2));
} catch (e) {
  console.error(`ERREUR dans "${nodeName}" : ${e.message}`);
  process.exit(1);
}
