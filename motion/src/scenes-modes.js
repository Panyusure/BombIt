(function () {
  'use strict';
  const M = window.M, P = M.P, TAU = Math.PI * 2;
  const Scenes = M.Scenes;
  const W = M.W, H = M.H;
  let boomTextCache = null;
  const fill = (ctx, c) => { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); };
  const line = (ctx, x1, y1, x2, y2, color, w = 2, alpha = 1) => {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  };
  function flash(ctx, a) {
    if (!Number.isFinite(a) || a <= 0) return;
    ctx.save(); ctx.globalAlpha = M.clamp(a, 0, 1); ctx.fillStyle = P.white; ctx.fillRect(0, 0, W, H); ctx.restore();
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

  // ============================================================
  // 10 — MODES INTRO / 24–26 s
  // ============================================================
  Scenes.modesIntro = function (ctx, t) {
    const u = t - 24;
    const beat = Math.floor(u / .5);
    if (beat < 1) {
      fill(ctx, P.cream);
      dotGrid(ctx, 0, 0, W, H, P.ink, .07);
      ctx.save(); ctx.translate(95, 300);
      M.text(ctx, '怎么玩？', 0, 0, { size: 210, fam: M.F.cn, weight: 900, color: P.ink, tracking: -6 });
      M.text(ctx, 'HOW TO PLAY', 6, 86, { size: 32, fam: M.F.en, weight: 900, color: P.orange, tracking: 3 });
      ctx.restore();
      M.text(ctx, '三条路线，随便挑。', 105, 610, { size: 42, fam: M.F.cn, weight: 500, color: P.ink, tracking: 2 });
      ['01 闯关打怪', '02 计时拆砖', '03 同屏对战'].forEach((s, i) => {
        const p = M.ease.outExpo(M.clamp((u - .08 - i * .07) / .32, 0, 1));
        const y = 720 + i * 76;
        ctx.save(); ctx.globalAlpha = p;
        ctx.fillStyle = [P.green, P.cyan, P.red][i];
        M.rr(ctx, 900 - (1 - p) * 900, y, 820, 58, 4); ctx.fill();
        M.text(ctx, s, 934 - (1 - p) * 900, y + 38, { size: 27, fam: M.F.cn, weight: 700, color: i === 2 ? P.cream : P.ink, tracking: 3 });
        ctx.restore();
      });
      M.text(ctx, 'Q版泡泡堂 · 模式选择', 100, 974, { size: 16, fam: M.F.mono, weight: 700, color: P.ink, tracking: 2 });
      flash(ctx, Math.exp(-u * 18) * .28);
      return;
    }
    if (beat < 2) {
      fill(ctx, P.ink);
      M.sunburst(ctx, 960, 540, 1000, 20, M.rgba(P.orange, .16), u * .2);
      M.text(ctx, '选一个', 960, 440, { size: 200, fam: M.F.cn, weight: 900, color: P.cream, align: 'center', tracking: -8 });
      M.text(ctx, 'PICK YOUR CHAOS', 960, 520, { size: 28, fam: M.F.en, weight: 900, color: P.cyan, align: 'center', tracking: 4 });
      [P.green, P.cyan, P.red].forEach((col, i) => {
        const x = 540 + i * 300;
        ctx.save(); ctx.translate(x, 800); ctx.rotate((i - 1) * .06 + u * .02);
        ctx.fillStyle = col; M.rr(ctx, -120, -120, 240, 240, 8); ctx.fill();
        ctx.strokeStyle = P.cream; ctx.lineWidth = 5; ctx.stroke();
        M.text(ctx, '0' + (i + 1), 0, 40, { size: 120, fam: M.F.en, weight: 900, color: P.ink, align: 'center', baseline: 'middle' });
        ctx.restore();
      });
      flash(ctx, Math.exp(-(u - .5) * 18) * .35);
      return;
    }
    // three split panels
    fill(ctx, P.ink);
    const labels = [
      ['闯关', 'ADVENTURE', P.green, '10 关 · 清空敌人'],
      ['拆砖', 'TIME ATTACK', P.cyan, '180 秒 · 拆光障碍'],
      ['对战', 'VERSUS', P.red, '同屏双人 · 先得 2 分']
    ];
    labels.forEach((d, i) => {
      const x = i * 640;
      const p = M.ease.outExpo(M.clamp((u - 1.0 - i * .04) / .3, 0, 1));
      ctx.save();
      ctx.translate(0, (1 - p) * (i % 2 ? 900 : -900));
      ctx.fillStyle = d[2]; ctx.fillRect(x, 0, 640, H);
      ctx.globalAlpha = .18; ctx.fillStyle = P.ink; ctx.fillRect(x, 0, 640, H);
      ctx.globalAlpha = 1;
      ctx.fillStyle = P.ink; ctx.fillRect(x, 820, 640, 260);
      M.text(ctx, d[0], x + 50, 450, { size: 170, fam: M.F.cn, weight: 900, color: P.ink, tracking: -8 });
      M.text(ctx, d[1], x + 54, 510, { size: 28, fam: M.F.en, weight: 900, color: P.cream, tracking: 3 });
      M.text(ctx, d[3], x + 54, 770, { size: 24, fam: M.F.cn, weight: 500, color: P.cream, tracking: 2 });
      M.text(ctx, '0' + (i + 1), x + 570, 760, { size: 48, fam: M.F.en2, weight: 900, color: P.ink, align: 'right' });
      ctx.restore();
    });
    flash(ctx, Math.exp(-(u - 1.0) * 20) * .3);
  };

  function modeKicker(ctx, no, cn, en, color, ink = P.cream, t = 0) {
    tag(ctx, `MODE ${no}`, 100, 170, P.ink, color, { size: 20, padX: 15, padY: 8 });
    M.text(ctx, en, 100, 220, { size: 19, fam: M.F.mono, weight: 700, color: ink, tracking: 3.4 });
    M.text(ctx, cn, 94, 430, { size: 150, fam: M.F.cn, weight: 900, color: ink, tracking: -6 });
  }

  // ============================================================
  // 11 — MODE 1 / 26–28 s
  // ============================================================
  Scenes.mode1 = function (ctx, t) {
    const u = t - 26;
    fill(ctx, P.cream);
    // forest slab
    ctx.fillStyle = P.green;
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(760, 0); ctx.lineTo(610, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.ink;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(300, 0); ctx.lineTo(190, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    M.text(ctx, '01', 590, 300, { size: 430, fam: M.F.en2, weight: 900, color: 'transparent', stroke: M.rgba(P.cream, .15), lineWidth: 6, align: 'right', baseline: 'middle', tracking: -16 });
    dotGrid(ctx, 0, 0, W, H, P.ink, .05);
    // content left
    M.text(ctx, '冒险模式 / SOLO', 100, 180, { size: 18, fam: M.F.mono, weight: 700, color: P.cyan, tracking: 3 });
    M.text(ctx, '闯关打怪', 86, 375, { size: 135, fam: M.F.cn, weight: 900, color: P.cream, tracking: -4 });
    M.text(ctx, '清空敌人，冲进第 10 关。', 92, 470, { size: 27, fam: M.F.cn, weight: 500, color: P.cream, tracking: 2 });
    // stage + boss tags
    ctx.save(); ctx.translate(94, 550); ctx.rotate(-.03);
    M.sticker(ctx, '10 STAGES', 0, 0, { bg: P.cream, color: P.ink, size: 27 });
    ctx.restore();
    ctx.save(); ctx.translate(300, 552); ctx.rotate(.04);
    M.sticker(ctx, 'BOSS FIGHT', 0, 0, { bg: P.orange, color: P.ink, size: 27 });
    ctx.restore();
    // progress pips
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i < 1 + Math.floor(u * 3) ? P.cream : M.rgba(P.cream, .24);
      ctx.fillRect(96 + i * 42, 655, 30, 10);
    }
    M.text(ctx, 'STAGE 01 / 10', 96, 700, { size: 14, fam: M.F.mono, weight: 700, color: P.cream, tracking: 2 });
    // board
    ctx.save();
    ctx.translate(990, 318); ctx.rotate(-.055);
    // hard shadow plate
    ctx.fillStyle = M.rgba(P.ink, .25); M.rr(ctx, -30, 36, 750, 650, 16); ctx.fill();
    ctx.fillStyle = P.cream; M.rr(ctx, -40, 8, 760, 650, 18); ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 5; ctx.stroke();
    M.board(ctx, { x: 12, y: 56, cols: 5, rows: 4, cell: 136, theme: 'forest', reveal: M.clamp(u * 2.4, 0, 1), t: u });
    // bombs + flame at beat
    const flameP = M.clamp((u - .8) / .3, 0, 1);
    if (flameP > 0) {
      ctx.save();
      M.flameCross(ctx, 148 + 136 * 2, 56 + 136 * 2 + 68, 136, { prog: flameP, color: P.orange });
      ctx.restore();
    }
    M.bomb(ctx, 148 + 136 * 2, 56 + 136 * 2 + 68, 58, { spark: 1, time: u, rot: -.2 });
    // little stars
    for (let i = 0; i < 6; i++) M.star(ctx, 80 + i * 120, 620, 8, 3, 5, M.rgba(P.yellow, .8));
    ctx.restore();
    // character
    ctx.save();
    ctx.translate(790, 980 + Math.sin(u * 5) * 6);
    M.char(ctx, 'xiaonuo', 0, 0, 450, { shadow: P.ink, sx: 12, sy: 12, glow: M.rgba(P.cyan, .35), glowBlur: 25, rotation: -.05 });
    ctx.restore();
    // enemy
    const enemyA = u < .9 ? 1 : M.clamp(1 - (u - .9) * 5, 0, 1);
    ctx.save();
    ctx.translate(1300, 790 + Math.sin(u * 4) * 8);
    ctx.globalAlpha = enemyA;
    if (u > .9) ctx.rotate((u - .9) * 3);
    M.char(ctx, 'gugu', 0, 0, 235, { shadow: P.ink, sx: 6, sy: 6 });
    ctx.restore();
    // hearts
    for (let i = 0; i < 3; i++) {
      M.star(ctx, 150 + i * 38, 760, 14, 6, 5, P.pink, -Math.PI / 2 + 0);
    }
    // clear stamp
    if (u > 1.2) {
      ctx.save(); ctx.translate(1510, 240); ctx.rotate(-.12);
      M.sticker(ctx, 'CLEAR!', 0, 0, { bg: P.yellow, color: P.ink, size: 56, padX: 26, padY: 12, lw: 5 });
      ctx.restore();
    }
    // top utility
    M.text(ctx, '↑↓←→ / WASD    MOVE       SPACE    BOMB       Q    SKILL', 100, 960, { size: 14, fam: M.F.mono, weight: 700, color: P.cream, tracking: 1.5 });
    flash(ctx, Math.exp(-u * 16) * .22);
  };

  function softBlock(ctx, x, y, s, color, color2, inner, alpha = 1, rot = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha *= alpha;
    ctx.fillStyle = P.ink; M.rr(ctx, -s / 2 + 6, -s / 2 + 8, s, s, s * .14); ctx.fill();
    ctx.fillStyle = color; M.rr(ctx, -s / 2, -s / 2, s, s, s * .14); ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = color2;
    M.rr(ctx, -s * .36, -s * .3, s * .72, s * .3, s * .08); ctx.fill();
    ctx.strokeStyle = M.rgba(inner, .8); ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-s * .26, s * .14); ctx.lineTo(s * .26, s * .14); ctx.stroke();
    M.star(ctx, 0, -s * .02, s * .09, s * .04, 5, M.rgba(P.white, .8));
    ctx.restore();
  }

  // ============================================================
  // 12 — MODE 2 / 28–30 s
  // ============================================================
  Scenes.mode2 = function (ctx, t) {
    const u = t - 28;
    fill(ctx, P.cyan);
    // giant black arena
    ctx.fillStyle = P.ink;
    ctx.beginPath(); ctx.moveTo(0, 760); ctx.lineTo(W, 620); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    // halftone
    M.halftone(ctx, 0, 0, W, 700, 26, P.cream, .14);
    // huge 03 outline
    M.text(ctx, '180s', 150, 220, { size: 240, fam: M.F.en2, weight: 900, color: 'transparent', stroke: M.rgba(P.cream, .16), lineWidth: 4, tracking: -6 });
    // title
    M.text(ctx, '计时拆砖', 90, 360, { size: 140, fam: M.F.cn, weight: 900, color: P.ink, tracking: -5 });
    M.text(ctx, 'TIME ATTACK / SOLO', 98, 408, { size: 22, fam: M.F.en, weight: 900, color: P.ink, tracking: 3 });
    M.text(ctx, '限时清空全部障碍。', 98, 462, { size: 28, fam: M.F.cn, weight: 500, color: P.ink, tracking: 2 });
    tag(ctx, '02 / TIME ATTACK', 98, 180, P.ink, P.cream, { size: 19 });
    // timer card
    ctx.save(); ctx.translate(102, 790); ctx.rotate(-.03);
    ctx.fillStyle = P.cream; M.rr(ctx, 0, 0, 540, 190, 6); ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 5; ctx.stroke();
    M.text(ctx, '剩余时间 / TIME LEFT', 28, 40, { size: 15, fam: M.F.mono, weight: 700, color: P.ink, tracking: 2 });
    const sec = Math.max(0, 2 * 60 + 58 - Math.floor(u * 10));
    const time = `0${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    M.text(ctx, time, 26, 142, { size: 120, fam: M.F.en2, weight: 900, color: P.ink, tracking: -3 });
    M.text(ctx, '障碍 58', 500, 140, { size: 22, fam: M.F.cn, weight: 700, color: P.orange, align: 'right' });
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i < 4 ? P.orange : M.rgba(P.ink, .18); ctx.fillRect(30 + i * 78, 160, 62, 8); }
    ctx.restore();
    // block wall
    ctx.save();
    ctx.translate(1040, 240); ctx.rotate(.035);
    ctx.fillStyle = M.rgba(P.ink, .28); M.rr(ctx, 22, 24, 700, 540, 16); ctx.fill();
    ctx.fillStyle = P.cream; M.rr(ctx, 0, 0, 700, 540, 16); ctx.fill();
    ctx.strokeStyle = P.ink; ctx.lineWidth = 5; ctx.stroke();
    const cols = 6, rows = 4, cell = 108, gap = 8;
    const clearP = M.clamp((u - .9) / .9, 0, 1);
    for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
      const i = r * cols + col;
      const th = .35 + (i / (cols * rows)) * .65;
      const cl = M.clamp((clearP - (0.35 + (i / (cols * rows)) * .65)) / .18, 0, 1);
      if (cl >= 1) continue;
      const x = 28 + col * (cell + gap) + cell / 2;
      const y = 30 + r * (cell + gap) + cell / 2;
      const colors = [[P.pink, P.lemon, P.hot], [P.lilac, P.cream, P.purple], [P.mint, P.lemon, P.green], [P.orange, P.yellow, P.red]];
      const cc = colors[(r + col) % 4];
      softBlock(ctx, x, y + cl * 150, cell, cc[0], cc[1], cc[2], 1 - cl * .2, cl * (i % 2 ? 1.2 : -1.1));
      if (cl > 0 && cl < 1) {
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = k % 2 ? P.yellow : P.cream;
          ctx.fillRect(x + (M.rand(i * 2 + k) - .5) * 100, y + 20 + M.rand(i * 3 + k) * 100, 10, 4);
        }
      }
    }
    ctx.restore();
    // character
    ctx.save();
    ctx.translate(560, 1010 + Math.sin(u * 6) * 6);
    M.char(ctx, 'xiaotian', 0, 0, 500, { shadow: P.ink, sx: 12, sy: 12, glow: M.rgba(P.cyan, .4), glowBlur: 30, rotation: .03 });
    ctx.restore();
    // speed lines
    for (let i = 0; i < 8; i++) {
      const yy = 620 + i * 30;
      line(ctx, 80 + (u * 500 + i * 120) % 500, yy, 400 + (u * 500 + i * 120) % 700, yy, M.rgba(P.ink, .2), 3, .8);
    }
    // big stamp
    if (u > .92) {
      ctx.save(); ctx.translate(930, 580); ctx.rotate(-.13);
      const pp = M.ease.outBack(M.clamp((u - .92) / .2, 0, 1));
      ctx.scale(pp, pp);
      M.sticker(ctx, '拆！', 0, 0, { bg: P.yellow, color: P.ink, size: 110, padX: 40, padY: 14, lw: 7 });
      ctx.restore();
    }
    flash(ctx, Math.exp(-u * 20) * .25);
  };

  function charSticker(ctx, id, x, y, h, o = {}) {
    const a = M.assets[id]; if (!a) return;
    const w = h * a.w / a.h;
    const sil = M.silhouette(id, o.border || P.cream);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(o.rot || 0);
    if (sil) {
      const off = o.borderW || 9;
      for (const [ox, oy] of [[-off,0],[off,0],[0,-off],[0,off],[-off*.7,-off*.7],[off*.7,-off*.7],[-off*.7,off*.7],[off*.7,off*.7]]) {
        ctx.drawImage(sil, -w/2 + ox, -h + oy, w, h);
      }
    }
    M.char(ctx, id, 0, 0, h, {
      shadow: o.shadow || P.ink, sx: o.sx || 10, sy: o.sy || 10,
      glow: o.glow || null, glowBlur: o.glowBlur || 30, alpha: o.alpha == null ? 1 : o.alpha
    });
    ctx.restore();
  }

  function keycap(ctx, label, x, y, w, h, color = P.cream, ink = P.ink) {
    ctx.save();
    ctx.fillStyle = M.rgba(P.ink, .3); M.rr(ctx, x + 5, y + 7, w, h, 9); ctx.fill();
    ctx.fillStyle = color; M.rr(ctx, x, y, w, h, 9); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.stroke();
    M.text(ctx, label, x + w / 2, y + h / 2 + 2, { size: Math.min(28, h * .45), fam: M.F.mono, weight: 700, color: ink, align: 'center', baseline: 'middle' });
    ctx.restore();
  }

  // ============================================================
  // 13 — MODE 3 / 30–32 s
  // ============================================================
  Scenes.mode3 = function (ctx, t) {
    const u = t - 30;
    fill(ctx, P.navy);
    // split diagonals
    ctx.fillStyle = P.red;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(1120, 0); ctx.lineTo(850, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.sky;
    ctx.beginPath(); ctx.moveTo(1120, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(850, H); ctx.closePath(); ctx.fill();
    // center light strip
    ctx.fillStyle = P.cream;
    ctx.beginPath(); ctx.moveTo(1040, 0); ctx.lineTo(1130, 0); ctx.lineTo(910, H); ctx.lineTo(820, H); ctx.closePath(); ctx.fill();
    dotGrid(ctx, 0, 0, W, H, P.cream, .08);
    // top labels
    M.text(ctx, '双人 · 同屏对战', 90, 160, { size: 56, fam: M.F.cn, weight: 900, color: P.cream, tracking: 0 });
    M.text(ctx, 'LOCAL VERSUS / FIRST TO 2', 92, 206, { size: 18, fam: M.F.en, weight: 900, color: P.ink, tracking: 3 });
    tag(ctx, '03 / VERSUS', 90, 250, P.ink, P.yellow, { size: 19 });
    // score
    ctx.save(); ctx.translate(960, 158); ctx.rotate(-.02);
    ctx.fillStyle = P.ink; M.rr(ctx, -270, -62, 540, 124, 10); ctx.fill();
    ctx.strokeStyle = P.cream; ctx.lineWidth = 4; ctx.stroke();
    M.text(ctx, '1P', -236, 0, { size: 22, fam: M.F.en, weight: 900, color: P.cyan, align: 'left', baseline: 'middle', tracking: 2 });
    M.text(ctx, '2P', 236, 0, { size: 22, fam: M.F.en, weight: 900, color: P.pink, align: 'right', baseline: 'middle', tracking: 2 });
    M.text(ctx, 'FIRST TO 2', 0, -38, { size: 12, fam: M.F.mono, weight: 700, color: M.rgba(P.cream, .55), align: 'center', baseline: 'middle', tracking: 3 });
    const score = u > 1.0 ? '2 : 1' : '1 : 1';
    M.text(ctx, score, 0, 18, { size: 66, fam: M.F.en, weight: 900, color: P.cream, align: 'center', baseline: 'middle', tracking: 6 });
    ctx.restore();
    // boards fragments
    ctx.save();
    ctx.translate(360, 420); ctx.rotate(-.08);
    ctx.globalAlpha = .6;
    M.board(ctx, { x: 0, y: 0, cols: 3, rows: 3, cell: 100, theme: 'park', reveal: 1, clear: null, t: u });
    ctx.restore();
    ctx.save();
    ctx.translate(1410, 420); ctx.rotate(.08);
    ctx.globalAlpha = .55;
    M.board(ctx, { x: 0, y: 0, cols: 3, rows: 3, cell: 100, theme: 'factory', reveal: 1, clear: null, t: u });
    ctx.restore();
    // characters
    ctx.save();
    ctx.translate(410, 1010 + Math.sin(u * 5) * 5);
    M.char(ctx, 'xiaonuo', 0, 0, 570, { shadow: P.ink, sx: 14, sy: 14, glow: M.rgba(P.yellow, .4), glowBlur: 30, rotation: -.04 });
    ctx.restore();
    ctx.save();
    ctx.translate(1510, 1010 + Math.sin(u * 5 + 2) * 5);
    M.char(ctx, 'axiu', 0, 0, 610, { shadow: P.ink, sx: 14, sy: 14, glow: M.rgba(P.sky, .4), glowBlur: 30, rotation: .04 });
    ctx.restore();
    // 1P/2P labels
    ctx.save(); ctx.translate(310, 780); ctx.rotate(-.08);
    ctx.fillStyle = P.ink; ctx.fillRect(-70, -28, 140, 56);
    M.text(ctx, '1P', 0, 2, { size: 34, fam: M.F.en, weight: 900, color: P.yellow, align: 'center', baseline: 'middle' });
    ctx.restore();
    ctx.save(); ctx.translate(1620, 780); ctx.rotate(.08);
    ctx.fillStyle = P.cream; ctx.fillRect(-70, -28, 140, 56);
    M.text(ctx, '2P', 0, 2, { size: 34, fam: M.F.en, weight: 900, color: P.navy, align: 'center', baseline: 'middle' });
    ctx.restore();
    // VS
    const vsP = 1 + .1 * M.beatPulse(u);
    ctx.save(); ctx.translate(960, 620); ctx.rotate(-.04); ctx.scale(vsP, vsP);
    M.display(ctx, 'VS', 0, 0, { size: 330, color: P.yellow, stroke: P.ink, lineWidth: 10, depth: 14, depthColor: P.orange, align: 'center', baseline: 'middle', fam: M.F.en, tracking: -8 });
    ctx.restore();
    // lightning
    ctx.save(); ctx.translate(960, 370); ctx.rotate(.12);
    M.icon.bolt(ctx, 0, 0, 260, P.cream);
    ctx.restore();
    // bombs
    M.bomb(ctx, 780, 900, 62, { spark: 1, time: u, rot: -.2 });
    M.bomb(ctx, 1140, 900, 62, { spark: 1, time: u + .5, rot: .2 });
    // key hints
    keycap(ctx, '↑ ↓ ← →', 120, 930, 180, 52, P.cream, P.ink);
    keycap(ctx, 'W A S D', 1540, 930, 180, 52, P.cream, P.ink);
    M.text(ctx, '先得 2 分获胜', 960, 940, { size: 25, fam: M.F.cn, weight: 700, color: P.ink, align: 'center', tracking: 2 });
    // impact pips
    if (u > 1.0) {
      flash(ctx, Math.exp(-(u - 1) * 15) * .45);
      for (let i = 0; i < 22; i++) {
        const a = M.rand(i * 2.3) * TAU, d = 120 + M.rand(i * 6.1) * 480 * (1 - Math.exp(-(u - 1) * 4));
        M.circle(ctx, 960 + Math.cos(a) * d, 620 + Math.sin(a) * d * .7, 4 + M.rand(i) * 10, i % 2 ? P.yellow : P.cream);
      }
    }
    flash(ctx, Math.exp(-u * 18) * .28);
  };

  // ============================================================
  // 14 — CORE LOOP + BOOM / 32–36 s
  // ============================================================
  Scenes.core = function (ctx, t) {
    const u = t - 32;
    if (u < 1) {
      fill(ctx, P.cream);
      M.sunburst(ctx, 690, 540, 1000, 24, M.rgba(P.orange, .1), u * .4);
      dotGrid(ctx, 0, 0, W, H, P.ink, .065);
      // huge command
      ctx.save(); ctx.translate(110, 420);
      M.text(ctx, '放弹', 0, 0, { size: 290, fam: M.F.cn, weight: 900, color: P.ink, tracking: -14 });
      M.text(ctx, '01 / PLACE', 10, 90, { size: 28, fam: M.F.en, weight: 900, color: P.orange, tracking: 4 });
      ctx.restore();
      M.text(ctx, '按下去。然后跑。', 120, 620, { size: 38, fam: M.F.cn, weight: 500, color: P.ink, tracking: 3 });
      keycap(ctx, 'SPACE', 120, 700, 290, 90, P.ink, P.cream);
      M.text(ctx, '空格', 270, 820, { size: 18, fam: M.F.cn, weight: 700, color: P.ink, align: 'center', tracking: 3 });
      // bomb
      const drop = M.ease.outBack(M.clamp((u - .1) / .35, 0, 1));
      ctx.save(); ctx.translate(1370, 640 - (1 - drop) * 300);
      const sq = 1 + .18 * Math.exp(-(u - .4) * 12) * Math.sin((u - .4) * 45);
      ctx.scale(1 / sq, sq);
      M.bomb(ctx, 0, 0, 210, { spark: 1, time: u, face: true, rot: -.08, glow: 20 });
      ctx.restore();
      // crosshair rings
      ctx.save(); ctx.translate(1370, 640); ctx.strokeStyle = M.rgba(P.ink, .2); ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(0, 0, 270 + i * 80 + Math.sin(u * 4 + i) * 12, 0, TAU); ctx.stroke(); }
      ctx.restore();
      // fuse path
      ctx.save(); ctx.strokeStyle = P.orange; ctx.lineWidth = 8; ctx.setLineDash([16, 14]); ctx.lineDashOffset = -u * 220;
      ctx.beginPath(); ctx.moveTo(1360, 370); ctx.bezierCurveTo(1500, 200, 1660, 260, 1740, 170); ctx.stroke(); ctx.restore();
      M.text(ctx, 'T-03', 1780, 160, { size: 24, fam: M.F.mono, weight: 700, color: P.ink, align: 'right' });
      flash(ctx, Math.exp(-u * 15) * .25);
      return;
    }
    if (u < 2) {
      fill(ctx, P.orange);
      M.sunburst(ctx, 960, 560, 1200, 22, M.rgba(P.yellow, .75), -u * .3);
      dotGrid(ctx, 0, 0, W, H, P.ink, .05);
      // explosion cross
      const p = M.clamp((u - 1) / .25, 0, 1);
      M.flameCross(ctx, 960, 560, 240, { prog: p, color: P.hot });
      // giant text
      ctx.save(); ctx.translate(100, 430); ctx.rotate(-.03);
      M.display(ctx, '爆炸', 0, 0, { size: 310, color: P.cream, stroke: P.ink, lineWidth: 12, depth: 18, depthColor: P.ink, align: 'left', fam: M.F.cn, tracking: -12 });
      M.text(ctx, '02 / BOOM', 10, 100, { size: 28, fam: M.F.en, weight: 900, color: P.ink, tracking: 4 });
      ctx.restore();
      M.text(ctx, '炸开缺口，改写地形。', 110, 650, { size: 38, fam: M.F.cn, weight: 500, color: P.ink, tracking: 3 });
      // shock rings
      for (let i = 0; i < 4; i++) {
        const rp = M.clamp((u - 1 - i * .05) * 2.5, 0, 1);
        ctx.strokeStyle = M.rgba(P.ink, .25 * (1 - rp)); ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(1380, 590, 60 + rp * 500, 0, TAU); ctx.stroke();
      }
      M.text(ctx, 'KEEP MOVING', 1740, 940, { size: 20, fam: M.F.en, weight: 900, color: P.ink, align: 'right', tracking: 4 });
      flash(ctx, Math.exp(-(u - 1) * 18) * .55);
      return;
    }
    if (u < 3) {
      fill(ctx, P.ink);
      // 3x3 bombs
      const bombs = [[-1, -1], [0, -1], [1, -1], [-1, 0], [0, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
      bombs.forEach(([bx, by], i) => {
        const x = 1170 + bx * 185, y = 510 + by * 185;
        const lit = Math.floor(u * 10 + i) % 4;
        M.bomb(ctx, x, y, 72, { spark: 1, time: u + i, rot: (i - 4) * .1, face: false, glow: lit === 0 ? 18 : 0 });
        if (lit === 0) M.circle(ctx, x, y, 90, M.rgba(P.orange, .15));
      });
      M.sunburst(ctx, 1250, 560, 1000, 20, M.rgba(P.orange, .08), u);
      ctx.save(); ctx.translate(100, 460); ctx.rotate(-.02);
      M.display(ctx, '连锁', 0, 0, { size: 310, color: P.cream, stroke: P.orange, lineWidth: 4, depth: 12, depthColor: P.orange, align: 'left', fam: M.F.cn, tracking: -10 });
      M.text(ctx, '03 / CHAIN', 12, 96, { size: 28, fam: M.F.en, weight: 900, color: P.cyan, tracking: 4 });
      ctx.restore();
      M.text(ctx, '一颗，接一颗，停不下来。', 108, 660, { size: 38, fam: M.F.cn, weight: 500, color: P.cream, tracking: 2 });
      // countdown
      const count = 3 - Math.min(2, Math.floor((u - 2) / .33));
      ctx.save(); ctx.translate(1420, 950); ctx.rotate(-.04);
      M.text(ctx, String(count), 0, 0, { size: 240, fam: M.F.en2, weight: 900, color: 'transparent', stroke: P.cream, lineWidth: 5, align: 'center', baseline: 'middle', tracking: -8 });
      ctx.restore();
      // fuse wires
      for (let i = 0; i < 9; i++) {
        const bx = 1170 + bombs[i][0] * 185, by = 510 + bombs[i][1] * 185;
        line(ctx, bx, by, bx + 20, by + 170, M.rgba(P.orange, .5), 2, .8);
      }
      const ticks = Math.floor(u * 8);
      flash(ctx, .06 + (ticks % 2 ? .02 : 0));
      return;
    }

    // BOOM / 35–36
    const b = u - 3;
    fill(ctx, P.yellow);
    // explosion geometry
    const shakeX = Math.sin(b * 87) * 18 * Math.exp(-b * 4);
    const shakeY = Math.cos(b * 73) * 14 * Math.exp(-b * 4);
    ctx.save(); ctx.translate(shakeX, shakeY);
    M.sunburst(ctx, 960, 560, 1300, 32, P.orange, b * .8);
    M.sunburst(ctx, 960, 560, 1100, 22, P.hot, -b * .6);
    M.sunburst(ctx, 960, 560, 800, 18, P.cream, b * .3);
    M.burst(ctx, 960, 560, 480 + Math.sin(b * 12) * 16, 280, 18, P.yellow, b * .2, P.ink, 12);
    M.burst(ctx, 960, 560, 320, 180, 16, P.cream, -b * .3, P.ink, 8);
    // flying debris
    for (let i = 0; i < 42; i++) {
      const a = M.rand(i * 2.1) * TAU;
      const sp = 500 + M.rand(i * 6.3) * 900;
      const x = 960 + Math.cos(a) * sp * b;
      const y = 560 + Math.sin(a) * sp * b + 500 * b * b;
      const size = 8 + M.rand(i) * 28;
      ctx.save(); ctx.translate(x, y); ctx.rotate(b * (M.rand(i + 2) - .5) * 12);
      ctx.globalAlpha = M.clamp(1.25 - b * 1.3, 0, 1);
      if (i % 3 === 0) { ctx.fillStyle = P.cream; ctx.fillRect(-size / 2, -size / 2, size, size); }
      else if (i % 3 === 1) { M.star(ctx, 0, 0, size, size * .4, 5, i % 2 ? P.ink : P.cream); }
      else { M.circle(ctx, 0, 0, size * .5, i % 2 ? P.cream : P.hot); }
      ctx.restore();
    }
    // giant BOOM type — pre-composited once, then transformed as a single sprite
    if (!boomTextCache) {
      const c = M.makeCanvas(2400, 1120), x = c.getContext('2d');
      M.display(x, 'BOOM!', 1200, 560, { size: 440, color: P.cream, stroke: P.ink, lineWidth: 16, depth: 22, depthColor: P.ink, align: 'center', baseline: 'middle', fam: M.F.en, tracking: -10 });
      x.save(); x.globalAlpha = .8; x.translate(18, 16);
      M.text(x, 'BOOM!', 1200, 560, { size: 440, fam: M.F.en, weight: 900, color: P.hot, align: 'center', baseline: 'middle', tracking: -10 });
      x.restore();
      boomTextCache = c;
    }
    ctx.save();
    ctx.translate(960, 600); ctx.rotate(-.055 + Math.sin(b * 6) * .01);
    const sc = 1 + .15 * Math.exp(-b * 8);
    ctx.scale(sc, sc);
    ctx.drawImage(boomTextCache, -1200, -560);
    ctx.restore();
    // sublabel
    ctx.save(); ctx.translate(960, 880); ctx.rotate(-.03);
    ctx.fillStyle = P.ink; ctx.fillRect(-310, -40, 620, 80);
    M.text(ctx, 'CHAIN REACTION / 全 场 连 锁', 0, 2, { size: 25, fam: M.F.cn, weight: 700, color: P.cream, align: 'center', baseline: 'middle', tracking: 3 });
    ctx.restore();
    ctx.restore();
    // second half: black inversion
    if (b > .42) {
      const k = M.clamp((b - .42) / .08, 0, 1);
      ctx.save(); ctx.globalAlpha = k; fill(ctx, P.ink); ctx.restore();
      ctx.save(); ctx.translate(960, 560); ctx.rotate(-.03);
      M.text(ctx, '炸', 0, 0, { size: 760, fam: M.F.cn, weight: 900, color: P.cream, align: 'center', baseline: 'middle', tracking: -30 });
      // offset hot copy
      ctx.globalAlpha = .55; ctx.translate(22, 24);
      M.text(ctx, '炸', 0, 0, { size: 760, fam: M.F.cn, weight: 900, color: P.hot, align: 'center', baseline: 'middle', tracking: -30 });
      ctx.restore();
      M.text(ctx, '不 要 停。', 960, 950, { size: 42, fam: M.F.cn, weight: 700, color: P.cream, align: 'center', tracking: 14 });
      ctx.restore ? null : null;
    }
    flash(ctx, M.clamp(1 - b * 8, 0, 1) * .95 + Math.exp(-b * 6) * .2);
  };

  // ============================================================
  // 15 — BOSS / 36–40 s
  // ============================================================
  function glitchImage(ctx, key, x, y, h, amp, seed, alpha = 1) {
    const a = M.assets[key]; if (!a) return;
    const w = h * a.w / a.h, dx = x - w / 2, dy = y - h;
    const bands = 18;
    ctx.save(); ctx.globalAlpha *= alpha;
    // colour ghosts
    const silR = M.silhouette(key, P.red), silC = M.silhouette(key, P.cyan);
    if (silR) { ctx.globalAlpha = alpha * .4; ctx.drawImage(silR, dx - 18, dy, w, h); }
    if (silC) { ctx.globalAlpha = alpha * .4; ctx.drawImage(silC, dx + 18, dy, w, h); }
    ctx.globalAlpha = alpha;
    for (let i = 0; i < bands; i++) {
      const sh = a.canvas.height / bands;
      const sy = i * sh;
      const yy = dy + (h / bands) * i;
      const off = (M.rand(seed + i * 3.7) - .5) * amp;
      ctx.drawImage(a.canvas, 0, sy, a.canvas.width, sh, dx + off, yy, w, h / bands + 1);
    }
    ctx.restore();
  }

  Scenes.boss = function (ctx, t) {
    const u = t - 36;
    fill(ctx, '#0B0A0F');
    // danger textures
    stripes(ctx, 0, 0, W, 70, P.ink, P.red, 40, -.55);
    stripes(ctx, 0, H - 70, W, 70, P.ink, P.red, 40, -.55);
    M.sunburst(ctx, 960, 540, 1100, 26, M.rgba(P.red, .12), u * .2);
    // warning titles
    if (u < .8) {
      ctx.save(); ctx.translate(960, 220); ctx.rotate(-.03);
      M.text(ctx, 'WARNING', 0, 0, { size: 300, fam: M.F.en, weight: 900, color: 'transparent', stroke: P.yellow, lineWidth: 10, align: 'center', tracking: 2 });
      ctx.globalAlpha = .14; ctx.fillStyle = P.yellow; ctx.fillRect(-900, -20, 1800, 40); ctx.restore();
      M.text(ctx, 'W A R N I N G', 960, 420, { size: 76, fam: M.F.en, weight: 900, color: P.red, align: 'center', tracking: 12 });
      M.text(ctx, '最终 BOSS 正在接近', 960, 830, { size: 40, fam: M.F.cn, weight: 700, color: P.cream, align: 'center', tracking: 6 });
      M.text(ctx, 'FINAL BOSS APPROACHING', 960, 880, { size: 16, fam: M.F.mono, weight: 700, color: P.cream, align: 'center', tracking: 4 });
      // boss normal enters
      const ep = M.ease.outExpo(M.clamp((u - .1) / .5, 0, 1));
      ctx.save(); ctx.translate(1700 + (1 - ep) * 700, 990);
      M.char(ctx, 'luludan', 0, 0, 680, { shadow: P.red, sx: 16, sy: 14, glow: M.rgba(P.purple, .35), glowBlur: 30 });
      ctx.restore();
      // glitch
      ctx.save(); ctx.globalAlpha = .65;
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = i % 2 ? P.red : P.cyan;
        ctx.fillRect(0, 250 + i * 70 + Math.sin(u * 20 + i) * 10, W, 3);
      }
      ctx.restore();
      flash(ctx, Math.exp(-u * 16) * .3);
      return;
    }
    if (u < 1.7) {
      const v = u - .8;
      // split layout
      ctx.fillStyle = P.red; ctx.fillRect(0, 0, 1020, H);
      ctx.fillStyle = P.ink; ctx.fillRect(1020, 0, W - 1020, H);
      dotGrid(ctx, 0, 0, W, H, P.cream, .07);
      // huge name
      ctx.save(); ctx.translate(80, 390); ctx.rotate(-.02);
      M.text(ctx, '鲁鲁旦', 0, 0, { size: 220, fam: M.F.cn, weight: 900, color: P.cream, tracking: -6 });
      M.display(ctx, 'LULUDAN', 6, 90, { size: 96, color: P.ink, stroke: P.cream, lineWidth: 2, align: 'left', fam: M.F.en, tracking: 2 });
      ctx.restore();
      M.text(ctx, '别 捣 蛋。', 94, 640, { size: 90, fam: M.F.cn, weight: 900, color: P.ink, tracking: 8 });
      M.text(ctx, 'FINAL STAGE 10 / 10', 98, 730, { size: 20, fam: M.F.mono, weight: 700, color: P.cream, tracking: 3 });
      // boss
      ctx.save(); ctx.translate(1390, 1060); ctx.rotate(.02);
      M.char(ctx, 'luludan', 0, 0, 880, { shadow: P.yellow, sx: 18, sy: 16, glow: M.rgba(P.purple, .55), glowBlur: 45 });
      ctx.restore();
      // warning triangles
      for (let i = 0; i < 3; i++) {
        ctx.save(); ctx.translate(760 + i * 95, 220 + i * 40); ctx.rotate(.1);
        M.poly(ctx, [[0, -60], [58, 48], [-58, 48]], P.yellow, P.ink, 5);
        M.text(ctx, '!', 0, 30, { size: 58, fam: M.F.en, weight: 900, color: P.ink, align: 'center' });
        ctx.restore();
      }
      flash(ctx, Math.exp(-v * 16) * .35);
      return;
    }
    if (u < 2.7) {
      const v = u - 1.7;
      // rage cut
      fill(ctx, '#E32748');
      M.sunburst(ctx, 960, 540, 1200, 24, M.rgba(P.ink, .18), -u);
      dotGrid(ctx, 0, 0, W, H, P.ink, .08);
      // boss glitch closeup
      glitchImage(ctx, 'luludanRage', 1470, 1110, 1060, 28 + 30 * (Math.sin(v * 30) > .4 ? 1 : 0), Math.floor(v * 20));
      // giant characters
      ctx.save(); ctx.translate(80, 430); ctx.rotate(-.05);
      ['别', '捣', '蛋'].forEach((c, i) => {
        const pp = M.ease.outBack(M.clamp((v - i * .1) / .18, 0, 1));
        ctx.save(); ctx.translate(i * 240, (1 - pp) * 300); ctx.rotate((i - 1) * .06);
        M.text(ctx, c, 0, 0, { size: 260, fam: M.F.cn, weight: 900, color: P.cream, stroke: P.ink, lineWidth: 8, tracking: -10 });
        ctx.restore();
      });
      ctx.restore();
      M.text(ctx, 'BOSS / PHASE 2', 96, 640, { size: 24, fam: M.F.en, weight: 900, color: P.ink, tracking: 4 });
      M.text(ctx, '它 生 气 了。', 96, 700, { size: 36, fam: M.F.cn, weight: 700, color: P.ink, tracking: 4 });
      // glitch strips
      for (let i = 0; i < 12; i++) {
        if (M.rand(i + Math.floor(v * 18)) > .6) {
          ctx.save(); ctx.globalAlpha = .8;
          ctx.fillStyle = i % 2 ? P.cyan : P.ink;
          ctx.fillRect(0, (i * 83 + v * 120) % H, W, 5 + M.rand(i) * 14);
          ctx.restore();
        }
      }
      flash(ctx, Math.exp(-v * 20) * .45);
      return;
    }
    // final stage / collapse
    const v = u - 2.7;
    if (v < .55) {
      fill(ctx, P.cream);
      M.sunburst(ctx, 960, 540, 1200, 24, M.rgba(P.orange, .35), v * 2);
      M.text(ctx, '第 10 关', 960, 420, { size: 120, fam: M.F.cn, weight: 900, color: P.ink, align: 'center', tracking: 6 });
      M.display(ctx, 'FINAL', 960, 700, { size: 260, color: P.orange, stroke: P.ink, lineWidth: 6, depth: 10, depthColor: P.ink, align: 'center', fam: M.F.en, tracking: 4 });
      ctx.save(); ctx.translate(960, 950); ctx.rotate(-.03);
      ctx.fillStyle = P.ink; ctx.fillRect(-280, -32, 560, 64);
      M.text(ctx, 'BOSS 鲁鲁旦 / 背水一战', 0, 2, { size: 24, fam: M.F.cn, weight: 700, color: P.cream, align: 'center', baseline: 'middle', tracking: 3 });
      ctx.restore();
      flash(ctx, Math.exp(-v * 15) * .2);
      return;
    }
    // red slit collapse -> awakening
    const q = M.clamp((v - .55) / .75, 0, 1);
    fill(ctx, P.ink);
    const slitH = 8 + (1 - q) * 300;
    ctx.fillStyle = P.red; ctx.fillRect(0, 540 - slitH / 2, W, slitH);
    ctx.fillStyle = P.yellow; ctx.fillRect(0, 540 - slitH / 8, W, slitH / 4);
    ctx.fillStyle = P.ink; ctx.fillRect(0, 0, W, 540 - slitH / 2);
    ctx.fillRect(0, 540 + slitH / 2, W, H);
    // rays from slit
    for (let i = 0; i < 30; i++) {
      const xx = i * 70 + q * 200;
      ctx.globalAlpha = .12 + .1 * M.rand(i);
      ctx.fillStyle = i % 2 ? P.red : P.orange;
      ctx.fillRect(xx, 540 - slitH / 2 - 40, 12, 80);
    }
    ctx.globalAlpha = 1;
    M.text(ctx, 'SPIRIT LINK / OVERRIDE', 960, 180, { size: 18, fam: M.F.mono, weight: 700, color: P.cream, align: 'center', tracking: 4 });
    flash(ctx, q * .25);
  };

  // ============================================================
  // 16 — AWAKENING / 40–44 s
  // ============================================================
  Scenes.awaken = function (ctx, t) {
    const u = t - 40;
    // portal / spirit link
    fill(ctx, '#080A11');
    // radial beams
    ctx.save(); ctx.translate(1270, 580); ctx.rotate(u * .16);
    M.rayLines(ctx, 0, 0, 120, 1200, 42, M.rgba(P.cyan, .14), 0, 2);
    ctx.restore();
    // huge vertical light shaft
    const shaft = ctx.createLinearGradient(0, 0, 0, H);
    shaft.addColorStop(0, M.rgba(P.cyan, 0));
    shaft.addColorStop(.45, M.rgba(P.cyan, .18));
    shaft.addColorStop(.55, M.rgba(P.cyan, .28));
    shaft.addColorStop(1, M.rgba(P.cyan, 0));
    ctx.fillStyle = shaft; ctx.fillRect(1070, 0, 420, H);
    // ring portals
    ctx.save(); ctx.translate(1270, 570); ctx.rotate(u * .12);
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = [P.cyan, P.pink, P.yellow, P.cream, P.cyan, P.pink][i];
      ctx.globalAlpha = .32 + .15 * Math.sin(u * 3 + i);
      ctx.lineWidth = 3 + (i === 0 ? 3 : 0);
      ctx.beginPath(); ctx.ellipse(0, 0, 300 + i * 42, 160 + i * 24, i * .3, 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.restore();
    // sparkles
    for (let i = 0; i < 50; i++) {
      const a = M.rand(i * 4.3) * TAU, rr = 100 + M.rand(i * 7.9) * 700;
      const x = 1270 + Math.cos(a + u * .2) * rr;
      const y = 560 + Math.sin(a + u * .2) * rr * .58;
      ctx.globalAlpha = .3 + .6 * M.rand(i + Math.floor(u * 10));
      M.star(ctx, x, y, 3 + M.rand(i) * 8, 1.5 + M.rand(i) * 3, 4, i % 3 ? P.cyan : P.pink);
    }
    ctx.globalAlpha = 1;
    // character, huge
    const enter = M.ease.outExpo(M.clamp((u - .18) / .55, 0, 1));
    const glow = .5 + .5 * Math.sin(u * 4);
    ctx.save();
    ctx.translate(1300, 1060 + (1 - enter) * 260);
    ctx.globalAlpha = .25 + .75 * enter;
    M.char(ctx, 'awakened', 0, 0, 1020, { shadow: P.cyan, sx: 22, sy: 22, glow: `rgba(92,225,242,${.4 + glow * .3})`, glowBlur: 70, rotation: -.015 });
    ctx.restore();
    // label left
    M.text(ctx, '通灵 / SPIRIT LINK', 100, 220, { size: 18, fam: M.F.mono, weight: 700, color: P.cyan, tracking: 3.8 });
    ctx.save(); ctx.translate(90, 500); ctx.rotate(-.02);
    M.text(ctx, '通灵', 0, 0, { size: 190, fam: M.F.cn, weight: 900, color: P.cream, tracking: 0 });
    M.text(ctx, '迁境奇点', 6, 110, { size: 62, fam: M.F.cn, weight: 900, color: P.pink, tracking: 3 });
    ctx.restore();
    M.text(ctx, '五色灵光汇聚 / 守护灵显现', 102, 730, { size: 28, fam: M.F.cn, weight: 500, color: M.rgba(P.cream, .85), tracking: 2 });
    // meter
    const fillN = Math.min(6, Math.floor(u * 9) + 1);
    M.text(ctx, '通灵条 / LINK', 102, 800, { size: 14, fam: M.F.mono, weight: 700, color: P.cream, tracking: 2 });
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i < fillN ? P.cyan : M.rgba(P.cream, .18);
      ctx.fillRect(100 + i * 72, 822, 60, 13);
      if (i < fillN) {
        ctx.globalAlpha = .3; ctx.fillStyle = P.white;
        ctx.fillRect(100 + i * 72, 822, 60, 4); ctx.globalAlpha = 1;
      }
    }
    M.text(ctx, fillN >= 6 ? '已通灵 / AWAKENED' : '通灵中 / CHARGING', 102, 868, { size: 17, fam: M.F.cn, weight: 700, color: fillN >= 6 ? P.yellow : P.cyan, tracking: 2 });
    // giant background outline
    M.text(ctx, 'AWAKEN', 1130, 630, { size: 330, fam: M.F.en, weight: 900, color: 'transparent', stroke: M.rgba(P.cyan, .07), lineWidth: 3, align: 'center', baseline: 'middle', tracking: -8 });
    // 42s — slam a cream editorial column over the left third
    if (u > 2) {
      const q = M.ease.outExpo(M.clamp((u - 2) / .22, 0, 1));
      const pw = 575;
      ctx.save();
      ctx.translate(-pw * (1 - q), 0);
      ctx.fillStyle = P.cream;
      ctx.fillRect(0, 0, pw, H);
      // edge rules
      ctx.fillStyle = P.cyan; ctx.fillRect(pw - 22, 0, 10, H);
      ctx.fillStyle = P.pink; ctx.fillRect(pw - 10, 0, 10, H);
      // halftone + big ghost number
      ctx.save(); ctx.globalAlpha = .10;
      ctx.fillStyle = M.pattern('dots', P.ink); ctx.fillRect(0, 0, pw, H); ctx.restore();
      M.text(ctx, '06', 44, 620, { size: 520, fam: M.F.en2, weight: 900, color: 'transparent', stroke: M.rgba(P.ink, .10), lineWidth: 4, align: 'left', baseline: 'middle', tracking: -18 });
      M.text(ctx, '06 / WEILAI', 48, 158, { size: 16, fam: M.F.mono, weight: 700, color: P.ink, tracking: 3 });
      M.text(ctx, 'SPIRIT LINK / AWAKENED', 48, 184, { size: 12, fam: M.F.mono, weight: 700, color: M.rgba(P.ink, .55), tracking: 2.4 });
      M.text(ctx, '未来', 38, 400, { size: 188, fam: M.F.cn, weight: 900, color: P.ink, tracking: -6 });
      M.text(ctx, '迁境奇点', 44, 476, { size: 58, fam: M.F.cn, weight: 900, color: P.pink, tracking: 2 });
      M.text(ctx, 'REWRITE THE ENDING', 48, 528, { size: 19, fam: M.F.en, weight: 900, color: P.orange, tracking: 3 });
      // meter / stats
      M.text(ctx, '通灵条 6 / 6  ·  AWAKENED', 48, 680, { size: 15, fam: M.F.mono, weight: 700, color: P.ink, tracking: 1.5 });
      for (let i = 0; i < 6; i++) { ctx.fillStyle = P.cyan; ctx.fillRect(48 + i * 74, 700, 62, 14); }
      M.text(ctx, '5×5 减速领域 / 75%', 48, 760, { size: 22, fam: M.F.cn, weight: 500, color: P.ink, tracking: 2 });
      M.text(ctx, '守护灵 · 双翼 · 光柱', 48, 796, { size: 20, fam: M.F.cn, weight: 500, color: M.rgba(P.ink, .68), tracking: 2 });
      // footer
      ctx.fillStyle = P.ink; ctx.fillRect(48, 866, 430, 54);
      M.text(ctx, 'FUTURE / WEILAI', 70, 899, { size: 18, fam: M.F.en, weight: 900, color: P.cream, tracking: 3 });
      M.text(ctx, 'SPIRIT QUEEN', 456, 899, { size: 11, fam: M.F.mono, weight: 700, color: P.cyan, align: 'right', tracking: 1.5 });
      // vertical black tab
      ctx.save(); ctx.translate(pw + 42, 540); ctx.rotate(Math.PI / 2);
      M.text(ctx, 'SINGULARITY / 06', 0, 0, { size: 13, fam: M.F.mono, weight: 700, color: P.cream, align: 'center', tracking: 3 });
      ctx.restore();
      ctx.restore();
    }
    // last beat kaleidoscope
    if (u > 3.2) {
      const q = M.clamp((u - 3.2) / .8, 0, 1);
      ctx.save(); ctx.globalAlpha = q;
      ctx.translate(960, 560); ctx.rotate(u * 1.8);
      for (let i = 0; i < 12; i++) {
        ctx.rotate(TAU / 12);
        ctx.fillStyle = [P.cyan, P.pink, P.yellow, P.orange][i % 4];
        ctx.globalAlpha = q * .32;
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 1100, 0, TAU / 24); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      flash(ctx, q * .35);
    }
    flash(ctx, Math.exp(-u * 20) * .35);
  };

  // ============================================================
  // 17 — FINALE / 44–48 s
  // ============================================================
  Scenes.finale = function (ctx, t) {
    const u = t - 44;
    if (u >= 3.0) {
      // last-beat end card / clean call to action
      const v = u - 3.0;
      fill(ctx, P.ink);
      M.sunburst(ctx, 1420, 430, 1000, 20, M.rgba(P.orange, .18), v * .25 - .4);
      ctx.save(); ctx.translate(1420, 430); ctx.rotate(-.2);
      M.rayLines(ctx, 0, 0, 380, 1000, 32, M.rgba(P.orange, .18), 0, 2);
      ctx.restore();
      dotGrid(ctx, 0, 0, W, H, P.cream, .045);
      // side colour blocks
      M.CHARS.forEach((ch, i) => {
        ctx.fillStyle = ch.color;
        ctx.fillRect(0, 120 + i * 110, 12, 72);
        ctx.fillRect(W - 12, 120 + i * 110, 12, 72);
      });
      const enter = M.ease.outExpo(M.clamp(v / .18, 0, 1));
      ctx.save();
      ctx.translate(0, (1 - enter) * 90);
      ctx.globalAlpha = enter;
      // giant number behind
      M.text(ctx, '09', 1780, 400, { size: 420, fam: M.F.en2, weight: 900, color: 'transparent', stroke: M.rgba(P.cream, .08), lineWidth: 5, align: 'right', baseline: 'middle', tracking: -16 });
      M.text(ctx, 'Q版泡泡堂', 960, 458, { size: 190, fam: M.F.cn, weight: 900, color: P.cream, align: 'center', baseline: 'middle', tracking: -5 });
      M.display(ctx, 'BOMBIT', 960, 610, { size: 138, color: P.orange, stroke: P.cream, lineWidth: 5, depth: 7, depthColor: P.ink, align: 'center', baseline: 'middle', fam: M.F.en, tracking: 2 });
      ctx.restore();
      M.text(ctx, '6 精灵  /  3 模式  /  1 颗炸弹', 960, 714, { size: 24, fam: M.F.cn, weight: 700, color: P.cream, align: 'center', tracking: 4 });
      ctx.save(); ctx.translate(960, 816); ctx.rotate(-.02);
      M.sticker(ctx, '现在开炸 / PLAY NOW', 0, 0, { bg: P.yellow, color: P.ink, size: 28, padX: 24, padY: 13 });
      ctx.restore();
      M.text(ctx, 'panyusure.github.io/BombIt', 960, 926, { size: 23, fam: M.F.mono, weight: 700, color: P.cyan, align: 'center', tracking: 1 });
      M.text(ctx, 'FAN-MADE MOTION ID  /  ALL CODE  /  2026', 960, 964, { size: 11, fam: M.F.mono, color: M.rgba(P.cream, .52), align: 'center', tracking: 2.4 });
      M.CHARS.forEach((ch, i) => {
        ctx.fillStyle = ch.color;
        ctx.fillRect(682 + i * 94, 996, 78, 5);
      });
      // bomb punctuation
      ctx.save(); ctx.translate(1518, 570); ctx.rotate(.06);
      M.bomb(ctx, 0, 0, 60, { spark: 1, time: t, face: true, rot: -.15, glow: 16 });
      ctx.restore();
      // entrance flash
      flash(ctx, Math.exp(-v * 16) * .85);
      return;
    }
    if (u < .8) {
      // full-bleed typographic final hit
      fill(ctx, P.ink);
      M.sunburst(ctx, 960, 540, 1400, 24, M.rgba(P.orange, .16), u * .4);
      // six colour rails, top and bottom
      M.CHARS.forEach((ch, i) => {
        const pp = M.ease.outExpo(M.clamp((u - i * .025) / .28, 0, 1));
        ctx.fillStyle = ch.color;
        ctx.fillRect(0, 182 + i * 13, W * pp, 8);
        ctx.fillRect(W * (1 - pp), 958 + i * 8, W * pp, 6);
      });
      M.text(ctx, 'FINAL MIX  /  SIX SPIRITS  /  ONE FUSE', 960, 134, { size: 14, fam: M.F.mono, weight: 700, color: M.rgba(P.cream, .55), align: 'center', tracking: 4 });
      ctx.save(); ctx.translate(960, 435); ctx.rotate(-.02);
      M.kinetic(ctx, '全员', 0, 0, { size: 270, fam: M.F.cn, weight: 900, color: P.cream, align: 'center', prog: M.clamp(u / .1, 0, 1), drop: 320, stagger: .05, tracking: -8 });
      M.kinetic(ctx, '开炸。', 0, 282, { size: 270, fam: M.F.cn, weight: 900, color: P.orange, align: 'center', prog: M.clamp((u - .055) / .12, 0, 1), drop: 320, stagger: .05, tracking: -8 });
      ctx.restore();
      ctx.fillStyle = P.orange; ctx.fillRect(760, 792, 400, 4);
      M.text(ctx, 'Q版泡泡堂 / BOMBIT', 960, 850, { size: 20, fam: M.F.cn, weight: 700, color: P.cream, align: 'center', tracking: 4 });
      M.text(ctx, '6 / 3 / 1  —  ALL IN', 960, 890, { size: 13, fam: M.F.mono, weight: 700, color: M.cyan, align: 'center', tracking: 3 });
      flash(ctx, Math.exp(-u * 18) * .55);
      return;
    }

    // main poster
    fill(ctx, P.cream);
    // huge orange sun
    M.circle(ctx, 1440, 430, 440, P.orange);
    ctx.save(); ctx.translate(1440, 430); ctx.rotate(u * .07);
    M.rayLines(ctx, 0, 0, 460, 1050, 36, M.rgba(P.orange, .24), 0, 3);
    ctx.restore();
    dotGrid(ctx, 0, 0, W, H, P.ink, .055);
    // BOMBIT outline backdrop
    M.text(ctx, 'BOMBIT', 960, 610, { size: 450, fam: M.F.en, weight: 900, color: 'transparent', stroke: M.rgba(P.ink, .13), lineWidth: 3, align: 'center', baseline: 'middle', tracking: -8 });
    // top ticker
    ctx.save(); ctx.translate(0, 120);
    ctx.fillStyle = P.ink; ctx.fillRect(0, -28, W, 56);
    const tick = '  Q版泡泡堂  ·  BOMBIT  ·  精灵冒险 × 同屏对战  ·  ';
    const tw = M.measure(ctx, tick, 22, 700, M.F.cn, 3);
    const off = (u * 200) % tw;
    for (let i = -1; i < Math.ceil(W / tw) + 2; i++) M.text(ctx, tick, i * tw - off, 0, { size: 22, fam: M.F.cn, weight: 700, color: P.cream, baseline: 'middle', tracking: 3 });
    // feather the ticker edges so the loop never shows a sliced glyph at frame edge
    const fadeL = ctx.createLinearGradient(0, -28, 170, -28);
    fadeL.addColorStop(0, P.ink); fadeL.addColorStop(1, M.rgba(P.ink, 0));
    ctx.fillStyle = fadeL; ctx.fillRect(0, -28, 170, 56);
    const fadeR = ctx.createLinearGradient(W, -28, W - 170, -28);
    fadeR.addColorStop(0, P.ink); fadeR.addColorStop(1, M.rgba(P.ink, 0));
    ctx.fillStyle = fadeR; ctx.fillRect(W - 170, -28, 170, 56);
    ctx.restore();
    // title block
    ctx.save(); ctx.translate(100, 390); ctx.rotate(-.025);
    M.text(ctx, 'Q版', 0, 0, { size: 126, fam: M.F.cn, weight: 900, color: P.ink, tracking: -2 });
    M.display(ctx, '泡泡堂', 0, 250, { size: 250, color: P.ink, stroke: 'transparent', lineWidth: 0, align: 'left', fam: M.F.cn, weight: 900, tracking: -5 });
    M.display(ctx, 'BOMBIT', 6, 342, { size: 105, color: P.orange, stroke: P.ink, lineWidth: 4, depth: 5, depthColor: P.ink, align: 'left', fam: M.F.en, tracking: 1 });
    M.text(ctx, '6 精灵 / 3 模式 / 1 颗炸弹', 10, 410, { size: 24, fam: M.F.cn, weight: 700, color: P.ink, tracking: 3 });
    ctx.restore();
    // character sticker parade — back row, then front row
    const backRow = [
      ['arui', 1260, 892, 300, -.06],
      ['xiaoyan', 1510, 900, 310, .03],
      ['xiaotian', 1760, 895, 300, -.02]
    ];
    backRow.forEach(([id, x, y, h, r], i) => {
      const pp = M.ease.outBack(M.clamp((u - .04 - i * .035) / .32, 0, 1));
      ctx.save(); ctx.globalAlpha = pp * .97; ctx.translate(0, (1 - pp) * 110);
      charSticker(ctx, id, x, y, h, { rot: r, border: P.cream, borderW: 7, shadow: P.ink, sx: 8, sy: 8 });
      ctx.restore();
    });
    const frontRow = [
      ['xiaonuo', 1115, 1014, 350, -.06],
      ['weilai', 1435, 1022, 375, .02],
      ['axiu', 1750, 1018, 360, .05]
    ];
    frontRow.forEach(([id, x, y, h, r], i) => {
      const pp = M.ease.outBack(M.clamp((u - .16 - i * .045) / .35, 0, 1));
      ctx.save(); ctx.globalAlpha = pp; ctx.translate(0, (1 - pp) * 170);
      charSticker(ctx, id, x, y, h, { rot: r, border: P.cream, borderW: 10, shadow: P.ink, sx: 12, sy: 12 });
      ctx.restore();
    });
    // bomb mascot floats in the sun, clear of the squad
    ctx.save(); ctx.translate(1700, 330); ctx.rotate(.08);
    M.bomb(ctx, 0, 0, 72, { spark: 1, time: t, rot: -.2, face: true, glow: 18 });
    ctx.restore();
    // stickers
    ctx.save(); ctx.translate(248, 842); ctx.rotate(-.05);
    M.sticker(ctx, '现在开炸 / PLAY NOW', 0, 0, { bg: P.yellow, color: P.ink, size: 28, padX: 22, padY: 13 });
    ctx.restore();
    ctx.save(); ctx.translate(564, 862); ctx.rotate(.025);
    M.sticker(ctx, 'v2.2 · FAN-MADE MOTION ID', 0, 0, { bg: P.cream, color: P.ink, size: 15, padX: 12, padY: 7 });
    ctx.restore();
    // URL bar
    ctx.save(); ctx.translate(100, 908);
    ctx.fillStyle = P.ink; ctx.fillRect(0, 0, 770, 56);
    M.text(ctx, 'panyusure.github.io/BombIt', 24, 35, { size: 24, fam: M.F.mono, weight: 700, color: P.cyan });
    M.text(ctx, 'ONLINE / ZERO INSTALL   ·   v2.2', 744, 35, { size: 12, fam: M.F.mono, weight: 700, color: P.cream, align: 'right', tracking: 1.3 });
    ctx.restore();
    // footer micro
    M.text(ctx, 'Q-BAN BUBBLE HALL — SIX SPIRITS, THREE MODES, ONE FUSE.', 100, 992, { size: 11, fam: M.F.mono, color: P.ink, tracking: 1.8 });
    // color bars at edges
    ctx.fillStyle = P.cyan; ctx.fillRect(0, 0, 12, H);
    ctx.fillStyle = P.pink; ctx.fillRect(W - 12, 0, 12, H);

  };

  M.scenesReady = true;
})();
