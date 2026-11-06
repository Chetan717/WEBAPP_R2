export const FIREWORKS_DURATION_MS = { welcome: 5400, download: 4800 };

const PALETTES = [
  ["#ffcf65", "#fff1be", "#ff9e46"],
  ["#ff6ea9", "#ffd1ed", "#f399ff"],
  ["#60e8ff", "#d2fbff", "#7da5ff"],
  ["#c7a0ff", "#f2daff", "#ff83b0"],
  ["#ffdf79", "#fff9df", "#ffb35d"],
  ["#87f4c4", "#ddffee", "#7addff"],
];

// One short-lived canvas; no assets, audio, timers per particle, or dependencies.
// All coordinates live in CSS pixels and survive orientation/viewport changes.
export function startFireworks(canvas, { variant = "download", onComplete } = {}) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const duration = FIREWORKS_DURATION_MS[variant] || FIREWORKS_DURATION_MS.download;
  let width = 0;
  let height = 0;
  let frameId = 0;
  let stopped = false;
  let lastPaint = 0;
  let lastElapsed = 0;
  const particles = [];
  const startedAt = performance.now();
  const compact = window.innerWidth < 600;
  const maxParticles = compact ? 340 : 460;
  const launchPlan = variant === "welcome"
    ? [[0, .18, .26], [420, .79, .36], [950, .45, .19], [1500, .24, .43], [2050, .72, .24]]
    : [[0, .22, .28], [280, .79, .38], [720, .48, .19], [1120, .16, .44], [1500, .82, .24], [1800, .51, .35]];
  const rockets = launchPlan.map(([delay, x, y], index) => ({
    delay,
    x,
    y,
    index,
    flight: 720 + (index % 3) * 95,
    exploded: false,
  }));

  function resize() {
    const nextWidth = window.innerWidth;
    const nextHeight = window.innerHeight;
    if (width && height) {
      for (const p of particles) {
        p.x *= nextWidth / width;
        p.y *= nextHeight / height;
        p.px *= nextWidth / width;
        p.py *= nextHeight / height;
      }
    }
    width = nextWidth;
    height = nextHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function explode(rocket) {
    const radius = Math.min(width * .27, height * .2, 145);
    const palette = PALETTES[rocket.index % PALETTES.length];
    const count = compact ? 62 : 82;
    const cx = rocket.x * width;
    const cy = rocket.y * height;
    for (let i = 0; i < count && particles.length < maxParticles; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * .045;
      const ring = i % 3 === 0 ? .54 : 1;
      const speed = (radius / 35) * ring * (.84 + Math.random() * .26);
      particles.push({
        x: cx, y: cy, px: cx, py: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: 1250 + Math.random() * 700,
        color: palette[i % palette.length],
        size: i % 7 === 0 ? 2.4 : 1.45,
        glitter: i % 5 === 0,
      });
    }
  }

  function drawRocket(rocket, progress) {
    const startX = (.5 + (rocket.x - .5) * .5) * width;
    const targetX = rocket.x * width;
    const startY = height + 25;
    const targetY = rocket.y * height;
    const ease = 1 - Math.pow(1 - progress, 1.8);
    const x = startX + (targetX - startX) * ease;
    const y = startY + (targetY - startY) * ease;
    const angle = Math.atan2(targetX - startX, startY - targetY);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const tailLength = 62 + progress * 42;
    const tail = ctx.createLinearGradient(0, 8, 0, tailLength);
    tail.addColorStop(0, "rgba(255,246,193,.98)");
    tail.addColorStop(.25, "rgba(255,181,65,.85)");
    tail.addColorStop(1, "rgba(255,119,30,0)");
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(-3.2, 7);
    ctx.quadraticCurveTo(-5, tailLength * .6, 0, tailLength);
    ctx.quadraticCurveTo(5, tailLength * .6, 3.2, 7);
    ctx.fill();

    // A visible, pointed firework rocket with a gold fuse and glowing exhaust.
    ctx.fillStyle = PALETTES[rocket.index % PALETTES.length][0];
    ctx.fillRect(-3.5, -8, 7, 16);
    ctx.fillStyle = "#fff5ce";
    ctx.fillRect(-3.5, -2, 7, 3);
    ctx.beginPath();
    ctx.moveTo(0, -17);
    ctx.lineTo(-5, -8);
    ctx.lineTo(5, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#ffe7a3";
    ctx.fillRect(-.6, 8, 1.2, 15);
    ctx.shadowColor = "#ffbd54";
    ctx.shadowBlur = 11;
    ctx.beginPath();
    ctx.arc(0, 11, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function paint(now) {
    if (stopped) return;
    const elapsed = now - startedAt;
    if (elapsed >= duration) {
      stop();
      onComplete?.();
      return;
    }
    // Cap at about 30fps on phones/WebViews; integrate using elapsed time.
    if (now - lastPaint < 30) {
      frameId = requestAnimationFrame(paint);
      return;
    }
    const dt = Math.min(2.5, Math.max(0, elapsed - lastElapsed) / 16.667);
    lastElapsed = elapsed;
    lastPaint = now;
    ctx.clearRect(0, 0, width, height);
    const fadeOut = Math.min(1, (duration - elapsed) / 650);

    for (const rocket of rockets) {
      const progress = (elapsed - rocket.delay) / rocket.flight;
      if (progress < 0) continue;
      if (progress < 1) {
        ctx.globalAlpha = fadeOut;
        drawRocket(rocket, progress);
      } else if (!rocket.exploded) {
        rocket.exploded = true;
        explode(rocket);
      }
    }

    ctx.lineCap = "round";
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt * 16.667;
      if (p.age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.px = p.x;
      p.py = p.y;
      p.vx *= Math.pow(.984, dt);
      p.vy = p.vy * Math.pow(.984, dt) + .025 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const lifeProgress = p.age / p.life;
      const twinkle = p.glitter ? .58 + Math.sin(p.age * .024) * .42 : 1;
      const alpha = Math.max(0, (1 - Math.pow(lifeProgress, 1.6)) * twinkle * fadeOut);
      ctx.strokeStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(p.px - p.vx * 4, p.py - p.vy * 4);
      ctx.lineTo(p.x, p.y);
      // A soft outer trail and sharp luminous core read as fireworks rather
      // than falling paper, without expensive per-particle canvas shadows.
      ctx.globalAlpha = alpha * .18;
      ctx.lineWidth = p.size * 4;
      ctx.stroke();
      ctx.globalAlpha = alpha;
      ctx.lineWidth = p.size;
      ctx.stroke();
      if (p.glitter && lifeProgress < .8) {
        ctx.fillStyle = "#fff8df";
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
    }
    ctx.globalAlpha = 1;
    frameId = requestAnimationFrame(paint);
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frameId);
    window.removeEventListener("resize", resize);
    ctx.clearRect(0, 0, width, height);
    particles.length = 0;
  }

  resize();
  window.addEventListener("resize", resize);
  frameId = requestAnimationFrame(paint);
  return stop;
}
