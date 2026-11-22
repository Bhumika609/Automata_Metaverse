/* ============================================================================
 * FORMAL LAYER · JFLAP bridge — read & write real JFLAP (.jff) files
 *   fa → DFA/NFA/ε-NFA     pda → PDA     turing → TM     grammar → CFG
 * Every machine built in Automata Metaverse can be opened in JFLAP, and every
 * JFLAP machine can be imported here (to verify it against a challenge).
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const F = AM.F;
  const J = (F.JFLAP = {});
  const isEps = F.isEps;

  /* ---------- tiny XML parser (works in browser and Node) ---------- */
  const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  J.parseXML = function (xml) {
    let i = 0;
    const root = { tag: '#root', attrs: {}, children: [], text: '' };
    const stack = [root];
    xml = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');
    const re = /<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(xml))) {
      if (m[5] !== undefined) { const top = stack[stack.length - 1]; top.text += unesc(m[5]); continue; }
      const [, closing, tag, attrStr, selfClose] = m;
      if (closing) { if (stack.length > 1) stack.pop(); continue; }
      const attrs = {};
      attrStr.replace(/([\w:.-]+)\s*=\s*"([^"]*)"/g, (_, k, v) => { attrs[k] = unesc(v); return ''; });
      const node = { tag, attrs, children: [], text: '' };
      stack[stack.length - 1].children.push(node);
      if (!selfClose) stack.push(node);
    }
    return root.children[0] || null;
  };
  const kid = (n, tag) => n.children.find((c) => c.tag === tag);
  const kids = (n, tag) => n.children.filter((c) => c.tag === tag);
  const txt = (n, tag) => { const k = kid(n, tag); return k ? k.text.trim() : ''; };

  /* ---------- export ---------- */
  J.exportMachine = function (m) {
    const L = ['<?xml version="1.0" encoding="UTF-8" standalone="no"?><!--Created with Automata Metaverse (JFLAP-compatible).-->', '<structure>'];
    if (m.type === 'CFG') {
      L.push('\t<type>grammar</type>', '\t<!--The list of productions.-->');
      const nmap = renameForJflap(m);
      for (const p of m.productions) L.push('\t<production>', `\t\t<left>${esc(nmap(p.left))}</left>`, p.right.length ? `\t\t<right>${esc(p.right.map(nmap).join(''))}</right>` : '\t\t<right/>', '\t</production>');
      L.push('</structure>');
      return L.join('\n');
    }
    const type = m.type === 'PDA' ? 'pda' : m.type === 'TM' ? 'turing' : 'fa';
    L.push(`\t<type>${type}</type>`, ...(m.type === 'PDA' ? [`\t<!--am:pda acceptMode=${m.acceptMode || 'final'} initialStack=${m.initialStack === undefined ? 'Z' : (m.initialStack || '-')}-->`] : []), '\t<automaton>', '\t\t<!--The list of states.-->');
    const num = new Map(m.states.map((s, i) => [s.id, i]));
    for (const s of m.states) {
      L.push(`\t\t<state id="${num.get(s.id)}" name="${esc(s.name)}">`, `\t\t\t<x>${(s.x || 0).toFixed(1)}</x>`, `\t\t\t<y>${(s.y || 0).toFixed(1)}</y>`);
      if (s.initial) L.push('\t\t\t<initial/>');
      if (s.final) L.push('\t\t\t<final/>');
      L.push('\t\t</state>');
    }
    L.push('\t\t<!--The list of transitions.-->');
    const tag = (n, v) => (v === '' || v === undefined || v === null ? `\t\t\t<${n}/>` : `\t\t\t<${n}>${esc(v)}</${n}>`);
    for (const t of m.transitions) {
      L.push('\t\t<transition>', `\t\t\t<from>${num.get(t.from)}</from>`, `\t\t\t<to>${num.get(t.to)}</to>`);
      if (type === 'fa') L.push(tag('read', isEps(t.read) ? '' : t.read));
      if (type === 'pda') L.push(tag('read', isEps(t.read) ? '' : t.read), tag('pop', t.pop || ''), tag('push', t.push || ''));
      if (type === 'turing') L.push(tag('read', F.TM.norm(t.read) === '_' ? '' : t.read), tag('write', F.TM.norm(t.write) === '_' ? '' : t.write), `\t\t\t<move>${t.move || 'R'}</move>`);
      L.push('\t\t</transition>');
    }
    L.push('\t</automaton>', '</structure>');
    return L.join('\n');
  };
  /** JFLAP treats only single upper-case letters as variables → rename S', A'' etc. */
  function renameForJflap(g) {
    const names = F.CFG.nonterminals(g);
    const map = new Map();
    const used = new Set(names.filter((n) => /^[A-Z]$/.test(n)));
    for (const n of names) {
      if (/^[A-Z]$/.test(n)) continue;
      const free = 'ABCDEFGHIJKLMNOPQRTUVWXYZ'.split('').find((l) => !used.has(l) && !g.productions.some((p) => p.right.includes(l)));
      if (free) { used.add(free); map.set(n, free); }
    }
    return (n) => map.get(n) || n;
  }

  /* ---------- import ---------- */
  J.importXML = function (xml) {
    const meta = /<!--am:pda acceptMode=(\w+) initialStack=(\S*?)-->/.exec(xml);
    const root = J.parseXML(xml);
    if (!root || root.tag !== 'structure') throw new Error('Not a JFLAP file (missing <structure>).');
    const type = txt(root, 'type');
    if (type === 'grammar') {
      const prods = kids(root, 'production').map((p, i) => ({ id: 'p' + i, left: txt(p, 'left'), right: F.CFG.tokenize(txt(p, 'right')) }));
      const lefts = new Set(prods.map((p) => p.left));
      return { type: 'CFG', start: lefts.has('S') ? 'S' : (prods[0] || {}).left || 'S', productions: prods };
    }
    const auto = kid(root, 'automaton') || root;
    const states = kids(auto, 'state').map((s, i) => ({
      id: 's' + s.attrs.id, name: s.attrs.name || 'q' + s.attrs.id,
      x: parseFloat(txt(s, 'x')) || 100 + i * 120, y: parseFloat(txt(s, 'y')) || 200,
      initial: !!kid(s, 'initial'), final: !!kid(s, 'final'),
    }));
    const trans = kids(auto, 'transition').map((t, i) => {
      const o = { id: 'j' + i, from: 's' + txt(t, 'from'), to: 's' + txt(t, 'to') };
      if (type === 'turing') { o.read = txt(t, 'read') || '_'; o.write = txt(t, 'write') || '_'; o.move = (txt(t, 'move') || 'R').toUpperCase(); }
      else { o.read = txt(t, 'read'); if (type === 'pda') { o.pop = txt(t, 'pop'); o.push = txt(t, 'push'); } }
      return o;
    });
    if (type === 'pda') return { type: 'PDA', states, transitions: trans, alphabet: F.PDA.alphabetOf({ transitions: trans }), acceptMode: meta ? meta[1] : 'final', initialStack: meta ? (meta[2] === '-' ? '' : meta[2]) : 'Z' };
    if (type === 'turing') return { type: 'TM', states, transitions: trans, alphabet: [], blank: '_' };
    if (type === 'fa' || type === 'fsa' || !type) {
      const m = { type: 'DFA', states, transitions: trans, alphabet: [] };
      m.alphabet = F.FA.symbols(m);
      m.type = F.FA.kindOf(m);
      return m;
    }
    throw new Error('Unsupported JFLAP structure type: ' + type);
  };

  /** plain-text list of strings (JFLAP "Multiple Run" input file) */
  J.testFile = (strings) => strings.map((s) => s).join('\n') + '\n';
})();
