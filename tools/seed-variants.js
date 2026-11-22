// Writes the JFLAP reference machine of every challenge VARIANT (jflap/levels/<Slot>_<variant>_<role>.jff), then repacks the bundle.
// The variant definitions live in js/game/variants.js; the machine builders live in tools/variant-builders.js.
// After seeding, the .jff files are the source of truth — edit one in JFLAP, save it, run:  node tools/build-levels.js
const T = require('../tests/harness'); T.load(T.FORMAL); T.load(T.GAME);
const fs = require('fs'), path = require('path');
const { F, G } = AM, H = require('./variant-builders')(AM);
const dir = path.join(__dirname, '..', 'jflap', 'levels');
const cache = new Map();
let n = 0;
for (const { key, spec } of G.Variants.fileSpecs()) {
  const [fn, args, pick] = spec;
  const ck = fn + JSON.stringify(args);
  if (!cache.has(ck)) cache.set(ck, H[fn](args));
  let m = cache.get(ck);
  if (pick !== undefined) m = m[pick];
  if (!m) throw new Error('builder returned nothing for ' + key);
  m = JSON.parse(JSON.stringify(m));
  if (m.type !== 'CFG' && m.states.some((s) => s.x === undefined || s.x === 100 && s.y === 100)) m = F.autoLayout(m);
  fs.writeFileSync(path.join(dir, key + '.jff'), F.JFLAP.exportMachine(m)); n++;
}
console.log(n + ' variant .jff files written');
