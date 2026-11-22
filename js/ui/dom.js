/* ============================================================================
 * UI LAYER · DOM helpers, toasts, modals, sound effects
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const UI = (AM.UI = AM.UI || {});
  const G = AM.G;
  const SVGNS = 'http://www.w3.org/2000/svg';

  /** h('div.card#id', {onclick, style:{}, dataset:{}}, child, 'text', [children]) */
  UI.h = function (sel, attrs, ...kids) {
    if (attrs !== undefined && attrs !== null && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    const m = /^([a-zA-Z0-9]*)((?:[.#][\w-]+)*)$/.exec(sel) || [];
    const el = document.createElement(m[1] || 'div');
    (m[2] || '').replace(/([.#])([\w-]+)/g, (_, k, v) => { if (k === '.') el.classList.add(v); else el.id = v; return ''; });
    apply(el, attrs);
    append(el, kids);
    return el;
  };
  UI.svg = function (tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    apply(el, attrs, true);
    append(el, kids);
    return el;
  };
  function apply(el, attrs, isSvg) {
    if (!attrs) return;
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.setAttribute('class', Array.isArray(v) ? v.filter(Boolean).join(' ') : v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  function append(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k === null || k === undefined || k === false) continue;
      el.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
    }
  }
  UI.$ = (s, r = document) => r.querySelector(s);
  UI.$$ = (s, r = document) => [...r.querySelectorAll(s)];
  UI.clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  UI.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  UI.sym = (s) => (s === '' || s === undefined ? 'ε' : s);
  UI.fmt = (n) => Number(n).toLocaleString('en-US');
  UI.date = (iso) => { try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; } };
  UI.reduceMotion = () => !!(G.Store.state && G.Store.state.settings.reduceMotion) || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  UI.sleep = (ms) => new Promise((r) => setTimeout(r, UI.reduceMotion() ? Math.min(ms, 30) : ms));

  /** things that must be torn down when a screen changes (timers, listeners) */
  UI.cleanups = [];
  UI.onCleanup = (fn) => UI.cleanups.push(fn);
  UI.runCleanups = () => { for (const f of UI.cleanups.splice(0)) { try { f(); } catch (e) { console.error(e); } } };

  /* ---------------- toasts ---------------- */
  UI.toast = function (msg, { kind = 'info', icon = '', ms = 3800 } = {}) {
    const box = UI.$('#toasts');
    const t = UI.h('div.toast.' + kind, { role: 'status' }, icon ? UI.h('span.t-ico', icon) : null, UI.h('span', msg));
    box.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 400); }, ms);
  };

  /* ---------------- modal ---------------- */
  UI.modal = function ({ title, body, buttons = [], wide = false, cls = '', onClose, dismissable = true }) {
    const back = UI.h('div.modal-back');
    const box = UI.h('div.modal' + (wide ? '.wide' : '') + (cls ? '.' + cls : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'dialog' });
    const close = () => { back.classList.remove('in'); document.removeEventListener('keydown', onKey); setTimeout(() => back.remove(), 200); if (onClose) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape' && dismissable) close(); };
    document.addEventListener('keydown', onKey);
    if (title) box.appendChild(UI.h('div.modal-head', UI.h('h3', title), dismissable ? UI.h('button.icon-btn', { 'aria-label': 'Close', onclick: close }, '✕') : null));
    const content = UI.h('div.modal-body');
    if (typeof body === 'string') content.innerHTML = body; else if (body) content.appendChild(body);
    box.appendChild(content);
    if (buttons.length) box.appendChild(UI.h('div.modal-foot', buttons.map((b) => UI.h('button.btn' + (b.primary ? '.primary' : '') + (b.danger ? '.danger' : ''), { onclick: () => { const r = b.onClick ? b.onClick(close) : undefined; if (r !== false && !b.keepOpen) close(); } }, b.label))));
    back.appendChild(box);
    back.addEventListener('mousedown', (e) => { if (e.target === back && dismissable) close(); });
    document.body.appendChild(back);
    requestAnimationFrame(() => back.classList.add('in'));
    const first = box.querySelector('input,textarea,select,button.primary');
    if (first) setTimeout(() => first.focus(), 60);
    return { close, el: box, body: content };
  };
  UI.confirm = (msg, { ok = 'Confirm', danger = false, title = 'Are you sure?' } = {}) => new Promise((res) => {
    let done = false;
    UI.modal({ title, body: UI.h('p', msg), onClose: () => { if (!done) res(false); }, buttons: [{ label: 'Cancel' }, { label: ok, primary: !danger, danger, onClick: () => { done = true; res(true); } }] });
  });
  UI.prompt = (title, value = '', placeholder = '') => new Promise((res) => {
    const inp = UI.h('input.text', { value, placeholder, maxlength: 48 });
    let done = false;
    const submit = (close) => { done = true; res(inp.value); if (close) close(); };
    const m = UI.modal({ title, body: inp, onClose: () => { if (!done) res(null); }, buttons: [{ label: 'Cancel' }, { label: 'OK', primary: true, onClick: () => { done = true; res(inp.value); } }] });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { done = true; res(inp.value); m.close(); } });
  });

  /* ---------------- file helpers ---------------- */
  UI.download = function (name, text, mime = 'text/plain') {
    const a = UI.h('a', { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name });
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  UI.pickFile = (accept) => new Promise((res) => {
    const inp = UI.h('input', { type: 'file', accept, style: { display: 'none' } });
    inp.addEventListener('change', () => { const f = inp.files[0]; if (!f) return res(null); const r = new FileReader(); r.onload = () => res({ name: f.name, text: r.result }); r.readAsText(f); inp.remove(); });
    document.body.appendChild(inp); inp.click();
  });
  UI.safeName = (s) => String(s).replace(/[^\w\-]+/g, '_').slice(0, 40) || 'machine';

  /* ---------------- sound (tiny WebAudio synth — no asset files) ---------------- */
  const sfx = (UI.sfx = {});
  let ctx = null;
  function tone(freq, dur, { type = 'sine', vol = 0.06, slide = 0, delay = 0 } = {}) {
    if (!G.Store.state || !G.Store.state.settings.sound) return;
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* audio unavailable */ }
  }
  sfx.click = () => tone(620, 0.06, { type: 'triangle' });
  sfx.place = () => tone(380, 0.09, { type: 'sine', slide: 200 });
  sfx.step = () => tone(520, 0.05, { type: 'square', vol: 0.025 });
  sfx.split = () => { tone(440, 0.12, { type: 'sine', slide: 300 }); tone(660, 0.12, { type: 'sine', slide: -200, delay: 0.03 }); };
  sfx.portal = () => tone(900, 0.22, { type: 'sine', slide: -600, vol: 0.05 });
  sfx.push = () => tone(300, 0.08, { type: 'square', vol: 0.03, slide: 120 });
  sfx.pop = () => tone(420, 0.08, { type: 'square', vol: 0.03, slide: -160 });
  sfx.ok = () => { tone(523, 0.12, { type: 'triangle' }); tone(784, 0.18, { type: 'triangle', delay: 0.1 }); };
  sfx.bad = () => { tone(220, 0.18, { type: 'sawtooth', vol: 0.04, slide: -90 }); };
  sfx.win = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.07, delay: i * 0.11 }));
  sfx.unlock = () => [784, 988, 1319].forEach((f, i) => tone(f, 0.25, { type: 'sine', vol: 0.06, delay: i * 0.09 }));

  /* ---------------- small shared bits ---------------- */
  UI.typeBadge = (type) => UI.h('span.badge.type', { style: { '--c': G.TYPE_COLOR[type] || '#9aa' } }, G.TYPE_LABEL[type] || type);
  UI.pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
  UI.bar = (value, max, cls = '') => UI.h('div.bar' + (cls ? '.' + cls : ''), UI.h('i', { style: { width: Math.max(0, Math.min(100, (100 * value) / (max || 1))) + '%' } }));
  UI.chip = (text, cls = '', onclick) => UI.h('button.chip' + (cls ? '.' + cls : ''), { onclick, type: 'button' }, text);
  UI.kbd = (t) => UI.h('kbd', t);
  UI.verdict = (ok) => UI.h('span.verdict.' + (ok ? 'yes' : 'no'), ok ? '✔ ACCEPT' : '✘ REJECT');
  UI.animateNumber = function (el, to, ms = 900, fmt = UI.fmt) {
    if (UI.reduceMotion()) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const tick = (t) => { const k = Math.min(1, (t - t0) / ms); el.textContent = fmt(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
})();
