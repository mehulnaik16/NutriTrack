// @ts-nocheck -- framework-free DOM/canvas animation, kept as written.
// Hold-to-commit page: hold the logo and green fills it tile by tile with ember sparkles
// dragging off the fill edge. At 100% the screen goes dark and the logo bursts.
// Framework-free; routes/commit.tsx is the React wrapper. Returns a destroy() function.
// Traced from the logo: 9 tiles in fill order (row by row), bounding boxes for the wipe.
const LOGO = {"w": 387.8, "h": 377.0, "color": "#598b14", "paths": ["M10.8 8.8L4.8 16.2L1.8 23.0L0.8 28.8L0.8 87.8L1.8 93.0L3.8 98.0L8.5 104.8L13.0 109.2L18.8 112.8L27.8 115.5L90.8 115.8L96.5 114.8L103.5 111.8L113.2 103.5L117.2 97.0L119.5 89.8L119.5 31.5L119.0 25.5L117.0 19.5L111.8 11.5L108.5 8.2L100.0 2.5L93.0 0.2L38.8 0.0L28.8 0.2L23.0 1.5L16.8 4.2Z", "M137.8 1.2L134.8 5.5L134.5 107.8L135.0 111.8L136.5 114.0L140.0 115.5L230.5 115.8L235.5 112.2L251.8 95.8L252.5 94.0L252.5 7.2L250.2 2.2L247.8 0.2L143.8 0.0L139.8 0.2Z", "M268.5 0.8L267.8 7.2L267.8 94.2L269.5 97.0L287.8 114.8L290.2 115.5L385.2 115.5L387.2 114.8L387.5 106.5L385.5 91.5L383.2 81.2L378.5 67.0L374.5 58.5L366.5 45.5L355.2 32.5L345.2 23.5L336.0 17.0L314.2 6.8L303.5 3.5L286.5 0.5L269.8 0.0Z", "M119.2 131.8L117.5 130.8L98.2 131.2L84.0 133.5L72.8 136.5L64.8 139.5L49.8 147.5L33.0 160.2L26.0 167.5L18.8 177.2L13.8 185.2L8.0 197.2L3.0 212.8L0.2 231.5L0.5 244.8L98.0 245.0L102.2 242.0L116.5 227.8L119.5 223.8Z", "M135.8 133.2L134.8 135.5L134.8 224.2L141.0 231.8L154.0 244.0L156.8 245.0L191.5 245.2L248.0 245.0L251.5 242.0L252.5 239.8L252.5 152.5L246.8 145.2L235.2 133.8L229.8 130.8L215.8 130.5L144.0 130.8L138.8 131.2Z", "M387.0 131.8L385.2 130.8L289.8 130.8L283.2 135.5L268.0 151.5L268.2 244.5L270.0 245.2L289.5 244.2L307.5 240.8L324.5 234.8L335.2 229.0L353.0 215.8L361.8 206.8L367.8 198.8L373.2 190.0L380.5 174.0L385.2 157.5L386.5 150.2L387.5 138.8Z", "M0.2 261.0L0.8 277.8L4.8 298.0L10.0 312.0L17.8 326.2L28.0 339.8L36.0 347.8L54.8 361.0L62.0 365.0L74.2 370.0L84.2 373.0L100.0 375.8L116.2 376.2L118.5 375.2L119.5 363.2L119.5 281.2L116.5 277.0L101.5 262.2L98.5 260.2L5.8 260.0L1.0 260.2Z", "M136.2 278.5L134.8 280.8L134.5 370.8L135.0 373.0L136.8 375.0L139.5 376.5L242.8 376.5L247.8 376.0L251.8 372.0L252.5 370.0L252.5 266.0L249.5 261.2L248.0 260.2L235.0 260.0L155.8 260.2Z", "M279.2 267.2L274.0 272.5L271.0 277.2L268.2 284.2L267.8 289.0L268.0 350.8L270.5 360.0L276.2 367.0L285.0 373.5L293.0 376.2L350.2 376.8L360.5 376.2L367.2 374.2L374.5 370.0L380.0 365.0L383.2 360.0L387.0 348.2L387.2 292.5L386.5 285.2L384.5 279.2L380.5 272.2L373.8 265.8L367.2 262.2L358.0 260.0L295.8 260.0L287.2 262.2Z"], "boxes": [[0.5, 0.0, 119.2, 116.0], [134.5, 0.0, 118.2, 116.0], [267.5, 0.0, 120.2, 116.0], [0.0, 130.5, 119.8, 115.0], [134.5, 130.5, 118.2, 115.0], [267.8, 130.5, 120.0, 115.0], [0.0, 260.0, 119.8, 116.5], [134.5, 260.0, 118.2, 116.8], [267.8, 260.0, 119.8, 117.0]]};

const NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'path', 'clipPath', 'defs', 'line', 'polygon', 'g', 'linearGradient', 'stop', 'rect']);
const RIDGE = '#b8dc7a'; // resting fingerprint, light green
const FILL = '#598b14';  // the hold fills it with the logo green

// Fingerprint round the logo (viewBox 160), after the reference: concentric
// ridges, solid over the top with one break each, broken into short dashes
// along the bottom. The inner ridge (r 48) clears the logo's corners (r 41).
const pt = (r, deg) => [80 + r * Math.sin(deg * Math.PI / 180), 80 - r * Math.cos(deg * Math.PI / 180)];
const arc = (r, a, b) => { const [x0, y0] = pt(r, a), [x1, y1] = pt(r, b); return `M${x0} ${y0}A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
const FP = [48, 54.5, 61, 67.5, 74].map((r, i) => {
  const br = [-40, 55, -75, 20, 85][i]; // where the top ridge breaks, staggered
  const top = arc(r, -118 - i * 4, br - 7) + arc(r, br + 7, 118 + i * 4);
  return { top, low: arc(r, 126 + i * 4, 234 - i * 4) };
});
const BURST_MS = 2400; // matches burst.mp3
const REACH = 500;     // wipe triangle reach, bigger than the logo
let uid = 0;

const CSS = `
.ch{position:relative;height:100%;box-sizing:border-box;padding:clamp(4px,1dvh,8px) 24px clamp(16px,3dvh,28px);display:flex;flex-direction:column;align-items:center;background:#fff;color:#111;font-family:inherit;overflow:hidden}
.ch h1{align-self:flex-start;margin:0 0 auto;font-size:clamp(22px,3.6dvh,30px);line-height:1.2;font-weight:700}
.ch-card{width:100%;box-sizing:border-box;margin-top:clamp(12px,3dvh,32px);padding:clamp(14px,2.4dvh,22px) clamp(16px,2.8dvh,24px);border:1px solid #eee;border-radius:24px;background:#fff;box-shadow:0 2px 16px rgba(0,0,0,.08);font-size:clamp(14px,2.1dvh,17px);line-height:1.45;color:#8a8a8a}
.ch-card p{margin:0}.ch-card p+p{margin-top:.6em}.ch-card b{color:#111;font-weight:600}
.ch-btn{all:unset;position:relative;display:block;flex:none;margin-top:clamp(16px,4dvh,44px);width:clamp(124px,23dvh,190px);aspect-ratio:1;border-radius:50%;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;cursor:pointer}
.ch-btn:focus-visible{outline:3px solid #598b14;outline-offset:6px}
.ch-ring{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.ch-logo{position:absolute;left:50%;top:50%;width:36%;transform:translate(-50%,-50%);overflow:visible}
.ch-hint{margin:clamp(12px,2.5dvh,22px) 0 auto;font-weight:600;font-size:clamp(13px,1.9dvh,15px);text-align:center}
.ch-dark{position:fixed;inset:0;z-index:2147482999;visibility:hidden;pointer-events:none;background:radial-gradient(circle at var(--x) var(--y),#142a09,#000 62%)}
.ch-dark svg{position:absolute;overflow:visible;filter:drop-shadow(0 0 22px rgba(120,210,50,.6))}
.ch-fx{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483000}
`;

const h = (tag, attrs = {}, ...kids) => {
  const e = SVG_TAGS.has(tag) ? document.createElementNS(NS, tag) : document.createElement(tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  e.append(...kids);
  return e;
};

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function mountCommitHold(host, o = {}) {
  const {
    title = 'Commit to your goal',
    goal = 'gaining 2.5 kg by Apr 1',
    pledge = 'I will track my meals, fuel my body with intention, and hold myself accountable.',
    hint = 'Tap and hold to make your commitment',
    holdMs = 3000,
    sound,
    onDone,
  } = o;
  const id = `ch${++uid}`;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!document.getElementById('ch-css')) document.head.append(Object.assign(h('style'), { id: 'ch-css', textContent: CSS }));

  // ---- logo (fill phase): ghost outline, green tiles revealed by a diagonal wipe, glowing fire edge
  const { paths, boxes, color } = LOGO;
  const wipes = paths.map(() => h('polygon', { points: '' }));
  const edgeEl = h('line', { stroke: '#e4ffa8', 'stroke-width': 3, 'stroke-linecap': 'round', visibility: 'hidden' });
  const flameO = h('path', { fill: '#4fe016', 'fill-opacity': 0.65, visibility: 'hidden' });
  const flameI = h('path', { fill: '#e8ff9a', 'fill-opacity': 0.9, visibility: 'hidden' });
  const main = h('svg', { class: 'ch-logo', viewBox: `0 0 ${LOGO.w} ${LOGO.h}`, 'aria-hidden': 'true' },
    h('defs', {}, ...paths.map((d, i) => h('clipPath', { id: `${id}w${i}` }, wipes[i])),
      ...paths.map((d, i) => h('clipPath', { id: `${id}t${i}` }, h('path', { d })))),
    ...paths.map((d) => h('path', { d, fill: '#dde8cc' })),
    ...paths.map((d, i) => h('path', { d, fill: color, 'clip-path': `url(#${id}w${i})` })),
    flameO, flameI, edgeEl);

  // ---- logo (burst phase): glossy bevelled tiles + sweeping sheen
  const sheen = h('rect', { x: -140, y: -60, width: 80, height: LOGO.h + 120, fill: `url(#${id}s)` });
  const gloss = h('svg', { viewBox: `0 0 ${LOGO.w} ${LOGO.h}`, 'aria-hidden': 'true' },
    h('defs', {},
      h('linearGradient', { id: `${id}g`, x1: 0, y1: 0, x2: 1, y2: 1 },
        h('stop', { offset: 0, 'stop-color': '#9ad152' }), h('stop', { offset: 0.55, 'stop-color': '#5b9a1e' }), h('stop', { offset: 1, 'stop-color': '#3b7010' })),
      h('linearGradient', { id: `${id}s` },
        h('stop', { offset: 0, 'stop-color': '#fff', 'stop-opacity': 0 }), h('stop', { offset: 0.5, 'stop-color': '#fff', 'stop-opacity': 0.6 }), h('stop', { offset: 1, 'stop-color': '#fff', 'stop-opacity': 0 })),
      h('clipPath', { id: `${id}all` }, ...paths.map((d) => h('path', { d })))),
    ...paths.map((d) => h('path', { d, fill: `url(#${id}g)` })),
    ...paths.map((d, i) => h('path', { d, fill: 'none', stroke: 'rgba(255,255,255,.5)', 'stroke-width': 7, 'clip-path': `url(#${id}t${i})` })),
    h('g', { 'clip-path': `url(#${id}all)` }, sheen));

  // ---- fingerprint ring: light-green ridges, a green copy drawn over them as the hold fills
  const ridge = { fill: 'none', 'stroke-width': 2, 'stroke-linecap': 'round' };
  const fills = FP.map((f) => h('path', { d: f.top, ...ridge, stroke: FILL, pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 }));
  const lows = FP.map((f) => h('path', { d: f.low, ...ridge, stroke: RIDGE, 'stroke-dasharray': '2.5 4.5' }));
  const ring = h('svg', { class: 'ch-ring', viewBox: '0 0 160 160', 'aria-hidden': 'true' },
    ...FP.map((f) => h('path', { d: f.top, ...ridge, stroke: RIDGE })), ...fills, ...lows);

  const btn = h('button', { class: 'ch-btn', type: 'button', 'aria-label': `${hint}. Hold for ${Math.round(holdMs / 1000)} seconds.` }, ring, main);
  const dark = h('div', { class: 'ch-dark' }, gloss);
  const fx = h('canvas', { class: 'ch-fx' });
  const cx2 = fx.getContext('2d');
  const root = h('div', { class: 'ch', 'data-state': 'idle' },
    h('h1', {}, title),
    h('div', { class: 'ch-card' },
      h('p', {}, 'I am committed to my goal of ', h('b', {}, goal), '.'), h('p', {}, pledge)),
    btn, h('p', { class: 'ch-hint' }, hint));
  host.append(root, dark, fx);

  // sparks are crisp streaks (the canvas fades slowly, so each one drags a tail); colours: core + halo
  const PAL = {
    light: [{ c: '#a8ff2e', h: '#2f9e0a' }, { c: '#e6ff8a', h: '#4ab812' }, { c: '#58f01c', h: '#1f7a08' }],
    dark: [{ c: '#c6ff6e', h: '#4fbe1a' }, { c: '#f2ffd0', h: '#8be03a' }, { c: '#7ee02e', h: '#2f8a0e' }],
  };
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const audio = sound ? new Audio(sound) : null;

  let state = 'idle', holding = false, p = 0, parts = [], running = false, last = 0, raf = 0, timer = 0, acc = 0, burstT = 0, unlocked = false;
  let W = 0, H = 0;

  const setState = (s) => { state = s; root.dataset.state = s; };
  const fit = () => {
    const d = Math.min(2, devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    fx.width = W * d; fx.height = H * d;
    cx2.setTransform(d, 0, 0, d, 0, 0);
  };

  const add = (q) => parts.push({ t: 0, drag: 0, g: 0, wob: 0, f: 0, ph: Math.random() * 6.28, fin: false, px: q.x, py: q.y, ...q });

  // flickering flame tongues standing on the fill edge (logo units)
  const flameD = (e, time, k) => {
    const n = clamp(Math.round((e.xb - e.xa) / 22), 2, 9), hgt = (30 + 50 * p) * k;
    let d = '';
    for (let i = 0; i < n; i++) {
      const x0 = e.xa + (e.xb - e.xa) * i / n, x1 = e.xa + (e.xb - e.xa) * (i + 1) / n, xm = (x0 + x1) / 2;
      const ym = e.c - xm, ht = hgt * (0.5 + 0.5 * Math.abs(Math.sin(time * 9 + i * 2.1)));
      d += `M${x0} ${e.c - x0}Q${xm - 6} ${ym - ht * 0.45} ${xm + Math.sin(time * 7 + i) * 7} ${ym - ht}Q${xm + 6} ${ym - ht * 0.45} ${x1} ${e.c - x1}Z`;
    }
    return d;
  };

  // ---- fill: tile k is mid-wipe, tiles before it are full, after it empty
  function paint(time = 0) {
    const f = p * 9, k = Math.min(8, f | 0), t = f - k;
    let edge = null;
    boxes.forEach(([x, y, w, hh], i) => {
      const c = x + y - 2 + (i < k ? 1 : i > k ? 0 : t) * (w + hh + 4) + (i > k ? -10 : 0);
      wipes[i].setAttribute('points', `${-REACH},${-REACH} ${c + REACH},${-REACH} ${-REACH},${c + REACH}`);
      if (i === k) {
        const xa = Math.max(x, c - (y + hh)), xb = Math.min(x + w, c - y);
        if (xb > xa) edge = { xa, xb, c, k };
      }
    });
    const live = edge && p > 0 && p < 1;
    const e = edgeEl;
    if (live) {
      e.setAttribute('x1', edge.xa); e.setAttribute('y1', edge.c - edge.xa);
      e.setAttribute('x2', edge.xb); e.setAttribute('y2', edge.c - edge.xb);
      e.setAttribute('clip-path', `url(#${id}t${edge.k})`);
    }
    e.setAttribute('visibility', live ? 'visible' : 'hidden');
    const burn = live && holding && !calm;
    if (burn) { flameO.setAttribute('d', flameD(edge, time, 1)); flameI.setAttribute('d', flameD(edge, time + 1.3, 0.5)); }
    flameO.setAttribute('visibility', burn ? 'visible' : 'hidden'); flameI.setAttribute('visibility', burn ? 'visible' : 'hidden');
    for (const f of fills) f.setAttribute('stroke-dashoffset', 1 - p);
    lows.forEach((l, i) => l.setAttribute('stroke', p >= (i + 1) / lows.length ? FILL : RIDGE));
    const shake = calm || p < 0.85 ? 0 : (p - 0.85) / 0.15 * 1.5;
    btn.style.transform = `translate(${rnd(-shake, shake)}px,${rnd(-shake, shake)}px) scale(${1 + 0.04 * p})`;
    return live ? edge : null;
  }

  function embers(edge, dt) {
    if (calm || !edge) return;
    const r = main.getBoundingClientRect(), s = r.width / LOGO.w;
    acc += (40 + 150 * p) * dt; // thicker and harder the closer to 100%
    for (; acc >= 1; acc--) {
      const x = rnd(edge.xa, edge.xb), sx = r.left + x * s, sy = r.top + (edge.c - x) * s, pal = pick(PAL.light);
      if (Math.random() < 0.8) { // sparks thrown up and back, away from the direction the fire is travelling
        const a = -Math.PI / 2 + rnd(-1.2, 0.9), v = rnd(180, 520) * (0.6 + 0.9 * p);
        add({ x: sx, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 420, drag: 0.5, life: rnd(0.35, 0.85), size: rnd(0.9, 1.9), ...pal });
      } else add({ x: sx, y: sy, vx: rnd(-20, 10), vy: -rnd(40, 110), g: -40, drag: 0.6, wob: 20, f: rnd(6, 12), life: rnd(1, 1.8), size: rnd(1, 1.8), ...pal });
    }
  }

  function burst() {
    setState('burst');
    fit();
    const r = main.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    dark.style.setProperty('--x', `${cx}px`); dark.style.setProperty('--y', `${cy}px`);
    Object.assign(gloss.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    dark.style.visibility = 'visible';
    const R = Math.hypot(W, H);
    dark.animate({ clipPath: [`circle(0px at ${cx}px ${cy}px)`, `circle(${R}px at ${cx}px ${cy}px)`] }, { duration: 650, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'forwards' });
    if (!calm) {
      gloss.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: 0.25 }, { transform: 'scale(1)' }], { duration: 900, easing: 'ease-out' });
      sheen.animate([{ transform: 'translateX(0) skewX(-20deg)' }, { transform: 'translateX(720px) skewX(-20deg)' }], { duration: 1100, delay: 350, iterations: 2 });
      for (let i = 0; i < 260; i++) {
        const a = rnd(0, 6.28), v = 150 + Math.random() ** 2 * 900;
        add({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, drag: 2.2, life: rnd(0.9, 2), size: rnd(0.8, 2.6), ...pick(PAL.dark) });
      }
      const rg = h('div', { style: `position:absolute;left:${cx}px;top:${cy}px;width:${R * 1.2}px;height:${R * 1.2}px;box-sizing:border-box;border:3px solid #a8ff5a;border-radius:50%;box-shadow:0 0 24px #6fe01a` });
      dark.append(rg);
      rg.animate([{ transform: 'translate(-50%,-50%) scale(0)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.1,.7,.2,1)' }).onfinish = () => rg.remove();
    }
    if (audio) audio.play().catch(() => {});
    burstT = 0; acc = 0;
    // Ease out instead of cutting straight to the next page: the page behind goes
    // blank, then the dark scene and sparks fade to white before onDone.
    timer = setTimeout(() => {
      setState('done');
      root.style.visibility = 'hidden';
      const ease = { duration: calm ? 300 : 900, easing: 'ease-in-out', fill: 'forwards' };
      fx.animate({ opacity: [1, 0] }, ease);
      dark.animate({ opacity: [1, 0] }, ease).onfinish = () => { timer = setTimeout(() => onDone && onDone(), 150); };
    }, BURST_MS);
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state === 'idle' || state === 'holding') {
      p = clamp(p + (holding ? dt / (holdMs / 1000) : -dt * 2.5 / (holdMs / 1000)), 0, 1);
      const edge = paint(now / 1000);
      if (holding) embers(edge, dt);
      if (p >= 1) { paint(); burst(); }
    } else if (state === 'burst' && !calm) {
      burstT += dt * 1000;
      acc += (15 + 120 * Math.min(1, burstT / BURST_MS)) * dt; // dust thickens like in the reference
      for (; acc >= 1; acc--) add({ x: rnd(0, W), y: rnd(0, H), vx: rnd(-14, 14), vy: rnd(-14, 14), life: rnd(1.2, 2.2), size: rnd(0.6, 1.5), fin: true, ...pick(PAL.dark) });
    }

    const dk = state === 'burst' || state === 'done';
    cx2.globalCompositeOperation = 'destination-out'; // fade last frame instead of wiping it: that is the drag
    cx2.globalAlpha = 1 - Math.exp(-dt * (dk ? 5 : 13));
    cx2.fillStyle = '#000'; cx2.fillRect(0, 0, W, H);
    cx2.globalCompositeOperation = dk ? 'lighter' : 'source-over';
    for (const q of parts) {
      q.t += dt;
      const k = 1 - q.t / q.life;
      if (k <= 0) { q.dead = true; continue; }
      const dr = Math.exp(-q.drag * dt);
      q.vx *= dr; q.vy = q.vy * dr + q.g * dt; q.px = q.x; q.py = q.y;
      q.x += (q.vx + (q.wob ? Math.sin(q.t * q.f + q.ph) * q.wob : 0)) * dt; q.y += q.vy * dt;
      const a = q.fin ? Math.sin(Math.PI * (1 - k)) * 0.8 : clamp(k * (0.75 + 0.25 * Math.sin(q.t * 30 + q.ph)), 0, 1);
      const w = q.size * (q.fin ? 1 : 0.5 + 0.5 * k);
      cx2.lineCap = q.fin ? 'round' : 'butt'; // butt: no overlapping caps, so no beading along the streak
      cx2.beginPath(); cx2.moveTo(q.px, q.py); cx2.lineTo(q.x + 0.01, q.y);
      cx2.strokeStyle = q.h; cx2.globalAlpha = a * 0.3; cx2.lineWidth = w * 3; cx2.stroke();
      cx2.strokeStyle = q.c; cx2.globalAlpha = a; cx2.lineWidth = w; cx2.stroke();
    }
    parts = parts.filter((q) => !q.dead);
    cx2.globalAlpha = 1;
    if (!parts.length) cx2.clearRect(0, 0, W, H); // drop the faint fade residue

    const active = state === 'burst' || parts.length || (state !== 'done' && (holding || p > 0));
    if (active) raf = requestAnimationFrame(tick); else running = false;
  }

  const wake = () => { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(tick); } };
  const start = () => {
    if (state === 'burst' || state === 'done') return;
    holding = true; setState('holding'); fit();
    if (audio && !unlocked) { // mobile browsers only allow sound that was started inside a touch
      unlocked = true; audio.muted = true;
      audio.play().then(() => { audio.pause(); audio.currentTime = 0; audio.muted = false; }).catch(() => { unlocked = false; audio.muted = false; });
    }
    wake();
  };
  const stop = () => { holding = false; if (state === 'holding') setState('idle'); };

  const keyDown = (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); start(); } };
  const keyUp = (e) => { if (e.key === ' ' || e.key === 'Enter') stop(); };
  const down = (e) => { btn.setPointerCapture(e.pointerId); start(); };
  const noMenu = (e) => e.preventDefault();
  btn.addEventListener('pointerdown', down);
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(ev, stop);
  btn.addEventListener('keydown', keyDown);
  btn.addEventListener('keyup', keyUp);
  btn.addEventListener('blur', stop);
  btn.addEventListener('contextmenu', noMenu);
  addEventListener('resize', fit);
  fit(); paint();

  return function destroy() {
    cancelAnimationFrame(raf); clearTimeout(timer); removeEventListener('resize', fit);
    if (audio) audio.pause();
    root.remove(); dark.remove(); fx.remove();
  };
}
