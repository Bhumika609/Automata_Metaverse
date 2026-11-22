/* Minimal zero-dependency test harness + loader shared by all test files. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
/** load browser scripts into this Node process, in the order index.html uses */
function load(files) {
  for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
}
const FORMAL = ['js/formal/core.js', 'js/formal/fa.js', 'js/formal/cfg.js', 'js/formal/pda.js', 'js/formal/tm.js', 'js/formal/jflap.js', 'js/formal/jflap_tools.js'];
const GAME = ['js/game/data.js', 'js/game/scoring.js', 'js/game/store.js', 'js/game/achievements.js', 'js/game/jflap_levels.js', 'js/game/challenges.js', 'js/game/variants.js', 'js/game/engine.js'];

const results = { pass: 0, fail: 0, failures: [] };
let currentSuite = '';
function suite(name, fn) { currentSuite = name; console.log('\n▸ ' + name); fn(); }
function test(name, fn) {
  try { fn(); results.pass++; console.log('  ✓ ' + name); }
  catch (e) { results.fail++; results.failures.push(`${currentSuite} › ${name}: ${e.message}`); console.log('  ✗ ' + name + '\n      ' + e.message); }
}
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
function eq(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'not equal') + `: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function summary() {
  console.log(`\n${results.pass} passed, ${results.fail} failed`);
  if (results.fail) { console.log('\nFAILURES:\n' + results.failures.map((f) => ' - ' + f).join('\n')); process.exitCode = 1; }
}
module.exports = { load, FORMAL, GAME, suite, test, assert, eq, summary, results };
