/* ============================================================
 * BOMBIT — Motion ID / core
 * Deterministic 2D motion-graphics toolkit. No dependencies.
 * ============================================================ */
(function () {
  'use strict';
  const M = (window.M = window.M || {});
  const TAU = Math.PI * 2;
  M.W = 1920;
  M.H = 1080;
  M.TAU = TAU;

  M.P = {
    ink: '#141019',
    ink2: '#231B2D',
    cream: '#F5EBD8',
    paper: '#F1E4CF',
    white: '#FFFDF6',
    orange: '#FF5533',
    pink: '#FF5E9E',
    hot: '#FF2D6F',
    yellow: '#FFD23F',
    lemon: '#FFE979',
    cyan: '#5CE1F2',
    sky: '#66C8FF',
    blue: '#2C5BFF',
    green: '#62DF88',
    mint: '#9CF5D2',
    purple: '#8B6BFF',
    lilac: '#C5B3FF',
    navy: '#17122E',
    red: '#F5233C',
    burgundy: '#8F1F3C'
  };

  M.F = {
    cn: '"HarmonyOS Sans SC", "Microsoft YaHei", sans-serif',
    cnHeavy: '"HarmonyOS Sans SC", "Microsoft YaHei", sans-serif',
    en: 'Impact, "Arial Black", sans-serif',
    en2: '"Arial Black", Impact, sans-serif',
    cond: '"Bahnschrift", "Arial Narrow", sans-serif',
    mono: 'Consolas, "Courier New", monospace',
    brush: '"FZShuTi", "KaiTi", serif',
    song: '"SourceHanSansJP-Bold", "Microsoft YaHei", sans-serif'
  };

  M.clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  M.lerp = (a, b, t) => a + (b - a) * t;
  M.inv = (a, b, x) => M.clamp((x - a) / (b - a), 0, 1);
  M.ease = {
    out: t => 1 - Math.pow(1 - t, 3),
    out5: t => 1 - Math.pow(1 - t, 5),
    in: t => t * t * t,
    in2: t => t * t,
    inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    outExpo: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
    inExpo: t => t <= 0 ? 0 : Math.pow(2, 10 * t - 10),
    outBack: (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
    outElastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (TAU / 3)) + 1
  };
  // beat helpers, 120 BPM → 0.5 s per beat
  M.BPM = 120;
  M.BEAT = 60 / M.BPM;
  M.bar = t => t / (M.BEAT * 4);
  M.phase = (t, offset = 0, rate = 1) => {
    const p = (t * rate + offset) / M.BEAT;
    return p - Math.floor(p);
  };
  M.pulse = (t, decay = 9, offset = 0, rate = 1) => {
    const p = M.phase(t + offset, 0, rate);
    return Math.exp(-p * decay);
  };
  M.beatPulse = (t, offset = 0) => M.pulse(t, 8, offset, 1);
  M.hit = (t, at, decay = 12, dur = 0) => {
    const d = t - at;
    if (d < -dur || d > 1.5) return 0;
    return d < 0 ? 0 : Math.exp(-d * decay);
  };

  // deterministic pseudo random
  M.rand = function (seed) {
    let s = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
    return s - Math.floor(s);
  };
  M.rand2 = function (a, b) {
    return M.rand(a * 91.37 + b * 47.13 + 8.31);
  };
  M.seedAt = function (frame, i) {
    return M.rand(i * 31.7 + frame * 13.13);
  };

  // colour helpers
  M.rgba = function (hex, a = 1) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  M.mix = function (a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(M.lerp((pa >> 16) & 255, (pb >> 16) & 255, t));
    const g = Math.round(M.lerp((pa >> 8) & 255, (pb >> 8) & 255, t));
    const bl = Math.round(M.lerp(pa & 255, pb & 255, t));
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
  };

  // ---------- fonts / type ----------
  M.setFont = function (ctx, size, weight = 700, fam = M.F.cn, italic = false) {
    ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${fam}`;
  };
  M.text = function (ctx, str, x, y, o = {}) {
    const {
      size = 48, weight = 700, fam = M.F.cn, color = M.P.ink, align = 'left',
      baseline = 'alphabetic', alpha = 1, tracking = 0, stroke = null, lineWidth = 0,
      shadow = null, shadowX = 10, shadowY = 10, rotation = 0, scaleX = 1,
      scaleY = 1, textAlign = align, skip = null
    } = o;
    if (!str) return 0;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
    M.setFont(ctx, size, weight, fam);
    ctx.textBaseline = baseline;
    const drawOne = (s, xx, yy, col) => {
      ctx.fillStyle = col;
      if (stroke && lineWidth) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(s, xx, yy);
      }
      if (shadow) {
        ctx.save();
        ctx.fillStyle = shadow;
        ctx.fillText(s, xx + shadowX, yy + shadowY);
        ctx.restore();
      }
      ctx.fillText(s, xx, yy);
    };
    if (!tracking) {
      const m = ctx.measureText(str).width;
      const xx = align === 'center' ? -m / 2 : align === 'right' ? -m : 0;
      drawOne(str, xx, 0, color);
      ctx.restore();
      return m;
    }
    const chars = [...str];
    let total = 0;
    for (const ch of chars) total += ctx.measureText(ch).width + tracking;
    total -= tracking;
    let xx = align === 'center' ? -total / 2 : align === 'right' ? -total : 0;
    for (const ch of chars) {
      const w = ctx.measureText(ch).width;
      if (skip == null || !skip.includes(ch)) drawOne(ch, xx, 0, color);
      xx += w + tracking;
    }
    ctx.restore();
    return total;
  };
  M.measure = function (ctx, str, size, weight = 700, fam = M.F.cn, tracking = 0) {
    M.setFont(ctx, size, weight, fam);
    if (!tracking) return ctx.measureText(str).width;
    return [...str].reduce((a, ch) => a + ctx.measureText(ch).width, 0) + tracking * (Math.max(0, [...str].length - 1));
  };
  M.fitSize = function (ctx, str, maxW, startSize, weight = 700, fam = M.F.cn, tracking = 0) {
    let s = startSize;
    while (s > 10 && M.measure(ctx, str, s, weight, fam, tracking) > maxW) s *= .985;
    return s;
  };
  M.vtext = function (ctx, str, x, y, o = {}) {
    const { size = 72, color = M.P.ink, weight = 700, fam = M.F.cn, gap = 4, align = 'center' } = o;
    const chars = [...str];
    const step = size + gap;
    ctx.save();
    M.setFont(ctx, size, weight, fam);
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    chars.forEach((ch, i) => ctx.fillText(ch, x, y + i * step));
    ctx.restore();
    return step * chars.length;
  };

  // outlined, extruded display type
  M.display = function (ctx, str, x, y, o = {}) {
    const {
      size = 240, color = M.P.cream, stroke = M.P.ink, lineWidth = 10, depth = 0,
      depthColor = M.P.ink, shadow = null, shadowX = 18, shadowY = 22, align = 'left',
      tracking = 0, rotation = 0, alpha = 1, fam = M.F.en, weight = 900, scaleX = 1,
      scaleY = 1, baseline = 'alphabetic'
    } = o;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    if (scaleX !== 1 || scaleY !== 1) ctx.scale(scaleX, scaleY);
    const draw = (dx, dy, fill, strokeCol, lw) => {
      M.text(ctx, str, dx, dy, {
        size, weight, fam, color: fill, align, tracking, stroke: strokeCol, lineWidth: lw,
        baseline
      });
    };
    if (shadow) draw(shadowX, shadowY, shadow, null, 0);
    if (depth > 0) {
      for (let i = depth; i > 0; i--) draw(i * .9, i * .9, depthColor, stroke, lineWidth);
    }
    draw(0, 0, color, stroke, lineWidth);
    ctx.restore();
  };

  // letter-by-letter kinetic text
  M.kinetic = function (ctx, str, x, y, o = {}) {
    const {
      size = 150, color = M.P.ink, fam = M.F.en, weight = 900, align = 'left',
      tracking = -2, prog = 1, stagger = .07, drop = 180, rotation = 0,
      perLetterRot = 0, alpha = 1, stroke = null, lineWidth = 0, seed = 1
    } = o;
    const chars = [...str];
    M.setFont(ctx, size, weight, fam);
    const widths = chars.map(ch => ctx.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
    let xx = align === 'center' ? -total / 2 : align === 'right' ? -total : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha *= alpha;
    for (let i = 0; i < chars.length; i++) {
      const p = M.clamp((prog - i * stagger) / .45, 0, 1);
      const e = M.ease.outBack(p);
      const r = perLetterRot * (M.rand(seed + i * 3.1) - .5) * 2;
      ctx.save();
      ctx.translate(xx + widths[i] / 2, (1 - e) * drop);
      ctx.rotate(r * e);
      M.text(ctx, chars[i], 0, 0, {
        size, weight, fam, color, align: 'center', stroke, lineWidth, alpha: M.clamp(p * 2, 0, 1)
      });
      ctx.restore();
      xx += widths[i] + tracking;
    }
    ctx.restore();
    return total;
  };

  // ---------- shapes / patterns ----------
  M.rr = function (ctx, x, y, w, h, r = 0) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  };
  M.poly = function (ctx, pts, fill, stroke, lw = 0) {
    ctx.beginPath();
    pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  };
  M.circle = function (ctx, x, y, r, fill, stroke, lw = 0) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  };
  M.star = function (ctx, x, y, r1, r2, n, fill, rot = -Math.PI / 2, stroke, lw) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + i * Math.PI / n;
      const r = i % 2 ? r2 : r1;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  };
  M.burst = function (ctx, x, y, r, inner, n, fill, rot = 0, stroke = M.P.ink, lw = 6) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + i * Math.PI / n;
      const rr = i % 2 ? inner * (.75 + .5 * M.rand(i * 3.1)) : r * (.9 + .1 * M.rand(i * 7.7));
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
  };
  M.sunburst = function (ctx, cx, cy, r, rays, color, rot = 0, alpha = 1) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < rays; i++) {
      const a0 = rot + i * TAU / rays, a1 = rot + (i + 1) * TAU / rays;
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
    }
    ctx.fill();
    ctx.restore();
  };
  M.rayLines = function (ctx, cx, cy, r0, r1, n, color, rot = 0, width = 3, alpha = 1) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha *= alpha;
    for (let i = 0; i < n; i++) {
      const a = rot + i * TAU / n;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    ctx.restore();
  };

  // paper textures
  const tex = {};
  function makeCanvas(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  M.makeCanvas = makeCanvas;
  M.noise = function () {
    if (tex.noise) return tex.noise;
    const c = makeCanvas(480, 480), x = c.getContext('2d');
    const img = x.createImageData(480, 480);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.random() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = Math.random() * 28;
    }
    x.putImageData(img, 0, 0);
    tex.noise = c;
    return c;
  };
  M.pattern = function (name, color, bg = null, scale = 1) {
    const key = name + color + (bg || '') + scale;
    if (tex[key]) return tex[key];
    const c = makeCanvas(160 * scale, 160 * scale), x = c.getContext('2d');
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); }
    x.fillStyle = color; x.strokeStyle = color;
    if (name === 'dots') {
      x.beginPath();
      for (let y = 0; y < 160; y += 16) for (let xx = 0; xx < 160; xx += 16) {
        x.moveTo((xx + 8) * scale, y * scale);
        x.arc((xx + 8) * scale, (y + 8) * scale, 3.2 * scale, 0, TAU);
      }
      x.fill();
    } else if (name === 'grid') {
      x.lineWidth = 1 * scale;
      for (let i = 0; i <= 160; i += 32) {
        x.beginPath(); x.moveTo(i * scale, 0); x.lineTo(i * scale, c.height); x.stroke();
        x.beginPath(); x.moveTo(0, i * scale); x.lineTo(c.width, i * scale); x.stroke();
      }
    } else if (name === 'stripes') {
      x.lineWidth = 18 * scale;
      for (let i = -160; i < 320; i += 48) {
        x.beginPath(); x.moveTo(i * scale, 0); x.lineTo((i - 160) * scale, c.height); x.stroke();
      }
    } else if (name === 'checks') {
      for (let y = 0; y < 160; y += 40) for (let xx = 0; xx < 160; xx += 40) {
        if (((xx + y) / 40) % 2 === 0) x.fillRect(xx * scale, y * scale, 40 * scale, 40 * scale);
      }
    } else if (name === 'micro') {
      x.lineWidth = 1;
      for (let y = 0; y < 160; y += 8) { x.beginPath(); x.moveTo(0, y); x.lineTo(160, y); x.stroke(); }
    }
    const p = ctxCache.createPattern(c, 'repeat');
    tex[key] = p;
    return p;
  };
  let ctxCache = document.createElement('canvas').getContext('2d');

  M.paper = function (ctx, color = M.P.cream, opts = {}) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, M.W, M.H);
    if (opts.glow) {
      const g = ctx.createRadialGradient(M.W * .5, M.H * .45, 20, M.W * .5, M.H * .45, 1000);
      g.addColorStop(0, M.rgba(opts.glow, .28));
      g.addColorStop(1, M.rgba(opts.glow, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, M.W, M.H);
    }
    ctx.save();
    ctx.globalAlpha = opts.noiseAlpha == null ? .12 : opts.noiseAlpha;
    ctx.fillStyle = M.pattern('dots', M.rgba(M.P.ink, .22));
    ctx.fillRect(0, 0, M.W, M.H);
    ctx.restore();
  };

  M.noiseOverlay = function (ctx, t, alpha = .055) {
    const n = M.noise();
    ctx.save();
    ctx.globalAlpha = alpha;
    const ox = -Math.floor(M.rand(Math.floor(t * 12)) * 480);
    const oy = -Math.floor(M.rand(Math.floor(t * 12) + 2) * 480);
    for (let y = oy; y < M.H; y += 480) for (let x = ox; x < M.W; x += 480) ctx.drawImage(n, x, y);
    ctx.restore();
  };

  M.halftone = function (ctx, x, y, w, h, step, color, alpha = 1, maxR = null) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let yy = y; yy < y + h; yy += step) {
      for (let xx = x; xx < x + w; xx += step) {
        const d = maxR == null ? 1 : M.clamp(1 - Math.hypot((xx - x - w * .5) / w, (yy - y - h * .5) / h) * 1.6, .05, 1);
        ctx.moveTo(xx + step * .5, yy);
        ctx.arc(xx + step * .5, yy + step * .5, Math.max(.8, step * .26 * d), 0, TAU);
      }
    }
    ctx.fill();
    ctx.restore();
  };

  M.cropMarks = function (ctx, color = M.P.ink, alpha = .55) {
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha *= alpha;
    const m = 36, L = 22;
    [[m, m, 1, 1], [M.W - m, m, -1, 1], [m, M.H - m, 1, -1], [M.W - m, M.H - m, -1, -1]].forEach(([x, y, sx, sy]) => {
      ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke();
    });
    ctx.restore();
  };

  M.sticker = function (ctx, text, x, y, o = {}) {
    const {
      bg = M.P.yellow, color = M.P.ink, size = 28, padX = 24, padY = 11,
      rotation = -.06, stroke = M.P.ink, lw = 3, shadow = true, fam = M.F.cn, weight = 700
    } = o;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rotation);
    M.setFont(ctx, size, weight, fam);
    const w = ctx.measureText(text).width + padX * 2;
    const h = size + padY * 2;
    if (shadow) {
      ctx.fillStyle = M.rgba(M.P.ink, .24);
      M.rr(ctx, -w / 2 + 8, -h / 2 + 8, w, h, 7); ctx.fill();
    }
    M.rr(ctx, -w / 2, -h / 2, w, h, 7);
    ctx.fillStyle = bg; ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
    ctx.fillStyle = color;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 1);
    ctx.restore();
  };

  M.washi = function (ctx, x, y, w, h, color, rot = 0) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.globalAlpha *= .86;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i <= w; i += 14) {
      const j = M.rand(i + x) * 4;
      i ? ctx.lineTo(i, j) : ctx.moveTo(0, j);
    }
    for (let i = w; i >= 0; i -= 14) ctx.lineTo(i, h + M.rand(i + y) * 4);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  };

  M.tapeLabel = function (ctx, text, x, y, color = M.P.ink, rot = 0) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.fillRect(-90, -16, 180, 32);
    M.text(ctx, text, 0, 0, { size: 16, fam: M.F.mono, weight: 700, color: M.P.cream, align: 'center', baseline: 'middle', tracking: 1.5 });
    ctx.restore();
  };

  // ---------- characters ----------
  M.CHARS = [
    {
      id: 'xiaonuo', name: '小诺', en: 'XIAONUO', no: '01', color: '#FFD23F', color2: '#5CE1F2',
      ink: '#141019', motif: 'star', skill: '时光星域', skillEn: 'TIME FIELD', tag: '时间',
      line: '冻结时间，守护伙伴', copy: '从难以掌控力量，到守护伙伴。', cool: '12'
    },
    {
      id: 'axiu', name: '阿修', en: 'AXIU', no: '02', color: '#F5233C', color2: '#17122E',
      ink: '#FFFDF6', motif: 'bolt', skill: '暗刃瞬袭', skillEn: 'SHADOW DASH', tag: '暗影',
      line: '突进三格，斩断退路', copy: '驾驭黑暗，辨明是非。', cool: '15'
    },
    {
      id: 'arui', name: '阿瑞', en: 'ARUI', no: '03', color: '#62DF88', color2: '#FFD23F',
      ink: '#141019', motif: 'leaf', skill: '森罗守护', skillEn: 'LIFE SHIELD', tag: '守护',
      line: '生命护盾，缠绕敌人', copy: '生命与机械之力，化作坚盾。', cool: '14'
    },
    {
      id: 'xiaoyan', name: '小炎', en: 'XIAOYAN', no: '04', color: '#FF5533', color2: '#FFD23F',
      ink: '#FFFDF6', motif: 'flame', skill: '炎灭火舞', skillEn: 'BLAZE REBOUND', tag: '烈焰',
      line: '吸收爆炸，原样奉还', copy: '承受的伤害，终将化作力量。', cool: '12'
    },
    {
      id: 'xiaotian', name: '小天', en: 'XIAOTIAN', no: '05', color: '#66C8FF', color2: '#FFFDF6',
      ink: '#141019', motif: 'eye', skill: '潜能洞察', skillEn: 'INSIGHT', tag: '洞察',
      line: '洞察爆破，移速 +30%', copy: '领悟对手，看穿战局。', cool: '12'
    },
    {
      id: 'weilai', name: '未来', en: 'WEILAI', no: '06', color: '#FF5E9E', color2: '#5CE1F2',
      ink: '#141019', motif: 'orbit', skill: '迁境奇点', skillEn: 'SINGULARITY', tag: '通灵',
      line: '放弹减速，六格通灵', copy: '五女仆合体，回到崩塌之前。', cool: 'PASSIVE'
    },
  ];

  M.IMAGES = {
    xiaonuo: { src: '../assets/characters/xiaonuo-hd.png', crop: [200, 40, 729, 1295] },
    axiu: { src: '../assets/characters/axiu-hd.png', crop: [199, 34, 870, 1249] },
    arui: { src: '../assets/characters/arui-hd.png', crop: [203, 87, 875, 1098] },
    xiaoyan: { src: '../assets/characters/xiaoyan-hd.png', crop: [160, 44, 943, 1191] },
    xiaotian: { src: '../assets/characters/xiaotian-hd.png', crop: [160, 60, 1049, 1027] },
    weilai: { src: '../assets/characters/weilai-hd.png', crop: [276, 40, 780, 1079] },
    awakened: { src: '../assets/characters/weilai-awakened-hd.png', crop: [3, 5, 1352, 1128] },
    luludan: { src: '../assets/enemies/luludan.png', crop: [180, 30, 940, 1160] },
    luludanRage: { src: '../assets/enemies/luludan-rage-v2.png', crop: [180, 30, 940, 1160] },
    gugu: { src: '../assets/enemies/gugu.png', crop: [70, 50, 1120, 1140] },
    claude: { src: '../assets/enemies/claude.png', crop: [60, 50, 1130, 1140] },
    oupao: { src: '../assets/enemies/oupao.png', crop: [50, 50, 1150, 1140] },
    wallpaper: { src: '../assets/ui/menu-wallpaper.png', crop: [0, 0, 3563, 2068] },
    adventure: { src: '../docs/screenshot-adventure.png', crop: [0, 120, 1440, 1150] },
    bombPreview: { src: '../docs/screenshot-bomb-preview.png', crop: [0, 120, 780, 660] },
    versus: { src: '../docs/screenshot-versus.png', crop: [0, 80, 780, 700] },
    menu: { src: '../docs/screenshot-menu.png', crop: [0, 0, 993, 960] },
  };

  M.assets = {};
  M.ready = false;
  M.load = async function (onProgress) {
    const entries = Object.entries(M.IMAGES);
    let done = 0;
    const loadOne = (key, def) => new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const [sx, sy, sw, sh] = def.crop;
        const cw = Math.min(sw, img.naturalWidth - sx);
        const ch = Math.min(sh, img.naturalHeight - sy);
        const cache = document.createElement('canvas');
        // cap long side for smooth, fast draw
        const scale = Math.min(1, 1200 / Math.max(cw, ch));
        cache.width = Math.round(cw * scale);
        cache.height = Math.round(ch * scale);
        const cx = cache.getContext('2d');
        cx.imageSmoothingEnabled = true;
        cx.imageSmoothingQuality = 'high';
        cx.drawImage(img, sx, sy, cw, ch, 0, 0, cache.width, cache.height);
        M.assets[key] = { img, canvas: cache, crop: [sx, sy, cw, ch], w: cache.width, h: cache.height };
        done++;
        onProgress && onProgress(done / entries.length, key);
        resolve();
      };
      img.onerror = () => {
        console.warn('image failed', def.src);
        done++;
        onProgress && onProgress(done / entries.length, key);
        resolve();
      };
      img.src = def.src;
    });
    await Promise.all(entries.map(([k, v]) => loadOne(k, v)));
    M.ready = true;
  };

  M.sil = {};
  M.silhouette = function (key, color = M.P.ink) {
    const ck = key + color;
    if (M.sil[ck]) return M.sil[ck];
    const a = M.assets[key];
    if (!a) return null;
    const c = makeCanvas(a.canvas.width, a.canvas.height);
    const x = c.getContext('2d');
    x.drawImage(a.canvas, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    M.sil[ck] = c;
    return c;
  };

  // Draw a character. x,y = bottom-centre by default.
  M.char = function (ctx, key, x, y, height, o = {}) {
    const a = M.assets[key];
    const {
      flip = false, rotation = 0, alpha = 1, anchorX = .5, anchorY = 1,
      shadow = null, sx = 0, sy = 0, glow = null, glowBlur = 30,
      scaleX = 1, scaleY = 1, trail = 0, trailColor = null, bob = 0
    } = o;
    if (!a) return null;
    const w = height * a.w / a.h;
    const dx = x - w * anchorX;
    const dy = y - height * anchorY + bob;
    ctx.save();
    const baseAlpha = ctx.globalAlpha;
    ctx.globalAlpha = baseAlpha * alpha;
    ctx.translate(x, y + bob);
    if (rotation) ctx.rotate(rotation);
    if (flip) ctx.scale(-1, 1);
    ctx.translate(-x, -y);
    if (shadow) {
      const sil = M.silhouette(key, shadow);
      if (sil) {
        for (let i = 1; i <= 2; i++) {
          ctx.globalAlpha = baseAlpha * alpha * (i === 1 ? .16 : .28);
          ctx.drawImage(sil, dx + sx * i, dy + sy * i, w, height);
        }
      }
    }
    if (trail > 0) {
      const sil = M.silhouette(key, trailColor || M.P.orange);
      if (sil) {
        for (let i = 3; i >= 1; i--) {
          ctx.save();
          ctx.globalAlpha = baseAlpha * alpha * .10 * (4 - i);
          ctx.drawImage(sil, dx - trail * i * 20, dy, w * (1 + i * .015), height);
          ctx.restore();
        }
      }
    }
    // restore opacity after shadows/trails, otherwise the sprite itself fades
    ctx.globalAlpha = baseAlpha * alpha;
    if (glow) {
      ctx.shadowColor = glow;
      ctx.shadowBlur = glowBlur;
    }
    if (scaleX !== 1 || scaleY !== 1) {
      ctx.translate(x, y);
      ctx.scale(scaleX, scaleY);
      ctx.translate(-x, -y);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(a.canvas, dx, dy, w, height);
    ctx.restore();
    return { x: dx, y: dy, w, h: height };
  };

  M.charCrop = function (ctx, key, sx, sy, sw, sh, dx, dy, dw, dh) {
    const a = M.assets[key]; if (!a) return;
    ctx.drawImage(a.canvas, sx, sy, sw, sh, dx, dy, dw, dh);
  };

  // ---------- character wordmark bits ----------
  M.icon = {
    star(ctx, x, y, s, color) {
      M.star(ctx, x, y, s, s * .44, 5, color);
    },
    bolt(ctx, x, y, s, color) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s / 100, s / 100);
      ctx.beginPath();
      ctx.moveTo(16, -58); ctx.lineTo(-40, 10); ctx.lineTo(-2, 10); ctx.lineTo(-20, 62);
      ctx.lineTo(42, -12); ctx.lineTo(4, -12); ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = M.P.ink; ctx.lineWidth = 8; ctx.stroke();
      ctx.restore();
    },
    leaf(ctx, x, y, s, color) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(-.45);
      ctx.beginPath(); ctx.ellipse(0, 0, s * .45, s * .85, 0, 0, TAU);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = M.P.ink; ctx.lineWidth = 7; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, s * .8); ctx.lineTo(0, -s * .8); ctx.stroke();
      ctx.restore();
    },
    flame(ctx, x, y, s, color) {
      ctx.save(); ctx.translate(x, y); ctx.scale(s / 100, s / 100);
      ctx.beginPath();
      ctx.moveTo(0, -58);
      ctx.bezierCurveTo(42, -8, 50, 34, 0, 58);
      ctx.bezierCurveTo(-50, 34, -42, -8, 0, -58);
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = M.P.ink; ctx.lineWidth = 8; ctx.stroke();
      ctx.restore();
    },
    eye(ctx, x, y, s, color) {
      ctx.save(); ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(-s, 0); ctx.quadraticCurveTo(0, -s * .9, s, 0); ctx.quadraticCurveTo(0, s * .9, -s, 0);
      ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = M.P.ink; ctx.lineWidth = 7; ctx.stroke();
      M.circle(ctx, 0, 0, s * .26, M.P.ink);
      ctx.restore();
    },
    orbit(ctx, x, y, s, color) {
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = color; ctx.lineWidth = 7;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.ellipse(0, 0, s, s * .36, i * Math.PI / 3, 0, TAU);
        ctx.stroke();
      }
      M.circle(ctx, 0, 0, s * .16, color);
      ctx.restore();
    }
  };
  M.motif = function (ctx, motif, x, y, s, color) {
    (M.icon[motif] || M.icon.star)(ctx, x, y, s, color);
  };

  // ---------- camera ----------
  M.camera = function (ctx, o = {}) {
    const { x = 0, y = 0, zoom = 1, rot = 0, shake = 0, seed = 1, t = 0 } = o;
    ctx.translate(M.W / 2 + x, M.H / 2 + y);
    ctx.rotate(rot);
    ctx.scale(zoom, zoom);
    if (shake) {
      const sx = (M.rand(seed + Math.floor(t * 60) * .71) - .5) * 2 * shake;
      const sy = (M.rand(seed + 17 + Math.floor(t * 60) * .77) - .5) * 2 * shake;
      ctx.translate(sx, sy);
    }
    ctx.translate(-M.W / 2, -M.H / 2);
  };

  // ---------- bomb ----------
  M.bomb = function (ctx, x, y, r, o = {}) {
    const {
      rot = -.15, face = true, fuse = 1, spark = 0, outline = M.P.cream,
      body = M.P.ink, alpha = 1, glow = 0, shine = true, fuseColor = M.P.orange
    } = o;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha *= alpha;
    if (glow) { ctx.shadowColor = M.rgba(M.P.yellow, .8); ctx.shadowBlur = glow; }
    // fuse
    ctx.strokeStyle = outline; ctx.lineWidth = r * .15; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(r * .25, -r * .88);
    ctx.bezierCurveTo(r * .7, -r * 1.35, r * 1.45, -r * 1.08, r * 1.2, -r * 1.55);
    ctx.stroke();
    ctx.strokeStyle = fuseColor; ctx.lineWidth = r * .085;
    ctx.beginPath();
    ctx.moveTo(r * .25, -r * .88);
    ctx.bezierCurveTo(r * .7, -r * 1.35, r * 1.45, -r * 1.08, r * 1.2, -r * 1.55);
    ctx.stroke();
    // spark
    const sx = r * 1.2, sy = -r * 1.55;
    const flick = .75 + .25 * Math.sin((o.time || 0) * 31);
    if (spark > 0) {
      M.star(ctx, sx, sy, r * .42 * spark * flick, r * .16 * spark, 7, M.P.yellow);
      M.circle(ctx, sx, sy, r * .13 * spark, M.P.white);
      for (let i = 0; i < 7; i++) {
        const a = M.rand(i * 4.1) * TAU, d = r * (.3 + M.rand(i * 8.2) * .55) * spark;
        M.circle(ctx, sx + Math.cos(a) * d, sy + Math.sin(a) * d, r * .025 * (1 + M.rand(i)), M.P.orange);
      }
    }
    // cap
    ctx.fillStyle = outline;
    M.rr(ctx, -r * .22, -r * 1.0, r * .44, r * .3, r * .08); ctx.fill();
    ctx.fillStyle = M.P.ink;
    M.rr(ctx, -r * .14, -r * .98, r * .28, r * .22, r * .06); ctx.fill();
    // body
    ctx.shadowBlur = 0;
    ctx.fillStyle = outline;
    M.circle(ctx, 0, 0, r * 1.03, body);
    ctx.fillStyle = body;
    M.circle(ctx, 0, 0, r, body);
    // rim light
    if (shine) {
      const g = ctx.createRadialGradient(-r * .35, -r * .45, r * .1, -r * .1, -r * .2, r * 1.15);
      g.addColorStop(0, M.rgba(M.P.white, .34));
      g.addColorStop(.45, M.rgba(M.P.white, .04));
      g.addColorStop(1, M.rgba(M.P.white, 0));
      ctx.fillStyle = g;
      M.circle(ctx, 0, 0, r, null);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
      ctx.fillStyle = M.rgba(M.P.white, .65);
      ctx.beginPath(); ctx.ellipse(-r * .42, -r * .48, r * .18, r * .09, -.7, 0, TAU); ctx.fill();
    }
    if (face) {
      // eyes
      ctx.fillStyle = M.P.white;
      ctx.beginPath(); ctx.ellipse(-r * .25, -r * .08, r * .13, r * .17, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * .2, -r * .08, r * .13, r * .17, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = M.P.ink;
      ctx.beginPath(); ctx.ellipse(-r * .22, -r * .06, r * .055, r * .1, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * .23, -r * .06, r * .055, r * .1, 0, 0, TAU); ctx.fill();
      // mouth
      ctx.strokeStyle = M.P.white; ctx.lineWidth = r * .045; ctx.beginPath();
      ctx.arc(r * .01, r * .13, r * .17, .25, Math.PI - .25); ctx.stroke();
      // blush
      ctx.fillStyle = M.rgba(M.P.pink, .55);
      ctx.beginPath(); ctx.ellipse(-r * .48, r * .18, r * .1, r * .05, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(r * .44, r * .18, r * .1, r * .05, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  };

  // ---------- board / tiles ----------
  M.THEMES = {
    forest: { a: '#8EDB75', b: '#76C963', block: '#D98652', block2: '#BA683C', accent: '#5BE28B', soft: '#F8CFE7', ink: '#2A2C25' },
    factory: { a: '#7CD3E8', b: '#63BDD8', block: '#D47057', block2: '#AE5546', accent: '#5CE1F2', soft: '#C5DDE6', ink: '#20303A' },
    park: { a: '#F7B6D5', b: '#EFA3C8', block: '#C9A0E8', block2: '#A879CF', accent: '#FFD23F', soft: '#FFF3D7', ink: '#33243A' }
  };
  M.board = function (ctx, o = {}) {
    const { x = 0, y = 0, cols = 7, rows = 5, cell = 100, theme = 'park', gap = 6, rot = 0, alpha = 1, reveal = 1, clear = null, t = 0 } = o;
    const th = M.THEMES[theme] || M.THEMES.park;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha *= alpha;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const tx = c * cell, ty = r * cell;
        const rv = M.clamp((reveal - i / (cols * rows)) * 5, 0, 1);
        if (rv <= 0) continue;
        let sx = 1, sy = 1, ox = 0, oy = 0;
        if (clear != null) {
          const cl = M.clamp(clear * 2 - (i / (cols * rows)), 0, 1);
          sy = 1 - cl; oy = cl * cell * .7; sx = 1 + cl * .2;
        }
        if (rv < 1) { sy *= M.ease.outBack(rv); }
        ctx.save();
        ctx.translate(tx + cell / 2 + ox, ty + cell / 2 + oy);
        ctx.scale(sx, sy);
        // tile
        M.rr(ctx, -cell / 2 + gap, -cell / 2 + gap, cell - gap * 2, cell - gap * 2, cell * .16);
        ctx.fillStyle = (r + c) % 2 ? th.a : th.b;
        ctx.fill();
        ctx.strokeStyle = M.rgba(th.ink, .28); ctx.lineWidth = 3; ctx.stroke();
        // inner glow
        ctx.globalAlpha *= .24;
        M.rr(ctx, -cell / 2 + gap + 8, -cell / 2 + gap + 8, cell - gap * 2 - 16, cell * .28, cell * .1);
        ctx.fillStyle = M.P.white; ctx.fill();
        ctx.globalAlpha /= .24;
        // decorative blocks
        const deco = M.rand2(c, r);
        if (deco > .70) {
          M.rr(ctx, -cell * .3, -cell * .28, cell * .6, cell * .56, cell * .1);
          ctx.fillStyle = th.block; ctx.fill();
          ctx.strokeStyle = th.ink; ctx.lineWidth = 3; ctx.stroke();
          ctx.strokeStyle = M.rgba(M.P.white, .35); ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(-cell * .22, -cell * .12); ctx.lineTo(cell * .22, -cell * .12); ctx.stroke();
        } else if (deco > .52) {
          M.circle(ctx, 0, 0, cell * .12, th.soft);
          M.circle(ctx, 0, 0, cell * .04, th.accent);
        }
        ctx.restore();
      }
    }
    ctx.restore();
  };

  M.flameCross = function (ctx, cx, cy, cell, o = {}) {
    const { len = 2, prog = 1, color = M.P.orange } = o;
    const arms = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]];
    arms.forEach(([dx, dy], i) => {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const p = M.clamp((prog - dist * .12) * 2.2, 0, 1);
      if (p <= 0) return;
      const s = cell * p;
      const x = cx + dx * cell, y = cy + dy * cell;
      ctx.save();
      ctx.translate(x, y);
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, s * .62);
      g.addColorStop(0, M.P.white);
      g.addColorStop(.35, M.P.yellow);
      g.addColorStop(.78, color);
      g.addColorStop(1, M.rgba(color, .9));
      M.rr(ctx, -s * .47, -s * .47, s * .94, s * .94, s * .22);
      ctx.fillStyle = g; ctx.fill();
      M.star(ctx, 0, 0, s * .34 * p, s * .15, 6, M.rgba(M.P.white, .85));
      ctx.restore();
    });
  };

  M.powerup = function (ctx, x, y, size, kind, label = true) {
    const colors = { fire: M.P.orange, speed: M.P.cyan, glove: M.P.yellow, shield: M.P.green, star: M.P.purple };
    const col = colors[kind] || M.P.yellow;
    ctx.save(); ctx.translate(x, y);
    M.circle(ctx, 0, 0, size * .5, col, M.P.ink, size * .06);
    M.circle(ctx, 0, 0, size * .4, null, M.rgba(M.P.white, .8), size * .025);
    const s = size * .26;
    ctx.strokeStyle = M.P.ink; ctx.fillStyle = M.P.ink; ctx.lineWidth = size * .055;
    if (kind === 'fire') {
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.bezierCurveTo(s, -s * .1, s * .8, s * .8, 0, s);
      ctx.bezierCurveTo(-s * .8, s * .8, -s, -s * .1, 0, -s); ctx.fill();
    } else if (kind === 'speed') {
      ctx.beginPath(); ctx.moveTo(-s, -s); ctx.lineTo(s * .2, -s); ctx.lineTo(-s * .1, 0); ctx.lineTo(s, s); ctx.stroke();
    } else if (kind === 'glove') {
      M.rr(ctx, -s * .7, -s * .7, s * 1.4, s * 1.2, s * .32); ctx.fill();
      ctx.fillRect(-s * .6, s * .35, s * 1.1, s * .28);
    } else if (kind === 'shield') {
      ctx.beginPath(); ctx.moveTo(0, -s * .9); ctx.lineTo(s * .8, -s * .4); ctx.lineTo(s * .65, s * .4); ctx.lineTo(0, s); ctx.lineTo(-s * .65, s * .4); ctx.lineTo(-s * .8, -s * .4); ctx.closePath(); ctx.fill();
    } else {
      M.star(ctx, 0, 0, s, s * .42, 5, M.P.ink);
    }
    if (label) M.text(ctx, kind.toUpperCase(), 0, size * .68, { size: size * .13, fam: M.F.mono, weight: 700, color: M.P.ink, align: 'center' });
    ctx.restore();
  };

  // frame metadata
  M.meta = function (ctx, t, data) {
    const { index = '00', chapter = 'SIGNAL', accent = M.P.orange, progress = 0 } = data;
    ctx.save();
    // Difference blend keeps the micro-type legible over every palette.
    ctx.globalCompositeOperation = 'difference';
    ctx.globalAlpha = .92;
    const ink = M.P.white;
    M.text(ctx, 'BOMBIT', 64, 58, { size: 21, fam: M.F.en2, weight: 900, color: ink, tracking: 1 });
    M.text(ctx, '/ Q版泡泡堂 · MOTION ID', 188, 57, { size: 12, fam: M.F.mono, color: ink, tracking: .6 });
    M.text(ctx, chapter.toUpperCase(), 1856, 57, { size: 12, fam: M.F.mono, color: ink, align: 'right', tracking: 1.2 });
    M.text(ctx, index, 1856, 86, { size: 26, fam: M.F.en2, weight: 900, color: ink, align: 'right' });
    ctx.globalAlpha = .28;
    ctx.strokeStyle = ink; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(64, 106); ctx.lineTo(1856, 106); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(64, 1008); ctx.lineTo(1856, 1008); ctx.stroke();
    ctx.globalAlpha = .82;
    M.text(ctx, '精灵冒险 × 同屏对战', 64, 1036, { size: 12, fam: M.F.mono, color: ink, tracking: .8 });
    M.text(ctx, `120 BPM  /  ${t.toFixed(1).padStart(4, '0')}s  /  60 FPS`, 1856, 1036, { size: 12, fam: M.F.mono, color: ink, align: 'right', tracking: .8 });
    for (let i = 0; i < 24; i++) {
      const on = i / 24 < progress;
      ctx.globalAlpha = on ? .8 : .16;
      ctx.fillStyle = ink;
      ctx.fillRect(64 + i * 75.3, 1050, 52, on ? 3 : 1);
    }
    ctx.restore();
    // a single palette marker, in normal blending
    ctx.save();
    ctx.fillStyle = accent;
    ctx.fillRect(1832, 64, 7, 26);
    ctx.restore();
  };

  M.sceneBg = function (ctx, color, o = {}) {
    ctx.fillStyle = color; ctx.fillRect(0, 0, M.W, M.H);
    if (o.halftone) {
      ctx.save();
      ctx.fillStyle = M.pattern('dots', M.rgba(o.halftoneColor || M.P.ink, .22));
      ctx.fillRect(0, 0, M.W, M.H);
      ctx.restore();
    }
  };

  M.w = M.W; M.h = M.H;
})();
