/* ============================================================
 * main.js —— 启动 + 固定步长主循环 + 场景状态机
 *
 * 场景：menu（选模式/选人） -> playing（对局） -> result（结算）
 *
 * 固定步长（60Hz 逻辑）+ 插值渲染：
 *   若直接用帧间隔驱动逻辑，144Hz 屏幕上游戏会快 2.4 倍。
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, G = BI.grid, R = BI.rules, S = BI.sprites,
      D = BI.draw, HUD = BI.hud, MO = BI.motion, MA = BI.match,
      EN = BI.entities, AI = BI.ai, DG = BI.danger,
      FX = BI.fx, SFX = BI.sfx, MUSIC = BI.music;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var bootEl = document.getElementById('boot');
  var booting = !!bootEl;
  var bootPhase = 'menu', bootFinishing = false, pendingGame = null;
  var replayURL = new URL('../replay.html?embedded=1', document.currentScript.src).href;
  canvas.tabIndex = -1;

  var STEP = BI.engine.STEP;
  var acc = 0, lastTs = 0;
  var fps = 60, fpsAcc = 0, fpsCount = 0;

  /* 场景状态机 */
  var app = {
    scene: 'menu',        // 'menu' | 'playing' | 'result'
    world: null,
    menu: null,
    result: null,
    config: null,         // 本局配置（再来一局用）
    paused: false,
    replayOpen: false,
    pause: null,          // 暂停菜单状态（暂停时才有）
    runtimeFault: null,
    errors: [],
    endAt: 0              // >0 表示胜负已分，等到这个时间点弹结算
  };

  /* ============================================================
   * 自适应缩放（含 HiDPI，保证高清屏不糊）
   * ============================================================ */
  function resize() {
    var dpr = window.devicePixelRatio || 1;
    var scale = Math.min(window.innerWidth / CFG.VIEW_W, window.innerHeight / CFG.VIEW_H);
    var cssW = Math.max(1, Math.floor(CFG.VIEW_W * scale));
    var cssH = Math.max(1, Math.floor(CFG.VIEW_H * scale));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(canvas.width / CFG.VIEW_W, 0, 0, canvas.height / CFG.VIEW_H, 0, 0);
  }

  /* ============================================================
   * 世界构建
   * ============================================================ */
  function createWorld(cfg) {
    var w = BI.engine.create(cfg);
    var hooks = {
      onExplode: function (bomb, cells) {
        SFX.play('explode');
        FX.explosion(bomb.cx, bomb.cy, cells);
      },
      onDeath: function (p) {
        SFX.play('death');
        FX.death(p.x, p.y);
      },
      onEnemyDeath: function (e) {
        SFX.play('enemyDie');
        FX.enemyDeath(e.x, e.y, e.color);
        // 掉道具的规则在 rules.dropFromEnemy 里（属于游戏逻辑，不放这儿）
      },
      onBossPhase: function (e, phase) {
        SFX.play('sudden');
        FX.burst(e.x, e.y - 25, { count: 24, speed: 100, life: .8,
          colors: [phase.color, '#fff3d1'], gravity: -20 });
        FX.text(e.x, e.y - 104, (phase.id === 2 ? '二 · ' : '三 · ') + phase.name,
          phase.color, { size: 21 });
      },
      onScenery: function (kind, x, y) {
        SFX.play('pickup');
        FX.burst(x, y - 8, { count: 12, speed: 65, life: .7, colors: ['#ffe3a5', '#c8e6a2', '#fff8e7'], gravity: 25 });
        FX.text(x, y - 34, kind === 'fruit' ? '生命果实' : '获得护盾', '#ffe3a5', { size: 14 });
      },
      onSkill: function (p, text) {
        SFX.play('pickup');
        FX.burst(p.x, p.y - 12, { count: 16, speed: 100, life: .5,
          colors: [BI.skills.info(p).color, '#fff9dd'], gravity: -20 });
        FX.text(p.x, p.y - 54, text, BI.skills.info(p).color, { size: 14 });
      },
      onEnemyBomb: function () { SFX.play('enemyBomb'); },
      onPickup: function (p, item) {
        var info = BI.ITEM_INFO[item.type] || {};
        if (p.isEnemy) {
          FX.text(p.x, p.y - 45, p.name + ' · ' + (info.label || '道具'), info.color || '#fff', { size: 12 });
          return;
        }
        SFX.play('pickup');
        FX.pickup(item.c * CFG.TILE + CFG.TILE / 2,
                  item.r * CFG.TILE + CFG.TILE / 2,
                  ({fire:'火力+1',bomb:'炸弹数量+1',speed:'速度+10%',fruit:'拾取生命果实',star:'无敌6秒',shield:'获得护盾',glove:'获得推弹手套'})[item.type] || info.label);
      },
      onShieldBreak: function (p) {
        SFX.play('shieldBreak');
        FX.shieldBreak(p.x, p.y - 20);
      },
      onItemBurned: function (c, r, type) {
        // 道具被炸掉也要有反馈，否则玩家会以为是显示 bug
        SFX.play('itemBurn');
        FX.burst(c * CFG.TILE + CFG.TILE / 2, r * CFG.TILE + CFG.TILE / 2, {
          count: 8, speed: 80, size: 3, life: 0.4, gravity: 120,
          colors: ['#ff9e5c', '#ffd166', '#ffffff']
        });
      },
      onSuddenDeath: function () { SFX.play('sudden'); }
    };
    w.eventSink = function (type, args) {
      if (type === 'field_reset') FX.reset();
      if (hooks[type]) hooks[type].apply(null, args);
    };
    return w;
  }

  function startNextLevel(w) { BI.engine.nextLevel(w); }

  /* ============================================================
   * 玩家推进
   * 移动与手感逻辑在 game/motion.js（不碰 DOM，可无头测试）
   * ============================================================ */
  function readActions(w) {
    var inp = BI.input, km = inp.map(w.inputMode, w.altKeys), actions = {};
    w.players.forEach(function (p) {
      var k = p.keyId;
      if (inp.hit(km,k,'left') || inp.hit(km,k,'right')) p.axisPref = 'x';
      if (inp.hit(km,k,'up') || inp.hit(km,k,'down')) p.axisPref = 'y';
      actions[p.id] = {
        hx: (inp.held(km,k,'right') ? 1 : 0) - (inp.held(km,k,'left') ? 1 : 0),
        hy: (inp.held(km,k,'down') ? 1 : 0) - (inp.held(km,k,'up') ? 1 : 0),
        bomb: inp.hit(km,k,'bomb'), skill: inp.hit(km,k,'skill')
      };
    });
    return actions;
  }

  /* ============================================================
   * 对局推进
   * ============================================================ */
  function updatePlaying(dt) {
    var w = app.world;
    if (!w) return;

    // 暂停时只推进暂停菜单，战场完全冻结
    if (app.paused) {
      if (!app.pause) app.pause = BI.pause.create();
      var act = BI.pause.update(app.pause, dt);
      if (act) handlePauseAction(act);
      return;
    }

    // 关前介绍期间冻结整个战场，确认后下一帧才推进。
    if (w.briefing) {
      if (BI.input.wasPressed('Escape') || BI.input.wasPressed('KeyP')) { togglePause(); return; }
      if (BI.input.wasPressed('Enter') || BI.input.wasPressed('NumpadEnter') ||
          BI.input.wasPressed('Space') || (BI.mouse.clicked && BI.input.hitRect(230, 582, 260, 52))) {
        w.briefing = null;
        BI.input.clear();
        BI.input.endMouseFrame();
        SFX.play('menuConfirm');
      }
      return;
    }

    // 结算等待期间只推进动画，避免通关后被残留炸弹扣命。
    if (w.match.over) {
      w.time += dt;
      FX.update(dt);
      if (app.endAt > 0 && w.time >= app.endAt) showResult();
      return;
    }
    BI.engine.step(w, readActions(w), dt);

    // 过关：放一次彩带 + 音效（只在刚清场的那一帧触发）
    if (w.mode === 'adventure') {
      if (w.match.levelClearAt > 0 && !w._levelFxFired) {
        w._levelFxFired = true;
        SFX.play('levelClear');
        FX.levelClear();
      } else if (w.match.levelClearAt === 0) {
        w._levelFxFired = false;
      }
    }

    // 特效推进
    FX.update(dt);

    // 胜负已分：停一下让玩家看清最后一爆，再弹结算
    if (w.match.over && app.endAt === 0) app.endAt = w.time + CFG.RESULT_DELAY;
    if (app.endAt > 0 && w.time >= app.endAt) { showResult(); return; }

    // 全局快捷键
    if (BI.input.wasPressed('KeyR')) { startGame(app.config); return; }
    if (BI.input.wasPressed('Tab')) w.altKeys = !w.altKeys;
    if (BI.input.wasPressed('KeyM')) SFX.toggle();                   // 静音开关
    if (BI.input.wasPressed('Escape') || BI.input.wasPressed('KeyP')) togglePause();
  }

  function showResult() {
    app.endAt = 0;
    var summary = MA.summary(app.world);
    app.result = BI.result.create(summary);
    app.scene = 'result';
    // 对战是两个人打，没有"玩家输了"这回事；单人模式才分胜负
    var won = (summary.mode === 'versus') ? true : (summary.winner === 'p1');
    SFX.play(won ? 'win' : 'lose');
    BI.input.clear();
  }

  /* ============================================================
   * 背景音乐：曲目完全由场景推导，每逻辑帧同步一次
   *
   *   菜单 → 菜单曲   普通对局 → 小怪关配乐   BOSS 关 → 鲁鲁旦别捣蛋
   *
   * BOSS 曲只在鲁鲁旦活着时放：打死它之后场上还有小怪的话，
   * 剩下的是普通清场，音乐要回到关卡曲。
   *
   * 写成「每帧对齐」而不是在 startGame / gotoMenu 里各调一次：
   * 换关、开 BOSS 关、重开本局都会经过主循环，不可能漏掉某一处，
   * 而且 music.play() 对同一首是空操作，重复调用没有代价。
   * ============================================================ */
  function syncMusic() {
    if (!MUSIC) return;
    var w = app.world;
    MUSIC.play(MUSIC.trackFor({
      scene: app.scene,
      world: w,
      bossBattle: !!(w && w.map && w.map.bossBattle),
      bossAlive: EN.bossAlive(w)
    }));
    MUSIC.setSuspended(app.paused || app.replayOpen);
  }

  /* ============================================================
   * 渲染
   * ============================================================ */
  function renderPlaying(alpha) {
    var w = app.world;
    ctx.clearRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
    ctx.fillStyle = '#1a2036';
    ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);

    ctx.save();
    // 震屏：只晃场地内容，HUD 保持稳定（晃 UI 会看不清状态）
    ctx.translate(FX.ox, CFG.HUD_H + FX.oy);

    // 场景内容和 UI 分开绘制，常规三主题地图以原尺寸显示。
    ctx.save();
    var fieldW = G.cols(w.map) * CFG.TILE, fieldH = G.rows(w.map) * CFG.TILE;
    var viewScale = Math.min(1, CFG.FIELD_W / fieldW, CFG.FIELD_H / fieldH);
    ctx.translate((CFG.FIELD_W - fieldW * viewScale) / 2, (CFG.FIELD_H - fieldH * viewScale) / 2);
    ctx.scale(viewScale, viewScale);
    S.drawMap(ctx, w.map, w.theme, w.time);
    S.drawPoison(ctx, w);
    S.drawBombZones(ctx, w, w.time);      // 爆炸范围预览（画在道具下面，免得盖住道具）
    S.drawItems(ctx, w.items, w.time);
    S.drawFlames(ctx, w.flames);
    S.drawSkills(ctx, w);

    // 角色素材是异步加载的，每帧刷一次 —— 图片到了自动换上
    BI.assets.refreshAll(w.players);

    // 以场地位置判断前后，不能按图片高度或把所有炸弹固定放在角色上面。
    // 使用与绘制一致的插值位置，移动经过炸弹时不会提前切换遮挡关系。
    var objects = [];
    w.players.concat(w.enemies).forEach(function (actor) {
      objects.push({ actor: actor, y: D.lerp(actor.py == null ? actor.y : actor.py, actor.y, alpha), layer: 0 });
    });
    w.bombs.forEach(function (bomb) {
      objects.push({ bomb: bomb, y: G.bombPosition(bomb).y, layer: 1 });
    });
    // 同一深度时炸弹优先显示，脚下刚放的炸弹可见；后方炸弹则自然被前方角色遮挡。
    objects.sort(function (a, b) { return a.y - b.y || a.layer - b.layer; });
    for (var i = 0; i < objects.length; i++) {
      var object = objects[i];
      if (object.bomb) {
        S.drawBombs(ctx, [object.bomb], w.time);
        S.drawFuseTimers(ctx, [object.bomb], w.time);
      } else if (object.actor.isEnemy) S.drawEnemy(ctx, object.actor, w.time, alpha);
      else S.drawCharacter(ctx, object.actor, w.time, alpha);
    }
    for (var j = 0; j < w.players.length; j++) {
      S.drawPlayerTag(ctx, w.players[j], w.players[j].name, w.time, viewScale);
    }

    // 粒子盖在角色上，飘字盖在最上面
    FX.draw(ctx);
    FX.drawTexts(ctx);

    ctx.restore();
    HUD.drawFieldFrame(ctx);
    HUD.drawFloating(ctx, w, w.time);
    HUD.drawSkills(ctx, w);
    ctx.restore();

    HUD.draw(ctx, w, { fps: fps });

    if (w.briefing) HUD.drawBriefing(ctx, w);
    if (app.paused && app.pause) {
      app.pause.info = pauseInfo();
      BI.pause.draw(ctx, app.pause);
    }
  }

  function renderFault() {
    ctx.clearRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
    ctx.fillStyle = '#1a2036'; ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
    BI.pause.draw(ctx, app.pause);
  }

  function render(alpha) {
    if (app.runtimeFault) { renderFault(); return; }
    if (app.scene === 'menu') {
      BI.menu.draw(ctx, app.menu);
    } else if (app.scene === 'playing') {
      renderPlaying(alpha);
    } else {
      // 结算界面：底下还留着最后一帧战场，压暗后叠卡片
      renderPlaying(1);
      BI.result.draw(ctx, app.result);
    }
  }

  /* ============================================================
   * 每帧推进
   * ============================================================ */
  function update(dt) {
    if (booting) return;
    if (MUSIC) { MUSIC.update(dt); syncMusic(); }
    if (app.replayOpen) return;
    if (app.runtimeFault) {
      var recovery = BI.pause.update(app.pause, dt);
      if (recovery) handlePauseAction(recovery);
      return;
    }
    if (app.scene === 'menu') {
      var start = BI.menu.update(app.menu, dt);
      if (start && start.screen === 'replay') openReplay();
      else if (start) startGame(start);
    } else if (app.scene === 'playing') {
      updatePlaying(dt);
    } else {
      var act = BI.result.update(app.result, dt);
      if (act === 'replay') startGame(app.config);
      else if (act === 'menu') gotoMenu();
    }
  }

  /* ============================================================
   * 主循环
   * ============================================================ */
  function openReplay() {
    if (app.replayOpen) return;
    var dialog = document.createElement('dialog'), viewer = document.createElement('iframe');
    dialog.id = 'replay-dialog';
    dialog.setAttribute('aria-label', 'Agent 对局回放');
    dialog.style.cssText = 'position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#111723;overflow:hidden;';
    viewer.title = 'Agent 对局回放播放器';
    viewer.src = replayURL;
    viewer.style.cssText = 'display:block;width:100%;height:100%;border:0;';
    dialog.appendChild(viewer); document.body.appendChild(dialog);
    function message(event) {
      if (event.source === viewer.contentWindow && event.data?.type === 'bombit-replay-close') dialog.close();
    }
    window.addEventListener('message', message);
    dialog.addEventListener('close', function () {
      window.removeEventListener('message', message);
      dialog.remove(); app.replayOpen = false; acc = 0;
      BI.input.clear(); BI.input.endMouseFrame(); canvas.focus();
    }, { once: true });
    app.replayOpen = true;
    BI.input.clear(); BI.input.endMouseFrame();
    dialog.showModal();
  }

  function frame(ts) {
    try {
      if (!lastTs) lastTs = ts;
      var dtReal = (ts - lastTs) / 1000;
      lastTs = ts;

      // 上限 0.25s：防止切标签页回来后的「死亡螺旋」
      acc += Math.min(dtReal, 0.25);

      var steps = 0;
      while (acc >= STEP && steps < 8) {
        update(STEP);
        BI.input.endFrame();       // 按键「刚按下」的边沿只在第一个逻辑步生效
        BI.input.endMouseFrame();
        acc -= STEP;
        steps++;
      }
      if (steps === 8) acc = 0;

      fpsAcc += dtReal; fpsCount++;
      if (fpsAcc >= 0.5) { fps = fpsCount / fpsAcc; fpsAcc = 0; fpsCount = 0; }

      // 加载遮罩覆盖整屏时不重复绘制底下的菜单，把主线程留给图片准备。
      if (!booting) render(acc / STEP);
    } catch (err) {
      var w = app.world;
      app.runtimeFault = {
        message: String(err && err.message || err), stack: String(err && err.stack || ''),
        scene: app.scene, level: w && w.match ? w.match.level : null,
        characters: w ? w.players.map(function (p) { return p.assetId; }) : [],
        time: w ? w.time : 0
      };
      app.errors.push(app.runtimeFault);
      if (app.errors.length > 8) app.errors.shift();
      if (window.console) console.error('[游戏异常]', app.runtimeFault);
      app.paused = true; app.pause = BI.pause.create(); app.pause.appear = 1; app.pause.index = 1;
      app.pause.title = '运行已暂停';
      app.pause.info = '遇到运行异常，可重开本局或返回菜单';
      acc = 0; BI.input.clear(); BI.input.endMouseFrame();
      // 抛错可能打断 canvas 的 save/restore，重置画布后单独绘制可操作菜单。
      resize(); renderFault();
    } finally {
      requestAnimationFrame(frame);
    }
  }

  /* ============================================================
   * 生命周期
   * ============================================================ */
  function togglePause() {
    app.paused = !app.paused;
    if (!app.paused) app.runtimeFault = null;
    if (app.paused) {
      app.pause = BI.pause.create();
      BI.sfx.play('pause');
    } else {
      app.pause = null;
      BI.sfx.play('menuMove');
    }
    BI.input.clear();
  }

  /** 暂停菜单里选了什么 */
  function handlePauseAction(action) {
    if (!action || action === 'resume') { togglePause(); return; }
    if (action === 'restart') {
      // 重开本局：用同一份配置重新造世界（关卡数也会回到第 1 关）
      if (app.config) startGame(app.config); else gotoMenu();
      return;
    }
    if (action === 'menu') gotoMenu();
  }

  /** 暂停菜单顶部那行小字：让玩家知道自己暂停在哪 */
  function pauseInfo() {
    var w = app.world;
    if (!w) return '';
    if (w.mode === 'adventure') {
      return '第 ' + w.match.level + ' 关　·　剩余敌人 ' + MA.countEnemies(w);
    }
    if (w.mode === 'dig') {
      return '剩余障碍 ' + MA.countBricks(w.map) + '　·　剩余时间 ' + HUD.mmss(w.match.remaining);
    }
    return w.match.scores.p1 + ' : ' + w.match.scores.p2 +
           '　·　第 ' + w.match.round + ' 回合';
  }

  function startGame(cfg) {
    if (bootEl && BI.assets.loading.done < BI.assets.loading.total) {
      if (booting) return;
      pendingGame = cfg; bootPhase = 'game'; booting = true;
      document.body.appendChild(bootEl);
      BI.assets.loadBackground();
      updateLoading();
      return;
    }
    app.runtimeFault = null;
    app.config = cfg;
    app.world = createWorld(cfg);
    app.scene = 'playing';
    app.paused = false;
    app.pause = null;
    app.endAt = 0;
    acc = 0;
    FX.reset();
    BI.sfx.unlock();          // 走到这儿说明已经有过交互（点菜单），可以开声音了
    BI.input.clear();
    BI.input.endMouseFrame();
  }

  function gotoMenu() {
    app.runtimeFault = null;
    app.scene = 'menu';
    app.world = null;
    app.result = null;
    app.paused = false;
    app.pause = null;
    app.endAt = 0;
    FX.reset();
    BI.input.clear();
  }

  function updateLoading() {
    if (!booting) return;
    var progress = bootPhase === 'menu' ? BI.assets.menuLoading : BI.assets.loading;
    if (window.BombItBoot) window.BombItBoot.resources(progress.done, progress.total, bootPhase);
    if (progress.done !== progress.total || !progress.total || bootFinishing) return;
    bootFinishing = true;
    // 保留完整的一帧 100% 进度；先绘制完整菜单，再启动后台请求。
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      booting = false; bootFinishing = false; acc = 0;
      if (bootEl.parentNode) bootEl.parentNode.removeChild(bootEl);
      BI.input.clear(); BI.input.endMouseFrame();
      if (pendingGame) {
        var cfg = pendingGame; pendingGame = null;
        startGame(cfg);
      }
      render(0);
      if (window.performance && performance.mark) performance.mark('bombit-' + bootPhase + '-ready');
      BI.assets.loadBackground();
      if (MUSIC) syncMusic();
    }); });
  }

  function boot() {
    resize();
    window.addEventListener('resize', resize);

    BI.input.init();
    BI.input.initMouse(canvas, CFG.VIEW_W, CFG.VIEW_H);
    BI.input.onBlur = function () { if (app.scene === 'playing') app.paused = true; };

    /* 音频解锁：浏览器要求音频必须在用户第一次交互之后才能「出声」，
       AudioContext 会一直 suspended、<audio>.play() 会被拒绝。
       这里挂监听，音效和音乐一起放行；音乐要是还没真的响起来就继续监听，
       下一次点击 / 按键再补一次，直到确实出声为止。 */
    function unlockAudio() {
      var sfxReady = BI.sfx.unlock();
      if (MUSIC) MUSIC.unlock();
      if (sfxReady && !(MUSIC && MUSIC.waiting())) {
        window.removeEventListener('keydown', unlockAudio);
        window.removeEventListener('mousedown', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
      }
    }
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('mousedown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    BI.assets.onProgress = updateLoading;
    BI.assets.init({ menuFirst: booting });
    // 壁纸属于菜单必需资源；文件缺失时结清进度并回退渐变背景。
    BI.assets.loadWallpaper(CFG.VIEW_W, CFG.VIEW_H, window.devicePixelRatio || 1);
    updateLoading();
    app.menu = BI.menu.create();
    if (!booting) {
      render(0);
      if (MUSIC) syncMusic();
    }

    requestAnimationFrame(frame);

    /* 调试入口：控制台里可以直接摸到状态，也方便自动化测试 */
    BI.debug = {
      get app() { return app; },
      get world() { return app.world; },
      get scene() { return app.scene; },

      startGame: startGame,
      gotoMenu: gotoMenu,
      startLevel: function (level) {
        if (!app.world || app.world.mode !== 'adventure') startGame({ mode: 'adventure', inputMode: 'solo', label: '单人 · 闯关打怪', chars: [null, null] });
        app.world.match.level = level; app.world.match.levelClearAt = 0;
        startNextLevel(app.world); return app.world;
      },
      togglePause: togglePause,
      render: function (a) { render(a == null ? 1 : a); },

      /** 用指定配置开局（自动化测试用） */
      quickStart: function (mode, seed) {
        var inputMode = (mode === 'versus') ? 'versus' : 'solo';
        var labels = {
          dig: '单人 · 计时拆砖',
          versus: '双人 · 同屏对战',
          adventure: '单人 · 闯关打怪'
        };
        startGame({ mode: mode, inputMode: inputMode, label: labels[mode] || mode, chars: [null, null], seed: seed });
        return app.world;
      },

      /** 手动推进 n 秒逻辑（不依赖 rAF；headless 下必须用它） */
      tick: function (seconds) {
        var n = Math.max(1, Math.round((seconds || 1) / STEP));
        for (var i = 0; i < n; i++) {
          update(STEP);
          BI.input.endFrame();
          BI.input.endMouseFrame();
        }
        return app.scene;
      },

      press: function (code, holdSeconds) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: code }));
        this.tick(holdSeconds || 1 / 60);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: code }));
      },

      hold: function (code, seconds) {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: code }));
        this.tick(seconds);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: code }));
      },

      snapshot: function () {
        var w = app.world;
        if (!w) return { scene: app.scene, world: null };
        return {
          scene: app.scene,
          mode: w.mode,
          theme: w.theme,
          time: +w.time.toFixed(2),
          paused: app.paused,
          seed: w.seedText,
          bombs: w.bombs.length,
          flames: w.flames.length,
          items: w.items.length,
          enemies: MA.countEnemies(w),
          dangerReady: !!w.danger,
          bricksLeft: MA.countBricks(w.map),
          stats: w.stats,
          match: {
            over: w.match.over,
            winner: w.match.winner,
            title: w.match.title,
            remaining: +w.match.remaining.toFixed(1),
            scores: w.match.scores,
            round: w.match.round,
            level: w.match.level,
            levelClearAt: +w.match.levelClearAt.toFixed(2)
          },
          players: w.players.map(function (p) {
            return {
              id: p.id, x: +p.x.toFixed(1), y: +p.y.toFixed(1),
              col: G.col(p.x), row: G.row(p.y),
              alive: p.alive, lives: p.lives,
              power: p.power, maxBombs: p.maxBombs,
              speed: +(1 + p.speedBonus).toFixed(2), shield: p.shield,
              starTime: +(p.starTime || 0).toFixed(1)
            };
          })
        };
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window.BI = window.BI || {});
