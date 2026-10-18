/* ============================================================
 * BOMBIT — Motion ID / scenes
 * Six chapters of flat, beat-cut graphic chaos.
 * ============================================================ */
(function () {
  'use strict';
  const M = window.M, P = M.P, TAU = Math.PI * 2;
  const Scenes = (M.Scenes = {});
  const W = M.W, H = M.H;

  const fill = (ctx, c) => { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); };
  const save = (ctx) => ctx.save();
  const restore = (ctx) => ctx.restore();
  const clamp01 = M.clamp;

  function flash(ctx, a) {
    if (!Number.isFinite(a) || a <= 0) return;
    ctx.save(); ctx.globalAlpha = M.clamp(a, 0, 1); ctx.fillStyle = P.white; ctx.fillRect(0, 0, W, H); ctx.restore();
  }
  function line(ctx, x1, y1, x2, y2, color, w = 2, alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  }
  function stripes(ctx, x, y, w, h, c1 = P.ink, c2 = P.yellow, sw = 46, ang = -.6) {
    ctx.save();
    M.rr(ctx, x, y, w, h, 0); ctx.clip();
    ctx.fillStyle = c1; ctx.fillRect(x, y, w, h);
    ctx.translate(x + w / 2, y + h / 2); ctx.rotate(ang);
    ctx.fillStyle = c2;
    const m = (w + h) * 1.2;
    for (let i = -m; i < m; i += sw * 2) ctx.fillRect(i, -m, sw, m * 2);
    ctx.restore();
  }
  function dotGrid(ctx, x, y, w, h, color = P.ink, alpha = .1) {
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.fillStyle = M.pattern('dots', color);
    ctx.fillRect(x, y, w, h); ctx.restore();
  }
  function tag(ctx, text, x, y, color = P.ink, bg = P.cream, o = {}) {
    const { size = 22, padX = 14, padY = 7, rot = 0, align = 'left', fam = M.F.mono, border = null } = o;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    M.setFont(ctx, size, 700, fam);
    const w = ctx.measureText(text).width + padX * 2, h = size + padY * 2;
    const xx = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
    ctx.fillStyle = bg; ctx.fillRect(xx, -h / 2, w, h);
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 2; ctx.strokeRect(xx, -h / 2, w, h); }
    ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, xx + padX, 1);
    ctx.restore();
    return w;
  }
  function cover(ctx, key, x, y, w, h, zoom = 1, ox = 0, oy = 0, alpha = 1) {
    const a = M.assets[key]; if (!a) return;
    const c = a.canvas;
    const s = Math.max(w / c.width, h / c.height) * zoom;
    const dw = c.width * s, dh = c.height * s;
    ctx.save(); ctx.globalAlpha *= alpha;
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.drawImage(c, x + (w - dw) / 2 + ox, y + (h - dh) / 2 + oy, dw, dh);
    ctx.restore();
  }
  function head(ctx, key, x, y, r, o = {}) {
    const a = M.assets[key]; if (!a) return;
    const c = a.canvas;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    ctx.fillStyle = o.bg || P.cream; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    const sh = c.height * .55;
    const s = Math.max(r * 2 / c.width, r * 2 / sh) * (o.zoom || 1.08);
    const dw = c.width * s, dh = c.height * s;
    ctx.drawImage(c, x - dw / 2 + (o.ox || 0), y - dh * .35 + (o.oy || 0), dw, dh);
    if (o.ring) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = o.ring; ctx.lineWidth = o.ringW || 8; ctx.stroke(); }
    ctx.restore();
  }
  function clipImagePoly(ctx, pts, fn) {
    ctx.save(); ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.clip(); fn(); ctx.restore();
  }
  function infoBlock(ctx, ch, x, y, w, dark = true, align = 'left') {
    const bg = dark ? P.ink : P.cream;
    const fg = dark ? P.cream : P.ink;
    const h = 176;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = bg;
    M.rr(ctx, 0, 0, w, h, 4); ctx.fill();
    // accent bar
    ctx.fillStyle = ch.color;
    ctx.fillRect(0, 0, 12, h);
    tag(ctx, 'Q / SKILL', 34, 30, fg, bg, { size: 17, border: M.rgba(fg, .28), padY: 5, padX: 9 });
    M.text(ctx, ch.skill, 34, 92, { size: 50, weight: 700, fam: M.F.cn, color: fg, align: 'left' });
    M.text(ctx, ch.line, 34, 128, { size: 22, weight: 500, fam: M.F.cn, color: M.rgba(fg, .78), align: 'left' });
    M.text(ctx, `${ch.skillEn}   /   CD ${ch.cool}s`, w - 28, 158, { size: 14, fam: M.F.mono, color: ch.color, align: 'right', tracking: .8 });
    ctx.restore();
    return h;
  }
  function verticalLabel(ctx, text, x, y, size, color, o = {}) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(o.rot || 0);
    M.text(ctx, text, 0, 0, { size, fam: o.fam || M.F.en, weight: 900, color, align: o.align || 'center', tracking: o.tracking || 2 });
    ctx.restore();
  }
  function littleBomb(ctx, x, y, r, t) {
    M.bomb(ctx, x, y, r, { spark: 1, time: t, rot: -.35 });
  }

  // ============================================================
  // 00 — COLD OPEN / 0–4 s
  // ============================================================
  Scenes.cold = function (ctx, t) {
    if (t < 2) {
      fill(ctx, '#0D0A10');
      // slow grid
      ctx.save();
      ctx.globalAlpha = .16; ctx.strokeStyle = '#F5EBD8'; ctx.lineWidth = 1;
      for (let i = 0; i < 7; i++) {
        const y = 200 + i * 120 + (t * 24) % 120;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      for (let i = 0; i < 14; i++) { ctx.beginPath(); ctx.moveTo(130 + i * 140, 0); ctx.lineTo(130 + i * 140, H); ctx.stroke(); }
      ctx.restore();
      // alarm corner
      M.text(ctx, 'FUSE / ARMED', 72, 158, { size: 15, fam: M.F.mono, color: P.cream, tracking: 3 });
      M.text(ctx, 'SIGNAL 00', 1848, 158, { size: 15, fam: M.F.mono, color: P.cream, tracking: 3, align: 'right' });
      // dramatic countdown numerals behind
      const digits = ['3', '2', '1'];
      const idx = Math.min(2, Math.floor(t / .52));
      const dl = (t - idx * .52) / .52;
      const numScale = 1 + .08 * Math.exp(-dl * 10);
      ctx.save();
      ctx.translate(1180, 690); ctx.rotate(-.08); ctx.scale(numScale, numScale);
      M.text(ctx, digits[idx], 0, 0, {
        size: 660, fam: M.F.en2, weight: 900, color: 'transparent', stroke: M.rgba(P.cream, .23),
        lineWidth: 4, align: 'center', baseline: 'middle', tracking: -20
      });
      ctx.restore();
      // fuse cord
      const bombX = 960, bombY = 590, r = 150;
      const burn = M.clamp((t - .15) / 1.55, 0, 1);
      const sparkX = M.lerp(520, bombX, burn * burn * (1.15 - .15 * burn)) + 8;
      const sparkY = M.lerp(270, bombY - r * .96, burn * burn * (1.1 - .1 * burn));
      ctx.save();
      ctx.strokeStyle = P.cream; ctx.lineWidth = 12; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(520, 270); ctx.quadraticCurveTo(760, 330, 850, 420); ctx.quadraticCurveTo(920, 485, bombX + 12, bombY - r * .9); ctx.stroke();
      ctx.strokeStyle = P.orange; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(520, 270); ctx.quadraticCurveTo(760, 330, 850, 420); ctx.quadraticCurveTo(920, 485, bombX + 12, bombY - r * .9); ctx.stroke();
      // ember
      M.circle(ctx, sparkX, sparkY, 10 + 4 * Math.sin(t * 45), P.yellow);
      M.circle(ctx, sparkX, sparkY, 22, M.rgba(P.orange, .35));
      for (let i = 0; i < 16; i++) {
        const a = M.rand(i * 3.1) * TAU, d = 8 + M.rand(i * 7.2) * 60 * (.5 + .5 * Math.sin(t * 12 + i));
        M.circle(ctx, sparkX + Math.cos(a) * d, sparkY + Math.sin(a) * d, 2 + M.rand(i) * 3, M.rgba(i % 2 ? P.yellow : P.orange, .8));
      }
      ctx.restore();
      // bomb
      const drop = M.ease.outBack(M.clamp(t / .55, 0, 1));
      const squash = M.clamp((t - .55) / .18, 0, 1);
      ctx.save();
      ctx.translate(bombX, bombY - (1 - drop) * 500);
      ctx.scale(1 + .12 * Math.sin(squash * Math.PI), 1 - .1 * Math.sin(squash * Math.PI));
      M.bomb(ctx, 0, 0, r, { spark: t > .35 ? 1 : .4, time: t, rot: -.08, glow: 26 });
      ctx.restore();
      // countdown text bottom
      M.text(ctx, 'CHANCELLOR // CANDY BOMB', 960, 960, { size: 16, fam: M.F.mono, color: M.rgba(P.cream, .7), align: 'center', tracking: 4 });
      M.text(ctx, '你只有一颗。', 960, 1002, { size: 28, weight: 700, fam: M.F.cn, color: P.cream, align: 'center' });
      // flash just before detonation
      flash(ctx, M.clamp((t - 1.84) / .1, 0, 1) * .85);
      return;
    }

    // hard-cut title, 4 alternate poster layouts
    const u = t - 2;
    const beat = Math.floor(u / .5);
    const lp = u - beat * .5;
    const variants = 4;
    const v = beat % variants;
    const punch = 1 + .07 * Math.exp(-lp * 18);
    const ink = [P.ink, P.cream, P.ink, P.orange][v];
    const paper = [P.cream, P.ink, P.orange, P.ink][v];
    fill(ctx, paper);
    // backdrop pieces
    if (v === 0) {
      // orange sun + rays on cream
      M.circle(ctx, 1410, 565, 405 * punch, P.orange);
      M.circle(ctx, 1410, 565, 330, M.rgba(P.cream, .08));
      ctx.save();
      ctx.translate(1410, 565); ctx.rotate(u * .18);
      M.rayLines(ctx, 0, 0, 420, 690, 36, M.rgba(P.ink, .22), 0, 2);
      ctx.restore();
      dotGrid(ctx, 0, 0, W, H, P.ink, .075);
    } else if (v === 1) {
      // dark + pink disc
      M.circle(ctx, 380, 850, 430, P.hot);
      M.circle(ctx, 380, 850, 360, M.rgba(P.yellow, .55));
      ctx.save(); ctx.translate(380, 850); ctx.rotate(-u * .25);
      M.star(ctx, 0, 0, 400, 185, 12, M.rgba(P.ink, .18));
      ctx.restore();
      stripes(ctx, 0, 0, W, 120, P.cream, P.pink, 28, -.48);
      stripes(ctx, 0, 960, W, 120, P.cream, P.pink, 28, -.48);
    } else if (v === 2) {
      // orange + black hole
      M.circle(ctx, 1290, 690, 390 * punch, P.ink);
      M.circle(ctx, 1290, 690, 275, P.orange);
      ctx.save(); ctx.translate(1290, 690); ctx.rotate(u * .3);
      M.rayLines(ctx, 0, 0, 270, 800, 24, M.rgba(P.cream, .35), 0, 3);
      ctx.restore();
      stripes(ctx, 0, 0, W, 70, P.ink, P.cream, 28, -.5);
    } else {
      // cream + cyan blocks
      ctx.fillStyle = P.cyan; ctx.fillRect(0, 0, 420, H);
      ctx.fillStyle = P.pink; ctx.fillRect(1500, 0, 420, H);
      dotGrid(ctx, 420, 0, 1080, H, P.cream, .12);
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.translate(720 + i * 120, 760 + Math.sin(i * 2 + u * 8) * 40); ctx.rotate(-.2);
        ctx.fillStyle = i % 2 ? P.cream : P.orange; ctx.fillRect(-40, -8, 80, 16); ctx.restore();
      }
    }

    // title lockup, layout shifts by beat
    const tilt = [0, -.03, .03, -.012][v];
    const xTitle = [110, 250, 90, 156][v];
    const yTitle = [610, 670, 640, 640][v];
    ctx.save();
    ctx.translate(xTitle, yTitle); ctx.rotate(tilt); ctx.scale(punch, punch);
    if (v === 1) {
      M.display(ctx, 'Q版', 0, -340, { size: 190, color: P.cream, stroke: P.ink, lineWidth: 6, align: 'left', fam: M.F.cn, weight: 900, depth: 8, depthColor: P.hot, tracking: -8 });
      M.display(ctx, '泡泡堂', 0, 0, { size: 330, color: P.cream, stroke: P.ink, lineWidth: 8, align: 'left', fam: M.F.cn, weight: 900, depth: 12, depthColor: P.hot, tracking: -14 });
      M.display(ctx, 'BOMBIT', 4, 120, { size: 140, color: P.orange, stroke: P.ink, lineWidth: 5, align: 'left', fam: M.F.en, tracking: -3 });
    } else if (v === 2) {
      M.text(ctx, 'Q版', 6, -360, { size: 156, fam: M.F.cn, weight: 900, color: P.cream, tracking: -4 });
      M.display(ctx, '泡泡堂', 0, 0, { size: 340, color: P.cream, stroke: P.ink, lineWidth: 10, align: 'left', fam: M.F.cn, weight: 900, depth: 16, depthColor: P.ink, tracking: -14 });
      M.text(ctx, 'BOMBIT / BOMB IT / BOMBIT', 10, 116, { size: 24, fam: M.F.mono, weight: 700, color: P.ink, tracking: 5 });
    } else {
      // chromatic glitch title
      ctx.save();
      ctx.globalAlpha = .8; ctx.fillStyle = P.cyan; ctx.fillRect(-30, -330, 980, 430);
      ctx.restore();
      M.display(ctx, 'Q版', 0, -340, { size: 190, color: P.cream, stroke: P.ink, lineWidth: 5, align: 'left', fam: M.F.cn, weight: 900, tracking: -6 });
      M.display(ctx, '泡泡堂', 0, 0, { size: 330, color: P.cream, stroke: P.ink, lineWidth: 7, align: 'left', fam: M.F.cn, weight: 900, depth: 10, depthColor: P.orange, tracking: -12 });
      M.display(ctx, 'BOMBIT', 4, 112, { size: 122, color: P.orange, stroke: P.ink, lineWidth: 4, align: 'left', fam: M.F.en, tracking: 0 });
    }
    ctx.restore();

    // small descriptors
    if (v !== 3) {
      M.text(ctx, '精灵冒险  ×  同屏对战', 1260, 1000, { size: 32, fam: M.F.cn, weight: 700, color: v === 1 ? P.cream : P.ink, align: 'center', tracking: 4 });
      M.text(ctx, '6 SPIRITS  /  3 MODES  /  1 BOMB', 1260, 1034, { size: 14, fam: M.F.mono, color: v === 1 ? P.pink : P.ink, align: 'center', tracking: 2.6 });
    }
    // bomb at right, oversized
    if (v !== 1) {
      ctx.save();
      ctx.translate(1450, 585); ctx.rotate(Math.sin(u * 3) * .05);
      const br = 235 + 10 * M.beatPulse(u);
      M.bomb(ctx, 0, 0, br, { spark: 1, time: u, rot: 0, glow: 30, face: v === 0 });
      ctx.restore();
    }
    // character peeks
    if (v === 1) {
      [['xiaonuo', 830, 900, 260, -.1], ['axiu', 1160, 920, 250, .09], ['weilai', 1500, 890, 250, -.05]].forEach(([k, x, y, h, r]) => {
        ctx.save(); ctx.translate(x, y); ctx.rotate(r);
        M.char(ctx, k, 0, 0, h, { shadow: P.ink, sx: 8, sy: 8 });
        ctx.restore();
      });
    }
    // vertical brand stamp
    ctx.save(); ctx.translate(1840, 520); ctx.rotate(Math.PI / 2);
    M.text(ctx, 'Q-BAN BUBBLE HALL / OFFICIAL TRAILER', 0, 0, { size: 13, fam: M.F.mono, weight: 700, color: v === 2 ? P.cream : P.ink, align: 'center', tracking: 3 });
    ctx.restore();
    flash(ctx, Math.exp(-lp * 25) * .38);
  };

  // ============================================================
  // 01 — HOOK / 4–8 s
  // ============================================================
  Scenes.hook = function (ctx, t) {
    const u = t - 4;
    const step = Math.floor(u / .5);
    const p = u - step * .5;
    if (u < 2) {
      // 4 quick value propositions
      const data = [
        { bg: P.cream, fg: P.ink, accent: P.cyan, num: '6', label: '位精灵', en: 'SIX SPIRITS', sub: 'STAR / SHADOW / LIFE / BLAZE / MIND / SPIRIT' },
        { bg: P.ink, fg: P.cream, accent: P.yellow, num: '3', label: '种模式', en: 'THREE WAYS TO PLAY', sub: 'ADVENTURE / TIME ATTACK / LOCAL VERSUS' },
        { bg: P.orange, fg: P.cream, accent: P.ink, num: '1', label: '颗炸弹', en: 'ONE BOMB', sub: 'THROW IT. RUN. REPEAT.' },
        { bg: P.pink, fg: P.ink, accent: P.cream, num: '∞', label: '种炸法', en: 'INFINITE CHAOS', sub: 'NO TWO ROUNDS ARE THE SAME' }
      ][step % 4];
      fill(ctx, data.bg);
      dotGrid(ctx, 0, 0, W, H, data.fg, .08);
      // giant numeral
      const scale = 1 + .08 * Math.exp(-p * 18);
      ctx.save();
      ctx.translate(step % 2 ? 1440 : 480, 575); ctx.scale(scale, scale); ctx.rotate(step % 2 ? .04 : -.05);
      M.text(ctx, data.num, 0, 0, {
        size: 760, fam: M.F.en2, weight: 900, color: 'transparent', stroke: data.accent, lineWidth: 10,
        align: 'center', baseline: 'middle', tracking: -30
      });
      ctx.fillStyle = data.accent; ctx.globalAlpha = .14;
      M.text(ctx, data.num, 0, 0, { size: 760, fam: M.F.en2, weight: 900, color: data.accent, align: 'center', baseline: 'middle', tracking: -30 });
      ctx.restore();
      // words
      const ax = step % 2 ? 230 : 980;
      ctx.save();
      ctx.translate(ax, 500);
      M.kinetic(ctx, data.label, 0, 0, {
        size: 250, fam: M.F.cn, weight: 900, color: data.fg, align: 'left', prog: M.clamp(p / .16, 0, 1),
        stagger: .06, drop: 140, tracking: -8, perLetterRot: .04, seed: step + 4
      });
      M.text(ctx, data.en, 8, 70, { size: 34, fam: M.F.en, weight: 900, color: data.accent, tracking: 2 });
      M.text(ctx, data.sub, 10, 112, { size: 13, fam: M.F.mono, weight: 700, color: data.fg, tracking: 2.1 });
      ctx.restore();
      // right/left visual props
      if (step === 0) {
        const cols = [P.yellow, P.red, P.green, P.orange, P.sky, P.pink];
        M.CHARS.forEach((ch, i) => {
          const ang = -Math.PI / 2 + (i - 2.5) * .34;
          const rr = 510;
          head(ctx, ch.id, 1350 + Math.cos(ang) * rr, 590 + Math.sin(ang) * rr, 84, { ring: P.ink, ringW: 5, bg: cols[i] });
        });
      } else if (step === 1) {
        const y = 730;
        for (let i = 0; i < 3; i++) {
          ctx.save(); ctx.translate(1030 + i * 235, y + (i % 2) * 34);
          ctx.fillStyle = [P.yellow, P.green, P.pink][i]; M.rr(ctx, 0, 0, 205, 240, 6); ctx.fill();
          ctx.strokeStyle = P.ink; ctx.lineWidth = 5; ctx.stroke();
          M.text(ctx, ['闯关', '拆砖', '对战'][i], 102, 96, { size: 58, fam: M.F.cn, weight: 900, color: P.ink, align: 'center' });
          M.text(ctx, ['ADV', 'TIME', 'VS'][i], 102, 150, { size: 25, fam: M.F.en, weight: 900, color: P.ink, align: 'center', tracking: 2 });
          M.text(ctx, '0' + (i + 1), 22, 32, { size: 18, fam: M.F.mono, weight: 700, color: P.ink });
          ctx.restore();
        }
      } else if (step === 2) {
        ctx.save(); ctx.translate(1390, 620);
        M.bomb(ctx, 0, 0, 210, { spark: 1, time: u, rot: -.1, face: true, glow: 50 });
        ctx.restore();
        M.sunburst(ctx, 1390, 620, 700, 18, M.rgba(P.yellow, .18), u * .3);
      } else {
        ctx.save(); ctx.translate(1390, 620); ctx.rotate(u * .3);
        for (let i = 0; i < 18; i++) {
          ctx.rotate(TAU / 18);
          const rr = 80 + (i % 5) * 38;
          M.circle(ctx, rr, 0, 24 + (i % 4) * 8, [P.orange, P.cyan, P.yellow, P.cream][i % 4]);
        }
        M.bomb(ctx, 0, 0, 145, { spark: 1, time: u, rot: 0, face: true });
        ctx.restore();
      }
      flash(ctx, Math.exp(-p * 30) * .45);
      return;
    }

    // 2s gameplay montage + "ready"
    if (u < 2.7) {
      fill(ctx, P.ink);
      const panels = [
        { key: 'adventure', x: 60, w: 600, color: P.green, label: '01 / 闯关打怪', en: 'ADVENTURE' },
        { key: 'bombPreview', x: 660, w: 600, color: P.cyan, label: '02 / 计时拆砖', en: 'TIME ATTACK' },
        { key: 'versus', x: 1260, w: 600, color: P.red, label: '03 / 同屏对战', en: 'VERSUS' }
      ];
      panels.forEach((pa, i) => {
        const enter = M.ease.outExpo(M.clamp((u - .05 - i * .05) / .32, 0, 1));
        const y = 180 + (1 - enter) * 700;
        const h = 700;
        ctx.save();
        ctx.beginPath(); ctx.rect(pa.x, y, pa.w, h); ctx.clip();
        cover(ctx, pa.key, pa.x, y, pa.w, h, 1.22 + u * .035, (i - 1) * 32, -u * 12, 1);
        ctx.fillStyle = M.rgba(pa.color, .34); ctx.fillRect(pa.x, y, pa.w, h);
        ctx.fillStyle = 'rgba(13,10,16,.12)'; ctx.fillRect(pa.x, y, pa.w, h);
        // caption plate
        ctx.fillStyle = P.cream; ctx.fillRect(pa.x, y + h - 126, pa.w, 126);
        M.text(ctx, pa.label, pa.x + 26, y + h - 64, { size: 35, fam: M.F.cn, weight: 900, color: P.ink });
        M.text(ctx, pa.en, pa.x + 28, y + h - 26, { size: 15, fam: M.F.mono, weight: 700, color: P.ink, tracking: 2.2 });
        M.text(ctx, '0' + (i + 1), pa.x + pa.w - 24, y + h - 58, { size: 50, fam: M.F.en2, color: pa.color, align: 'right' });
        ctx.restore();
        ctx.strokeStyle = P.cream; ctx.lineWidth = 6; ctx.strokeRect(pa.x, y, pa.w, h);
      });
      // giant header
      ctx.save();
      ctx.translate(960, 114); ctx.rotate(-.015);
      M.text(ctx, 'REAL GAMEPLAY  /  真实对局画面', 0, 0, { size: 30, fam: M.F.cn, weight: 700, color: P.cream, align: 'center', tracking: 3 });
      ctx.restore();
      stripes(ctx, 0, 88, W, 8, P.ink, P.orange, 12, -.4);
      dotGrid(ctx, 0, 0, W, H, P.cream, .05);
      flash(ctx, .1);
      return;
    }
    // final hook: characters roll call
    const v = u - 2.7;
    fill(ctx, P.cream);
    M.circle(ctx, 960, 560, 470, P.orange);
    ctx.save(); ctx.translate(960, 560); ctx.rotate(v * 1.1);
    M.rayLines(ctx, 0, 0, 500, 920, 40, M.rgba(P.ink, .28), 0, 3);
    ctx.restore();
    dotGrid(ctx, 0, 0, W, H, P.ink, .06);
    const chars = M.CHARS;
    chars.forEach((ch, i) => {
      const a = -Math.PI / 2 + i * TAU / 6 + v * .3;
      const rr = 355;
      const x = 960 + Math.cos(a) * rr, y = 540 + Math.sin(a) * rr * .7;
      ctx.save();
      const pp = M.ease.outBack(M.clamp((v - i * .035) / .3, 0, 1));
      ctx.globalAlpha = pp;
      ctx.translate(x, y); ctx.rotate(Math.sin(v * 2 + i) * .06);
      head(ctx, ch.id, 0, 0, 86, { ring: P.ink, ringW: 5, bg: ch.color });
      M.text(ctx, ch.name, 0, 122, { size: 26, fam: M.F.cn, weight: 700, color: P.ink, align: 'center' });
      ctx.restore();
    });
    ctx.save();
    ctx.translate(960, 540); ctx.rotate(-.03);
    M.text(ctx, '全员', 0, -10, { size: 215, fam: M.F.cn, weight: 900, color: P.ink, align: 'center', tracking: -10 });
    M.text(ctx, '集结', 0, 200, { size: 215, fam: M.F.cn, weight: 900, color: P.cream, align: 'center', tracking: -10, stroke: P.ink, lineWidth: 10 });
    ctx.restore();
    stripe(ctx, 'SQUAD UP / SQUAD UP / SQUAD UP', t);
    flash(ctx, Math.exp(-v * 30) * .4);
  };

  function stripe(ctx, text, t) {
    ctx.save();
    ctx.translate(W / 2, 940); ctx.rotate(-.025);
    ctx.fillStyle = P.ink; ctx.fillRect(-W, -36, W * 2, 72);
    M.setFont(ctx, 30, 900, M.F.en);
    const w = ctx.measureText(text + '   ').width;
    const off = (t * 200) % w;
    for (let i = -2; i < 6; i++) {
      M.text(ctx, text + '   ', -W / 2 - off + i * w, 0, { size: 30, fam: M.F.en, weight: 900, color: P.cream, baseline: 'middle' });
    }
    ctx.restore();
  }

  // ============================================================
  // 02 — ROSTER INTRO / 8–10 s
  // ============================================================
  Scenes.rosterIntro = function (ctx, t) {
    const u = t - 8;
    if (u < 1) {
      fill(ctx, P.ink);
      ctx.save(); ctx.translate(960, 560); ctx.rotate(u * .18);
      M.rayLines(ctx, 0, 0, 220, 1200, 28, M.rgba(P.cream, .15), 0, 3);
      ctx.restore();
      M.text(ctx, 'ROSTER / 01—06', 92, 190, { size: 16, fam: M.F.mono, weight: 700, color: P.cyan, tracking: 4 });
      M.display(ctx, '认识一下', 88, 500, { size: 220, color: P.cream, stroke: P.pink, lineWidth: 0, depth: 10, depthColor: P.pink, align: 'left', fam: M.F.cn, weight: 900, tracking: -4 });
      M.display(ctx, '你的精灵。', 88, 745, { size: 220, color: P.cream, stroke: P.cyan, lineWidth: 0, depth: 10, depthColor: P.cyan, align: 'left', fam: M.F.cn, weight: 900, tracking: -4 });
      // six vertical bars
      M.CHARS.forEach((ch, i) => {
        const w = 34, x = 1400 + i * 58;
        const hh = 340 * M.ease.outExpo(M.clamp((u - .05 * i) / .4, 0, 1));
        ctx.fillStyle = ch.color; ctx.fillRect(x, 260, w, hh);
        M.text(ctx, ch.no, x + 17, 250, { size: 14, fam: M.F.mono, weight: 700, color: P.cream, align: 'center' });
      });
      M.text(ctx, 'SIX ELEMENTS · ONE FUSE', 1840, 900, { size: 18, fam: M.F.mono, weight: 700, color: P.cream, align: 'right', tracking: 3 });
      flash(ctx, Math.exp(-u * 18) * .4);
      return;
    }
    fill(ctx, P.cream);
    const v = u - 1;
    // huge title left
    ctx.save(); ctx.translate(90, 330); ctx.rotate(-.02);
    M.text(ctx, '六位精灵', 0, 0, { size: 160, fam: M.F.cn, weight: 900, color: P.ink, tracking: -2 });
    M.text(ctx, '六种炸法', 0, 170, { size: 160, fam: M.F.cn, weight: 900, color: 'transparent', stroke: P.ink, lineWidth: 5, tracking: -2 });
    M.text(ctx, 'MEET THE SQUAD', 4, 248, { size: 26, fam: M.F.en, weight: 900, color: P.orange, tracking: 3 });
    ctx.restore();
    // color columns with heads
    M.CHARS.forEach((ch, i) => {
      const xx = 990 + (i % 3) * 285;
      const yy = 220 + Math.floor(i / 3) * 375;
      const pp = M.ease.outBack(M.clamp((v - i * .045) / .32, 0, 1));
      ctx.save();
      ctx.translate(xx, yy);
      ctx.scale(pp, pp);
      ctx.fillStyle = ch.color;
      M.rr(ctx, 0, 0, 250, 310, 8); ctx.fill();
      ctx.strokeStyle = P.ink; ctx.lineWidth = 4; ctx.stroke();
      head(ctx, ch.id, 125, 150, 96, { bg: P.cream, ring: P.ink, ringW: 4 });
      ctx.fillStyle = P.ink; ctx.fillRect(0, 250, 250, 60);
      M.text(ctx, ch.name, 18, 292, { size: 32, fam: M.F.cn, weight: 700, color: P.cream });
      M.text(ctx, ch.no, 232, 290, { size: 19, fam: M.F.mono, weight: 700, color: ch.color, align: 'right' });
      ctx.restore();
    });
    // circle iris hint
    ctx.save(); ctx.translate(960, 560); ctx.rotate(v * .4);
    M.rayLines(ctx, 0, 0, 300, 950, 32, M.rgba(P.orange, .18), 0, 2);
    ctx.restore();
    flash(ctx, Math.exp(-v * 20) * .35);
  };

  // ============================================================
  // 03–08 — SIX CHARACTER CARDS, each 2 s
  // ============================================================
  function cardCommon(ctx, t, ch, idx) {
    const enter = M.ease.outBack(M.clamp(t / .28, 0, 1));
    const alt = t >= 1.0;
    const altIn = M.clamp((t - 1.0) / .12, 0, 1);
    const bob = Math.sin(t * Math.PI * 2 * 1.5 + idx) * 10;
    const pulse = 1 + .016 * M.beatPulse(t);
    return { enter, alt, altIn, bob, pulse, local: t };
  }

  // 小诺
  Scenes.charXiaonuo = function (ctx, t) {
    t -= 10;
    const ch = M.CHARS[0];
    const c = cardCommon(ctx, t, ch, 0);
    const bg = c.alt ? P.ink : P.yellow;
    fill(ctx, bg);
    // sun / star field
    M.sunburst(ctx, 1370, 500, 920, 22, M.rgba(c.alt ? P.orange : P.cream, c.alt ? .13 : .28), t * .12);
    dotGrid(ctx, 0, 0, W, H, c.alt ? P.cream : P.ink, .09);
    // giant outlined 01
    ctx.save(); ctx.translate(1550, 280); ctx.rotate(-.13);
    M.text(ctx, '01', 0, 0, { size: 480, fam: M.F.en2, weight: 900, color: 'transparent', stroke: c.alt ? M.rgba(P.cream, .14) : M.rgba(P.ink, .14), lineWidth: 7, align: 'center', baseline: 'middle', tracking: -20 });
    ctx.restore();
    // orbital rings
    ctx.save();
    ctx.translate(1330, 610); ctx.rotate(-.12);
    ctx.strokeStyle = c.alt ? P.cyan : M.rgba(P.ink, .5); ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(0, 0, 350 + i * 45, 140 + i * 23, -.25, 0, TAU); ctx.stroke(); }
    ctx.restore();
    // char
    ctx.save();
    ctx.translate(1320, 1010 + (1 - c.enter) * 220 + c.bob);
    const s = c.enter * c.pulse;
    ctx.scale(s, s);
    M.char(ctx, 'xiaonuo', 0, 0, 830, { shadow: c.alt ? P.orange : P.ink, sx: 14, sy: 16, glow: c.alt ? P.cyan : M.rgba(P.cyan, .3), glowBlur: 40, rotation: -.03 });
    ctx.restore();
    // huge name
    ctx.save();
    ctx.translate(105, 480);
    M.text(ctx, ch.name, 0, 0, { size: 300, fam: M.F.cn, weight: 900, color: c.alt ? P.cream : P.ink, tracking: -6 });
    M.display(ctx, 'XIAONUO', 8, 96, { size: 86, color: c.alt ? P.cyan : P.orange, stroke: c.alt ? P.cream : P.ink, lineWidth: 3, align: 'left', fam: M.F.en, tracking: 1 });
    M.text(ctx, 'STAR / TIME / GUARDIAN', 12, 124, { size: 14, fam: M.F.mono, color: c.alt ? P.cream : P.ink, tracking: 2.6 });
    M.text(ctx, '从心软，到心之力量。', 12, 162, { size: 20, fam: M.F.cn, weight: 500, color: c.alt ? P.cream : P.ink, tracking: 2 });
    ctx.restore();
    // top micro
    tag(ctx, '01 / 06', 105, 128, c.alt ? P.ink : P.cream, c.alt ? P.cyan : P.ink, { size: 20, padX: 14, padY: 7 });
    // stars
    for (let i = 0; i < 9; i++) {
      const a = M.rand(i * 7.1) * TAU, rr = 150 + M.rand(i * 2.3) * 480;
      M.star(ctx, 1350 + Math.cos(a + t * .2) * rr, 590 + Math.sin(a + t * .2) * rr * .55, 10 + M.rand(i) * 20, 4 + M.rand(i) * 8, 5, c.alt ? P.cyan : P.cream, t + i);
    }
    infoBlock(ctx, ch, 105, 760, 690, !c.alt, 'left');
    // sticker
    ctx.save(); ctx.translate(825, 240); ctx.rotate(.08);
    M.sticker(ctx, '时空系 / TIME', 0, 0, { bg: c.alt ? P.orange : P.cream, color: P.ink, size: 22 });
    ctx.restore();
    // cyan crystal shards
    ctx.save(); ctx.translate(1030, 865); ctx.rotate(-.15);
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.translate(i * 34, -i * 50); ctx.rotate(.1 * i + t * .2);
      M.poly(ctx, [[0, -60], [20, 0], [0, 54], [-20, 0]], c.alt ? P.cyan : P.cream, P.ink, 4);
      ctx.restore();
    }
    ctx.restore();
    flash(ctx, c.altIn * .32);
  };

  // 阿修
  Scenes.charAxiu = function (ctx, t) {
    t -= 12;
    const ch = M.CHARS[1];
    const c = cardCommon(ctx, t, ch, 1);
    fill(ctx, c.alt ? P.red : P.navy);
    // red slash
    ctx.save();
    ctx.translate(960, 540); ctx.rotate(-.38);
    ctx.fillStyle = c.alt ? P.navy : P.red; ctx.fillRect(-1200, -130, 2400, 260);
    ctx.fillStyle = c.alt ? P.cream : P.orange; ctx.fillRect(-1200, 70, 2400, 26);
    ctx.restore();
    // halftone red circle
    M.circle(ctx, 1470, 560, 440, c.alt ? M.rgba(P.navy, .35) : M.rgba(P.red, .45));
    M.halftone(ctx, 1030, 120, 820, 850, 26, c.alt ? P.navy : P.red, .4);
    dotGrid(ctx, 0, 0, W, H, P.cream, .05);
    // bolts
    ctx.save(); ctx.translate(1540, 240); ctx.rotate(-.1);
    M.icon.bolt(ctx, 0, 0, 290, c.alt ? P.cream : P.yellow);
    ctx.restore();
    ctx.save(); ctx.translate(900, 915); ctx.rotate(.2);
    M.icon.bolt(ctx, 0, 0, 170, c.alt ? P.yellow : P.red);
    ctx.restore();
    // char
    ctx.save();
    ctx.translate(560, 1000 + (1 - c.enter) * 260 + c.bob);
    const s = c.enter * c.pulse;
    ctx.scale(s, s);
    M.char(ctx, 'axiu', 0, 0, 900, { shadow: c.alt ? P.navy : P.red, sx: 18, sy: 18, glow: c.alt ? P.yellow : P.red, glowBlur: 35, rotation: -.04 });
    ctx.restore();
    // name right
    ctx.save(); ctx.translate(1080, 440);
    M.text(ctx, ch.name, 0, 0, { size: 310, fam: M.F.cn, weight: 900, color: c.alt ? P.navy : P.cream, tracking: -10 });
    M.display(ctx, 'AXIU', 12, 92, { size: 120, color: c.alt ? P.cream : P.red, stroke: c.alt ? P.navy : P.cream, lineWidth: 3, align: 'left', fam: M.F.en, tracking: 2 });
    M.text(ctx, 'SHADOW / BLADE / OATH', 16, 128, { size: 14, fam: M.F.mono, color: c.alt ? P.navy : P.pink, tracking: 2.8 });
    M.text(ctx, '驾驭黑暗，辨明是非。', 16, 162, { size: 20, fam: M.F.cn, weight: 500, color: c.alt ? P.navy : P.cream, tracking: 2 });
    ctx.restore();
    tag(ctx, '02 / 06', 1670, 128, c.alt ? P.cream : P.navy, c.alt ? P.navy : P.cream, { size: 20, padX: 14, padY: 7 });
    // diagonal ribbon
    ctx.save(); ctx.translate(1270, 730); ctx.rotate(-.38);
    ctx.fillStyle = c.alt ? P.cream : P.ink; ctx.fillRect(-330, -28, 660, 56);
    M.text(ctx, 'DARK IS NOT EVIL / DARK IS NOT EVIL', 0, 0, { size: 20, fam: M.F.mono, weight: 700, color: c.alt ? P.navy : P.cream, align: 'center', baseline: 'middle', tracking: 2 });
    ctx.restore();
    infoBlock(ctx, ch, 1080, 760, 700, !c.alt);
    // warning tag
    ctx.save(); ctx.translate(940, 180); ctx.rotate(-.06);
    M.sticker(ctx, '暗影系 / SHADOW', 0, 0, { bg: c.alt ? P.navy : P.cream, color: c.alt ? P.cream : P.ink, size: 22 });
    ctx.restore();
    flash(ctx, c.altIn * .35);
  };

  // 阿瑞
  Scenes.charArui = function (ctx, t) {
    t -= 14;
    const ch = M.CHARS[2];
    const c = cardCommon(ctx, t, ch, 2);
    fill(ctx, c.alt ? P.ink : P.green);
    // shield rings
    ctx.save(); ctx.translate(1370, 540); ctx.rotate(t * .12);
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = i % 2 ? (c.alt ? P.green : P.cream) : (c.alt ? P.yellow : P.ink);
      ctx.globalAlpha = .55 - i * .06; ctx.lineWidth = 5 + (i === 0 ? 6 : 0);
      ctx.beginPath(); ctx.arc(0, 0, 200 + i * 84, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.restore();
    // leaf confetti
    for (let i = 0; i < 12; i++) {
      const a = M.rand(i * 4.3) * TAU, rr = 180 + M.rand(i * 8.1) * 520;
      ctx.save();
      ctx.translate(1360 + Math.cos(a) * rr, 540 + Math.sin(a) * rr * .58 + Math.sin(t * 2 + i) * 30);
      ctx.rotate(t * .4 + i);
      M.icon.leaf(ctx, 0, 0, 26 + M.rand(i) * 22, c.alt ? P.green : (i % 2 ? P.yellow : P.cream));
      ctx.restore();
    }
    dotGrid(ctx, 0, 0, W, H, c.alt ? P.cream : P.ink, .06);
    // char
    ctx.save();
    ctx.translate(1370, 1000 + (1 - c.enter) * 230 + c.bob);
    const s = c.enter * c.pulse;
    ctx.scale(s, s);
    M.char(ctx, 'arui', 0, 0, 820, { shadow: c.alt ? P.green : P.ink, sx: 16, sy: 18, glow: c.alt ? P.green : M.rgba(P.yellow, .3), glowBlur: 40, rotation: .02 });
    ctx.restore();
    // name left
    ctx.save(); ctx.translate(100, 400);
    M.text(ctx, ch.name, 0, 0, { size: 305, fam: M.F.cn, weight: 900, color: c.alt ? P.cream : P.ink, tracking: -8 });
    M.display(ctx, 'ARUI', 10, 100, { size: 128, color: c.alt ? P.green : P.cream, stroke: c.alt ? P.cream : P.ink, lineWidth: 3, align: 'left', fam: M.F.en, tracking: 2 });
    M.text(ctx, 'LIFE / MACHINE / SHIELD', 16, 138, { size: 14, fam: M.F.mono, color: c.alt ? P.green : P.ink, tracking: 2.8 });
    M.text(ctx, '生命与机械之力，化作坚盾。', 16, 174, { size: 20, fam: M.F.cn, weight: 500, color: c.alt ? P.cream : P.ink, tracking: 2 });
    ctx.restore();
    tag(ctx, '03 / 06', 100, 128, c.alt ? P.ink : P.cream, c.alt ? P.green : P.ink, { size: 20, padX: 14, padY: 7 });
    infoBlock(ctx, ch, 100, 760, 700, !c.alt);
    ctx.save(); ctx.translate(875, 240); ctx.rotate(.05);
    M.sticker(ctx, '守护系 / GUARD', 0, 0, { bg: c.alt ? P.yellow : P.cream, color: P.ink, size: 22 });
    ctx.restore();
    // giant outline 03
    M.text(ctx, '03', 225, 640, { size: 330, fam: M.F.en2, weight: 900, color: 'transparent', stroke: c.alt ? M.rgba(P.green, .18) : M.rgba(P.ink, .16), lineWidth: 4, align: 'center', tracking: -10 });
    flash(ctx, c.altIn * .35);
  };

  // 小炎
  Scenes.charXiaoyan = function (ctx, t) {
    t -= 16;
    const ch = M.CHARS[3];
    const c = cardCommon(ctx, t, ch, 3);
    fill(ctx, c.alt ? P.ink : P.red);
    // flame discs
    M.circle(ctx, 1390, 570, 500, c.alt ? P.orange : P.yellow);
    M.sunburst(ctx, 1390, 570, 900, 18, c.alt ? M.rgba(P.red, .5) : M.rgba(P.cream, .32), -t * .2);
    for (let i = 0; i < 5; i++) {
      ctx.save(); ctx.translate(1390 + Math.cos(i * 2.2 + t) * 300, 570 + Math.sin(i * 1.6 + t) * 260);
      ctx.rotate(i + t * .3);
      M.icon.flame(ctx, 0, 0, 120 + i * 20, i % 2 ? P.orange : P.cream);
      ctx.restore();
    }
    dotGrid(ctx, 0, 0, W, H, P.cream, .06);
    // char
    ctx.save();
    ctx.translate(1370, 1000 + (1 - c.enter) * 240 + c.bob);
    const s = c.enter * c.pulse;
    ctx.scale(s, s);
    M.char(ctx, 'xiaoyan', 0, 0, 850, { shadow: c.alt ? P.orange : P.ink, sx: 20, sy: 18, glow: c.alt ? P.yellow : P.orange, glowBlur: 42, rotation: -.03 });
    ctx.restore();
    // name
    ctx.save(); ctx.translate(100, 480);
    M.display(ctx, ch.name, 0, 0, { size: 310, color: P.cream, stroke: P.ink, lineWidth: 9, depth: 10, depthColor: c.alt ? P.orange : P.ink, align: 'left', fam: M.F.cn, tracking: -10 });
    M.display(ctx, 'XIAOYAN', 10, 96, { size: 104, color: c.alt ? P.orange : P.ink, stroke: c.alt ? P.cream : P.cream, lineWidth: 3, align: 'left', fam: M.F.en, tracking: 1 });
    M.text(ctx, 'BLAZE / REBOUND / ROAR', 14, 132, { size: 14, fam: M.F.mono, color: c.alt ? P.cream : P.ink, tracking: 2.8 });
    M.text(ctx, '承受的伤害，终将化作力量。', 14, 166, { size: 20, fam: M.F.cn, weight: 500, color: P.cream, tracking: 2 });
    ctx.restore();
    tag(ctx, '04 / 06', 100, 128, P.ink, P.cream, { size: 20, padX: 14, padY: 7 });
    infoBlock(ctx, ch, 100, 760, 700, false);
    ctx.save(); ctx.translate(875, 240); ctx.rotate(-.04);
    M.sticker(ctx, '烈焰系 / BLAZE', 0, 0, { bg: P.ink, color: P.cream, size: 22 });
    ctx.restore();
    // huge 炎 watermark
    M.text(ctx, '炎', 1080, 560, { size: 420, fam: M.F.cn, weight: 900, color: 'transparent', stroke: M.rgba(P.cream, .12), lineWidth: 5, align: 'center', baseline: 'middle' });
    flash(ctx, c.altIn * .4);
  };

  // 小天
  Scenes.charXiaotian = function (ctx, t) {
    t -= 18;
    const ch = M.CHARS[4];
    const c = cardCommon(ctx, t, ch, 4);
    fill(ctx, c.alt ? P.ink : P.sky);
    // eye chart / radar
    ctx.save(); ctx.translate(520, 560); ctx.rotate(t * .05);
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = i % 2 ? (c.alt ? P.cyan : P.cream) : (c.alt ? P.cream : P.ink);
      ctx.globalAlpha = .45 - i * .05; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 150 + i * 82, -.8, 1.8); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    M.icon.eye(ctx, 0, 0, 180, c.alt ? P.cyan : P.cream);
    ctx.restore();
    dotGrid(ctx, 0, 0, W, H, c.alt ? P.cream : P.ink, .07);
    // scanning line
    const sy = 180 + ((t * 340) % 760);
    ctx.save(); ctx.globalAlpha = .7;
    ctx.fillStyle = c.alt ? P.cyan : P.cream; ctx.fillRect(0, sy, W, 3);
    ctx.globalAlpha = .12; ctx.fillRect(0, sy - 40, W, 40); ctx.restore();
    // char left
    ctx.save();
    ctx.translate(520, 1000 + (1 - c.enter) * 230 + c.bob);
    const s = c.enter * c.pulse;
    ctx.scale(s, s);
    M.char(ctx, 'xiaotian', 0, 0, 850, { shadow: c.alt ? P.cyan : P.ink, sx: 16, sy: 18, glow: c.alt ? P.cyan : M.rgba(P.cream, .3), glowBlur: 35, rotation: .02 });
    ctx.restore();
    // name right
    ctx.save(); ctx.translate(1070, 440);
    M.text(ctx, ch.name, 0, 0, { size: 310, fam: M.F.cn, weight: 900, color: c.alt ? P.cream : P.ink, tracking: -9 });
    M.display(ctx, 'XIAOTIAN', 12, 96, { size: 100, color: c.alt ? P.cyan : P.cream, stroke: c.alt ? P.cream : P.ink, lineWidth: 3, align: 'left', fam: M.F.en, tracking: 1 });
    M.text(ctx, 'MIND / INSIGHT / SPEED', 16, 132, { size: 14, fam: M.F.mono, color: c.alt ? P.cyan : P.ink, tracking: 2.8 });
    M.text(ctx, '领悟对手，看穿战局。', 16, 162, { size: 20, fam: M.F.cn, weight: 500, color: c.alt ? P.cream : P.ink, tracking: 2 });
    ctx.restore();
    tag(ctx, '05 / 06', 1070, 128, P.ink, P.cream, { size: 20, padX: 14, padY: 7 });
    infoBlock(ctx, ch, 1070, 760, 700, !c.alt);
    // tag
    ctx.save(); ctx.translate(940, 210); ctx.rotate(.07);
    M.sticker(ctx, '洞察系 / INSIGHT', 0, 0, { bg: c.alt ? P.cyan : P.ink, color: c.alt ? P.ink : P.cream, size: 22 });
    ctx.restore();
    // big outline 05
    M.text(ctx, '05', 1500, 450, { size: 440, fam: M.F.en2, weight: 900, color: 'transparent', stroke: c.alt ? M.rgba(P.cyan, .15) : M.rgba(P.ink, .12), lineWidth: 6, align: 'center', baseline: 'middle', tracking: -12 });
    flash(ctx, c.altIn * .36);
  };

  // 未来
  Scenes.charWeilai = function (ctx, t) {
    t -= 20;
    const ch = M.CHARS[5];
    const c = cardCommon(ctx, t, ch, 5);
    fill(ctx, c.alt ? P.ink : P.cream);
    // holo blocks
    const blocks = [
      [100, 140, 400, 150, P.cyan], [500, 140, 230, 150, P.pink], [730, 140, 180, 150, P.yellow],
      [100, 860, 650, 110, P.pink], [750, 860, 200, 110, P.cyan], [950, 860, 100, 110, P.orange]
    ];
    blocks.forEach(([x, y, w, h, col], i) => {
      ctx.save(); ctx.globalAlpha = c.alt ? .7 : .85;
      ctx.fillStyle = col; ctx.fillRect(x, y + Math.sin(t * 2 + i) * 6, w, h); ctx.restore();
    });
    // orbital portal
    ctx.save(); ctx.translate(1320, 560); ctx.rotate(t * .2);
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = [P.cyan, P.pink, P.yellow, P.cream][i]; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(0, 0, 330 + i * 40, 170 + i * 25, i * .4, 0, TAU); ctx.stroke();
    }
    ctx.restore();
    // char
    ctx.save();
    ctx.translate(1320, 1010 + (1 - c.enter) * 240 + c.bob);
    const s = c.enter * c.pulse;
    ctx.scale(s, s);
    M.char(ctx, 'weilai', 0, 0, 840, { shadow: c.alt ? P.cyan : P.pink, sx: 16, sy: 18, glow: c.alt ? P.cyan : M.rgba(P.pink, .35), glowBlur: 45, rotation: -.02 });
    ctx.restore();
    // name
    ctx.save(); ctx.translate(100, 470);
    M.text(ctx, ch.name, 0, 0, { size: 315, fam: M.F.cn, weight: 900, color: c.alt ? P.cream : P.ink, tracking: -10 });
    M.display(ctx, 'WEILAI', 10, 100, { size: 128, color: c.alt ? P.cyan : P.pink, stroke: c.alt ? P.cream : P.ink, lineWidth: 3, align: 'left', fam: M.F.en, tracking: 2 });
    M.text(ctx, 'SPIRIT / TIME / SINGULARITY', 14, 138, { size: 14, fam: M.F.mono, color: c.alt ? P.cyan : P.ink, tracking: 2.8 });
    M.text(ctx, '五女仆合体，回到崩塌之前。', 14, 172, { size: 20, fam: M.F.cn, weight: 500, color: c.alt ? P.cream : P.ink, tracking: 2 });
    ctx.restore();
    tag(ctx, '06 / 06', 100, 128, c.alt ? P.ink : P.cream, c.alt ? P.cyan : P.ink, { size: 20, padX: 14, padY: 7 });
    infoBlock(ctx, ch, 100, 760, 700, !c.alt);
    // six segment meter
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i < 4 ? P.cyan : P.ink;
      ctx.fillRect(110 + i * 70, 700, 58, 12);
    }
    M.text(ctx, '通灵 4 / 6', 110, 688, { size: 14, fam: M.F.mono, weight: 700, color: c.alt ? P.cream : P.ink, tracking: 1.6 });
    ctx.save(); ctx.translate(875, 240); ctx.rotate(-.04);
    M.sticker(ctx, '通灵系 / SPIRIT', 0, 0, { bg: c.alt ? P.cyan : P.ink, color: c.alt ? P.ink : P.cream, size: 22 });
    ctx.restore();
    // glitch slices
    for (let i = 0; i < 5; i++) {
      const yy = 300 + i * 120 + Math.sin(t * 10 + i) * 30;
      ctx.fillStyle = M.rgba(i % 2 ? P.cyan : P.pink, .12);
      ctx.fillRect(820 + Math.sin(t * 3 + i) * 40, yy, 900, 10);
    }
    // faint 06
    M.text(ctx, '06', 1570, 530, { size: 420, fam: M.F.en2, weight: 900, color: 'transparent', stroke: c.alt ? M.rgba(P.cyan, .12) : M.rgba(P.pink, .2), lineWidth: 5, align: 'center', baseline: 'middle', tracking: -16 });
    flash(ctx, c.altIn * .36);
  };

  // ============================================================
  // 09 — SQUAD / 22–24 s
  // ============================================================
  Scenes.group = function (ctx, t) {
    const u = t - 22;
    fill(ctx, P.cream);
    // giant outline
    ctx.save(); ctx.translate(960, 520); ctx.rotate(-.02);
    M.text(ctx, 'SQUAD', 0, 0, { size: 510, fam: M.F.en, weight: 900, color: 'transparent', stroke: M.rgba(P.ink, .08), lineWidth: 2, align: 'center', baseline: 'middle', tracking: -8 });
    ctx.restore();
    // title top
    ctx.save(); ctx.translate(100, 240);
    M.text(ctx, '全员就位', 0, 0, { size: 164, fam: M.F.cn, weight: 900, color: P.ink, tracking: -4 });
    M.text(ctx, 'SIX SPIRITS / NO MERCY', 6, 72, { size: 22, fam: M.F.en, weight: 900, color: P.orange, tracking: 3 });
    ctx.restore();
    // six strips
    const stripW = 248;
    M.CHARS.forEach((ch, i) => {
      const x = 198 + i * (stripW + 18);
      const pp = M.ease.outExpo(M.clamp((u - i * .035) / .36, 0, 1));
      const yy = 350 + (1 - pp) * 750;
      ctx.save();
      ctx.beginPath(); ctx.rect(x, 350, stripW, 620); ctx.clip();
      ctx.fillStyle = ch.color; ctx.fillRect(x, yy, stripW, 620);
      ctx.globalAlpha = .2; ctx.fillStyle = P.ink; ctx.fillRect(x, yy, stripW, 620);
      ctx.globalAlpha = 1;
      // number top
      M.text(ctx, ch.no, x + 20, yy + 60, { size: 40, fam: M.F.en2, weight: 900, color: P.ink });
      M.text(ctx, ch.en, x + 20, yy + 88, { size: 12, fam: M.F.mono, weight: 700, color: P.ink, tracking: 2 });
      // character
      M.char(ctx, ch.id, x + stripW / 2, yy + 620, 500, { shadow: P.ink, sx: 9, sy: 9, rotation: Math.sin(i) * .02 });
      // bottom nameplate
      ctx.fillStyle = P.ink; ctx.fillRect(x, yy + 620 - 64, stripW, 64);
      M.text(ctx, ch.name, x + 20, yy + 620 - 20, { size: 34, fam: M.F.cn, weight: 700, color: ch.color });
      M.text(ctx, ch.tag, x + stripW - 18, yy + 620 - 22, { size: 16, fam: M.F.cn, weight: 500, color: P.cream, align: 'right' });
      ctx.restore();
      ctx.strokeStyle = P.ink; ctx.lineWidth = 4; ctx.strokeRect(x, 350, stripW, 620);
      // accent blocks
      ctx.fillStyle = P.ink; ctx.fillRect(x, 350, stripW, 14);
    });
    // ready stamp
    if (u > 1.0) {
      const pp = M.ease.outBack(M.clamp((u - 1.0) / .18, 0, 1));
      ctx.save(); ctx.translate(982, 284); ctx.rotate(-.035); ctx.scale(pp, pp);
      M.sticker(ctx, '6 / 6  READY', 0, 0, { bg: P.yellow, color: P.ink, size: 24, padX: 16, padY: 9 });
      ctx.restore();
      flash(ctx, Math.exp(-(u - 1.0) * 16) * .25);
    }
  };

  M.scenesReady = true;
})();
