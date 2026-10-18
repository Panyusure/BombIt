/* ============================================================
 * BOMBIT — Motion ID / player + deterministic renderer
 * ============================================================ */
(function () {
  'use strict';
  const M = window.M, P = M.P;
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: false });
  const DUR = 48;

  const SEGMENTS = [
    { id: 'cold', start: 0, end: 4, draw: M.Scenes.cold, chapter: 'COLD OPEN / FUSE', index: '00', accent: P.orange },
    { id: 'hook', start: 4, end: 8, draw: M.Scenes.hook, chapter: 'THE HOOK', index: '01', accent: P.cyan, transition: { type: 'bars', dur: .30, color: P.orange } },
    { id: 'rosterIntro', start: 8, end: 10, draw: M.Scenes.rosterIntro, chapter: 'ROSTER INTRO', index: '02', accent: P.pink, transition: { type: 'checker', dur: .28, color: P.cyan } },
    { id: 'char0', start: 10, end: 12, draw: M.Scenes.charXiaonuo, chapter: 'ROSTER / XIAONUO', index: '03.1', accent: P.yellow, transition: { type: 'diag', dur: .18, color: P.yellow } },
    { id: 'char1', start: 12, end: 14, draw: M.Scenes.charAxiu, chapter: 'ROSTER / AXIU', index: '03.2', accent: P.red, transition: { type: 'diag', dur: .16, color: P.red } },
    { id: 'char2', start: 14, end: 16, draw: M.Scenes.charArui, chapter: 'ROSTER / ARUI', index: '03.3', accent: P.green, transition: { type: 'diag', dur: .16, color: P.green } },
    { id: 'char3', start: 16, end: 18, draw: M.Scenes.charXiaoyan, chapter: 'ROSTER / XIAOYAN', index: '03.4', accent: P.orange, transition: { type: 'diag', dur: .16, color: P.orange } },
    { id: 'char4', start: 18, end: 20, draw: M.Scenes.charXiaotian, chapter: 'ROSTER / XIAOTIAN', index: '03.5', accent: P.sky, transition: { type: 'diag', dur: .16, color: P.sky } },
    { id: 'char5', start: 20, end: 22, draw: M.Scenes.charWeilai, chapter: 'ROSTER / WEILAI', index: '03.6', accent: P.pink, transition: { type: 'diag', dur: .16, color: P.pink } },
    { id: 'group', start: 22, end: 24, draw: M.Scenes.group, chapter: 'SQUAD ASSEMBLED', index: '04', accent: P.yellow, transition: { type: 'iris', dur: .30, color: P.cream } },
    { id: 'modesIntro', start: 24, end: 26, draw: M.Scenes.modesIntro, chapter: 'GAME MODES', index: '05', accent: P.cyan, transition: { type: 'split', dur: .24, color: P.orange } },
    { id: 'mode1', start: 26, end: 28, draw: M.Scenes.mode1, chapter: 'MODE / ADVENTURE', index: '05.1', accent: P.green, transition: { type: 'diag', dur: .22, color: P.green } },
    { id: 'mode2', start: 28, end: 30, draw: M.Scenes.mode2, chapter: 'MODE / TIME ATTACK', index: '05.2', accent: P.cyan, transition: { type: 'slide', dur: .22, color: P.cyan } },
    { id: 'mode3', start: 30, end: 32, draw: M.Scenes.mode3, chapter: 'MODE / VERSUS', index: '05.3', accent: P.red, transition: { type: 'split', dur: .20, color: P.red } },
    { id: 'core', start: 32, end: 36, draw: M.Scenes.core, chapter: 'CORE LOOP / BOOM', index: '06', accent: P.orange, transition: { type: 'glitch', dur: .26, color: P.orange } },
    { id: 'boss', start: 36, end: 40, draw: M.Scenes.boss, chapter: 'FINAL BOSS / LULUDAN', index: '07', accent: P.red, transition: { type: 'glitch', dur: .30, color: P.red } },
    { id: 'awaken', start: 40, end: 44, draw: M.Scenes.awaken, chapter: 'SPIRIT LINK / WEILAI', index: '08', accent: P.cyan, transition: { type: 'iris', dur: .32, color: P.cyan } },
    { id: 'finale', start: 44, end: 48, draw: M.Scenes.finale, chapter: 'MAIN TITLE', index: '09', accent: P.pink, transition: { type: 'checker', dur: .28, color: P.pink } },
  ];

  function segmentAt(t) {
    for (let i = SEGMENTS.length - 1; i >= 0; i--) if (t >= SEGMENTS[i].start) return SEGMENTS[i];
    return SEGMENTS[0];
  }
  function previousSegment(seg) {
    const i = SEGMENTS.indexOf(seg);
    return i > 0 ? SEGMENTS[i - 1] : null;
  }

  function clipForMask(type, p, color) {
    ctx.beginPath();
    if (type === 'bars') {
      const n = 12, h = M.H / n;
      for (let i = 0; i < n; i++) {
        const lp = M.clamp(p * 1.35 - (i % 4) * .055, 0, 1);
        if (lp <= 0) continue;
        const W = M.W * M.ease.outExpo(lp);
        if (i % 2) ctx.rect(M.W - W, i * h, W, h + 1);
        else ctx.rect(0, i * h, W, h + 1);
      }
    } else if (type === 'checker') {
      const cols = 14, rows = 8, cw = M.W / cols, ch = M.H / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const threshold = (r + c) / (rows + cols - 2);
        const lp = M.clamp((p - threshold * .68) / .32, 0, 1);
        if (lp <= 0) continue;
        const s = M.ease.outBack(lp);
        const x = c * cw + cw / 2, y = r * ch + ch / 2;
        ctx.rect(x - cw * .5 * s, y - ch * .5 * s, cw * s + .6, ch * s + .6);
      }
    } else if (type === 'iris') {
      ctx.arc(M.W / 2, M.H / 2, M.W * .78 * M.ease.inOut(p), 0, Math.PI * 2);
    } else if (type === 'split') {
      const h = M.H * M.ease.outExpo(p);
      ctx.rect(0, (M.H - h) / 2, M.W, h);
    } else if (type === 'diag') {
      const x = M.W * (1 - M.ease.outExpo(p));
      ctx.moveTo(x + 260, 0); ctx.lineTo(M.W, 0); ctx.lineTo(M.W, M.H); ctx.lineTo(x - 260, M.H); ctx.closePath();
    } else {
      ctx.rect(0, 0, M.W, M.H);
    }
    ctx.clip();
  }

  function drawTransition(ctx, seg, t) {
    const trans = seg.transition;
    if (!trans) return false;
    const local = t - seg.start;
    if (local >= trans.dur) return false;
    const raw = M.clamp(local / trans.dur, 0, 1);
    const p = M.ease.inOut(raw);
    const prev = previousSegment(seg);
    if (!prev) return false;
    const prevAbs = Math.min(t, prev.end - .001);
    ctx.save();
    prev.draw(ctx, prevAbs);
    ctx.restore();

    if (trans.type === 'slide') {
      const e = M.ease.outExpo(raw);
      ctx.save();
      ctx.translate(-M.W * e, 0);
      ctx.globalAlpha = 1 - e * .35;
      prev.draw(ctx, prevAbs);
      ctx.restore();
      ctx.save();
      ctx.translate(M.W * (1 - e), 0);
      seg.draw(ctx, t);
      ctx.restore();
      ctx.save();
      ctx.fillStyle = trans.color;
      ctx.fillRect(M.W * (1 - e) - 30, 0, 34, M.H);
      ctx.fillRect(M.W * (1 - e) - 90, 0, 12, M.H);
      ctx.restore();
      return true;
    }
    if (trans.type === 'glitch') {
      const localT = Math.max(0, t - seg.start);
      const slices = 26, sh = M.H / slices;
      for (let i = 0; i < slices; i++) {
        const on = M.clamp((raw - M.rand(i * 2.7) * .22) / .18, 0, 1);
        if (on <= 0) continue;
        ctx.save();
        ctx.beginPath(); ctx.rect(0, i * sh, M.W, sh + 1); ctx.clip();
        ctx.translate((M.rand(i * 7.1 + Math.floor(t * 30)) - .5) * 260 * (1 - raw), 0);
        seg.draw(ctx, t);
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = (1 - raw) * .8;
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 2 ? P.cyan : P.hot;
        ctx.fillRect(0, M.rand(i + Math.floor(t * 20)) * M.H, M.W, 2 + M.rand(i * 2) * 10);
      }
      ctx.restore();
      return true;
    }
    // all other transitions: draw incoming inside mask
    ctx.save();
    clipForMask(trans.type, p, trans.color);
    seg.draw(ctx, t);
    ctx.restore();

    // transition furniture: coloured flash / bars
    ctx.save();
    const flashA = Math.sin(raw * Math.PI) * .28;
    if (flashA > 0) { ctx.fillStyle = M.rgba(P.white, flashA); ctx.fillRect(0, 0, M.W, M.H); }
    if (trans.type === 'diag') {
      const x = M.W * (1 - M.ease.outExpo(p));
      ctx.globalAlpha = .85;
      ctx.fillStyle = trans.color;
      ctx.save(); ctx.translate(x, 0); ctx.rotate(-.22);
      ctx.fillRect(-40, -100, 16, 1300);
      ctx.fillRect(40, -100, 5, 1300);
      ctx.restore();
      ctx.restore();
    } else if (trans.type === 'checker') {
      const cols = 14, rows = 8, cw = M.W / cols, ch = M.H / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const threshold = (r + c) / (rows + cols - 2);
        const lp = M.clamp((p - threshold * .68) / .22, 0, 1);
        if (lp > 0 && lp < 1) {
          ctx.globalAlpha = (1 - lp) * .45;
          ctx.fillStyle = trans.color;
          ctx.fillRect(c * cw, r * ch, cw, ch);
        }
      }
      ctx.restore();
    } else if (trans.type === 'iris') {
      ctx.globalAlpha = (1 - p) * .7;
      ctx.strokeStyle = trans.color; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(M.W / 2, M.H / 2, M.W * .78 * M.ease.inOut(p), 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (trans.type === 'bars') {
      ctx.globalAlpha = (1 - raw) * .55;
      ctx.fillStyle = trans.color;
      ctx.fillRect(0, 0, M.W, 10); ctx.fillRect(0, M.H - 10, M.W, 10);
      ctx.restore();
    } else {
      ctx.restore();
    }
    return true;
  }

  function renderCoverFrame() {
    ctx.reset();
    ctx.fillStyle = P.cream; ctx.fillRect(0, 0, M.W, M.H);
    // orange planet
    M.sunburst(ctx, 1480, 470, 1300, 26, M.rgba(P.orange, .10), -.22);
    M.circle(ctx, 1480, 470, 475, P.orange);
    M.circle(ctx, 1480, 470, 405, 'rgba(255,245,230,.06)');
    // paper dots + a giant outline word
    ctx.save(); ctx.globalAlpha = .08;
    ctx.fillStyle = M.pattern('dots', P.ink); ctx.fillRect(0, 0, M.W, M.H);
    ctx.restore();
    M.text(ctx, 'BOMBIT', 1370, 670, {
      size: 470, fam: M.F.en, weight: 900, color: 'transparent', stroke: M.rgba(P.ink, .10),
      lineWidth: 4, align: 'center', baseline: 'middle', tracking: -10
    });
    // technical marginalia
    M.text(ctx, 'MOTION ID / 2026', 1090, 150, { size: 15, fam: M.F.mono, weight: 700, color: P.ink, tracking: 3 });
    M.text(ctx, '6 SPIRITS  ·  3 MODES  ·  1 FUSE', 1092, 178, { size: 13, fam: M.F.mono, weight: 700, color: P.ink, tracking: 2 });
    // character group with hard shadows
    const back = [
      ['arui', 1240, 902, 310, -.06],
      ['xiaoyan', 1520, 908, 320, .03],
      ['xiaotian', 1790, 900, 310, -.02]
    ];
    back.forEach(([id, x, y, h, r]) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(r);
      M.char(ctx, id, 0, 0, h, { shadow: P.ink, sx: 10, sy: 10 });
      ctx.restore();
    });
    const front = [
      ['xiaonuo', 1080, 1040, 380, -.06],
      ['weilai', 1410, 1050, 420, .02],
      ['axiu', 1740, 1040, 400, .05]
    ];
    front.forEach(([id, x, y, h, r]) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(r);
      M.char(ctx, id, 0, 0, h, { shadow: P.ink, sx: 14, sy: 14 });
      ctx.restore();
    });
    // bomb mascot / accent bars / caption
    M.bomb(ctx, 1770, 360, 84, { spark: 1, time: 2.2, face: true, rot: -.12, glow: 10 });
    const colors = M.CHARS.map(c => c.color);
    colors.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(1840, 160 + i * 82, 12, 56); });
    M.text(ctx, 'Q-BAN BUBBLE HALL', 1110, 1000, { size: 16, fam: M.F.mono, weight: 700, color: P.ink, tracking: 3 });
    M.text(ctx, 'A 48-SECOND MOTION STUDY', 1110, 1024, { size: 12, fam: M.F.mono, weight: 700, color: M.rgba(P.ink, .62), tracking: 2 });
    // registration crop marks
    M.cropMarks(ctx, P.ink, .35);
    window.__coverRendered = true;
  }

  function renderSlate(ctx, t) {
    ctx.fillStyle = '#09080D'; ctx.fillRect(0, 0, M.W, M.H);
    const p = M.clamp(t / .35, 0, 1);
    M.circle(ctx, M.W / 2, M.H / 2, 8 + 2 * Math.sin(t * 20), M.P.orange);
    M.text(ctx, 'BOMBIT', M.W / 2, M.H / 2 + 58, { size: 16, fam: M.F.mono, weight: 700, color: M.rgba(P.cream, .7), align: 'center', tracking: 4 });
    ctx.save(); ctx.globalAlpha = .22;
    ctx.fillStyle = P.cream; ctx.fillRect(M.W / 2 - 120, M.H / 2 + 86, 240 * p, 2);
    ctx.restore();
  }

  function renderAt(t, opts = {}) {
    t = M.clamp(t, 0, DUR);
    if (typeof ctx.reset === 'function') ctx.reset();
    else ctx.clearRect(0, 0, M.W, M.H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (t < 0) {
      renderSlate(ctx, t);
      return;
    }
    const seg = segmentAt(t);
    const inTransition = drawTransition(ctx, seg, t);
    if (!inTransition) seg.draw(ctx, t);
    if (opts.meta !== false) {
      M.meta(ctx, t, {
        index: seg.index, chapter: seg.chapter, accent: seg.accent, progress: t / DUR
      });
    }
    M.noiseOverlay(ctx, t, .045);
    // final gate fade
    if (t > 47.9) {
      ctx.save();
      ctx.globalAlpha = M.clamp((t - 47.9) / .1, 0, 1);
      ctx.fillStyle = '#07060A'; ctx.fillRect(0, 0, M.W, M.H);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    window.__lastRenderT = t;
    return seg;
  }

  // ---------- loading ----------
  const $ = (s) => document.querySelector(s);
  const elStatus = $('#status');
  const elProgress = $('#progress');
  const elCover = $('#cover');
  const elControls = $('#controls');
  const elPlay = $('#playBtn');
  const elTime = $('#time');
  const elFill = $('#fill');
  const elMute = $('#mute');
  const elPoster = $('#poster');
  let loadProgress = 0;

  function setStatus(text, p = null) {
    if (elStatus) elStatus.textContent = text;
    if (p != null && elProgress) elProgress.style.transform = `scaleX(${M.clamp(p, 0, 1)})`;
  }

  let scoreBuffer = null, scorePromise = null;
  async function loadScoreFile() {
    if (location.protocol === 'file:') return null;
    try {
      const res = await fetch('out/BombIt_MotionID_Score.wav', { cache: 'force-cache' });
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      const decoder = new OfflineAudioContext(2, 1, 48000);
      return await decoder.decodeAudioData(data);
    } catch (e) {
      return null;
    }
  }
  async function ensureScore() {
    if (scoreBuffer) return scoreBuffer;
    if (scorePromise) return scorePromise;
    scorePromise = (async () => {
      setStatus('载入原创配乐 / LOADING SCORE', .08);
      const pre = await loadScoreFile();
      if (pre) {
        scoreBuffer = pre;
        setStatus('原声就绪 / CLICK TO PLAY', 1);
        console.log('score loaded from out/BombIt_MotionID_Score.wav');
        return scoreBuffer;
      }
      setStatus('合成原创配乐 / SYNTHESIZING SCORE', .05);
      const start = performance.now();
      scoreBuffer = await M.Audio.render((p) => setStatus('合成原创配乐 / SYNTHESIZING SCORE', .05 + p * .65));
      setStatus('原声就绪 / CLICK TO PLAY', 1);
      console.log('score rendered in', ((performance.now() - start) / 1000).toFixed(2), 's');
      return scoreBuffer;
    })();
    return scorePromise;
  }

  // ---------- playback ----------
  let audioCtx = null, gainNode = null, sourceNode = null;
  let state = 'cover'; // cover | loading | playing | paused | recording
  let playhead = 0;
  let startOffset = 0, startCtxTime = 0;
  let muted = false;
  let raf = 0;
  let lastUi = 0;

  function ensureAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000, latencyHint: 'playback' });
      gainNode = audioCtx.createGain();
      gainNode.gain.value = muted ? 0 : .9;
      gainNode.connect(audioCtx.destination);
    }
    return audioCtx;
  }

  async function startPlayback(from = playhead) {
    let score;
    try {
      score = await ensureScore();
    } catch (e) {
      console.error(e);
      setStatus('音频失败 / AUDIO ERROR', 0);
      score = null;
    }
    ensureAudioCtx();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    stopSource();
    if (score) {
      sourceNode = audioCtx.createBufferSource();
      sourceNode.buffer = score;
      sourceNode.connect(gainNode);
      startOffset = M.clamp(from, 0, DUR);
      startCtxTime = audioCtx.currentTime + .06;
      sourceNode.start(startCtxTime, startOffset);
    } else {
      startOffset = from;
      startCtxTime = performance.now() / 1000 + .06;
    }
    state = 'playing';
    playhead = from;
    document.body.classList.add('is-playing');
    if (elCover) elCover.classList.add('is-hidden');
    tick();
  }
  function stopSource() {
    if (sourceNode) {
      try { sourceNode.stop(); } catch (e) {}
      try { sourceNode.disconnect(); } catch (e) {}
      sourceNode = null;
    }
  }
  function pausePlayback() {
    if (state !== 'playing') return;
    updatePlayhead();
    stopSource();
    state = 'paused';
    document.body.classList.remove('is-playing');
    cancelAnimationFrame(raf);
    renderAt(playhead);
    updateUi();
  }
  async function resumePlayback() {
    if (state === 'paused' || state === 'cover') {
      if (playhead >= DUR - .01) playhead = 0;
      await startPlayback(playhead);
    }
  }
  function updatePlayhead() {
    if (state !== 'playing') return playhead;
    if (audioCtx) {
      playhead = M.clamp(startOffset + (audioCtx.currentTime - startCtxTime), 0, DUR);
    } else {
      playhead = M.clamp(startOffset + (performance.now() / 1000 - startCtxTime), 0, DUR);
    }
    return playhead;
  }
  function tick() {
    if (state !== 'playing') return;
    updatePlayhead();
    if (playhead >= DUR) {
      stopSource();
      state = 'paused'; playhead = DUR;
      document.body.classList.remove('is-playing');
      renderCoverFrame();
      updateUi();
      if (elCover) elCover.classList.remove('is-hidden');
      setStatus('完 / END', 1);
      return;
    }
    renderAt(playhead);
    updateUi();
    raf = requestAnimationFrame(tick);
  }
  function updateUi() {
    if (!elTime) return;
    const s = Math.floor(playhead);
    elTime.textContent = `00:${String(s).padStart(2, '0')} / 00:48`;
    elFill.style.transform = `scaleX(${playhead / DUR})`;
    if (elPlay) elPlay.classList.toggle('is-pause', state === 'playing');
  }

  // controls
  elPlay && elPlay.addEventListener('click', () => {
    if (state === 'playing') pausePlayback();
    else resumePlayback();
  });
  const scrub = $('#scrub');
  if (scrub) {
    const seek = (e) => {
      const r = scrub.getBoundingClientRect();
      const x = M.clamp((e.clientX - r.left) / r.width, 0, 1);
      playhead = x * DUR;
      if (state === 'playing') {
        startPlayback(playhead);
      } else {
        renderAt(playhead); updateUi();
      }
    };
    let drag = false;
    scrub.addEventListener('pointerdown', (e) => { drag = true; scrub.setPointerCapture(e.pointerId); seek(e); });
    scrub.addEventListener('pointermove', (e) => { if (drag) seek(e); });
    scrub.addEventListener('pointerup', () => { drag = false; });
  }
  elMute && elMute.addEventListener('click', () => {
    muted = !muted;
    if (gainNode) gainNode.gain.value = muted ? 0 : .9;
    elMute.classList.toggle('is-muted', muted);
    elMute.textContent = muted ? 'MUTED' : 'SOUND';
  });
  $('#fullscreen')?.addEventListener('click', () => {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  });
  $('#replay')?.addEventListener('click', () => { playhead = 0; startPlayback(0); });
  $('#startFromCover')?.addEventListener('click', () => { playhead = 0; startPlayback(0); });
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); state === 'playing' ? pausePlayback() : resumePlayback(); }
    if (e.code === 'ArrowRight') { playhead = M.clamp(playhead + (state === 'playing' ? 5 : 1 / 30), 0, DUR); if (state === 'playing') startPlayback(playhead); else { renderAt(playhead); updateUi(); } }
    if (e.code === 'ArrowLeft') { playhead = M.clamp(playhead - (state === 'playing' ? 5 : 1 / 30), 0, DUR); if (state === 'playing') startPlayback(playhead); else { renderAt(playhead); updateUi(); } }
    if (e.code === 'KeyF') $('#fullscreen')?.click();
  });

  // ---------- record mp4 ----------
  async function recordVideo(opts = {}) {
    const score = await ensureScore();
    const clipStart = M.clamp(opts.start || 0, 0, DUR - .1);
    const clipDuration = M.clamp(opts.duration || DUR - clipStart, .1, DUR - clipStart);
    state = 'recording';
    document.body.classList.add('recording');
    if (elCover) elCover.classList.add('is-hidden');
    const ac = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000, latencyHint: 'playback' });
    await ac.resume();
    const dest = ac.createMediaStreamDestination();
    const src = ac.createBufferSource();
    src.buffer = score;
    src.connect(dest);
    const capture = canvas.captureStream(60);
    const stream = new MediaStream([...capture.getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const preferred = [
      'video/mp4;codecs=avc1.640028,mp4a.40.2',
      'video/mp4;codecs=avc1.4D401F,mp4a.40.2',
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4',
      'video/webm;codecs=vp9,opus',
      'video/webm'
    ];
    const mime = preferred.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const recorder = new MediaRecorder(stream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: opts.videoBitsPerSecond || 22_000_000,
      audioBitsPerSecond: opts.audioBitsPerSecond || 192_000
    });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const done = new Promise((resolve) => { recorder.onstop = resolve; });
    let stopped = false;
    const startAt = ac.currentTime + .20;
    // start recording first, then the score
    recorder.start(1000);
    src.start(startAt, clipStart);
    let stopAt = clipDuration + .15;
    let frames = 0;
    let err = null;
    let lastDraw = -1;
    function draw() {
      if (stopped) return;
      const raw = ac.currentTime - startAt;
      try {
        if (raw < 0) {
          if (lastDraw < 0) { renderAt(clipStart); lastDraw = raw; frames++; }
        } else if (raw - lastDraw >= 1 / 61) {
          renderAt(Math.min(DUR, clipStart + raw));
          lastDraw = raw;
          frames++;
        }
      } catch (e) {
        err = e; console.error(e);
        stopped = true;
        try { recorder.stop(); } catch (_) {}
        return;
      }
      if (raw >= stopAt) {
        stopped = true;
        try { recorder.stop(); } catch (_) {}
        return;
      }
      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
    await done;
    const blob = new Blob(chunks, { type: mime || 'video/webm' });
    const ext = (mime || '').includes('mp4') ? 'mp4' : 'webm';
    const name = opts.filename || `BombIt_MotionID_1080p60.${ext}`;
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    try { capture.getTracks().forEach(t => t.stop()); } catch (e) {}
    try { ac.close(); } catch (e) {}
    state = 'paused';
    document.body.classList.remove('recording');
    playhead = Math.min(DUR, clipStart + clipDuration);
    renderCoverFrame();
    if (elCover) elCover.classList.remove('is-hidden');
    const info = { size: blob.size, mime, frames, duration: clipDuration, error: err ? String(err) : null, name };
    window.__lastRecording = info;
    return info;
  }

  // ---------- boot ----------
  async function boot() {
    setStatus('加载精灵素材 / LOADING ASSETS', 0);
    await M.load((p, key) => setStatus(`加载精灵素材 / ${key}`, p));
    setStatus('渲染封面 / COMPOSITING POSTER', 1);
    // cover poster frame
    renderCoverFrame();
    document.body.classList.add('ready');
    if (elCover) elCover.classList.remove('is-hidden');
    setStatus('点击播放 / CLICK TO PLAY', 1);
    // Render the score while the cover is being read; no blocking of the first paint.
    if (!/[?&]noscore\b/.test(location.search)) {
      setTimeout(() => {
        if (!scoreBuffer && !scorePromise) {
          ensureScore().catch((e) => console.warn('score failed', e));
        }
      }, 900);
    }
  }

  window.__motion = {
    renderAt,
    renderCoverFrame,
    still(t, meta = true) {
      renderAt(t, { meta });
      return canvas.toDataURL('image/png');
    },
    recordVideo,
    ensureScore,
    get score() { return scoreBuffer; },
    get playhead() { return playhead; },
    setPlayhead(t) { playhead = M.clamp(t, 0, DUR); renderAt(playhead); updateUi(); },
    startPlayback,
    pausePlayback,
    state: () => state,
    segments: SEGMENTS,
    mimeSupport: () => ({
      mp4: MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.640028,mp4a.40.2'),
      webm: MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    })
  };

  boot().catch((e) => {
    console.error(e);
    setStatus('加载失败 / ' + e.message, 0);
  });
})();
