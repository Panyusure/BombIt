/* ============================================================
 * BOMBIT — original procedural score / 120 BPM / 48 s
 * Everything is synthesized in an OfflineAudioContext.
 * ============================================================ */
(function () {
  'use strict';
  const M = window.M;
  const A = (M.Audio = {});
  A.DURATION = 48;
  const SR = 48000;
  const BEAT = 0.5, BAR = 2;
  const S = (bar, beat = 0, sixteenth = 0) => bar * BAR + beat * BEAT + sixteenth * .125;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const midi = { D2: 38, E2: 40, Fs2: 42, G2: 43, A2: 45, B2: 47, C3: 48, Cs3: 49, D3: 50, E3: 52, Fs3: 54, G3: 55, A3: 57, B3: 59, C4: 60, Cs4: 61, D4: 62, E4: 64, Fs4: 66, G4: 67, A4: 69, B4: 71, C5: 72, Cs5: 73, D5: 74, E5: 76, Fs5: 78, G5: 79, A5: 81, B5: 83, C6: 84, Cs6: 85, D6: 86, E6: 88, Fs6: 90, A6: 93 };
  const CH = {
    D: { root: midi.D2, notes: [midi.D3, midi.Fs3, midi.A3, midi.D4, midi.Fs4] },
    Bm: { root: midi.B2, notes: [midi.B2, midi.D3, midi.Fs3, midi.B3, midi.D4] },
    G: { root: midi.G2, notes: [midi.G2, midi.B2, midi.D3, midi.G3, midi.B3] },
    A: { root: midi.A2, notes: [midi.A2, midi.Cs3, midi.E3, midi.A3, midi.Cs4] },
    Fsm: { root: midi.Fs2, notes: [midi.Fs2, midi.A2, midi.Cs3, midi.Fs3, midi.A3] },
    Em: { root: midi.E2, notes: [midi.E2, midi.G2, midi.B2, midi.E3, midi.G3] },
    Bdim: { root: midi.B2, notes: [midi.B2, midi.D3, midi.Fs3, midi.B3, midi.D4] },
    Gdark: { root: midi.G2, notes: [midi.G2, 46, midi.D3, midi.G3, 58] }
  };

  // chord per 2s bar
  const progression = {
    0: ['D'], 1: ['D'], 2: ['D'], 3: ['A'],
    4: ['D'], 5: ['D'], 6: ['Bm'], 7: ['G'], 8: ['A'], 9: ['Fsm'], 10: ['Em'], 11: ['A'],
    12: ['D'], 13: ['A'], 14: ['Bm'], 15: ['G'],
    16: ['Em'], 17: ['A'],
    18: ['Bdim'], 19: ['Bdim'],
    20: ['G'], 21: ['A'],
    22: ['D'], 23: ['G']
  };
  const chordAt = (bar) => CH[(progression[Math.floor(bar)] || ['D'])[0]];

  function noiseBuffer(ctx, dur, channels = 2) {
    const len = Math.floor(dur * SR);
    const b = ctx.createBuffer(channels, len, SR);
    for (let c = 0; c < channels; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return b;
  }
  function impulse(ctx, dur = 2.4, decay = 3.2) {
    const len = Math.floor(dur * SR);
    const b = ctx.createBuffer(2, len, SR);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < SR * .01 ? i / (SR * .01) : 1);
      }
    }
    return b;
  }
  function shaper(ctx, amount = 1.5) {
    const ws = ctx.createWaveShaper();
    const n = 2048, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i * 2 / n - 1;
      curve[i] = Math.tanh(x * amount);
    }
    ws.curve = curve; ws.oversample = '2x';
    return ws;
  }

  A.render = async function (onProgress) {
    const ctx = new OfflineAudioContext(2, Math.ceil(A.DURATION * SR), SR);
    const master = ctx.createGain(); master.gain.value = .72;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -15; comp.knee.value = 18; comp.ratio.value = 3.2;
    comp.attack.value = .004; comp.release.value = .18;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2.5; limiter.knee.value = 0; limiter.ratio.value = 20;
    limiter.attack.value = .001; limiter.release.value = .08;
    master.connect(comp).connect(limiter).connect(ctx.destination);

    const verb = ctx.createConvolver(); verb.buffer = impulse(ctx);
    const verbGain = ctx.createGain(); verbGain.gain.value = .28;
    verb.connect(verbGain).connect(master);
    const delay = ctx.createDelay(2); delay.delayTime.value = .375;
    const delayFb = ctx.createGain(); delayFb.gain.value = .28;
    const delayLp = ctx.createBiquadFilter(); delayLp.type = 'lowpass'; delayLp.frequency.value = 2800;
    const delayOut = ctx.createGain(); delayOut.gain.value = .2;
    delay.connect(delayLp).connect(delayFb).connect(delay);
    delayLp.connect(delayOut).connect(master);
    const drums = ctx.createGain(); drums.gain.value = .9;
    const drumSat = shaper(ctx, 1.35);
    drums.connect(drumSat).connect(master);
    const music = ctx.createGain(); music.gain.value = 1;
    const musicSat = shaper(ctx, 1.12);
    music.connect(musicSat).connect(master);

    const noise = noiseBuffer(ctx, 2.2);
    const out = (node, { pan = 0, send = 0, dly = 0, bus = master, gain = 1 } = {}) => {
      const g = ctx.createGain(); g.gain.value = gain;
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      node.connect(g).connect(p);
      p.connect(bus === 'music' ? music : bus === 'drums' ? drums : master);
      if (send) {
        const s = ctx.createGain(); s.gain.value = send;
        p.connect(s).connect(verb);
      }
      if (dly) {
        const s = ctx.createGain(); s.gain.value = dly;
        p.connect(s).connect(delay);
      }
      return g;
    };

    // sidechain duck for music bus
    const duck = (t) => {
      music.gain.setValueAtTime(1, t);
      music.gain.linearRampToValueAtTime(.68, t + .008);
      music.gain.linearRampToValueAtTime(.92, t + .095);
      music.gain.linearRampToValueAtTime(1, t + .23);
    };

    // ---------- instruments ----------
    function kick(t, g = 1, tone = 1) {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(165 * tone, t);
      o.frequency.exponentialRampToValueAtTime(47, t + .115);
      gn.gain.setValueAtTime(.0001, t);
      gn.gain.linearRampToValueAtTime(g, t + .004);
      gn.gain.exponentialRampToValueAtTime(.0001, t + .36);
      o.connect(gn).connect(drums);
      o.start(t); o.stop(t + .38);
      const n = ctx.createBufferSource(); n.buffer = noise;
      const nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2400;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(g * .09, t); ng.gain.exponentialRampToValueAtTime(.0001, t + .028);
      n.connect(nf).connect(ng).connect(drums); n.start(t); n.stop(t + .04);
      duck(t);
    }
    function snare(t, g = .6, pan = 0) {
      const n = ctx.createBufferSource(); n.buffer = noise;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2100; bp.Q.value = .65;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(g * .5, t); ng.gain.exponentialRampToValueAtTime(.0001, t + .18);
      n.connect(hp).connect(bp).connect(ng);
      out(ng, { pan, send: .18, bus: 'drums' });
      n.start(t); n.stop(t + .2);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(195, t); o.frequency.exponentialRampToValueAtTime(135, t + .08);
      og.gain.setValueAtTime(g * .55, t); og.gain.exponentialRampToValueAtTime(.0001, t + .12);
      o.connect(og); out(og, { pan, send: .08, bus: 'drums' });
      o.start(t); o.stop(t + .14);
    }
    function clap(t, g = .4, pan = 0) {
      for (let i = 0; i < 3; i++) {
        const tt = t + i * .017;
        const n = ctx.createBufferSource(); n.buffer = noise;
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + i * 300; bp.Q.value = 1.1;
        const ng = ctx.createGain(); ng.gain.setValueAtTime(g * (.5 - i * .1), tt); ng.gain.exponentialRampToValueAtTime(.0001, tt + .055 + i * .015);
        n.connect(bp).connect(ng); out(ng, { pan, send: .22, bus: 'drums' });
        n.start(tt); n.stop(tt + .09);
      }
    }
    function hat(t, g = .16, open = false, pan = 0) {
      const n = ctx.createBufferSource(); n.buffer = noise;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7600;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 10500; bp.Q.value = .7;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(g, t); ng.gain.exponentialRampToValueAtTime(.0001, t + (open ? .22 : .045));
      n.connect(hp).connect(bp).connect(ng); out(ng, { pan, bus: 'drums' });
      n.start(t); n.stop(t + (open ? .24 : .06));
    }
    function crash(t, g = .3, pan = 0) {
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3800;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(g, t); ng.gain.exponentialRampToValueAtTime(.0001, t + 1.25);
      n.connect(hp).connect(ng); out(ng, { pan, send: .25, bus: 'drums' });
      n.start(t); n.stop(t + 1.3);
    }
    function tom(t, freq = 140, g = .3, pan = 0) {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(freq * .55, t + .18);
      gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(.0001, t + .25);
      o.connect(gn); out(gn, { pan, send: .12, bus: 'drums' });
      o.start(t); o.stop(t + .27);
    }
    function bass(t, note, dur, g = .5, cutoff = 420) {
      const f = mtof(note);
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'square';
      o1.frequency.value = f; o2.frequency.value = f * .5;
      o2.detune.value = 4;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 5;
      lp.frequency.setValueAtTime(cutoff, t);
      lp.frequency.exponentialRampToValueAtTime(cutoff * .45, t + Math.min(dur, .18));
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(.0001, t);
      gn.gain.linearRampToValueAtTime(g, t + .012);
      gn.gain.setValueAtTime(g, t + dur * .6);
      gn.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o1.connect(lp); o2.connect(lp); lp.connect(gn);
      out(gn, { send: .03, bus: 'music', gain: 1 });
      o1.start(t); o2.start(t); o1.stop(t + dur + .02); o2.stop(t + dur + .02);
    }
    function sub(t, note, dur, g = .5) {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = 'sine'; o.frequency.value = mtof(note);
      gn.gain.setValueAtTime(.0001, t); gn.gain.linearRampToValueAtTime(g, t + .01);
      gn.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(gn).connect(music); o.start(t); o.stop(t + dur + .02);
    }
    function pad(t, notes, dur, g = .055, bright = 1600, pan = 0) {
      notes.forEach((n, idx) => {
        for (let d = -1; d <= 1; d += 2) {
          const o = ctx.createOscillator(), gn = ctx.createGain(), lp = ctx.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = d * (6 + idx);
          lp.type = 'lowpass'; lp.frequency.value = bright; lp.Q.value = .6;
          gn.gain.setValueAtTime(.0001, t);
          gn.gain.linearRampToValueAtTime(g / notes.length, t + Math.min(.25, dur * .2));
          gn.gain.setValueAtTime(g / notes.length, t + dur * .78);
          gn.gain.exponentialRampToValueAtTime(.0001, t + dur);
          o.connect(lp).connect(gn);
          out(gn, { pan: pan + (idx - 2) * .05, send: .28, bus: 'music' });
          o.start(t); o.stop(t + dur + .03);
        }
      });
    }
    function stab(t, notes, dur = .16, g = .12, bright = 3200) {
      notes.forEach((n) => {
        for (let d = -1; d <= 1; d += 2) {
          const o = ctx.createOscillator(), gn = ctx.createGain(), lp = ctx.createBiquadFilter();
          o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = d * 9;
          lp.type = 'lowpass'; lp.frequency.setValueAtTime(bright, t); lp.frequency.exponentialRampToValueAtTime(500, t + dur);
          gn.gain.setValueAtTime(.0001, t); gn.gain.linearRampToValueAtTime(g / notes.length, t + .008);
          gn.gain.exponentialRampToValueAtTime(.0001, t + dur);
          o.connect(lp).connect(gn); out(gn, { send: .2, bus: 'music' });
          o.start(t); o.stop(t + dur + .02);
        }
      });
    }
    function pluck(t, note, dur = .18, g = .11, pan = 0, bright = 3200) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), gn = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'square'; o.frequency.value = mtof(note);
      o2.type = 'triangle'; o2.frequency.value = mtof(note + 12); o2.detune.value = 5;
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(bright, t); lp.frequency.exponentialRampToValueAtTime(900, t + dur);
      gn.gain.setValueAtTime(.0001, t); gn.gain.linearRampToValueAtTime(g, t + .005);
      gn.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(lp); o2.connect(lp); lp.connect(gn);
      out(gn, { pan, send: .12, dly: .2, bus: 'music' });
      o.start(t); o2.start(t); o.stop(t + dur + .02); o2.stop(t + dur + .02);
    }
    function bell(t, note, dur = 1.2, g = .1, pan = 0) {
      const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
      const gn = ctx.createGain();
      car.type = 'sine'; car.frequency.value = mtof(note);
      mod.type = 'sine'; mod.frequency.value = mtof(note) * 2.01;
      mg.gain.setValueAtTime(mtof(note) * 1.8, t);
      mg.gain.exponentialRampToValueAtTime(1, t + dur * .6);
      mod.connect(mg).connect(car.frequency);
      gn.gain.setValueAtTime(.0001, t); gn.gain.linearRampToValueAtTime(g, t + .005);
      gn.gain.exponentialRampToValueAtTime(.0001, t + dur);
      car.connect(gn); out(gn, { pan, send: .4, dly: .28, bus: 'music' });
      car.start(t); mod.start(t); car.stop(t + dur + .05); mod.stop(t + dur + .05);
    }
    function lead(t, note, dur = .3, g = .08, pan = 0) {
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(), gn = ctx.createGain(), lp = ctx.createBiquadFilter();
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'square'; o.frequency.value = mtof(note);
      o2.type = 'sawtooth'; o2.frequency.value = mtof(note - 12); o2.detune.value = 4;
      lfo.frequency.value = 5.6; lg.gain.value = 4.5; lfo.connect(lg).connect(o.frequency);
      lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 1.2;
      gn.gain.setValueAtTime(.0001, t); gn.gain.linearRampToValueAtTime(g, t + .012);
      gn.gain.setValueAtTime(g, t + dur * .8); gn.gain.exponentialRampToValueAtTime(.0001, t + dur);
      o.connect(lp); o2.connect(lp); lp.connect(gn);
      out(gn, { pan, send: .22, dly: .25, bus: 'music' });
      o.start(t); o2.start(t); lfo.start(t); o.stop(t + dur + .02); o2.stop(t + dur + .02); lfo.stop(t + dur + .02);
    }
    function choir(t, notes, dur, g = .06) {
      notes.forEach((n, i) => {
        const src = ctx.createOscillator(), env = ctx.createGain();
        src.type = 'sawtooth'; src.frequency.value = mtof(n); src.detune.value = (i - 2) * 4;
        const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 820; f1.Q.value = 2.5;
        const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1450; f2.Q.value = 3.5;
        const f3 = ctx.createBiquadFilter(); f3.type = 'bandpass'; f3.frequency.value = 2800; f3.Q.value = 4.5;
        const lvl1 = ctx.createGain(), lvl2 = ctx.createGain(), lvl3 = ctx.createGain();
        lvl1.gain.value = .55; lvl2.gain.value = .35; lvl3.gain.value = .16;
        env.gain.setValueAtTime(.0001, t);
        env.gain.linearRampToValueAtTime(g / notes.length, t + Math.min(.5, dur * .25));
        env.gain.setValueAtTime(g / notes.length, t + dur * .8);
        env.gain.exponentialRampToValueAtTime(.0001, t + dur);
        src.connect(f1).connect(lvl1).connect(env);
        src.connect(f2).connect(lvl2).connect(env);
        src.connect(f3).connect(lvl3).connect(env);
        out(env, { pan: (i - 2) * .12, send: .6, bus: 'music' });
        src.start(t); src.stop(t + dur + .05);
      });
    }
    function boom(t, g = 1) {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(28, t + .7);
      gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(.0001, t + 1.15);
      o.connect(gn); out(gn, { send: .3, bus: 'drums' });
      o.start(t); o.stop(t + 1.2);
      const n = ctx.createBufferSource(); n.buffer = noise;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(1800, t); lp.frequency.exponentialRampToValueAtTime(180, t + .6);
      const ng = ctx.createGain(); ng.gain.setValueAtTime(g * .55, t); ng.gain.exponentialRampToValueAtTime(.0001, t + .75);
      n.connect(lp).connect(ng); out(ng, { send: .35, bus: 'drums' });
      n.start(t); n.stop(t + .8);
    }
    function riser(t, dur, g = .16, up = true) {
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(up ? 320 : 6800, t);
      bp.frequency.exponentialRampToValueAtTime(up ? 9800 : 340, t + dur);
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(.0001, t); ng.gain.exponentialRampToValueAtTime(g, t + dur * .85);
      ng.gain.linearRampToValueAtTime(.0001, t + dur);
      n.connect(bp).connect(ng); out(ng, { send: .2 });
      n.start(t); n.stop(t + dur + .02);
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(up ? 110 : 740, t); o.frequency.exponentialRampToValueAtTime(up ? 880 : 90, t + dur);
      og.gain.setValueAtTime(.0001, t); og.gain.linearRampToValueAtTime(g * .18, t + dur * .9);
      og.gain.linearRampToValueAtTime(.0001, t + dur);
      o.connect(og); out(og, { pan: .2, send: .2 });
      o.start(t); o.stop(t + dur + .02);
    }
    function whoosh(t, g = .14, pan = 0) {
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.8;
      bp.frequency.setValueAtTime(4800, t); bp.frequency.exponentialRampToValueAtTime(320, t + .3);
      const ng = ctx.createGain(); ng.gain.setValueAtTime(.0001, t); ng.gain.linearRampToValueAtTime(g, t + .045);
      ng.gain.exponentialRampToValueAtTime(.0001, t + .34);
      n.connect(bp).connect(ng); out(ng, { pan, send: .1 });
      n.start(t); n.stop(t + .35);
    }
    function tick(t, g = .08, f = 3200, pan = 0) {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = 'square'; o.frequency.value = f;
      gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(.0001, t + .025);
      o.connect(gn); out(gn, { pan, bus: 'drums' });
      o.start(t); o.stop(t + .03);
    }
    function clickBomb(t, g = .35) {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(320, t); o.frequency.exponentialRampToValueAtTime(110, t + .12);
      gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(.0001, t + .2);
      o.connect(gn); out(gn, { send: .1, bus: 'drums' });
      o.start(t); o.stop(t + .22);
    }
    function pop(t, pan = 0, g = .12) {
      const o = ctx.createOscillator(), gn = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(900, t); o.frequency.exponentialRampToValueAtTime(1600, t + .04);
      gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(.0001, t + .08);
      o.connect(gn); out(gn, { pan, send: .15, bus: 'drums' });
      o.start(t); o.stop(t + .1);
    }
    function glitch(t, dur = .22, g = .13) {
      for (let i = 0; i < 7; i++) {
        const tt = t + i * dur / 7;
        const o = ctx.createOscillator(), gn = ctx.createGain();
        o.type = i % 2 ? 'square' : 'sawtooth';
        o.frequency.value = 120 + Math.floor(Math.random() * 16) * 55;
        gn.gain.setValueAtTime(g * (.5 + Math.random() * .5), tt);
        gn.gain.exponentialRampToValueAtTime(.0001, tt + .035);
        o.connect(gn); out(gn, { pan: (Math.random() - .5) * .8, bus: 'drums' });
        o.start(tt); o.stop(tt + .04);
      }
    }
    function siren(t, dur, g = .035) {
      const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), gn = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = 520;
      lfo.type = 'sine'; lfo.frequency.value = 2.6; lg.gain.value = 160;
      lfo.connect(lg).connect(o.frequency);
      gn.gain.setValueAtTime(.0001, t); gn.gain.linearRampToValueAtTime(g, t + .1);
      gn.gain.setValueAtTime(g, t + dur - .2); gn.gain.linearRampToValueAtTime(.0001, t + dur);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
      o.connect(lp).connect(gn); out(gn, { pan: -.2, send: .3 });
      o.start(t); lfo.start(t); o.stop(t + dur + .02); lfo.stop(t + dur + .02);
    }
    function fuse(t, dur, g = .08) {
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3400; bp.Q.value = .8;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(.0001, t); ng.gain.linearRampToValueAtTime(g, t + .1);
      for (let i = 0; i < Math.floor(dur * 20); i++) {
        const tt = t + i / 20;
        ng.gain.setValueAtTime(g * (.35 + Math.random() * .9), tt);
      }
      ng.gain.linearRampToValueAtTime(.0001, t + dur);
      n.connect(hp).connect(bp).connect(ng); out(ng, { pan: .1, send: .08 });
      n.start(t); n.stop(t + dur + .02);
      for (let i = 0; i < dur * 8; i++) tick(t + i / 8, .012, 1800 + Math.random() * 2400, .1);
    }
    function vinyl(t, dur) {
      const n = ctx.createBufferSource(); n.buffer = noise; n.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
      const gn = ctx.createGain(); gn.gain.value = .015;
      n.connect(lp).connect(gn); out(gn, { pan: 0 });
      n.start(t); n.stop(t + dur);
      for (let i = 0; i < dur * 1.5; i++) {
        if (Math.random() < .6) {
          const tt = t + Math.random() * dur;
          const c = ctx.createBufferSource(); c.buffer = noise;
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
          const cg = ctx.createGain(); cg.gain.setValueAtTime(.018 * Math.random(), tt); cg.gain.exponentialRampToValueAtTime(.0001, tt + .007);
          c.connect(hp).connect(cg); out(cg, { pan: Math.random() - .5 });
          c.start(tt); c.stop(tt + .01);
        }
      }
    }

    // ---------- arrangement ----------
    vinyl(0, 6);
    fuse(0, 2.05, .06);
    // low heartbeat intro
    kick(S(0, 0), .55, .9); kick(S(0, 2), .42, .85);
    kick(S(1, 0), .62, .92); kick(S(1, 2), .45, .88);
    sub(0, midi.D2, 1.9, .18);
    bell(0.5, midi.D5, 1.5, .06, -.22);
    bell(1.25, midi.A5, 1.0, .045, .18);
    for (let i = 0; i < 8; i++) tick(.0 + i * .25, .02 + i * .005, 2800 + i * 80, i % 2 ? .2 : -.2);
    // snare roll into the first slam
    for (let i = 0; i < 8; i++) snare(1.5 + i * .0625, .12 + i * .022, .15);
    riser(1.25, .7, .12);
    // 2.0 slam
    boom(2.0, .85); crash(2.0, .25); stab(2.0, CH.D.notes, .5, .18, 4200);
    bass(2.0, midi.D2, .45, .4); kick(2.0, .8);
    pad(2.0, CH.D.notes, 3.85, .07, 1800);
    choir(2.0, [midi.D4, midi.Fs4, midi.A4], 3.8, .04);

    // title groove 2–4
    for (let b = 0; b < 4; b++) {
      const t = 2 + b * .5;
      kick(t, b === 0 ? .8 : .55);
      if (b === 1 || b === 3) snare(t, .36);
      if (b === 1 || b === 3) clap(t + .005, .23);
      hat(t + .25, .1, false, .25);
      if (b === 2) tick(t, .08, 3400);
    }
    const motifA = [midi.D5, midi.Fs5, midi.A5, midi.Cs6, midi.A5, midi.Fs5, midi.E5, midi.D5];
    motifA.forEach((n, i) => { if (i % 2 === 0) pluck(2.0 + i * .25, n, .2, .10, i % 4 ? -.2 : .2); });
    crash(3.5, .12);
    riser(3.0, 1.0, .13);
    for (let i = 0; i < 8; i++) snare(3.0 + i * .125, .08 + i * .03, -.1 + i * .025);
    // 4.0 drop
    boom(4.0, .7); crash(4.0, .28); stab(4.0, CH.D.notes, .3, .17, 5000);
    bass(4.0, midi.D2, .45, .5);

    // 4–8 build groove
    for (let bar = 2; bar < 4; bar++) {
      const ch = chordAt(bar);
      pad(bar * 2, ch.notes, 1.95, .07, 1700);
      for (let b = 0; b < 4; b++) {
        const t = bar * 2 + b * .5;
        kick(t, .72);
        if (b === 1 || b === 3) { snare(t, .42); clap(t, .28); }
        hat(t + .25, .14, false, .2);
        for (let e = 0; e < 2; e++) hat(t + e * .25 + .125, .04, false, -.25);
      }
      for (let e = 0; e < 8; e++) {
        const t = bar * 2 + e * .25;
        const pattern = [0, 0, 12, 0, 7, 0, 10, 0];
        bass(t, ch.root + pattern[e], .2, .38, 520);
      }
    }
    // 4–8 arp + melody
    const arp4 = [0, 12, 7, 16, 7, 12, 19, 12];
    for (let i = 0; i < 16; i++) {
      const bar = 2 + Math.floor(i / 8);
      const ch = chordAt(bar);
      const n = ch.notes[(i + 1) % 3] + 12 + (i % 4 === 3 ? 12 : 0);
      pluck(4 + i * .25, n, .18, .052, i % 2 ? .35 : -.35, 3600);
    }
    [midi.D5, midi.E5, midi.Fs5, midi.A5, midi.Fs5, midi.E5, midi.D5, midi.Cs5].forEach((n, i) => lead(4 + i * .5, n, .38, .05, .15));
    lead(5.5, midi.D5, .8, .06, .15);
    riser(7.0, 1.0, .18);
    for (let i = 0; i < 16; i++) snare(7.0 + i * .0625, .08 + i * .025, .1);

    // 8.0 roster drop
    boom(8.0, .9); crash(8.0, .36); stab(8.0, CH.D.notes.map(n => n + 12), .35, .16, 5200);
    choir(8.0, [midi.D4, midi.Fs4, midi.A4, midi.D5], 1.9, .05);

    // 8–22 roster groove / six characters
    for (let bar = 4; bar < 11; bar++) {
      const ch = chordAt(bar);
      const t0 = bar * 2;
      pad(t0, ch.notes, 1.95, .075, 1900);
      // drum foundation
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * .5;
        kick(t, .78);
        if (b === 1 || b === 3) { snare(t, .45); clap(t, .32); }
        hat(t + .25, .15, true, .2);
        hat(t + .125, .055, false, -.25);
        hat(t + .375, .055, false, -.25);
      }
      // bass bounce
      const bassLine = [0, 0, 12, 0, 7, 10, 7, 0];
      for (let e = 0; e < 8; e++) bass(t0 + e * .25, ch.root + bassLine[e], .19, .34, 620);
      // arpeggio
      for (let e = 0; e < 16; e++) {
        const chordNotes = ch.notes;
        const n = chordNotes[[0, 2, 1, 3, 2, 1, 3, 2][e % 8]] + (e >= 8 ? 12 : 0);
        pluck(t0 + e * .125, n + 12, .11, .035, Math.sin(e * 1.7) * .5, 4200);
      }
    }
    // character slam accents at 10,12,14,16,18,20
    [10, 12, 14, 16, 18, 20].forEach((t, i) => {
      crash(t, i === 5 ? .3 : .17);
      stab(t, chordAt(t / 2).notes.map(n => n + 12), .18, .10, 4800);
      boom(t, .28);
      pop(t, i % 2 ? .3 : -.3, .08);
      // riser in last .5 s of each card
      if (i < 5) whoosh(t + 1.45, .10, i % 2 ? .5 : -.5);
    });
    // little top-line hook, per two bars
    const hook = [midi.D5, midi.A5, midi.Fs5, midi.E5, midi.D5, midi.Cs5, midi.A4, midi.Cs5];
    [0, 1].forEach((rep) => {
      hook.forEach((n, i) => lead(10 + rep * 4 + i * .5, n, .3, .045, .15));
    });
    [1, 2].forEach((rep) => {
      [midi.B4, midi.D5, midi.Fs5, midi.A5, midi.Fs5, midi.D5, midi.Cs5, midi.D5].forEach((n, i) => lead(16 + rep * 2 + i * .25, n, .18, .038, -.15));
    });
    lead(20.5, midi.B5, 1.5, .05, .2);
    // 22 group build
    crash(22.0, .32); boom(22.0, .5);
    stab(22.0, CH.A.notes.map(n => n + 12), .4, .16, 4000);
    for (let b = 0; b < 4; b++) {
      kick(22 + b * .5, .8);
      if (b === 1 || b === 3) snare(22 + b * .5, .5);
      hat(22 + b * .5 + .25, .14, true, .15);
    }
    bass(22.0, midi.A2, 1.5, .42);
    for (let i = 0; i < 16; i++) snare(22.0 + i * .0625, .08 + i * .028, .2);
    riser(22.5, 1.5, .2);
    choir(22.0, [midi.A3, midi.Cs4, midi.E4], 2.0, .055);
    // stop just before 24
    snare(23.75, .5); boom(23.75, .35);

    // 24.0 modes drop
    boom(24.0, .75); crash(24.0, .34); stab(24.0, CH.D.notes, .35, .17, 5200);
    choir(24.0, [midi.D4, midi.Fs4, midi.A4], 1.6, .04);

    // 24–32 modes groove
    for (let bar = 12; bar < 16; bar++) {
      const ch = chordAt(bar);
      const t0 = bar * 2;
      pad(t0, ch.notes, 1.95, .08, 2200);
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * .5;
        kick(t, .82);
        if (b === 1 || b === 3) { snare(t, .46); clap(t, .34); }
        hat(t + .25, .16, true, .25);
        hat(t + .125, .06, false, -.2);
        hat(t + .375, .06, false, -.2);
      }
      const bassLine = [0, 0, 12, 10, 7, 0, 7, 12];
      for (let e = 0; e < 8; e++) bass(t0 + e * .25, ch.root + bassLine[e], .2, .37, 700);
      // bigger topline for modes
      const phrase = [midi.D5, midi.Fs5, midi.A5, midi.B5, midi.A5, midi.Fs5, midi.E5, midi.D5];
      phrase.forEach((n, i) => lead(t0 + i * .25, n + (bar - 12) % 2 * 0, .18, .042, .15));
      for (let e = 0; e < 8; e++) pluck(t0 + e * .25 + .125, ch.notes[e % 3] + 24, .1, .025, Math.sin(e) * .4, 4600);
    }
    [26, 28, 30].forEach((t, i) => { whoosh(t, .13, i % 2 ? .4 : -.4); crash(t, .15); stab(t, chordAt(t / 2).notes, .18, .08, 4200); });
    // fill 31–32
    for (let i = 0; i < 12; i++) snare(31.0 + i * .0833, .1 + i * .035, .2);
    riser(31.0, 1.0, .15);
    crash(32.0, .3); boom(32.0, .5);

    // 32–34 sparse command / fuse
    glitch(32.0, .25, .08);
    for (let b = 0; b < 4; b++) {
      kick(32 + b * .5, .7);
      if (b === 1 || b === 3) snare(32 + b * .5, .4);
      for (let i = 0; i < 4; i++) tick(32 + b * .5 + i * .125, .02, 2400 + i * 250, i % 2 ? .2 : -.2);
    }
    const darkArp = [midi.E3, midi.B3, midi.E4, midi.G4, midi.B4, midi.G4, midi.E4, midi.B3];
    darkArp.forEach((n, i) => pluck(32 + i * .25, n, .18, .06, i % 2 ? .3 : -.3, 2200));
    bass(32.0, midi.E2, 1.8, .4, 380);
    pad(32.0, CH.Em.notes, 1.9, .07, 1200);
    // 34–35 build down / fuse
    bass(34.0, midi.E2, .8, .36, 360);
    for (let i = 0; i < 16; i++) snare(34.0 + i * .0469, .1 + i * .03, .1);
    riser(34.0, .95, .2);
    fuse(34.0, 1.0, .12);
    for (let i = 0; i < 8; i++) tick(34.0 + i * .125, .06 + i * .012, 2800 + i * 180, .1);
    // silence breath at 34.92 then BOOM at 35.0
    for (let i = 0; i < 6; i++) tick(34.5 + i * .08, .11, 3600 + i * 120, 0);
    boom(35.0, 1.0); crash(35.0, .4); sub(35.0, midi.D2, 1.8, .45);
    stab(35.0, [midi.D3, midi.Fs3, midi.A3, midi.D4, midi.Fs4], .5, .2, 6000);
    glitch(35.0, .18, .1);
    // 35–36 breakbeat after the blast
    for (let i = 0; i < 4; i++) { kick(35 + i * .25, .7); hat(35 + i * .25 + .125, .12, false, .2); }
    for (let i = 0; i < 8; i++) snare(35.0 + i * .125, .12 + i * .02, .15);
    bass(35.0, midi.D2, .9, .42, 800);

    // 36 boss
    boom(36.0, .8); crash(36.0, .35); stab(36.0, [midi.B2, midi.D3, midi.Fs3, midi.B3], .5, .18, 3800);
    siren(36.0, 3.8, .04);
    for (let bar = 18; bar < 20; bar++) {
      const ch = chordAt(bar);
      const t0 = bar * 2;
      pad(t0, ch.notes, 1.95, .09, 1200);
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * .5;
        if (b === 0 || b === 2) kick(t, .95, .85);
        if (b === 1) { snare(t, .6); clap(t, .32); }
        if (b === 3) { snare(t, .3, .1); kick(t + .25, .55); }
        hat(t + .25, .1, false, -.2);
      }
      // dark distorted ostinato
      const bassLine = [0, 0, 0, 1, 0, 6, 0, 5];
      for (let e = 0; e < 8; e++) bass(t0 + e * .25, ch.root + bassLine[e], .19, .46, 430);
      // low brass stab on 2 and 4
      stab(t0 + .5, [ch.notes[0] - 12, ch.notes[2] - 12, ch.notes[3] - 12], .35, .11, 1600);
      crash(t0, .16);
    }
    // 38 rage escalation
    glitch(38.0, .35, .12);
    for (let i = 0; i < 8; i++) tom(38 + i * .25, 110 + i * 8, .22, i % 2 ? .3 : -.3);
    for (let i = 0; i < 8; i++) snare(38.5 + i * .0625, .12 + i * .03, .15);
    riser(38.5, 1.4, .2);
    for (let i = 0; i < 6; i++) tick(39.0 + i * .1, .08, 3200 + i * 120, 0);
    // 40 awakening ethereal
    crash(40.0, .28); boom(40.0, .35);
    stab(40.0, [midi.G3, midi.B3, midi.D4, midi.G4], .7, .12, 3000);
    choir(40.0, [midi.G3, midi.B3, midi.D4, midi.G4, midi.B4], 3.9, .07);
    pad(40.0, [midi.G2, midi.B2, midi.D3, midi.G3], 3.9, .08, 2400);
    const bellNotes = [midi.G5, midi.D6, midi.B5, midi.G5, midi.A5, midi.E6, midi.Cs6, midi.A5, midi.B5, midi.Fs6, midi.D6, midi.B5, midi.A5, midi.Cs6, midi.E6, midi.D6];
    bellNotes.forEach((n, i) => bell(40.0 + i * .25, n, 1.4, .045, Math.sin(i * .8) * .5));
    for (let i = 0; i < 8; i++) pluck(40.0 + i * .25, [midi.G4, midi.B4, midi.D5, midi.G5][i % 4], .2, .035, i % 2 ? .4 : -.4, 4200);
    // 41—42 heart / build
    for (let b = 0; b < 4; b++) {
      kick(41 + b * .5, .5);
      if (b === 1 || b === 3) snare(41 + b * .5, .32);
    }
    bass(41.0, midi.G2, 1.8, .3, 320);
    // 42 euphoric lift
    crash(42.0, .28);
    pad(42.0, CH.A.notes, 1.95, .09, 3000);
    for (let b = 0; b < 4; b++) {
      kick(42 + b * .5, .72);
      if (b === 1 || b === 3) { snare(42 + b * .5, .48); clap(42 + b * .5, .3); }
      hat(42 + b * .5 + .25, .16, true, .2);
    }
    bass(42.0, midi.A2, .45, .4); bass(42.5, midi.A2, .2, .35); bass(42.75, midi.A3, .18, .25);
    bass(43.0, midi.A2, .45, .4); bass(43.5, midi.A2, .2, .35); bass(43.75, midi.Cs3, .18, .25);
    [midi.A4, midi.Cs5, midi.E5, midi.A5, midi.E5, midi.Cs5, midi.B4, midi.Cs5].forEach((n, i) => lead(42 + i * .25, n, .22, .055, .2));
    for (let i = 0; i < 16; i++) snare(43.0 + i * .0625, .08 + i * .025, .1);
    riser(43.0, 1.0, .18);

    // 44 finale
    boom(44.0, 1.0); crash(44.0, .4); stab(44.0, [midi.D3, midi.Fs3, midi.A3, midi.D4, midi.Fs4, midi.A4], .6, .22, 6000);
    choir(44.0, [midi.D4, midi.Fs4, midi.A4, midi.D5], 3.8, .07);
    sub(44.0, midi.D2, 3.8, .28);
    for (let bar = 22; bar < 24; bar++) {
      const ch = chordAt(bar);
      const t0 = bar * 2;
      pad(t0, ch.notes, 1.95, .09, 2600);
      for (let b = 0; b < 4; b++) {
        const t = t0 + b * .5;
        kick(t, .88);
        if (b === 1 || b === 3) { snare(t, .52); clap(t, .36); }
        hat(t + .25, .17, true, .25);
        hat(t + .125, .065, false, -.2);
        hat(t + .375, .065, false, -.2);
      }
      const bassLine = [0, 0, 12, 0, 7, 10, 7, 12];
      for (let e = 0; e < 8; e++) bass(t0 + e * .25, ch.root + bassLine[e], .2, .4, 750);
      for (let e = 0; e < 16; e++) pluck(t0 + e * .125, ch.notes[e % 3] + 24, .1, .03, Math.sin(e * 1.3) * .5, 4800);
    }
    const finalHook = [midi.D5, midi.A5, midi.B5, midi.A5, midi.Fs5, midi.E5, midi.D5, midi.Cs5, midi.D5, midi.Fs5, midi.A5, midi.D6, midi.A5, midi.Fs5, midi.E5, midi.D5];
    finalHook.forEach((n, i) => lead(44 + i * .25, n, .22, .06, .18));
    lead(46.0, midi.D6, 1.0, .075, .2);
    for (let i = 0; i < 16; i++) snare(46.0 + i * .0625, .09 + i * .03, .1);
    whoosh(46.5, .15, -.4); whoosh(46.55, .12, .4);
    riser(46.5, .5, .18);
    // final hit at 47
    boom(47.0, 1.0); crash(47.0, .45); kick(47.0, 1.0);
    stab(47.0, [midi.D3, midi.Fs3, midi.A3, midi.D4, midi.Fs4], 1.0, .22, 5000);
    choir(47.0, [midi.D4, midi.Fs4, midi.A4, midi.D5], 1.0, .08);
    bell(47.0, midi.D6, .9, .08, .2); bell(47.05, midi.A6, .8, .05, -.2);
    // final fuse wink
    tick(47.6, .05, 3000, 0); tick(47.78, .06, 3600, 0);

    // tiny transition ticks for visual sync
    [4.0, 8.0, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 35, 36, 40, 44, 47].forEach((t, i) => {
      if (i < 3) return;
      tick(t + .02, .025, 4200, .3);
    });

    onProgress && onProgress(.55);
    const buffer = await ctx.startRendering();
    onProgress && onProgress(.92);
    // normalize + fades
    let peak = 0;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
    }
    const gain = peak > 0 ? Math.min(2.2, .89 / peak) : 1;
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const d = buffer.getChannelData(c);
      for (let i = 0; i < d.length; i++) {
        let g = gain;
        const t = i / SR;
        if (t < .02) g *= t / .02;
        if (t > 47.55) g *= M.clamp((48 - t) / .45, 0, 1);
        d[i] *= g;
      }
    }
    onProgress && onProgress(1);
    return buffer;
  };

  A.toWav = function (buffer) {
    const numCh = buffer.numberOfChannels, len = buffer.length, sr = buffer.sampleRate;
    const data = new DataView(new ArrayBuffer(44 + len * numCh * 2));
    const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); data.setUint32(4, 36 + len * numCh * 2, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true);
    data.setUint16(22, numCh, true); data.setUint32(24, sr, true);
    data.setUint32(28, sr * numCh * 2, true); data.setUint16(32, numCh * 2, true); data.setUint16(34, 16, true);
    writeStr(36, 'data'); data.setUint32(40, len * numCh * 2, true);
    const chans = []; for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
    let o = 44;
    for (let i = 0; i < len; i++) for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2;
    }
    return new Blob([data], { type: 'audio/wav' });
  };
})();
