/* ============================================================================
 * UI LAYER · procedural art — starfield, region scenes, world glyphs, object icons
 * Everything is generated (no image files), seeded so it is stable between visits.
 * ========================================================================== */
(function () {
  const AM = (globalThis.AM = globalThis.AM || {});
  const UI = AM.UI, F = AM.F, G = AM.G;
  const S = UI.svg;

  /* ---------------- starfield ---------------- */
  UI.startStars = function () {
    const cv = UI.$('#stars'); if (!cv) return;
    const c = cv.getContext('2d');
    let W = 0, H = 0, stars = [], streaks = [], tint = [34, 211, 238];
    const rnd = F.rng(42);
    const resize = () => {
      W = cv.width = innerWidth; H = cv.height = innerHeight;
      stars = Array.from({ length: Math.min(200, Math.floor((W * H) / 9000)) }, () => ({ x: rnd() * W, y: rnd() * H, r: rnd() * 1.4 + 0.2, s: rnd() * 0.25 + 0.03, a: rnd() * 6.28, p: rnd() * 0.02 + 0.005 }));
    };
    resize(); addEventListener('resize', resize);
    const readTint = () => {
      const col = getComputedStyle(document.body).getPropertyValue('--accent').trim();
      const m = /^#([0-9a-f]{6})$/i.exec(col);
      if (m) tint = [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    };
    let last = 0;
    function frame(t) {
      if (document.hidden) { requestAnimationFrame(frame); return; }
      if (t - last > 33 || UI.reduceMotion()) {
        last = t;
        c.clearRect(0, 0, W, H);
        const g = c.createRadialGradient(W * 0.7, H * 0.15, 0, W * 0.7, H * 0.15, Math.max(W, H) * 0.8);
        g.addColorStop(0, `rgba(${tint[0]},${tint[1]},${tint[2]},0.13)`); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(0, 0, W, H);
        const still = UI.reduceMotion();
        for (const s of stars) {
          if (!still) { s.y += s.s; s.a += s.p; if (s.y > H) { s.y = -2; s.x = rnd() * W; } }
          const al = 0.35 + 0.45 * Math.sin(s.a);
          c.fillStyle = `rgba(${200 + tint[0] / 8 | 0},${210 + tint[1] / 16 | 0},255,${Math.max(0.1, al)})`;
          c.beginPath(); c.arc(s.x, s.y, s.r, 0, 6.283); c.fill();
        }
        if (!still && rnd() < 0.006) streaks.push({ x: rnd() * W, y: rnd() * H * 0.5, l: 80 + rnd() * 120, life: 1 });
        streaks = streaks.filter((k) => k.life > 0);
        for (const k of streaks) { c.strokeStyle = `rgba(${tint[0]},${tint[1]},${tint[2]},${k.life * 0.6})`; c.lineWidth = 1.2; c.beginPath(); c.moveTo(k.x, k.y); c.lineTo(k.x - k.l * k.life, k.y + k.l * 0.4 * k.life); c.stroke(); k.x += 9; k.y += 3.5; k.life -= 0.025; }
        readTint();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  };

  /* ---------------- region scenes (wide banner art) ---------------- */
  const defsGlow = (id, color) => S('defs', null,
    S('linearGradient', { id: id + 'sky', x1: 0, y1: 0, x2: 0, y2: 1 }, S('stop', { offset: '0', 'stop-color': color, 'stop-opacity': 0.34 }), S('stop', { offset: '1', 'stop-color': '#060818', 'stop-opacity': 0 })),
    S('filter', { id: id + 'blur', x: '-30%', y: '-30%', width: '160%', height: '160%' }, S('feGaussianBlur', { stdDeviation: 5 })));

  const scenes = {
    city(color, rnd) {
      const g = S('g'); let x = 0;
      while (x < 1200) {
        const w = 40 + rnd() * 60, h = 60 + rnd() * 150;
        g.appendChild(S('rect', { x, y: 260 - h, width: w, height: h, fill: '#0b1536', stroke: color, 'stroke-opacity': 0.35 }));
        for (let wy = 260 - h + 10; wy < 250; wy += 16) for (let wx = x + 7; wx < x + w - 8; wx += 12) if (rnd() < 0.5) g.appendChild(S('rect', { x: wx, y: wy, width: 6, height: 8, fill: rnd() < 0.7 ? color : '#fbbf24', opacity: 0.35 + rnd() * 0.6, class: rnd() < 0.2 ? 'flick' : '' }));
        x += w + 6 + rnd() * 10;
      }
      // central gate
      g.appendChild(S('g', { transform: 'translate(560 120)' }, S('rect', { x: 0, y: 0, width: 14, height: 140, fill: color }), S('rect', { x: 86, y: 0, width: 14, height: 140, fill: color }), S('rect', { x: 0, y: -10, width: 100, height: 16, rx: 4, fill: color }), S('rect', { x: 20, y: 40, width: 60, height: 100, fill: 'none', stroke: color, 'stroke-dasharray': '4 6', class: 'dash' })));
      return g;
    },
    clones(color, rnd) {
      const g = S('g');
      const branch = (x, y, depth, ang) => {
        if (depth > 4) return;
        const n = depth === 0 ? 1 : 2;
        for (let i = 0; i < n; i++) {
          const a = ang + (n === 1 ? 0 : (i ? 1 : -1) * (0.45 + rnd() * 0.2));
          const len = 70 - depth * 10;
          const x2 = x + Math.cos(a) * len * 1.6, y2 = y + Math.sin(a) * len * 0.55;
          g.appendChild(S('path', { d: `M${x} ${y} Q${(x + x2) / 2} ${y - 30} ${x2} ${y2}`, stroke: color, 'stroke-opacity': 0.55, 'stroke-width': 2, fill: 'none', 'stroke-dasharray': depth % 2 ? '2 6' : '' }));
          g.appendChild(S('circle', { cx: x2, cy: y2, r: 5 + (4 - depth), fill: color, opacity: 0.7, class: 'pulse', style: { animationDelay: (rnd() * 2).toFixed(2) + 's' } }));
          if (depth % 2 === 1) g.appendChild(S('circle', { cx: x2, cy: y2, r: 13, fill: 'none', stroke: '#e879f9', 'stroke-dasharray': '3 4', class: 'spin' }));
          branch(x2, y2, depth + 1, a * 0.85);
        }
      };
      branch(70, 140, 0, 0); branch(1130, 150, 0, Math.PI); // mirrored
      for (let i = 0; i < 4; i++) g.appendChild(S('circle', { cx: 480 + i * 80, cy: 130 + Math.sin(i) * 30, r: 7, fill: '#fff', opacity: 0.8, class: 'pulse', style: { animationDelay: i * 0.3 + 's' } }));
      return g;
    },
    forest(color, rnd) {
      const g = S('g');
      const tree = (x, y, len, ang, d) => {
        if (d > 7 || len < 5) { g.appendChild(S('circle', { cx: x, cy: y, r: 3.2, fill: rnd() < 0.5 ? color : '#bbf7d0', opacity: 0.85, class: rnd() < 0.15 ? 'pulse' : '' })); return; }
        const x2 = x + Math.sin(ang) * len, y2 = y - Math.cos(ang) * len;
        g.appendChild(S('line', { x1: x, y1: y, x2, y2, stroke: d < 3 ? '#14532d' : color, 'stroke-width': Math.max(1, 7 - d), 'stroke-linecap': 'round', opacity: 0.85 }));
        tree(x2, y2, len * (0.72 + rnd() * 0.08), ang - 0.4 - rnd() * 0.2, d + 1); tree(x2, y2, len * (0.72 + rnd() * 0.08), ang + 0.4 + rnd() * 0.2, d + 1);
      };
      [140, 380, 600, 830, 1070].forEach((x, i) => tree(x, 262, 46 + (i % 2) * 14, (rnd() - 0.5) * 0.2, 0));
      return g;
    },
    factory(color, rnd) {
      const g = S('g');
      const gear = (cx, cy, r, teeth, spd) => {
        let d = '';
        for (let i = 0; i < teeth; i++) { const a0 = (i / teeth) * 6.283, a1 = ((i + 0.5) / teeth) * 6.283; d += `${i ? 'L' : 'M'}${cx + Math.cos(a0) * r} ${cy + Math.sin(a0) * r}L${cx + Math.cos(a0 + 0.06) * (r + 11)} ${cy + Math.sin(a0 + 0.06) * (r + 11)}L${cx + Math.cos(a1 - 0.06) * (r + 11)} ${cy + Math.sin(a1 - 0.06) * (r + 11)}L${cx + Math.cos(a1) * r} ${cy + Math.sin(a1) * r}`; }
        g.appendChild(S('g', { class: 'gear', style: { transformOrigin: `${cx}px ${cy}px`, animationDuration: spd + 's' } }, S('path', { d: d + 'Z', fill: 'none', stroke: color, 'stroke-width': 2.4, opacity: 0.8 }), S('circle', { cx, cy, r: r * 0.35, fill: color, opacity: 0.6 })));
      };
      gear(170, 120, 52, 12, 14); gear(268, 90, 34, 8, -9.3); gear(1010, 110, 60, 14, 17); gear(1110, 160, 38, 9, -11);
      g.appendChild(S('rect', { x: 330, y: 214, width: 560, height: 18, rx: 6, fill: '#1b1409', stroke: color, 'stroke-opacity': 0.7 }));
      for (let i = 0; i < 14; i++) g.appendChild(S('line', { x1: 346 + i * 40, y1: 223, x2: 360 + i * 40, y2: 223, stroke: color, 'stroke-width': 2, class: 'belt' }));
      for (let i = 0; i < 6; i++) g.appendChild(S('rect', { x: 585, y: 196 - i * 20, width: 52, height: 18, rx: 3, fill: color, opacity: 0.35 + i * 0.1, stroke: '#fff', 'stroke-opacity': 0.25, class: 'crate', style: { animationDelay: i * 0.15 + 's' } }));
      return g;
    },
    tape(color, rnd) {
      const g = S('g');
      const syms = ['□', '1', '0', '1', '1', '0', '□', '1', '0', '0', '1', '□'];
      for (let i = -1; i < 14; i++) g.appendChild(S('g', { transform: `translate(${60 + i * 88} 150)` }, S('rect', { width: 80, height: 80, rx: 8, fill: '#0a1233', stroke: color, 'stroke-opacity': i === 6 ? 1 : 0.4, 'stroke-width': i === 6 ? 3 : 1.5 }), S('text', { x: 40, y: 54, 'text-anchor': 'middle', 'font-size': 34, fill: color, 'font-family': 'JetBrains Mono, monospace', opacity: 0.9 }, syms[(i + 12) % 12])));
      g.appendChild(S('g', { class: 'head', transform: 'translate(560 60)' }, S('path', { d: 'M0 0H80L40 70Z', fill: color, opacity: 0.85 }), S('circle', { cx: 40, cy: 18, r: 7, fill: '#fff' })));
      for (let i = 0; i < 5; i++) g.appendChild(S('rect', { x: 60 + i * 230, y: 20, width: 120, height: 8, rx: 4, fill: color, opacity: 0.18 + rnd() * 0.2 }));
      return g;
    },
    void(color, rnd) {
      const g = S('g', { transform: 'translate(600 135)' });
      for (let i = 0; i < 9; i++) g.appendChild(S('ellipse', { rx: 40 + i * 52, ry: 8 + i * 12, fill: 'none', stroke: i % 2 ? color : '#a78bfa', 'stroke-opacity': 0.5 - i * 0.04, 'stroke-width': 2, transform: `rotate(${-8 + i * 2})`, class: 'spin-slow', style: { animationDuration: 30 + i * 6 + 's' } }));
      g.appendChild(S('circle', { r: 44, fill: '#000', stroke: color, 'stroke-width': 3 }));
      g.appendChild(S('circle', { r: 56, fill: 'none', stroke: color, 'stroke-opacity': 0.3, 'stroke-width': 12, filter: 'blur(4px)' }));
      for (let i = 0; i < 40; i++) { const a = rnd() * 6.28, r = 70 + rnd() * 450; g.appendChild(S('circle', { cx: Math.cos(a) * r, cy: Math.sin(a) * r * 0.25, r: rnd() * 2 + 0.6, fill: '#fff', opacity: rnd() * 0.7 })); }
      g.appendChild(S('text', { y: 8, 'text-anchor': 'middle', 'font-size': 24, fill: color, 'font-family': 'JetBrains Mono, monospace' }, '∞?'));
      return g;
    },
  };
  UI.regionScene = function (worldId) {
    const w = G.worldById(worldId), rnd = F.rng(worldId.length * 977 + worldId.charCodeAt(0));
    const svg = S('svg', { class: 'scene', viewBox: '0 0 1200 260', preserveAspectRatio: 'xMidYMax slice', 'aria-hidden': 'true' }, defsGlow(worldId, w.color));
    svg.appendChild(S('rect', { width: 1200, height: 260, fill: `url(#${worldId}sky)` }));
    svg.appendChild(scenes[w.icon === 'clones' ? 'clones' : w.icon === 'city' ? 'city' : w.icon === 'forest' ? 'forest' : w.icon === 'factory' ? 'factory' : w.icon === 'tape' ? 'tape' : 'void'](w.color, rnd));
    return svg;
  };

  /* ---------------- world glyphs (hub map) ---------------- */
  UI.worldGlyph = function (worldId, color) {
    const g = S('g', { fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    const A = (el) => { g.appendChild(el); return el; };
    if (worldId === 'regular') { A(S('rect', { x: -26, y: -4, width: 14, height: 30 })); A(S('rect', { x: -8, y: -22, width: 16, height: 48 })); A(S('rect', { x: 12, y: 4, width: 14, height: 22 })); A(S('path', { d: 'M-4 -10h8M-4 0h8M-4 10h8', 'stroke-width': 2 })); }
    if (worldId === 'nfa') { A(S('circle', { cx: -22, cy: 0, r: 6 })); A(S('circle', { cx: 8, cy: -16, r: 6 })); A(S('circle', { cx: 8, cy: 16, r: 6 })); A(S('circle', { cx: 28, cy: 0, r: 5, 'stroke-dasharray': '3 3' })); A(S('path', { d: 'M-16 -2L2 -14M-16 2L2 14M14 -16L24 -5M14 16L24 5', 'stroke-width': 2 })); }
    if (worldId === 'cfg') { A(S('path', { d: 'M0 26V-2M0 8L-14 -4M0 -2L14 -16M0 -2L-12 -16M-14 -4L-24 -12M14 -16L22 -26' })); A(S('circle', { cx: -24, cy: -14, r: 4, fill: color })); A(S('circle', { cx: 22, cy: -28, r: 4, fill: color })); A(S('circle', { cx: -12, cy: -18, r: 4, fill: color })); }
    if (worldId === 'pda') { A(S('rect', { x: -22, y: 8, width: 44, height: 14, rx: 3 })); A(S('rect', { x: -22, y: -8, width: 44, height: 14, rx: 3 })); A(S('rect', { x: -22, y: -24, width: 44, height: 14, rx: 3, 'stroke-dasharray': '4 4' })); A(S('path', { d: 'M30 -20v14M26 -12l4 -6l4 6', 'stroke-width': 2.4 })); }
    if (worldId === 'tm') { for (let i = -2; i <= 2; i++) A(S('rect', { x: i * 16 - 7, y: 6, width: 14, height: 18, rx: 2 })); A(S('path', { d: 'M-8 -22H8L0 -2Z', fill: color })); }
    if (worldId === 'void') { A(S('circle', { cx: 0, cy: 0, r: 9, fill: color })); A(S('ellipse', { rx: 28, ry: 10, transform: 'rotate(-20)' })); A(S('ellipse', { rx: 20, ry: 24, 'stroke-opacity': 0.6, transform: 'rotate(30)' })); }
    if (worldId === 'hub') { A(S('circle', { r: 20 })); A(S('circle', { r: 8, fill: color })); A(S('path', { d: 'M0 -30V-20M0 30V20M-30 0H-20M30 0H20' })); }
    return g;
  };

  /* ---------------- object icons (viewBox 0 0 100 100); .door animates ---------------- */
  UI.objectIcon = function (id, color) {
    const svg = S('svg', { class: 'obj-icon', viewBox: '0 0 100 100', 'aria-hidden': 'true' });
    const st = { fill: 'none', stroke: color, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    const A = (el) => { svg.appendChild(el); return el; };
    if (id === 'gate_main') { A(S('rect', Object.assign({ x: 8, y: 20, width: 16, height: 66, rx: 3 }, st))); A(S('rect', Object.assign({ x: 76, y: 20, width: 16, height: 66, rx: 3 }, st))); A(S('rect', Object.assign({ x: 6, y: 12, width: 88, height: 12, rx: 4 }, st))); A(S('g', { class: 'door' }, S('rect', Object.assign({ x: 30, y: 30, width: 40, height: 56, rx: 3 }, st)), S('path', Object.assign({ d: 'M40 30V86M50 30V86M60 30V86' }, st, { 'stroke-width': 2 })))); }
    else if (id === 'vending') { A(S('rect', Object.assign({ x: 22, y: 8, width: 56, height: 84, rx: 6 }, st))); A(S('rect', Object.assign({ x: 29, y: 16, width: 30, height: 46, rx: 3 }, st))); A(S('g', { class: 'door' }, S('rect', Object.assign({ x: 31, y: 70, width: 38, height: 14, rx: 3 }, st)))); A(S('circle', { cx: 68, cy: 28, r: 4, fill: color })); A(S('circle', { cx: 68, cy: 42, r: 4, fill: color, opacity: 0.5 })); }
    else if (id === 'scanner') { A(S('circle', Object.assign({ cx: 50, cy: 50, r: 34 }, st))); A(S('circle', Object.assign({ cx: 50, cy: 50, r: 20 }, st, { 'stroke-dasharray': '4 5' }))); A(S('g', { class: 'door' }, S('path', Object.assign({ d: 'M50 16V50L72 66' }, st)))); A(S('circle', { cx: 50, cy: 50, r: 5, fill: color })); }
    else if (id === 'seeder') { A(S('path', Object.assign({ d: 'M30 90h40M50 90V50' }, st))); A(S('g', { class: 'door' }, S('path', Object.assign({ d: 'M50 56C30 52 24 36 26 24C42 24 52 36 50 56ZM50 46C68 44 76 30 74 18C60 18 50 30 50 46Z' }, st), { fill: color, 'fill-opacity': 0.25 }))); }
    else if (id === 'crate') { for (let i = 0; i < 3; i++) A(S('rect', Object.assign({ x: 22, y: 64 - i * 22, width: 56, height: 20, rx: 3 }, st, { 'stroke-dasharray': i === 2 ? '5 4' : '' }))); A(S('g', { class: 'door' }, S('path', Object.assign({ d: 'M86 20v26M80 28l6 -8l6 8' }, st)))); }
    else { for (let i = 0; i < 4; i++) A(S('rect', Object.assign({ x: 8 + i * 22, y: 62, width: 18, height: 24, rx: 3 }, st))); A(S('g', { class: 'door' }, S('path', Object.assign({ d: 'M38 14H62L50 50Z' }, st), { fill: color, 'fill-opacity': 0.5 }))); }
    return svg;
  };
})();
