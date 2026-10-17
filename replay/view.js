(function () {
  'use strict';
  var BI = window.BI, CFG = BI.config, S = BI.sprites, HUD = BI.hud, FX = BI.fx;
  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('game'), ctx = canvas.getContext('2d'), player = null, playing = false, loading = false;
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = 720 * dpr; canvas.height = 696 * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  var previous = 0, accumulator = 0, loadId = 0, lastPanel = 0, markerFrame = null;
  var controls = ['restart','back','play','forward','step','action','timeline'];
  BI.assets.init();
  function notice(message, error) { $('notice').textContent = message; $('notice').classList.toggle('error', !!error); }
  function time(frame) {
    var seconds = Math.floor(frame / 60);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }
  function pause() { playing = false; accumulator = 0; $('play').textContent = '播放'; }
  function returnToGame() {
    pause();
    if (new URLSearchParams(location.search).has('embedded') && window.parent !== window) {
      window.parent.postMessage({ type: 'bombit-replay-close' }, '*');
      return true;
    }
    return false;
  }
  $('back-to-game').addEventListener('click', function (event) { if (returnToGame()) event.preventDefault(); });
  function effects(events) {
    FX.update(1 / 60);
    events.forEach(function (event) {
      if (event.type === 'field_reset') FX.reset();
      if (event.type === 'onExplode') FX.explosion(event.col, event.row, event.cells);
      if (event.type === 'onDeath') {
        var p = player.world.playerById(event.player); if (p) FX.death(p.x, p.y);
      }
      if (event.type === 'onEnemyDeath') {
        var e = player.world.enemies.find(function (actor) { return actor.id === event.enemy; });
        if (e) FX.enemyDeath(e.x, e.y, e.color);
      }
    });
  }
  function draw() {
    if (!player) return;
    var w = player.world;
    // Rendering assets belong to a view, not to the deterministic saved world.
    var view = Object.create(w);
    view.players = w.players.map(function (p) { return Object.assign({}, p); });
    BI.assets.refreshAll(view.players);
    ctx.clearRect(0, 0, 720, 696);
    ctx.save(); ctx.translate(FX.ox, CFG.HUD_H + FX.oy);
    S.drawMap(ctx, view.map, view.theme, view.time);
    S.drawPoison(ctx, view); S.drawBombZones(ctx, view, view.time);
    S.drawItems(ctx, view.items, view.time); S.drawFlames(ctx, view.flames); S.drawSkills(ctx, view);
    var objects = view.players.concat(view.enemies).map(function (actor) { return { actor: actor, y: actor.y, layer: 0 }; });
    view.bombs.forEach(function (bomb) { objects.push({ bomb: bomb, y: BI.grid.bombPosition(bomb).y, layer: 1 }); });
    objects.sort(function (a, b) { return a.y - b.y || a.layer - b.layer; });
    objects.forEach(function (object) {
      if (object.bomb) { S.drawBombs(ctx, [object.bomb], view.time); S.drawFuseTimers(ctx, [object.bomb], view.time); }
      else if (object.actor.isEnemy) S.drawEnemy(ctx, object.actor, view.time, 1);
      else S.drawCharacter(ctx, object.actor, view.time, 1);
    });
    view.players.forEach(function (p) { S.drawPlayerTag(ctx, p, p.name, view.time, 1); });
    FX.draw(ctx); FX.drawTexts(ctx);
    HUD.drawFieldFrame(ctx); HUD.drawFloating(ctx, view, view.time); HUD.drawSkills(ctx, view);
    ctx.restore();
    // Reuse the original character/status artwork with spectator instructions.
    ctx.fillStyle = '#242e47'; ctx.fillRect(0, 0, 720, CFG.HUD_H);
    ctx.fillStyle = '#dcebea'; ctx.font = 'bold 17px "Microsoft YaHei",sans-serif';
    ctx.fillText('AGENT 对局回放', 18, 25);
    ctx.fillStyle = '#9fb6c8'; ctx.font = '12px "Microsoft YaHei",sans-serif';
    ctx.fillText(playing ? '正在播放 · ' + $('speed').value + '×' : w.match.over ? '对局结束 · 可拖动进度重看' : '已暂停 · 空格继续', 18, 49);
    var edge = 704;
    for (var i = view.players.length - 1; i >= 0; i--) edge -= HUD.chip(ctx, view.players[i], edge, CFG.HUD_H, view) + 10;
  }
  function panels() {
    if (!player) return;
    var w = player.world, p = w.players[0], mode = { adventure: '冒险', dig: '拆砖', versus: '对战' }[w.mode];
    $('level').textContent = mode + (w.mode === 'adventure' ? ' · 第 ' + w.match.level + ' / 10 关' : w.mode === 'versus' ? ' · 回合 ' + w.match.round : ' · 计时挑战');
    $('character').textContent = (BI.CHARACTERS.characters[p.assetId]?.name || p.assetId) + ' · ' +
      ({ forest: '晨露森林', factory: '星汽工厂', park: '星糖游乐园' }[w.theme] || w.theme) +
      (w.map.bossBattle ? ' · BOSS 战' : '');
    var stats = [['生命', p.lives, p.alive ? '' : '等待重生'], ['击杀', w.stats.kills, ''],
      ['火力', p.power, '格'], ['炸弹', p.maxBombs, '枚上限'], ['速度', '+' + Math.round(p.speedBonus * 100), '%'], ['爆炸', w.stats.explosions, '次']];
    $('stats').replaceChildren();
    stats.forEach(function (item) {
      var node = document.createElement('div'); node.className = 'stat';
      var label = document.createElement('span'), value = document.createElement('strong'), unit = document.createElement('small');
      label.textContent = item[0]; value.textContent = item[1] + ' '; unit.textContent = item[2]; value.appendChild(unit); node.append(label, value); $('stats').appendChild(node);
    });
    $('result').textContent = w.match.over ? w.match.title + ' · ' + w.match.subtitle : '';
    $('clock').textContent = time(w.frame) + ' / ' + time(player.totalFrames);
    $('frame-count').textContent = '帧 ' + w.frame.toLocaleString();
    $('action-count').textContent = '动作 ' + player.index.toLocaleString() + ' / ' + player.data.history.length.toLocaleString();
    $('timeline').value = w.frame;
    var currentLevel = null;
    player.markers.forEach(function (m) { if (m.frame <= w.frame && (m.type === 'start' || m.type === 'level_started' || m.type === 'round_started')) currentLevel = m.frame; });
    $('markers').querySelectorAll('button').forEach(function (button) {
      var active = Number(button.dataset.frame) === currentLevel;
      button.classList.toggle('active', active);
      if (active && markerFrame !== currentLevel) {
        var list = $('markers'), itemBox = button.getBoundingClientRect(), listBox = list.getBoundingClientRect();
        if (itemBox.top < listBox.top || itemBox.bottom > listBox.bottom) list.scrollTop += itemBox.top - listBox.top - listBox.height / 2;
      }
    });
    markerFrame = currentLevel;
  }
  function seek(frame) {
    if (!player || loading) return;
    pause(); FX.reset(); player.seek(frame); draw(); panels();
  }
  function toggle() {
    if (!player || loading) return;
    if (playing) pause();
    else {
      if (player.world.frame >= player.totalFrames) seek(0);
      playing = true; previous = 0; $('play').textContent = '暂停';
    }
    draw();
  }
  async function digest(value) {
    if (!window.crypto?.subtle) throw new Error('浏览器不支持本地校验，请用新版 Edge 或 Chrome 打开。');
    var bytes = new TextEncoder().encode(JSON.stringify(value));
    var result = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(result), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
  }
  async function load(value, name) {
    var token = ++loadId;
    pause(); loading = true;
    controls.forEach(function (id) { $(id).disabled = true; });
    $('verified').textContent = '正在校验';
    notice('正在重演动作并建立跳转索引…');
    try {
      var candidate = new BombItReplay.Player(BI, value);
      await candidate.build(digest, async function (index, total) {
        if (token !== loadId) throw new Error('已切换文件');
        notice('正在校验 ' + index.toLocaleString() + ' / ' + total.toLocaleString() + ' 步动作…');
        await new Promise(function (resolve) { setTimeout(resolve, 0); });
      });
      if (token !== loadId) return;
      player = candidate; player.onFrame = effects; markerFrame = null; FX.reset();
      $('filename').textContent = name || '本地回放';
      $('empty').hidden = true; $('empty').style.display = 'none';
      $('verified').textContent = '逐步校验通过';
      $('timeline').max = player.totalFrames;
      $('markers').replaceChildren();
      player.markers.forEach(function (marker) {
        var button = document.createElement('button'), stamp = document.createElement('small');
        button.type = 'button'; button.dataset.frame = marker.frame;
        button.textContent = marker.label; stamp.textContent = time(marker.frame); button.appendChild(stamp);
        if (marker.type === 'onDeath') button.className = 'death';
        button.addEventListener('click', function () { seek(marker.frame); }); $('markers').appendChild(button);
      });
      notice('已校验全部 ' + player.data.history.length.toLocaleString() + ' 步 · 总时长 ' + time(player.totalFrames) + ' · 点击播放，或选择关卡跳看。');
      controls.forEach(function (id) { $(id).disabled = false; });
      draw(); panels();
      return player;
    } catch (error) {
      if (token === loadId) { player = null; $('verified').textContent = '载入失败'; notice(error.message, true); }
      throw error;
    } finally { if (token === loadId) loading = false; }
  }
  async function file(file) {
    if (!file) return;
    try { await load(JSON.parse((await file.text()).replace(/^\uFEFF/, '')), file.name); }
    catch (error) { notice(error.message, true); }
  }
  $('file').addEventListener('change', function () { file(this.files[0]); this.value = ''; });
  document.addEventListener('dragover', function (e) { e.preventDefault(); document.body.classList.add('dragging'); });
  document.addEventListener('dragleave', function (e) { if (!e.relatedTarget) document.body.classList.remove('dragging'); });
  document.addEventListener('drop', function (e) { e.preventDefault(); document.body.classList.remove('dragging'); file(e.dataTransfer.files[0]); });
  $('play').addEventListener('click', toggle);
  $('restart').addEventListener('click', function () { seek(0); });
  $('back').addEventListener('click', function () { if (player) seek(player.world.frame - 300); });
  $('forward').addEventListener('click', function () { if (player) seek(player.world.frame + 300); });
  $('timeline').addEventListener('input', function () { seek(Number(this.value)); });
  $('step').addEventListener('click', function () { if (player) seek(player.world.frame + 1); });
  $('action').addEventListener('click', function () {
    if (!player) return;
    var entry = player.data.history[player.index];
    if (entry) seek(player.world.frame + entry.advancedFrames - player.offset);
  });
  document.addEventListener('keydown', function (e) {
    if (e.code === 'Escape' && returnToGame()) { e.preventDefault(); return; }
    if (['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowLeft' && player) { e.preventDefault(); seek(player.world.frame - 300); }
    if (e.code === 'ArrowRight' && player) { e.preventDefault(); seek(player.world.frame + 300); }
  });
  function frame(now) {
    var dt = previous ? Math.min((now - previous) / 1000, .1) : 0; previous = now;
    try {
      if (player && playing && !loading) {
        accumulator += dt * Number($('speed').value) * 60;
        var count = Math.min(120, Math.floor(accumulator)); accumulator -= count;
        while (count-- > 0 && player.world.frame < player.totalFrames) player.tick();
        if (player.world.frame >= player.totalFrames) pause();
      }
      if (player && !loading) {
        draw();
        if (now - lastPanel > 100) { panels(); lastPanel = now; }
      }
    } catch (error) { pause(); notice('播放停止：' + error.message, true); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.BombItReplayViewer = { load: load, seek: seek, digest: digest, draw: draw,
    get player() { return player; }, get playing() { return playing; }, get loading() { return loading; } };
  var params = new URLSearchParams(location.search), bundle = params.get('bundle');
  var validBundle = bundle && /^\.bombit\/(?:cache\/browser-replays|tmp\/tests)\/[a-zA-Z0-9_\/-]+\.js$/.test(bundle);
  if (validBundle) {
    var script = document.createElement('script'); script.src = bundle;
    script.onload = function () {
      load(window.BOMBIT_REPLAY_DATA, params.get('name') || window.BOMBIT_REPLAY_DATA?.recording?.name).catch(function () {});
    };
    script.onerror = function () { notice('未找到导出的回放。请运行观看回放启动器，或直接选择 JSON 文件。', true); };
    document.body.appendChild(script);
  }
  if (params.has('test')) {
    var tests = document.createElement('script'); tests.src = 'tests/replay-browser.js'; document.body.appendChild(tests);
  }
})();
