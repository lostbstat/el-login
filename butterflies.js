/* Floating butterflies background — drop-in for every page.
   Usage: <script src="butterflies.js" defer></script>
   - Canvas sits behind page content, never blocks clicks.
   - Colors come from theme CSS variables, so theme changes are picked up.
   - Pauses when the tab is hidden. Reduced-motion check is optional (see RESPECT_REDUCED_MOTION). */
(() => {
  if (window.__butterflies) return;
  window.__butterflies = true;
  // Set to true to hide butterflies for users whose OS has "reduce motion" turned on.
  const RESPECT_REDUCED_MOTION = false;
  if (RESPECT_REDUCED_MOTION && matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const COUNT_MAX = 14, COUNT_MIN = 6;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none';
  document.body.prepend(canvas);
  // #appShell paints an opaque full-screen background that would hide the canvas.
  // body already has the same base color + gradients, so making it transparent changes nothing visually.
  const fix = document.createElement('style');
  fix.textContent = '#appShell{background:transparent!important}';
  document.head.appendChild(fix);
  // App pages: behind everything (z-index:-1, visible through the page background).
  // Welcome page has its own opaque background, so there the canvas sits just above
  // that background but below its content (.wl-main has z-index:2).
  function layer() {
    const wp = document.getElementById('welcomePage');
    const onWelcome = !!(wp && wp.getClientRects().length);
    const z = onWelcome ? '1' : '-1';
    if (canvas.style.zIndex !== z) canvas.style.zIndex = z;
  }
  layer();
  setInterval(layer, 400);
  const ctx = canvas.getContext('2d');

  let W = 0, H = 0, dpr = 1, list = [], palette = [];

  function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    const pick = (name, fb) => cs.getPropertyValue(name).trim() || fb;
    palette = [
      pick('--primal2', '#CD5782'),
      pick('--second2-deep', '#4FA3A5'),
      pick('--second1-deep', '#E0B84C'),
      pick('--primal2-mid', '#E7A1BB'),
      pick('--second2', '#8CCBC8')
    ];
  }

  function make(initial) {
    const size = 9 + Math.random() * 10;
    return {
      x: Math.random() * W,
      y: initial ? Math.random() * H : H + 30,
      size,
      speed: 18 + Math.random() * 26,
      heading: Math.random() * Math.PI * 2,
      wob: Math.random() * 10,
      wobF: 0.6 + Math.random() * 0.9,
      turn: 0.8 + Math.random() * 1.2,
      phase: Math.random() * Math.PI * 2,
      flap: 9 + Math.random() * 6,
      color: palette[Math.floor(Math.random() * palette.length)],
      alpha: 0.45 + Math.random() * 0.3
    };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const target = Math.max(COUNT_MIN, Math.min(COUNT_MAX, Math.round(W * H / 90000)));
    while (list.length < target) list.push(make(true));
    list.length = target;
  }

  function wing(s, flip) {
    // one side (upper + lower wing), drawn on +x then mirrored by flip
    ctx.save();
    ctx.scale(flip, 1);
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.1);
    ctx.bezierCurveTo(s * 0.9, -s * 1.15, s * 1.25, -s * 0.2, s * 0.15, s * 0.05);
    ctx.bezierCurveTo(s * 1.0, s * 0.2, s * 0.8, s * 0.95, s * 0.05, s * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw(b, t) {
    const open = 0.2 + 0.8 * Math.abs(Math.sin(t * b.flap + b.phase));
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.heading + Math.PI / 2);
    ctx.globalAlpha = b.alpha;
    ctx.fillStyle = b.color;
    ctx.save();
    ctx.scale(open, 1);
    wing(b.size, 1);
    wing(b.size, -1);
    ctx.restore();
    ctx.globalAlpha = Math.min(1, b.alpha + 0.3);
    ctx.fillStyle = '#4a3a33';
    ctx.beginPath();
    ctx.ellipse(0, 0, b.size * 0.07, b.size * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  let last = performance.now(), raf = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = now / 1000;
    ctx.clearRect(0, 0, W, H);
    for (const b of list) {
      // gentle wandering with a slight upward drift
      b.heading += Math.sin(t * b.wobF + b.wob) * b.turn * dt;
      b.x += Math.cos(b.heading) * b.speed * dt;
      b.y += Math.sin(b.heading) * b.speed * dt - 4 * dt;
      const m = 40;
      if (b.x < -m) b.x = W + m; else if (b.x > W + m) b.x = -m;
      if (b.y < -m) b.y = H + m; else if (b.y > H + m) b.y = -m;
      draw(b, t);
    }
    raf = requestAnimationFrame(frame);
  }

  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  readPalette();
  resize();
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  // pick up theme changes (the 🎨 theme picker changes CSS variables)
  new MutationObserver(() => { readPalette(); list.forEach(b => b.color = palette[Math.floor(Math.random() * palette.length)]); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
  start();
})();
