/* ============================================================================
 * APP · router, HUD, boot
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const UI = AM.UI, G = AM.G, h = UI.h;
  const st = () => G.Store.state;
  let current = { name: 'title', params: {} }, hudEls = null;

  UI.applySettings = function () {
    const s = st().settings;
    document.body.classList.toggle('hc', !!s.highContrast);
    document.body.classList.toggle('reduce', !!s.reduceMotion);
    document.documentElement.style.setProperty('--fs', s.fontScale || 1);
  };

  function buildHud() {
    const lv = G.Game.level(), sum = G.Game.summary();
    const scoreB = h('b', UI.fmt(sum.overall)), lvB = h('b', 'Lv ' + lv.level), xpBar = UI.bar(lv.into, lv.span), nameB = h('small', st().player.name + ' · ' + lv.rank);
    const nav = [['hub', '🌐 Hub'], ['archive', '🗄 Archive'], ['lab', '🧪 Lab'], ['jflap', '☕ JFLAP'], ['achievements', '🏆 Achievements'], ['profile', '👤 Profile']];
    const el = h('header.hud', { role: 'banner' },
      h('div.logo', { tabindex: 0, role: 'link', onclick: () => UI.go('hub'), onkeydown: (e) => { if (e.key === 'Enter') UI.go('hub'); } }, UI.svg('svg', { viewBox: '0 0 64 64', html: '<circle cx="32" cy="32" r="26" fill="#0a1030" stroke="#22d3ee" stroke-width="4"/><circle cx="32" cy="32" r="16" fill="none" stroke="#c084fc" stroke-width="4"/><circle cx="32" cy="32" r="5" fill="#fbbf24"/>' }), 'AUTOMATA'),
      h('nav.hud-nav', { 'aria-label': 'Main' }, nav.map(([k, t]) => h('button.nav-btn' + (current.name === k ? '.on' : ''), { type: 'button', onclick: () => UI.go(k) }, t))),
      h('div.hud-stats', h('div.stat', h('small', 'Score'), scoreB), h('div.stat.xp', h('small', 'Level'), lvB, xpBar), nameB,
        h('button.icon-btn', { type: 'button', title: 'How to play', 'aria-label': 'How to play', onclick: () => UI.howTo() }, '?'),
        h('button.icon-btn', { type: 'button', title: 'Toggle sound', 'aria-label': 'Toggle sound', onclick: (e) => { st().settings.sound = !st().settings.sound; e.currentTarget.textContent = st().settings.sound ? '🔊' : '🔇'; G.Store.save(); } }, st().settings.sound ? '🔊' : '🔇')));
    hudEls = { scoreB, lvB, xpBar, nameB };
    return el;
  }
  UI.refreshHud = function () {
    if (!hudEls) return;
    const lv = G.Game.level();
    hudEls.scoreB.textContent = UI.fmt(G.Game.overall()); hudEls.lvB.textContent = 'Lv ' + lv.level;
    hudEls.xpBar.firstChild.style.width = Math.round(lv.pct * 100) + '%'; hudEls.nameB.textContent = st().player.name + ' · ' + lv.rank;
  };

  UI.go = function (name, params = {}) {
    UI.runCleanups();
    document.querySelectorAll('.modal-back').forEach((m) => m.remove());
    const root = document.getElementById('app');
    UI.clear(root);
    current = { name, params };
    const fn = UI.screens[name];
    if (!fn) return UI.go('hub');
    if (name !== 'title') root.appendChild(buildHud());
    else hudEls = null;
    try { fn(root, params); } catch (e) { console.error(e); root.appendChild(h('div.screen', h('div.panel', h('h3', 'Something went wrong'), h('pre.mono', String(e && e.stack || e)), h('button.btn', { onclick: () => UI.go('hub') }, 'Back to hub')))); }
    window.scrollTo(0, 0);
  };

  function boot() {
    G.Store.load(); UI.applySettings(); UI.startStars();
    /* every visit rolls a fresh set of challenges (?seed=abc repeats a session, ?classic pins the original challenges) */
    try { const q = new URLSearchParams(location.search); G.Variants.rollAll({ seed: q.get('seed') || undefined, classic: q.has('classic') ? true : undefined }); } catch (e) { console.error('variant roll failed', e); }
    G.Store.on(() => UI.refreshHud());
    window.addEventListener('beforeunload', () => G.Store.flush());
    UI.go('title');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
