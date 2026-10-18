/* ============================================================
 * hud.js —— 顶部状态栏、悬浮计时、技能条与关前介绍
 *
 * 视觉：BOMBIT Motion UI。深墨色报头 + 奶油硬边信息卡 + 印刷编号。
 * 交互/信息优先级不变：模式、真实键位、玩家成长、生命、倒计时。
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, D = BI.draw, C = CFG.C, U = BI.ui;

  var MODE_TITLE = {
    dig: '计时拆砖',
    versus: '同屏对战',
    adventure: '闯关打怪'
  };

  var MODE_META = {
    dig: { no: '02', title: '计时拆砖', en: 'TIME ATTACK', color: U.C.cyan, tag: 'TIME' },
    versus: { no: '03', title: '同屏对战', en: 'LOCAL VERSUS', color: U.C.pink, tag: 'SCORE' },
    adventure: { no: '01', title: '闯关打怪', en: 'ADVENTURE', color: U.C.green, tag: 'STAGE' }
  };

  function modeMeta(world) {
    return MODE_META[world.mode] || { no: '00', title: '对局', en: 'BATTLE', color: U.C.yellow, tag: 'PLAY' };
  }

  // 关前档案的版面与开始按钮命中区：渲染、输入与测试共用同一套数字，
  // 卡片收窄后字号反而放大，避免“小窗套小字”。
  var BRIEF_CARD = { x: 56, y: 72, w: 608, h: 552 };
  var BRIEF_HEADER = 74;
  var BRIEF_BTN = { x: 230, y: 530, w: 260, h: 46 };

  function keyHint(world) {
    if (world.inputMode === 'versus') {
      return '1P：' + dirText(world, 'p1') + ' + Enter 放弹　　' +
             '2P：' + dirText(world, 'p2') + ' + 空格 放弹';
    }
    return dirText(world, 'p1') + ' 移动　·　空格 放炸弹';
  }

  // 一个动作可能绑多套键位（单人：方向键 + WASD），提示要把它们都报出来，
  // 否则玩家按 WASD 走动了、HUD 却只写“方向键”，会以为游戏串键。
  var DIR_LABEL = { ArrowUp: '方向键', KeyW: 'WASD', KeyI: 'IJKL' };

  function dirText(world, key) {
    var km = BI.input.map(world.inputMode, world.altKeys);
    var codes = BI.input.codes(km[key].up), labels = [];
    for (var i = 0; i < codes.length; i++) {
      var label = DIR_LABEL[codes[i]];
      if (label && labels.indexOf(label) < 0) labels.push(label);
    }
    return labels.length ? labels.join(' / ') : '方向键';
  }

  /** 秒 -> "2:35" */
  function mmss(sec) {
    sec = Math.max(0, sec);
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function heartRow(ctx, x, y, count, size) {
    for (var i = 0; i < count; i++) {
      hud.heart(ctx, x - i * (size + 2), y, size);
    }
  }

  function statGroup(ctx, type, x, y, value, color, iconSize, font) {
    BI.sprites.drawItemIcon(ctx, type, x, y, iconSize || 16);
    U.text(ctx, value, x + (iconSize || 16) * .58 + 3, y, {
      size: font || 9.5, weight: 900, family: U.F.mono, fill: color || U.C.ink
    });
  }

  var hud = BI.hud = {

    mmss: mmss,

    briefingStart: BRIEF_BTN,

    /* ============================================================
     * 顶部 HUD
     * ============================================================ */
    draw: function (ctx, world, info) {
      var W = CFG.VIEW_W, H = CFG.HUD_H;
      var meta = modeMeta(world);

      // 深墨底 + 网点 + 底边
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(0, 0, W, H);
      U.dots(ctx, 0, 0, W, H, U.C.cream, .045, 14);
      ctx.fillStyle = meta.color;
      ctx.fillRect(0, 0, 5, H);
      ctx.fillStyle = U.C.cream;
      ctx.fillRect(0, H - 1, W, 1);
      ctx.fillStyle = 'rgba(245,235,216,.14)';
      ctx.fillRect(0, 0, W, 1);

      // 背景大号模式编号
      U.text(ctx, meta.no, 304, 59, {
        size: 98, weight: 900, family: U.F.impact, fill: 'rgba(245,235,216,0)',
        stroke: 'rgba(245,235,216,.055)', strokeWidth: 1.3, align: 'center'
      });

      // 左：模式 / 真实键位
      U.text(ctx, 'MODE ' + meta.no + '  /  ' + meta.en, 16, 12, {
        size: 6.5, weight: 700, family: U.F.mono, fill: U.C.cream, alpha: .52
      });
      U.text(ctx, meta.title, 14, 31, {
        size: 20, weight: 900, family: U.F.cn, fill: U.C.cream
      });
      ctx.fillStyle = meta.color;
      ctx.fillRect(16, 42, 22, 2);
      if (world.inputMode === 'versus') {
        D.text(ctx, '1P：' + dirText(world, 'p1') + ' 移动 · Enter 放弹', 16, 50, {
          font: '8.8px "Microsoft YaHei", sans-serif', fill: 'rgba(245,235,216,.7)', baseline: 'middle'
        });
        D.text(ctx, '2P：' + dirText(world, 'p2') + ' 移动 · 空格 放弹', 16, 62, {
          font: '8.8px "Microsoft YaHei", sans-serif', fill: 'rgba(245,235,216,.7)', baseline: 'middle'
        });
      } else {
        // 关键：测试会 patch D.text 来确认 HUD 真的报出了两套移动键
        D.text(ctx, keyHint(world), 16, 52, {
          font: '9.2px "Microsoft YaHei", sans-serif', fill: 'rgba(245,235,216,.7)',
          baseline: 'middle'
        });
        D.text(ctx, 'Esc 暂停　·　M 静音　·　Tab 备用键', 16, 64, {
          font: '7px Consolas, monospace', fill: 'rgba(245,235,216,.36)', baseline: 'middle'
        });
      }

      // 右：玩家状态卡；从右往左排
      var right = W - 12;
      for (var i = world.players.length - 1; i >= 0; i--) {
        var p = world.players[i];
        hud.chip(ctx, p, right, H, world);
      }
    },

    /* ============================================================
     * 玩家状态卡
     * ============================================================ */
    chip: function (ctx, p, right, H, world) {
      var versus = world.mode === 'versus';
      var w = versus ? 352 : 350;
      var h = versus ? 28 : 54;
      var x = right - w;
      var y = versus ? (p.id === 'p1' ? 4 : 37) : 9;
      var color = p.color || (p.id === 'p2' ? U.C.pink : U.C.cyan);
      var cy = y + h / 2;

      U.panel(ctx, x, y, w, h, {
        fill: U.C.cream, stroke: U.C.ink, lw: 1.8, r: 4,
        shadow: color, shadowX: 3, shadowY: 3
      });

      // 左侧玩家色标签
      ctx.save();
      D.roundRect(ctx, x, y, w, h, 4);
      ctx.clip();
      ctx.fillStyle = color;
      ctx.fillRect(x, y, versus ? 32 : 36, h);
      ctx.strokeStyle = U.C.ink;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + (versus ? 32 : 36), y);
      ctx.lineTo(x + (versus ? 32 : 36), y + h);
      ctx.stroke();
      ctx.restore();
      U.text(ctx, (p.id || 'p1').toUpperCase(), x + (versus ? 16 : 18), cy, {
        size: versus ? 8.5 : 10, weight: 900, family: U.F.impact, fill: U.C.ink, align: 'center'
      });

      var name = p.charName || p.name || '精灵';
      var hearts = versus ? (p.alive ? 1 : 0) : BI.rules.lifeCount(p);
      var dim = p.alive ? 1 : .48;
      ctx.save();
      ctx.globalAlpha = dim;

      if (versus) {
        U.text(ctx, name, x + 39, y + 14, {
          size: 9.5, weight: 900, family: U.F.cn, fill: U.C.ink
        });
        var sy = y + 14;
        statGroup(ctx, 'fire', x + 106, sy, String(p.power), U.C.ink, 14, 8.5);
        statGroup(ctx, 'bomb', x + 147, sy, String(p.maxBombs), U.C.ink, 14, 8.5);
        statGroup(ctx, 'speed', x + 188, sy, '×' + (1 + p.speedBonus).toFixed(1), U.C.ink, 14, 8);
        var ix = x + 246;
        if (p.glove) { BI.sprites.drawItemIcon(ctx, 'glove', ix, sy, 15); ix += 22; }
        if (p.shield > 0) { BI.sprites.drawItemIcon(ctx, 'shield', ix, sy, 17); ix += 24; }
        if (p.starTime > 0) { BI.sprites.drawItemIcon(ctx, 'star', ix, sy, 17); ix += 22; }
        if (p.alive) {
          hud.heart(ctx, x + w - 13, sy, 12);
        } else {
          U.text(ctx, '重生中', x + w - 9, sy, {
            size: 6, weight: 700, family: U.F.cn, fill: U.C.ink, align: 'right', alpha: .55
          });
        }
      } else {
        U.text(ctx, name, x + 45, y + 17, {
          size: 12, weight: 900, family: U.F.cn, fill: U.C.ink
        });
        var hy = y + 17;
        if (hearts > 0) heartRow(ctx, x + w - 17, hy, hearts, 11);

        var ry = y + 40;
        statGroup(ctx, 'fire', x + 47, ry, String(p.power), U.C.ink, 17, 10);
        statGroup(ctx, 'bomb', x + 107, ry, String(p.maxBombs), U.C.ink, 17, 10);
        statGroup(ctx, 'speed', x + 167, ry, '×' + (1 + p.speedBonus).toFixed(1), U.C.ink, 17, 9);
        var sx = x + 238;
        if (p.glove) { BI.sprites.drawItemIcon(ctx, 'glove', sx, ry, 17); sx += 26; }
        if (p.shield > 0) { BI.sprites.drawItemIcon(ctx, 'shield', sx, ry, 18); sx += 26; }
        if (p.starTime > 0) {
          BI.sprites.drawItemIcon(ctx, 'star', sx, ry, 18);
          U.text(ctx, p.starTime.toFixed(1) + 's', sx + 13, ry, {
            size: 6.5, weight: 700, family: U.F.mono, fill: U.C.ink, alpha: .65
          });
        }
      }
      ctx.restore();
      return w;
    },

    /* ============================================================
     * 底部技能卡
     * ============================================================ */
    drawSkills: function (ctx, world) {
      world.players.forEach(function (p) {
        var info = BI.skills.info(p), km = BI.input.map(world.inputMode, world.altKeys);
        var code = km[p.keyId].skill;
        var key = info.passive ? '被动' : (code === 'ShiftRight' ? '右Shift' : code.replace('Key', ''));
        var w = info.passive ? 192 : 204;
        var height = info.passive ? 42 : 36;
        var x = p.keyId === 'p2' ? CFG.FIELD_W - w - 10 : 10;
        var y = CFG.FIELD_H - height - 8;
        var ready = p.alive && !(p.skillCd > 0);
        var col = info.color || U.C.cyan;
        var keyW = info.passive ? 44 : (code === 'ShiftRight' ? 50 : 34);

        U.panel(ctx, x, y, w, height, {
          fill: U.C.cream, stroke: U.C.ink, lw: 1.8, r: 3,
          shadow: col, shadowX: 3, shadowY: 3
        });
        U.dots(ctx, x, y, w, height, U.C.ink, .055, 10);

        U.keycap(ctx, key, x + 7, y + (info.passive ? 7 : 7), keyW, 18,
          ready ? col : '#9A8C7A', U.C.ink);
        U.text(ctx, info.name, x + keyW + 16, y + 15, {
          size: info.passive ? 10.5 : 10, weight: 900, family: U.F.cn, fill: U.C.ink
        });
        var state = info.passive && p.alive
          ? (p.soulEvolved ? '已通灵' : '通灵')
          : (ready ? '就绪' : (p.alive ? Math.ceil(p.skillCd || 0) + 's' : '等待'));
        U.text(ctx, state, x + w - 10, y + 14, {
          size: 6.5, weight: 700, family: U.F.mono,
          fill: ready ? U.C.ink : U.C.orange, align: 'right', alpha: ready ? .7 : 1
        });

        if (info.passive) {
          var barX = x + 8, barY = y + 30, barW = w - 16;
          D.blob(ctx, barX, barY, barW, 5, 2.5, '#45586B', null);
          var progress = Math.min(1, (p.soulBombs || 0) / info.bombsToEvolve);
          if (progress > 0) {
            D.blob(ctx, barX, barY, barW * progress, 5, 2.5,
              p.soulEvolved ? U.C.yellow : col, null);
          }
          ctx.fillStyle = U.C.ink;
          for (var seg = 1; seg < info.bombsToEvolve; seg++) {
            ctx.fillRect(barX + barW * seg / info.bombsToEvolve - 1, barY - 1, 2, 7);
          }
        } else {
          ctx.fillStyle = 'rgba(20,16,25,.14)';
          ctx.fillRect(x + 8, y + height - 6, w - 16, 3);
          if (p.skillCd > 0) {
            ctx.fillStyle = col;
            ctx.fillRect(x + 8, y + height - 6,
              (w - 16) * Math.max(0, 1 - p.skillCd / info.cd), 3);
          } else {
            ctx.fillStyle = ready ? col : 'rgba(20,16,25,.2)';
            ctx.fillRect(x + 8, y + height - 6, w - 16, 3);
          }
        }
        if (!p.alive) {
          ctx.save();
          ctx.globalAlpha = .42;
          U.panel(ctx, x, y, w, height, { fill: U.C.paper, stroke: U.C.ink, lw: 1.5, r: 3 });
          ctx.restore();
        }
      });
    },

    /* ============================================================
     * 战场顶部悬浮信息 / BOSS 血条 / 回合提示
     * ============================================================ */
    drawFloating: function (ctx, world, time) {
      var m = world.match;
      if (!m) return;

      if (world.map.bossBattle) {
        var boss = world.enemies.filter(function (e) { return e.type === 'boss'; })[0];
        var hp = boss && boss.alive ? boss.hp : 0;
        var maxHp = boss ? boss.maxHp : BI.entities.TYPES.boss.hp;
        var phase = BI.entities.bossStage(boss);
        var color = phase ? phase.color : U.C.pink;
        var x = 208, y = 6, w = 304, h = 43;
        U.panel(ctx, x, y, w, h, {
          fill: U.C.cream, stroke: U.C.ink, lw: 2, r: 3,
          shadow: color, shadowX: 4, shadowY: 4
        });
        U.dots(ctx, x, y, w, h, U.C.ink, .06, 11);
        U.tag(ctx, 'BOSS', x + 10, y + 14, {
          size: 6, family: U.F.mono, fill: color, fg: U.C.ink,
          padX: 5, h: 12, align: 'left', stroke: U.C.ink, lw: 1
        });
        var label = hp > 0 ? ['', '一 · 试探', '二 · 认真', '三 · 暴走'][phase.id] : '已击败';
        U.text(ctx, '鲁鲁旦 · ' + label + (m.level === CFG.ADVENTURE_LEVELS ? ' · 最终战' : ''),
          x + 56, y + 13, {
            size: 7.5, weight: 900, family: U.F.cn, fill: U.C.ink
          });
        U.text(ctx, hp + ' / ' + maxHp, x + w - 10, y + 13, {
          size: 7, weight: 700, family: U.F.mono, fill: U.C.ink, align: 'right'
        });
        var segs = Math.min(maxHp, 12);
        var segW = (w - 20) / segs;
        for (var i = 0; i < segs; i++) {
          var on = i < Math.ceil(hp / maxHp * segs);
          ctx.fillStyle = on ? color : 'rgba(20,16,25,.14)';
          ctx.fillRect(x + 10 + i * segW, y + 29, segW - 2, 7);
        }
        return;
      }

      var label, sub = '', warn = false, tag = 'TIME', color = U.C.cyan;
      if (m.mode === 'dig') {
        label = mmss(m.remaining);
        warn = m.remaining <= 20 && !m.over;
        sub = '剩余障碍 ' + BI.match.countBricks(world.map);
        tag = 'TIME'; color = U.C.cyan;
      } else if (m.mode === 'adventure') {
        var left = BI.match.countEnemies(world);
        label = '第 ' + m.level + ' / ' + CFG.ADVENTURE_LEVELS + ' 关';
        if (m.levelClearAt > 0) { sub = '关卡完成 · 即将进入下一关'; warn = false; }
        else sub = '剩余敌人 ' + left;
        warn = (left > 0 && left <= 2);
        tag = 'STAGE'; color = U.C.green;
      } else {
        label = m.scores.p1 + ' : ' + m.scores.p2;
        if (m.sudden) { sub = '加速决胜'; warn = true; }
        else sub = '第 ' + m.round + ' 回合　先得 ' + m.targetScore + ' 分';
        tag = 'SCORE'; color = U.C.pink;
      }

      var numberSize = m.mode === 'dig' ? 26 : (m.mode === 'versus' ? 27 : 18);
      var numberFamily = m.mode === 'adventure' ? U.F.cn : U.F.impact;
      var numberWeight = 900;
      var lw = U.measure(ctx, label, numberSize, numberWeight, numberFamily);
      var sw = U.measure(ctx, sub, 8, 500, U.F.cn);
      var w = Math.max(lw, sw) + 100;
      var h = sub ? 54 : 40;
      var x = CFG.FIELD_W / 2 - w / 2;
      var y = 5;

      U.panel(ctx, x, y, w, h, {
        fill: U.C.cream,
        stroke: U.C.ink, lw: 2, r: 3,
        shadow: warn ? U.C.orange : color, shadowX: 4, shadowY: 4
      });
      U.dots(ctx, x, y, w, h, U.C.ink, .055, 11);
      U.tag(ctx, tag, x + 10, y + 13, {
        size: 6, family: U.F.mono, fill: warn ? U.C.orange : color, fg: U.C.ink,
        padX: 5, h: 12, align: 'left', stroke: U.C.ink, lw: 1
      });
      // 白字墨底小牌：保持奶油外框的轻，同时保证数字有最强对比
      var plateW = Math.min(w - 18, Math.max(lw + 22, 92));
      var plateH = sub ? 25 : 25;
      var plateX = CFG.FIELD_W / 2 + 8 - plateW / 2;
      var plateY = y + (sub ? 10 : (h - plateH) / 2);
      U.panel(ctx, plateX, plateY, plateW, plateH, {
        fill: U.C.ink, stroke: null, r: 2
      });
      var labelColor = warn ? '#ff7a6b' : '#ffffff';
      U.text(ctx, label, CFG.FIELD_W / 2 + 8, y + (sub ? 22 : h / 2), {
        size: numberSize, weight: numberWeight, family: numberFamily,
        fill: labelColor, align: 'center', baseline: 'middle'
      });
      if (sub) {
        // 危险提示只换颜色，不做闪烁：小字一直亮着，读数才不费眼。
        var subColor = warn ? U.C.orange : 'rgba(20,16,25,.62)';
        U.text(ctx, sub, CFG.FIELD_W / 2 + 8, y + 42, {
          size: 8, weight: warn ? 700 : 500, family: U.F.cn, fill: subColor, align: 'center'
        });
      }

      // 回合间隔：整块墨色记分板
      if (m.mode === 'versus' && m.roundEndsAt > 0 && !m.over) {
        var leftTime = Math.max(0, m.roundEndsAt - world.time);
        ctx.save();
        ctx.globalAlpha = .88;
        ctx.fillStyle = U.C.ink;
        ctx.fillRect(0, CFG.FIELD_H / 2 - 58, CFG.FIELD_W, 116);
        ctx.globalAlpha = 1;
        ctx.fillStyle = U.C.orange;
        ctx.fillRect(0, CFG.FIELD_H / 2 - 58, CFG.FIELD_W, 4);
        ctx.fillStyle = U.C.cyan;
        ctx.fillRect(0, CFG.FIELD_H / 2 + 54, CFG.FIELD_W, 4);
        U.dots(ctx, 0, CFG.FIELD_H / 2 - 54, CFG.FIELD_W, 108, U.C.cream, .05, 14);
        var who = m.scores.p1 > m.scores.p2 ? '1P' : (m.scores.p2 > m.scores.p1 ? '2P' : '');
        U.tag(ctx, 'ROUND ' + m.round, CFG.FIELD_W / 2, CFG.FIELD_H / 2 - 38, {
          size: 6, family: U.F.mono, fill: who ? U.C.yellow : U.C.cream, fg: U.C.ink,
          padX: 6, h: 13, align: 'center', stroke: U.C.ink, lw: 1
        });
        U.text(ctx, who ? (who + ' 得分！') : '本回合结束', CFG.FIELD_W / 2, CFG.FIELD_H / 2 - 8, {
          size: 30, weight: 900, family: U.F.cn, fill: U.C.cream, align: 'center'
        });
        U.text(ctx, leftTime.toFixed(1) + ' 秒后进入下一回合', CFG.FIELD_W / 2, CFG.FIELD_H / 2 + 27, {
          size: 9, weight: 500, family: U.F.cn, fill: 'rgba(245,235,216,.68)', align: 'center'
        });
        ctx.restore();
      }
    },

    heart: function (ctx, x, y, size) {
      U.heart(ctx, x, y, size, '#FF839B', U.C.ink);
    },

    /* ============================================================
     * 关前介绍：整张“敌情档案”海报
     * ============================================================ */
    drawBriefing: function (ctx, world) {
      var b = world.briefing, fresh = b.fresh.length > 0;
      var ids = fresh ? b.fresh : b.types;
      var selected = BI.entities.TYPES[ids[0]];
      var theme = BI.THEMES[world.theme] || BI.THEMES.forest;
      var W = CFG.VIEW_W, H = CFG.VIEW_H;
      var card = BRIEF_CARD;
      var btn = hud.briefingStart;
      var bx = btn.x, by = btn.y, bw = btn.w, bh = btn.h;

      ctx.save();
      ctx.fillStyle = 'rgba(20,16,25,.84)';
      ctx.fillRect(0, 0, W, H);
      U.dots(ctx, 0, 0, W, H, U.C.cream, .035, 16);

      U.panel(ctx, card.x, card.y, card.w, card.h, {
        fill: U.C.cream, stroke: U.C.ink, lw: 3, r: 5,
        shadow: U.C.orange, shadowX: 7, shadowY: 7
      });

      // 顶部黑色刊头
      ctx.save();
      D.roundRect(ctx, card.x, card.y, card.w, card.h, 5);
      ctx.clip();
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(card.x, card.y, card.w, BRIEF_HEADER);
      U.dots(ctx, card.x, card.y, card.w, BRIEF_HEADER, U.C.cream, .055, 13);
      ctx.restore();
      U.text(ctx, 'STAGE ' + pad2(world.match.level) + ' / ' + CFG.ADVENTURE_LEVELS +
        (world.match.level === CFG.ADVENTURE_LEVELS ? '  ·  FINAL' : ''), card.x + 22, card.y + 18, {
        size: 7.6, weight: 700, family: U.F.mono, fill: U.C.cyan
      });
      U.text(ctx, theme.name + (world.map.bossBattle ? ' · BOSS 战' : ''), card.x + 22, card.y + 42, {
        size: 26, weight: 900, family: U.F.cn, fill: U.C.cream
      });
      U.text(ctx, theme.subtitle, card.x + 22, card.y + 61, {
        size: 8.6, weight: 500, family: U.F.cn, fill: 'rgba(245,235,216,.6)'
      });
      U.tag(ctx, world.map.bossBattle ? 'BOSS' : (fresh ? 'NEW ENEMY' : 'REMINDER'),
        card.x + card.w - 22, card.y + 24, {
          size: 7.2, family: U.F.mono, fill: world.map.bossBattle ? U.C.hot : U.C.yellow,
          fg: U.C.ink, padX: 7, h: 15, align: 'right', stroke: U.C.ink, lw: 1
        });
      U.text(ctx, pad2(world.match.level), card.x + card.w - 22, card.y + 58, {
        size: 50, weight: 900, family: U.F.impact, fill: 'rgba(245,235,216,0)',
        stroke: 'rgba(245,235,216,.13)', strokeWidth: 1.2, align: 'right'
      });

      // 左侧敌人立绘块：深色档案卡 + 奶油圆形舞台
      var ax = card.x + 22, ay = card.y + 88, aw = 204, ah = 256;
      U.panel(ctx, ax, ay, aw, ah, {
        fill: theme.sky, stroke: U.C.ink, lw: 2, r: 4,
        shadow: U.C.ink, shadowX: 4, shadowY: 4
      });
      ctx.save();
      D.roundRect(ctx, ax, ay, aw, ah, 4);
      ctx.clip();
      U.dots(ctx, ax, ay, aw, ah, U.C.cream, .075, 12);
      ctx.fillStyle = U.C.cream;
      ctx.beginPath();
      ctx.arc(ax + aw / 2, ay + 136, 82, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = U.C.ink;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = U.C.orange;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ax + aw / 2, ay + 136, 88, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = U.C.ink;
      ctx.fillRect(ax, ay + ah - 42, aw, 42);
      ctx.restore();

      if (selected) {
        var e = {
          type: selected.id, color: selected.color, dark: selected.dark,
          x: 0, px: 0, y: 0, py: 0, alive: true, maxHp: selected.hp, hp: selected.hp, facing: 1
        };
        // 立绘脚底对齐标签条上沿：先按脚底定位，再反推锚点，
        // 避免缩放变化后怪图下沉压住名字（drawEnemy 内部还有 16px 脚底偏移）。
        var spriteScale = selected.id === 'boss' ? 1.85 : 2.55;
        var feetY = ay + ah - 36;
        ctx.save();
        ctx.translate(ax + aw / 2, feetY - 16.5 * spriteScale);
        ctx.scale(spriteScale, spriteScale);
        BI.sprites.drawEnemy(ctx, e, world.time, 1);
        ctx.restore();
        U.tag(ctx, fresh ? '初次登场' : '本关提醒', ax + 12, ay + 15, {
          size: 7.2, family: U.F.cn, fill: U.C.yellow, fg: U.C.ink,
          padX: 6, h: 15, align: 'left', stroke: U.C.ink, lw: 1
        });
        U.text(ctx, selected.name, ax + 12, ay + ah - 15, {
          size: 17.5, weight: 900, family: U.F.cn, fill: U.C.cream
        });
        U.text(ctx, 'ENEMY FILE  /  ' + (world.map.bossBattle ? 'BOSS' : 'NPC'), ax + aw - 12, ay + ah - 16, {
          size: 6.2, weight: 700, family: U.F.mono, fill: 'rgba(245,235,216,.55)', align: 'right'
        });
      }

      // 右侧档案文字
      var tx = ax + aw + 22, tw = card.x + card.w - 22 - tx;
      U.text(ctx, '敌情档案 / THREAT PROFILE', tx, ay + 7, {
        size: 7.6, weight: 700, family: U.F.mono, fill: U.C.ink, alpha: .45
      });
      if (selected) {
        U.text(ctx, (fresh ? '初次登场  ' : '本关提醒  ') + selected.name, tx, ay + 30, {
          size: 21, weight: 900, family: U.F.cn, fill: U.C.ink,
          shadow: U.C.yellow, shadowX: 2, shadowY: 2
        });
        wrapText(ctx, selected.story, tx, ay + 54, tw, 10.4, 14, 'rgba(20,16,25,.7)', 3, 500, U.F.cn);

        ctx.strokeStyle = 'rgba(20,16,25,.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(tx, ay + 102);
        ctx.lineTo(tx + tw, ay + 102);
        ctx.stroke();

        U.tag(ctx, '行动', tx, ay + 118, {
          size: 7.6, family: U.F.cn, fill: U.C.green, fg: U.C.ink,
          padX: 6, h: 15, align: 'left', stroke: U.C.ink, lw: 1
        });
        wrapText(ctx, selected.mechanic, tx + 42, ay + 118, tw - 42, 9.8, 12.5, 'rgba(20,16,25,.78)', 2, 500, U.F.cn);

        U.tag(ctx, '攻击', tx, ay + 172, {
          size: 7.6, family: U.F.cn, fill: U.C.orange, fg: U.C.ink,
          padX: 6, h: 15, align: 'left', stroke: U.C.ink, lw: 1
        });
        wrapText(ctx, selected.damage, tx + 42, ay + 172, tw - 42, 9.8, 12.5, 'rgba(20,16,25,.78)', 2, 500, U.F.cn);

        // HP 计线条，填满档案右侧的下半区
        var hpx = tx, hpy = ay + 212, hpw = tw, hph = 40;
        U.panel(ctx, hpx, hpy, hpw, hph, {
          fill: U.C.ink, stroke: U.C.ink, lw: 1.5, r: 2
        });
        U.text(ctx, '生命 / HP', hpx + 12, hpy + 12, {
          size: 7, weight: 700, family: U.F.mono, fill: 'rgba(245,235,216,.55)'
        });
        U.text(ctx, String(selected.hp), hpx + hpw - 12, hpy + 12, {
          size: 8, weight: 900, family: U.F.mono, fill: U.C.yellow, align: 'right'
        });
        var maxPips = Math.min(8, Math.max(1, selected.hp));
        for (var hp = 0; hp < maxPips; hp++) {
          ctx.fillStyle = U.C.orange;
          ctx.fillRect(hpx + 12 + hp * ((hpw - 24) / maxPips), hpy + 23, (hpw - 24) / maxPips - 3, 7);
        }
      }

      // 底部任务条：把原先散落的说明收进一张黑色 mission 卡
      var mx = card.x + 22, my = card.y + 358, mw = card.w - 44, mh = 84;
      U.panel(ctx, mx, my, mw, mh, {
        fill: U.C.ink, stroke: U.C.ink, lw: 1.5, r: 3
      });
      ctx.fillStyle = U.C.orange;
      ctx.fillRect(mx, my, mw, 3);
      U.dots(ctx, mx, my, mw, mh, U.C.cream, .045, 12);
      var c1 = mx + 16, c2 = mx + 206, c3 = mx + 390;
      ctx.strokeStyle = 'rgba(245,235,216,.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(c2 - 14, my + 12);
      ctx.lineTo(c2 - 14, my + mh - 12);
      ctx.moveTo(c3 - 14, my + 12);
      ctx.lineTo(c3 - 14, my + mh - 12);
      ctx.stroke();

      U.text(ctx, '本关阵容 / SQUAD', c1, my + 16, {
        size: 6.8, weight: 700, family: U.F.mono, fill: U.C.cyan
      });
      wrapText(ctx, b.types.map(function (id) { return BI.entities.TYPES[id].name; }).join(' / '),
        c1, my + 35, 160, 9.4, 11.5, U.C.cream, 2, 700, U.F.cn);
      U.text(ctx, '共 ' + world.enemies.length + ' 只', c1, my + 70, {
        size: 7.8, weight: 700, family: U.F.mono, fill: U.C.yellow
      });

      U.text(ctx, '场景机制 / STAGE RULE', c2, my + 16, {
        size: 6.8, weight: 700, family: U.F.mono, fill: U.C.green
      });
      U.text(ctx, theme.subtitle, c2, my + 34, {
        size: 9.4, weight: 900, family: U.F.cn, fill: U.C.cream
      });
      wrapText(ctx, theme.mechanic, c2, my + 52, 152, 7.8, 10.5, 'rgba(245,235,216,.6)', 2, 500, U.F.cn);

      U.text(ctx, '任务目标 / OBJECTIVE', c3, my + 16, {
        size: 6.8, weight: 700, family: U.F.mono, fill: U.C.orange
      });
      U.text(ctx, '击败全部敌人', c3, my + 38, {
        size: 11, weight: 900, family: U.F.cn, fill: U.C.cream
      });
      U.text(ctx, '即可过关', c3, my + 56, {
        size: 7.8, weight: 500, family: U.F.cn, fill: 'rgba(245,235,216,.55)'
      });

      // 固定命中区：渲染、输入与测试共用 BI.hud.briefingStart（230,530,260,46）
      var hover = BI.mouse.inside && BI.input.hitRect(bx, by, bw, bh);
      U.panel(ctx, bx, by, bw, bh, {
        fill: hover ? U.C.orange : U.C.yellow,
        stroke: U.C.ink, lw: 2.5, r: 4,
        shadow: U.C.ink, shadowX: 4, shadowY: 4
      });
      U.play(ctx, bx + 28, by + bh / 2, 12, U.C.ink);
      U.text(ctx, '开始本关', bx + 49, by + bh / 2, {
        size: 19, weight: 900, family: U.F.cn, fill: U.C.ink
      });
      U.keycap(ctx, 'ENTER', bx + bw - 75, by + 14, 54, 19, U.C.ink, U.C.cream);
      U.text(ctx, 'Enter / 空格 / 点击', card.x + card.w / 2, card.y + card.h - 20, {
        size: 7.2, weight: 500, family: U.F.mono, fill: 'rgba(20,16,25,.45)', align: 'center'
      });
      ctx.restore();
    },

    /* ============================================================
     * 战场边框
     * ============================================================ */
    drawFieldFrame: function (ctx) {
      ctx.save();
      ctx.strokeStyle = 'rgba(20,16,25,.44)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, CFG.FIELD_W - 2, CFG.FIELD_H - 2);
      ctx.strokeStyle = 'rgba(245,235,216,.22)';
      ctx.lineWidth = 1;
      ctx.strokeRect(4, 4, CFG.FIELD_W - 8, CFG.FIELD_H - 8);
      ctx.restore();
    }
  };

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /** 和 menu 同款的换行工具：字号/行距明确，避免 Canvas 文本挤在一起 */
  function wrapText(ctx, text, x, y, maxWidth, size, lineHeight, color, maxLines, weight, family) {
    var chars = Array.from(String(text || ''));
    var line = '', row = 0;
    ctx.save();
    ctx.font = U.font(size, weight || 500, family || U.F.cn);
    for (var i = 0; i < chars.length; i++) {
      var test = line + chars[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        U.text(ctx, line, x, y + row * lineHeight, {
          size: size, weight: weight || 500, family: family || U.F.cn, fill: color
        });
        row++;
        line = chars[i];
        if (maxLines && row >= maxLines - 1) {
          while (i < chars.length - 1) {
            var next = line + chars[i + 1];
            if (ctx.measureText(next + '…').width > maxWidth) break;
            i++; line = next;
          }
          line += '…';
          break;
        }
      } else {
        line = test;
      }
    }
    if (line) {
      U.text(ctx, line, x, y + row * lineHeight, {
        size: size, weight: weight || 500, family: family || U.F.cn, fill: color
      });
    }
    ctx.restore();
    return row + 1;
  }

})(window.BI = window.BI || {});
