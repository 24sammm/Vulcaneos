/* =========================================================
   simulasi-scene.js · Panggung animasi letusan Anak Krakatau
   ---------------------------------------------------------
   Menggambar adegan erupsi di <canvas id="sceneCanvas"> dan
   memainkan urutan fase: kilatan letusan, kolom abu, lontaran
   material, aliran piroklastik, jatuhan abu, lalu dampak ke
   perairan (gelombang, air mengeruh, uap).
   Seluruh gerak diturunkan dari parameter simulasi.
   ========================================================= */

(() => {
  'use strict';

  const VIEW = { w: 800, h: 460, sea: 330, cx: 452, cy: 150 };

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  const FALLBACK = {
    vei: 4, column: 12, duration: 6, wind: 20, windDir: 135,
    depth: 50, sst: 29, collapse: true, dTss: 0.75,
    pyroclastic: 4.5, tsunamiHeight: 1.8,
  };

  const state = {
    canvas: null, ctx: null, phaseEl: null,
    w: 0, h: 0, dpr: 1,
    p: null, t: 0, last: 0, raf: 0,
    puffs: [], bombs: [], ash: [], steam: [], splashes: [], embers: [],
    puffAcc: 0, bombAcc: 0, ashAcc: 0, emberAcc: 0,
    stars: [], phase: '',
  };

  /* ── UKURAN & TRANSFORMASI ────────────────────────────── */

  function resize() {
    if (!state.canvas) return;
    const rect = state.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    state.w = Math.max(320, rect.width || 800);
    state.h = Math.max(200, rect.height || 450);
    state.dpr = dpr;
    state.canvas.width = Math.round(state.w * dpr);
    state.canvas.height = Math.round(state.h * dpr);
    draw();
  }

  function viewTransform() {
    const k = Math.max(state.w / VIEW.w, state.h / VIEW.h);
    return { k, ox: (state.w - VIEW.w * k) / 2, oy: state.h - VIEW.h * k };
  }

  /* ── PARAMETER ───────────────────────────────────────── */

  function setParams(r) {
    state.p = r;
  }

  const plumeHeight = (p) => 40 + p.column * 7 + p.vei * 4;
  const windVx = (p) => (p.wind / 80) * Math.sin((p.windDir * Math.PI) / 180) * 58;

  /* ── SPAWN PARTIKEL ──────────────────────────────────── */

  function spawnPuff(p) {
    const h = plumeHeight(p);
    // Angin dari utara menjauh dari pengamat, dari selatan mendekat:
    // ukuran kepulan sedikit membesar/mengecil agar arah tetap terbaca.
    const depth = 1 - 0.16 * Math.cos((p.windDir * Math.PI) / 180);
    state.puffs.push({
      x: VIEW.cx + rand(-7, 7),
      y: VIEW.cy + rand(-4, 4),
      vx: windVx(p) * 0.5 + rand(-7, 7),
      vy: -(h / 2.1) * rand(0.72, 1.16),
      r: (rand(5, 11) + p.vei * 1.3) * depth,
      age: 0,
      life: rand(2.8, 4.8),
      warm: rand(0, 1),
      wob: rand(0, Math.PI * 2),
    });
  }

  function spawnBomb(p) {
    const power = 0.4 + p.vei / 6;
    state.bombs.push({
      x: VIEW.cx + rand(-5, 5),
      y: VIEW.cy,
      vx: rand(-1, 1) * 210 * power + windVx(p) * 0.4,
      vy: -rand(110, 250) * (0.6 + power * 0.7),
      r: rand(1.3, 2.8),
      trail: [],
    });
  }

  function spawnSplash(x) {
    state.splashes.push({ x, y: VIEW.sea + rand(1, 10), r: 2, age: 0, life: range(0.55, 0.9) });
    for (let i = 0; i < 3; i += 1) {
      state.steam.push({
        x: x + rand(-6, 6),
        y: VIEW.sea + rand(-2, 4),
        vy: -rand(16, 46),
        vx: rand(-8, 8),
        r: rand(5, 12),
        age: 0,
        life: range(1.1, 2.2),
      });
    }
  }

  function range(a, b) {
    return rand(a, b);
  }

  /* ── LANGKAH WAKTU ───────────────────────────────────── */

  function step(dt) {
    const p = state.p || FALLBACK;
    state.t += dt;
    const t = state.t;

    if (t > 0.12) {
      state.puffAcc += dt * (20 + p.vei * 7);
      while (state.puffAcc >= 1) {
        state.puffAcc -= 1;
        if (state.puffs.length < 140) spawnPuff(p);
      }
    }

    if (t > 0.25 && t < 1.2 + p.vei * 0.22) {
      state.bombAcc += dt * (5 + p.vei * 3.4);
      while (state.bombAcc >= 1) {
        state.bombAcc -= 1;
        if (state.bombs.length < 70) spawnBomb(p);
      }
    }

    if (t > 1.1) {
      state.ashAcc += dt * (12 + p.vei * 7 + p.column * 1.4);
      while (state.ashAcc >= 1) {
        state.ashAcc -= 1;
        if (state.ash.length < 140) {
          state.ash.push({
            x: VIEW.cx + rand(-120, 120) + windVx(p) * 0.4,
            y: rand(20, VIEW.cy + 40),
            vx: windVx(p) * 0.55 + rand(-6, 6),
            vy: rand(16, 52),
            r: rand(0.6, 1.8),
          });
        }
      }
    }

    if (t < 3.2) {
      state.emberAcc += dt * (10 + p.vei * 5);
      while (state.emberAcc >= 1) {
        state.emberAcc -= 1;
        if (state.embers.length < 60) {
          state.embers.push({
            x: VIEW.cx + rand(-16, 16),
            y: VIEW.cy + rand(-10, 8),
            vx: rand(-26, 26),
            vy: rand(-70, -22),
            r: rand(0.8, 2),
            age: 0,
            life: rand(0.6, 1.6),
          });
        }
      }
    }

    updatePuffs(dt, p);
    updateBombs(dt, p);
    updateAsh(dt);
    updateSteam(dt);
    updateEmbers(dt);
    updateSplashes(dt);
  }

  function updatePuffs(dt, p) {
    const drift = windVx(p);
    for (let i = state.puffs.length - 1; i >= 0; i -= 1) {
      const q = state.puffs[i];
      q.age += dt;
      q.vx += (drift - q.vx) * 0.7 * dt;
      q.x += (q.vx + Math.sin(q.age * 1.6 + q.wob) * 7) * dt;
      q.y += q.vy * dt;
      q.vy *= 0.994;
      q.r += (5 + p.column * 0.75) * dt;
      if (q.age > q.life || q.y < -220) state.puffs.splice(i, 1);
    }
  }

  function updateBombs(dt, p) {
    for (let i = state.bombs.length - 1; i >= 0; i -= 1) {
      const b = state.bombs[i];
      b.trail.push({ x: b.x, y: b.y });
      if (b.trail.length > 7) b.trail.shift();
      b.vy += 300 * dt;
      b.vx += windVx(p) * 0.25 * dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.y > VIEW.sea + rand(0, 14)) {
        spawnSplash(b.x);
        state.bombs.splice(i, 1);
      }
    }
  }

  function updateAsh(dt) {
    for (let i = state.ash.length - 1; i >= 0; i -= 1) {
      const a = state.ash[i];
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      if (a.y > VIEW.sea + 40) state.ash.splice(i, 1);
    }
  }

  function updateSteam(dt) {
    for (let i = state.steam.length - 1; i >= 0; i -= 1) {
      const s = state.steam[i];
      s.age += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy *= 0.99;
      s.r += 9 * dt;
      if (s.age > s.life) state.steam.splice(i, 1);
    }
  }

  function updateEmbers(dt) {
    for (let i = state.embers.length - 1; i >= 0; i -= 1) {
      const e = state.embers[i];
      e.age += dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.vy += 34 * dt;
      if (e.age > e.life) state.embers.splice(i, 1);
    }
  }

  function updateSplashes(dt) {
    for (let i = state.splashes.length - 1; i >= 0; i -= 1) {
      const s = state.splashes[i];
      s.age += dt;
      s.r += 42 * dt;
      if (s.age > s.life) state.splashes.splice(i, 1);
    }
  }

  /* ── MENGGAMBAR ──────────────────────────────────────── */

  function draw() {
    const ctx = state.ctx;
    if (!ctx) return;
    const p = state.p || FALLBACK;
    const t = state.t;
    const { k, ox, oy } = viewTransform();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    ctx.setTransform(state.dpr * k, 0, 0, state.dpr * k, state.dpr * ox, state.dpr * oy);

    const growth = clamp((t - 1) / 3.6, 0, 1);
    const ashFilm = clamp((t - 2.1) / 4, 0, 1);

    drawSky(ctx, p, t, growth);
    drawIslands(ctx, ashFilm);
    drawSea(ctx, p, t, growth, ashFilm);
    drawTsunami(ctx, p, t);
    drawVolcano(ctx, p, t);
    drawPyroclastic(ctx, p, t);
    drawSteam(ctx);
    drawPuffs(ctx, p);
    drawBombs(ctx);
    drawEmbers(ctx);
    drawAsh(ctx);
    drawSplashes(ctx);
    drawFlash(ctx, p, t);
    updatePhase(t);
  }

  function drawSky(ctx, p, t, growth) {
    const sky = ctx.createLinearGradient(0, -80, 0, VIEW.sea);
    sky.addColorStop(0, '#07131c');
    sky.addColorStop(0.42, '#162d39');
    sky.addColorStop(0.74, '#4a4f4e');
    sky.addColorStop(1, '#9d7658');
    ctx.fillStyle = sky;
    ctx.fillRect(-320, -320, 1440, VIEW.sea + 324);

    ctx.save();
    for (let i = 0; i < state.stars.length; i += 1) {
      const s = state.stars[i];
      const twinkle = 0.35 + 0.3 * Math.sin(t * 0.9 + s.p);
      ctx.fillStyle = `rgba(233,228,213,${(twinkle * (1 - growth * 0.8)).toFixed(3)})`;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.restore();

    // Cahaya kawah yang memantul di langit
    const glowR = 110 + p.vei * 30 + p.column * 3.2;
    const glow = ctx.createRadialGradient(VIEW.cx, VIEW.cy, 0, VIEW.cx, VIEW.cy, glowR);
    glow.addColorStop(0, `rgba(255,198,124,${(0.26 + p.vei * 0.05).toFixed(3)})`);
    glow.addColorStop(0.35, 'rgba(255,146,70,0.14)');
    glow.addColorStop(1, 'rgba(255,110,40,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.fillRect(VIEW.cx - glowR, VIEW.cy - glowR, glowR * 2, glowR * 2);
    ctx.restore();
  }

  function drawIslands(ctx, ashFilm) {
    ctx.fillStyle = '#122327';
    ctx.beginPath();
    ctx.moveTo(-40, 338);
    ctx.lineTo(58, 313);
    ctx.lineTo(118, 331);
    ctx.lineTo(152, 321);
    ctx.lineTo(220, 338);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(686, 339);
    ctx.lineTo(736, 317);
    ctx.lineTo(840, 335);
    ctx.lineTo(840, 346);
    ctx.lineTo(686, 346);
    ctx.closePath();
    ctx.fill();

    if (ashFilm > 0) {
      ctx.fillStyle = `rgba(150,146,138,${(ashFilm * 0.35).toFixed(3)})`;
      ctx.fillRect(-40, 300, 900, 48);
      ctx.fillStyle = '#122327';
    }
  }

  function drawSea(ctx, p, t, growth, ashFilm) {
    const sea = ctx.createLinearGradient(0, VIEW.sea, 0, VIEW.h + 40);
    sea.addColorStop(0, '#2a585f');
    sea.addColorStop(0.55, '#1a434b');
    sea.addColorStop(1, '#0c2730');
    ctx.fillStyle = sea;
    ctx.fillRect(-320, VIEW.sea, 1440, VIEW.h - VIEW.sea + 300);

    // Pantulan cahaya kawah di permukaan
    const shine = ctx.createLinearGradient(0, VIEW.sea, 0, VIEW.sea + 90);
    shine.addColorStop(0, `rgba(240,160,94,${(0.22 + p.vei * 0.03).toFixed(3)})`);
    shine.addColorStop(1, 'rgba(240,160,94,0)');
    ctx.fillStyle = shine;
    ctx.fillRect(VIEW.cx - 130, VIEW.sea, 260, 92);

    // Air mengeruh menyebar dari pulau
    const rx = (60 + 250 * growth) * (0.75 + p.dTss * 0.7);
    if (rx > 6) {
      ctx.save();
      ctx.translate(VIEW.cx, VIEW.sea + 44);
      ctx.scale(1, 0.18);
      const turb = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      const alpha = clamp((0.18 + p.dTss * 0.45) * growth, 0, 0.72);
      turb.addColorStop(0, `rgba(150,132,96,${alpha.toFixed(3)})`);
      turb.addColorStop(0.55, `rgba(112,132,104,${(alpha * 0.7).toFixed(3)})`);
      turb.addColorStop(1, 'rgba(90,120,110,0)');
      ctx.fillStyle = turb;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Lapisan abu yang mengapung dan menutup permukaan
    if (ashFilm > 0) {
      const film = ctx.createLinearGradient(0, VIEW.sea, 0, VIEW.sea + 70);
      film.addColorStop(0, `rgba(190,183,170,${(ashFilm * 0.4).toFixed(3)})`);
      film.addColorStop(1, 'rgba(190,183,170,0)');
      ctx.fillStyle = film;
      ctx.fillRect(-320, VIEW.sea, 1440, 74);
    }

    // Garis gelombang
    ctx.lineWidth = 0.9;
    for (let i = 0; i < 10; i += 1) {
      const y = VIEW.sea + 9 + i * 13;
      ctx.strokeStyle = `rgba(226,236,231,${(0.09 - i * 0.005).toFixed(3)})`;
      ctx.beginPath();
      for (let x = -40; x <= 840; x += 20) {
        const yy = y + Math.sin(x * 0.02 + t * (1.1 + i * 0.05) + i) * (1.2 + i * 0.24);
        if (x === -40) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function drawTsunami(ctx, p, t) {
    if (!p.collapse) return;
    for (let i = 0; i < 3; i += 1) {
      const tau = t - 1.15 - i * 0.55;
      if (tau <= 0) continue;
      const rr = tau * (58 + p.tsunamiHeight * 22);
      const alpha = clamp(0.5 - rr / 620, 0, 0.5);
      if (alpha <= 0.01) continue;
      ctx.strokeStyle = `rgba(242,238,226,${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.8 - i * 0.3;
      ctx.beginPath();
      ctx.ellipse(VIEW.cx, VIEW.sea + 8 + i * 4, rr, rr * 0.17, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawVolcano(ctx, p, t) {
    const flank = ctx.createLinearGradient(232, 0, 676, 0);
    flank.addColorStop(0, '#16262a');
    flank.addColorStop(0.5, '#334036');
    flank.addColorStop(1, '#152427');
    ctx.fillStyle = flank;
    ctx.beginPath();
    ctx.moveTo(232, 334);
    ctx.bezierCurveTo(318, 322, 396, 216, 432, 150);
    ctx.lineTo(472, 148);
    ctx.bezierCurveTo(512, 214, 592, 320, 676, 334);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(61,74,60,0.55)';
    ctx.beginPath();
    ctx.moveTo(404, 334);
    ctx.bezierCurveTo(424, 288, 442, 206, 452, 152);
    ctx.lineTo(466, 150);
    ctx.bezierCurveTo(478, 210, 498, 292, 520, 334);
    ctx.closePath();
    ctx.fill();

    // Aliran lava di lereng
    const flicker = 0.62 + 0.32 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 19);
    const lava = ctx.createLinearGradient(0, 150, 0, 300);
    lava.addColorStop(0, '#ffe6b4');
    lava.addColorStop(0.5, '#ff9b45');
    lava.addColorStop(1, 'rgba(255,106,36,0.35)');
    ctx.globalAlpha = clamp(flicker, 0.35, 1) * clamp(0.4 + p.vei * 0.12, 0.4, 1);
    ctx.fillStyle = lava;
    ctx.beginPath();
    ctx.moveTo(452, 158);
    ctx.bezierCurveTo(440, 210, 424, 252, 408, 296);
    ctx.bezierCurveTo(430, 268, 452, 226, 464, 170);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(10,18,17,0.72)';
    ctx.beginPath();
    ctx.ellipse(452, 150, 25, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cahaya kawah
    const glowR = 34 + p.vei * 10 + 8 * Math.sin(t * 9);
    const g = ctx.createRadialGradient(452, 148, 0, 452, 148, glowR);
    g.addColorStop(0, 'rgba(255,226,170,0.95)');
    g.addColorStop(0.4, 'rgba(255,150,70,0.5)');
    g.addColorStop(1, 'rgba(255,106,36,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(452 - glowR, 148 - glowR, glowR * 2, glowR * 2);
    ctx.restore();
  }

  function drawPyroclastic(ctx, p, t) {
    if (p.pyroclastic < 1.2) return;
    const flow = clamp((t - 1.7) / 2.4, 0, 1);
    if (flow <= 0) return;
    const reach = flow * clamp(p.pyroclastic / 4.2, 0.2, 1.2);

    const legs = [
      { cx: 424, cy: 244, ex: 396, ey: 328 },
      { cx: 488, cy: 248, ex: 516, ey: 330 },
    ];

    for (let i = 0; i < legs.length; i += 1) {
      const leg = legs[i];
      const front = clamp(reach + i * 0.06, 0, 1.1);
      for (let s = 0; s <= 6; s += 1) {
        const u = (s / 6) * front;
        const x = (1 - u) * (1 - u) * 452 + 2 * (1 - u) * u * leg.cx + u * u * leg.ex;
        const y = (1 - u) * (1 - u) * 156 + 2 * (1 - u) * u * leg.cy + u * u * leg.ey;
        const rr = 8 + u * 20 + Math.sin(t * 3 + s) * 1.6;
        const blob = ctx.createRadialGradient(x, y, 0, x, y, rr);
        blob.addColorStop(0, 'rgba(78,74,66,0.62)');
        blob.addColorStop(0.6, 'rgba(70,68,62,0.36)');
        blob.addColorStop(1, 'rgba(60,60,56,0)');
        ctx.fillStyle = blob;
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
      if (front > 0.95) {
        ctx.fillStyle = 'rgba(96,92,84,0.35)';
        ctx.beginPath();
        ctx.ellipse(leg.ex + (i ? 6 : -6), VIEW.sea + 2, 26, 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Uap saat aliran menyentuh laut
    if (reach > 0.95 && state.steam.length < 80) {
      if (Math.random() < 0.5) {
        state.steam.push({
          x: 400 + rand(-14, 14),
          y: VIEW.sea + rand(-4, 2),
          vy: -rand(14, 34),
          vx: rand(-10, 10),
          r: rand(6, 14),
          age: 0,
          life: rand(1.4, 2.6),
        });
      }
    }
  }

  function drawSteam(ctx) {
    for (let i = 0; i < state.steam.length; i += 1) {
      const s = state.steam[i];
      const a = clamp(1 - s.age / s.life, 0, 1) * 0.3;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      g.addColorStop(0, `rgba(226,224,214,${a.toFixed(3)})`);
      g.addColorStop(1, 'rgba(210,208,198,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPuffs(ctx, p) {
    const list = state.puffs.slice().sort((a, b) => b.r - a.r);
    for (let i = 0; i < list.length; i += 1) {
      const q = list[i];
      const life = clamp(1 - q.age / q.life, 0, 1);
      const a = Math.pow(life, 1.1) * (0.2 + p.vei * 0.025);
      if (a <= 0.004) continue;
      const g = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, q.r);
      if (q.age < 0.7) {
        const warm = clamp(1 - q.age / 0.7, 0, 1) * q.warm;
        g.addColorStop(0, `rgba(248,206,154,${(a * (0.7 + warm * 0.8)).toFixed(3)})`);
      } else {
        g.addColorStop(0, `rgba(219,208,193,${(a * 0.95).toFixed(3)})`);
      }
      g.addColorStop(0.55, `rgba(158,152,144,${(a * 0.6).toFixed(3)})`);
      g.addColorStop(1, 'rgba(118,118,120,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(q.x, q.y, q.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBombs(ctx) {
    for (let i = 0; i < state.bombs.length; i += 1) {
      const b = state.bombs[i];
      if (b.trail.length > 1) {
        ctx.strokeStyle = 'rgba(255,180,110,0.45)';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(b.trail[0].x, b.trail[0].y);
        for (let j = 1; j < b.trail.length; j += 1) ctx.lineTo(b.trail[j].x, b.trail[j].y);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 4);
      g.addColorStop(0, 'rgba(255,226,168,0.95)');
      g.addColorStop(0.4, 'rgba(255,152,74,0.45)');
      g.addColorStop(1, 'rgba(255,120,50,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawEmbers(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < state.embers.length; i += 1) {
      const e = state.embers[i];
      const a = clamp(1 - e.age / e.life, 0, 1);
      ctx.fillStyle = `rgba(255,178,104,${(a * 0.8).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawAsh(ctx) {
    ctx.fillStyle = 'rgba(226,219,206,0.4)';
    for (let i = 0; i < state.ash.length; i += 1) {
      const a = state.ash[i];
      ctx.fillRect(a.x, a.y, a.r, a.r);
    }
  }

  function drawSplashes(ctx) {
    for (let i = 0; i < state.splashes.length; i += 1) {
      const s = state.splashes[i];
      const a = clamp(1 - s.age / s.life, 0, 1) * 0.5;
      ctx.strokeStyle = `rgba(226,240,234,${a.toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r, s.r * 0.28, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawFlash(ctx, p, t) {
    if (t > 0.45) return;
    const a = (1 - t / 0.45) * (0.18 + p.vei * 0.045);
    ctx.fillStyle = `rgba(255,219,172,${a.toFixed(3)})`;
    ctx.fillRect(-320, -320, 1440, VIEW.sea + 324);
  }

  function updatePhase(t) {
    if (!state.phaseEl) return;
    let label = 'Dampak perairan';
    if (t < 1.2) label = 'Letusan awal';
    else if (t < 2.1) label = 'Kolom abu naik';
    else if (t < 3.2) label = 'Aliran piroklastik';
    else if (t < 4.6) label = 'Jatuhan abu';
    if (label !== state.phase) {
      state.phase = label;
      state.phaseEl.textContent = label;
    }
  }

  /* ── KONTROL ─────────────────────────────────────────── */

  function restart() {
    state.t = 0;
    state.last = 0;
    state.puffs.length = 0;
    state.bombs.length = 0;
    state.ash.length = 0;
    state.steam.length = 0;
    state.splashes.length = 0;
    state.embers.length = 0;
    state.puffAcc = 0;
    state.bombAcc = 0;
    state.ashAcc = 0;
    state.emberAcc = 0;
    state.phase = '';
    draw();
  }

  function start() {
    if (state.raf) return;
    const loop = (now) => {
      const dt = state.last ? Math.min(0.05, (now - state.last) / 1000) : 0.016;
      state.last = now;
      step(dt);
      draw();
      state.raf = window.requestAnimationFrame(loop);
    };
    state.raf = window.requestAnimationFrame(loop);
  }

  function init() {
    state.canvas = document.getElementById('sceneCanvas');
    if (!state.canvas) return false;
    state.ctx = state.canvas.getContext('2d');
    if (!state.ctx) return false;
    state.phaseEl = document.getElementById('scenePhase');
    for (let i = 0; i < 30; i += 1) {
      state.stars.push({ x: rand(-20, 820), y: rand(-10, 250), r: rand(0.9, 2), p: rand(0, Math.PI * 2) });
    }
    resize();
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => resize());
      ro.observe(state.canvas);
    }
    return true;
  }

  window.SimScene = { init, start, setParams, restart };
})();
