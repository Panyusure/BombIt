/* ============================================================
 * hud.js —— 顶部状态栏与关前怪物介绍
 *
 * 键位提示必须显示当前模式的真实键位：
 * 单人用空格放弹、双人 1P 改用 Enter —— 显示错玩家就会按错。
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, D = BI.draw, C = CFG.C;

  var MODE_TITLE = {
    dig: '单人 · 计时拆砖',
    versus: '双人 · 同屏对战',
    adventure: '单人 · 闯关打怪'
  };

  function keyHint(world) {
    if (world.inputMode === 'versus') {
      return '1P：' + dirText(world, 'p1') + ' + Enter 放弹　　' +
             '2P：' + dirText(world, 'p2') + ' + 空格 放弹';
    }
    return dirText(world, 'p1') + ' 移动　·　空格 放炸弹';
  }

  // 一个动作可能绑多套键位（单人：方向键 + WASD），提示要把它们都报出来，
  // 否则玩家按 WASD 走动了、HUD 却只写"方向键"，会以为游戏串键。
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

  var hud = BI.hud = {

    mmss: mmss,          // 暂停菜单也要显示剩余时间，导出去复用

    draw: function (ctx, world, info) {
      var W = CFG.VIEW_W, H = CFG.HUD_H;

      /* 背景条 */
      var g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#2b3358');
      g.addColorStop(1, C.hudBg);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.09)';
      ctx.fillRect(0, H - 2, W, 2);

      /* 左：模式名 + 键位提示 */
      D.text(ctx, MODE_TITLE[world.mode] || world.label || '对局', 18, 25, {
        font: 'bold 19px "Microsoft YaHei", sans-serif',
        fill: C.hudText, baseline: 'middle'
      });
      D.text(ctx, world.mode === 'versus' ? '1P：' + dirText(world, 'p1') + ' 移动 · Enter 放弹' : keyHint(world), 18, 45, {
        font: '13px "Microsoft YaHei", sans-serif',
        fill: C.hudDim, baseline: 'middle'
      });

      /* 右：每个玩家的状态胶囊 */
      var rightEdge = W - 16;
      for (var i = world.players.length - 1; i >= 0; i--) {
        var p = world.players[i];
        hud.chip(ctx, p, rightEdge, H, world);
      }

      var tail = world.mode === 'versus' ? '2P：' + dirText(world, 'p2') + ' 移动 · 空格 放弹' : 'Esc 暂停　·　M 静音';
      D.text(ctx, tail, 18, H - 12, {
        font: '11px Consolas, monospace',
        fill: 'rgba(154,166,200,.75)',
        baseline: 'middle'
      });
    },

    drawSkills: function (ctx, world) {
      world.players.forEach(function (p) {
        var info = BI.skills.info(p), km = BI.input.map(world.inputMode, world.altKeys);
        var code = km[p.keyId].skill;
        var key = info.passive ? '被动' : (code === 'ShiftRight' ? '右 Shift' : code.replace('Key', ''));
        var w = 192, keyWidth = info.passive ? 34 : (code === 'ShiftRight' ? 52 : 28);
        var x = p.keyId === 'p2' ? CFG.FIELD_W - w - 12 : 12;
        var nameX = x + keyWidth + 20;
        var height = info.passive ? 38 : 31;
        var y = CFG.FIELD_H - height - 7, ready = p.alive && !(p.skillCd > 0);
        ctx.save();
        D.blob(ctx, x, y, w, height, 12, 'rgba(28,42,53,.92)', ready ? info.color : '#6d7c8e', 1.2);
        D.blob(ctx, x + 7, y + (info.passive ? 4 : 5), keyWidth, info.passive ? 18 : 20, 7, ready ? info.color : '#526474', null);
        D.text(ctx, key, x + 7 + keyWidth / 2, y + (info.passive ? 13 : 15), { font: 'bold 11px sans-serif', align: 'center', fill: ready ? '#243847' : '#dae0e9' });
        D.text(ctx, info.name, nameX, y + 14, { font: 'bold 13px "Microsoft YaHei", sans-serif', fill: '#f2eddf' });
        var state = info.passive && p.alive ? (p.soulEvolved ? '已通灵' : '通灵') : (ready ? '就绪' : (p.alive ? Math.ceil(p.skillCd || 0) + '秒' : '等待重生'));
        D.text(ctx, state, x + w - 13, y + 14, { font: '11px sans-serif', align: 'right', fill: ready ? info.color : '#a6b6c5' });
        if (p.skillCd > 0) D.blob(ctx, nameX, y + 25, (w - keyWidth - 35) * Math.max(0, 1 - p.skillCd / info.cd), 2, 1, info.color, null);
        if (info.passive) {
          var barX=x+8,barY=y+27,barW=w-16,barColor=p.soulEvolved?'#f1c0ee':info.color;
          D.blob(ctx,barX,barY,barW,5,2.5,'#45586b',null);
          var progress=Math.min(1,(p.soulBombs || 0)/info.bombsToEvolve);
          if(progress>0)D.blob(ctx,barX,barY,barW*progress,5,2.5,barColor,null);
          ctx.fillStyle='rgba(28,42,53,.8)';
          for(var segment=1;segment<info.bombsToEvolve;segment++)ctx.fillRect(barX+barW*segment/info.bombsToEvolve-1,barY,2,5);
        }
        ctx.restore();
      });
    },

    /**
     * 战场顶部的悬浮状态条：倒计时 / 比分。
     * 为什么放这儿：战场第 0 行永远是外围硬墙，这块地方本来就是空的，
     * 不用跟 HUD 上的键位提示、玩家胶囊抢位置。
     */
    drawFloating: function (ctx, world, time) {
      var m = world.match;
      if (!m) return;

      if (world.map.bossBattle) {
        var boss = world.enemies.filter(function (e) { return e.type === 'boss'; })[0];
        var hp = boss && boss.alive ? boss.hp : 0;
        var maxHp = boss ? boss.maxHp : BI.entities.TYPES.boss.hp;
        var phase = BI.entities.bossStage(boss);
        var color = phase ? phase.color : '#c99af2';
        ctx.save();
        // 常规地图第0行是边界墙，血条放在此处，不遮挡可活动格。
        D.blob(ctx, 215, 4, 290, 39, 13, 'rgba(29,27,48,.92)', color, 1.5);
        var label = hp > 0 ? ['','一 · 试探','二 · 认真','三 · 暴走'][phase.id] : '已击败';
        D.text(ctx, '鲁鲁旦 · ' + label + (m.level === CFG.ADVENTURE_LEVELS ? ' · 最终战' : ''), 230, 17, {font:'bold 12px "Microsoft YaHei", sans-serif',fill:color});
        D.text(ctx, hp + ' / ' + maxHp, 488, 17, {font:'bold 11px sans-serif',fill:'#ffe0a1',align:'right'});
        for(var i=0;i<maxHp;i++)D.blob(ctx,230+i*260/maxHp,29,260/maxHp-4,7,2,i<hp?color:'#50435e',null);
        ctx.restore(); return;
      }
      var label, sub = '', warn = false, blinkLabel = true;

      if (m.mode === 'dig') {
        label = mmss(m.remaining);
        warn = m.remaining <= 20 && !m.over;
        sub = '剩余障碍 ' + BI.match.countBricks(world.map);

      } else if (m.mode === 'adventure') {
        var left = BI.match.countEnemies(world);
        label = '第 ' + m.level + ' / ' + CFG.ADVENTURE_LEVELS + ' 关';
        // 关数是玩家定位「打到第几关」的锚点，任何情况下都不闪；
        // 剩敌警告改闪在下面那行小字上，提示照样给到。
        blinkLabel = false;
        if (m.levelClearAt > 0) { sub = '关卡完成 · 即将进入下一关'; warn = false; }
        else sub = '剩余敌人 ' + left;
        warn = (left > 0 && left <= 2);

      } else {
        label = m.scores.p1 + ' : ' + m.scores.p2;
        if (m.sudden) { sub = '加速决胜'; warn = true; }
        else sub = '第 ' + m.round + ' 回合　先得 ' + m.targetScore + ' 分';
      }

      ctx.save();
      ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
      var lw = ctx.measureText(label).width;
      ctx.font = '11px "Microsoft YaHei", sans-serif';
      var sw = ctx.measureText(sub).width;
      var w = Math.max(lw, sw) + 40;
      var h = sub ? 54 : 38;
      var x = CFG.FIELD_W / 2 - w / 2;
      var y = 30 - h / 2;

      D.blob(ctx, x, y, w, h, h / 2, 'rgba(16,20,36,.62)', 'rgba(255,255,255,.14)', 1.5);

      var color = warn ? '#ff7a6b' : '#ffffff';
      if (warn && blinkLabel && Math.sin(time * 8) < 0) color = '#ffd0c8';
      D.text(ctx, label, CFG.FIELD_W / 2, y + (sub ? 20 : h / 2), {
        font: 'bold 26px "Microsoft YaHei", sans-serif',
        align: 'center', baseline: 'middle', fill: color
      });
      if (sub) {
        var subColor = 'rgba(210,220,250,.75)';
        // 不闪主标题的模式（闯关）把警告闪在这一行
        if (warn && !blinkLabel) subColor = Math.sin(time * 8) < 0 ? '#ff9c8e' : '#ff7a6b';
        D.text(ctx, sub, CFG.FIELD_W / 2, y + 41, {
          font: '11px "Microsoft YaHei", sans-serif',
          align: 'center', baseline: 'middle', fill: subColor
        });
      }
      ctx.restore();

      // 对战回合之间：中场提示
      if (m.mode === 'versus' && m.roundEndsAt > 0 && !m.over) {
        var left = Math.max(0, m.roundEndsAt - world.time);
        ctx.save();
        ctx.globalAlpha = 0.72;
        ctx.fillStyle = '#0d1220';
        ctx.fillRect(0, CFG.FIELD_H / 2 - 56, CFG.FIELD_W, 112);
        ctx.restore();

        var who = m.scores.p1 > m.scores.p2 ? '1P' : (m.scores.p2 > m.scores.p1 ? '2P' : '');
        D.text(ctx, who ? (who + ' 得分！') : '本回合结束', CFG.FIELD_W / 2, CFG.FIELD_H / 2 - 18, {
          font: 'bold 30px "Microsoft YaHei", sans-serif',
          align: 'center', baseline: 'middle',
          fill: '#ffd166', stroke: 'rgba(0,0,0,.5)', strokeWidth: 5
        });
        D.text(ctx, left.toFixed(1) + '秒后进入下一回合', CFG.FIELD_W / 2, CFG.FIELD_H / 2 + 24, {
          font: '15px "Microsoft YaHei", sans-serif',
          align: 'center', baseline: 'middle', fill: 'rgba(230,236,255,.85)'
        });
      }
    },

    heart: function (ctx, x, y, size) {
      ctx.save(); ctx.translate(x,y); ctx.scale(size/16,size/16);
      ctx.beginPath(); ctx.moveTo(0,6); ctx.bezierCurveTo(-2,3,-8,0,-8,-4);
      ctx.bezierCurveTo(-8,-9,-2,-10,0,-5);ctx.bezierCurveTo(2,-10,8,-9,8,-4);
      ctx.bezierCurveTo(8,0,2,3,0,6);ctx.closePath();ctx.fillStyle='#ff839b';ctx.fill();
      ctx.strokeStyle='#a54763';ctx.lineWidth=1.2;ctx.stroke();
      ctx.beginPath();ctx.moveTo(-5,-4);ctx.quadraticCurveTo(-4,-7,-2,-6);ctx.strokeStyle='#ffe8e8';ctx.lineWidth=1.5;ctx.stroke();
      ctx.restore();
    },

    /** 单个玩家的状态胶囊，返回它占用的宽度 */
    chip: function (ctx, p, right, H, world) {
      var w = 358, x = right - w;
      var y = world.mode === 'versus' ? (p.id === 'p1' ? 4 : 37) : 13;
      var h = world.mode === 'versus' ? 30 : 44, cy = y + h / 2 - (world.mode === 'versus' ? 0 : 7);
      ctx.save();
      D.blob(ctx, x, y, w, h, 9, 'rgba(255,255,255,.07)', 'rgba(255,255,255,.12)', 1);
      ctx.globalAlpha = p.alive ? 1 : .4;
      D.circle(ctx, x + 14, cy, 5); ctx.fillStyle = p.color; ctx.fill();
      D.text(ctx, (p.name || p.id.toUpperCase()) + ' ' + (p.charName || ''), x + 25, cy, {
        font: 'bold 11px "Microsoft YaHei", sans-serif', fill: C.hudText
      });
      ['fire', 'bomb', 'speed'].forEach(function (type, i) {
        var ix = x + 105 + i * 51;
        BI.sprites.drawItemIcon(ctx, type, ix, cy, 18);
        D.text(ctx, [p.power, p.maxBombs, '×' + (1 + p.speedBonus).toFixed(1)][i], ix + 13, cy, {
          font: 'bold 11px sans-serif', fill: C.hudText
        });
      });
      var hearts = world.mode === 'versus' ? (p.alive ? 1 : 0) : BI.rules.lifeCount(p);
      var hx = world.mode === 'versus' ? x + 88 : x + w - 18 - Math.max(0,hearts-1)*16;
      for(var n=0;n<hearts;n++)hud.heart(ctx,hx+n*16,world.mode==='versus'?cy:y+h-8,world.mode==='versus'?11:12);
      if (p.glove) BI.sprites.drawItemIcon(ctx, 'glove', x + 260, cy, 18);
      if (p.shield > 0) BI.sprites.drawItemIcon(ctx, 'shield', x + 281, cy, 22);
      if (p.starTime > 0) {
        BI.sprites.drawItemIcon(ctx, 'star', x + 308, cy, 21);
        D.text(ctx, p.starTime.toFixed(1) + '秒', x + 323, cy, {
          font: 'bold 11px sans-serif', fill: '#ffe382'
        });
      }
      ctx.restore();
      return w;
    },

    drawBriefing: function (ctx, world) {
      var b = world.briefing, fresh = b.fresh.length > 0;
      var ids = fresh ? b.fresh : b.types;
      var selected = BI.entities.TYPES[ids[0]];
      ctx.save();
      ctx.fillStyle = 'rgba(13,19,37,.86)'; ctx.fillRect(0, 0, CFG.VIEW_W, CFG.VIEW_H);
      var theme = BI.THEMES[world.theme] || BI.THEMES.forest;
      var panel = ctx.createLinearGradient(50, 48, 620, 656);
      panel.addColorStop(0, theme.sky); panel.addColorStop(1, '#233344');
      D.blob(ctx, 50, 48, 620, 608, 26, panel, theme.top, 1.5);
      D.text(ctx, '第 ' + world.match.level + ' / ' + CFG.ADVENTURE_LEVELS + ' 关' +
        (world.match.level === CFG.ADVENTURE_LEVELS ? ' · 最终战' : ''), 360, 84, {
        font: 'bold 26px "Microsoft YaHei", sans-serif', align: 'center', fill: '#ffe3a1'
      });
      D.text(ctx, theme.name + (world.map.bossBattle ? ' · BOSS 战' : ''), 360, 120, {
        font: '14px "Microsoft YaHei", sans-serif', align: 'center', fill: '#c4d5ea'
      });
      // 图鉴卡只介绍本关实际出现的怪物；每关至多引入一种新怪物。
      D.blob(ctx, 78, 150, 564, 292, 18, 'rgba(219,235,223,.08)', 'rgba(227,244,231,.10)', 1);
      if (selected) {
        var e = { type: selected.id, color: selected.color, dark: selected.dark,
          x: 0, px: 0, y: 0, py: 0, alive: true, maxHp: selected.hp, hp: selected.hp };
        ctx.save(); ctx.translate(135, selected.id === 'boss' ? 250 : 229); ctx.scale(selected.id === 'boss' ? 1 : 1.55, selected.id === 'boss' ? 1 : 1.55);
        BI.sprites.drawEnemy(ctx, e, world.time, 1); ctx.restore();
        D.text(ctx, (fresh ? '初次登场 · ' : '本关提醒 · ') + selected.name, 188, 186, {
          font: 'bold 22px "Microsoft YaHei", sans-serif', fill: selected.color
        });
        function wrap(text, x, y, maxWidth, color) {
          ctx.font = '14px "Microsoft YaHei", sans-serif';
          var line = '', row = 0;
          Array.from(text).forEach(function (ch) {
            if (ctx.measureText(line + ch).width > maxWidth && line) {
              D.text(ctx, line, x, y + row * 23, { font: ctx.font, fill: color });
              line = ''; row++;
            }
            line += ch;
          });
          if (line) D.text(ctx, line, x, y + row * 23, { font: ctx.font, fill: color });
        }
        wrap(selected.story, 188, 223, 425, '#d8e3f1');
        D.text(ctx, '行动', 101, 287, { font: 'bold 14px "Microsoft YaHei", sans-serif', fill: '#94dfd2' });
        wrap(selected.mechanic, 188, 287, 425, '#e5edf7');
        D.text(ctx, '攻击', 101, 361, { font: 'bold 14px "Microsoft YaHei", sans-serif', fill: '#ffb3ac' });
        wrap(selected.damage, 188, 361, 425, '#e5edf7');
      }
      D.text(ctx, '本关阵容：' + b.types.map(function (id) { return BI.entities.TYPES[id].name; }).join(' / ') +
        '   ·   共 ' + world.enemies.length + ' 只', 360, 465, {
        font: '13px "Microsoft YaHei", sans-serif', align: 'center', fill: '#c4d5ea'
      });
      D.text(ctx, theme.subtitle, 360, 501, { font: 'bold 13px "Microsoft YaHei", sans-serif', align: 'center', fill: '#e9d6a8' });
      D.text(ctx, theme.mechanic, 360, 525, { font: '11.5px "Microsoft YaHei", sans-serif', align: 'center', fill: '#c5d8d8' });
      D.text(ctx, '击败全部敌人即可过关', 360, 551, {
        font: '12px "Microsoft YaHei", sans-serif', align: 'center', fill: '#b2c4dd'
      });
      var hover = BI.mouse.inside && BI.input.hitRect(230, 582, 260, 52);
      D.blob(ctx, 230, 582, 260, 52, 16, hover ? '#ffe3a1' : '#8fe3c7', null);
      D.text(ctx, '开始本关', 360, 601, {
        font: 'bold 20px "Microsoft YaHei", sans-serif', align: 'center', fill: '#20374d'
      });
      D.text(ctx, 'Enter / 空格 / 点击', 360, 622, {
        font: '11px "Microsoft YaHei", sans-serif', align: 'center', fill: '#355568'
      });
      ctx.restore();
    },

    /** 战场外围描一圈内阴影，让战场更"陷进去" */
    drawFieldFrame: function (ctx) {
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, CFG.FIELD_W - 6, CFG.FIELD_H - 6);
      ctx.restore();
    }
  };

})(window.BI = window.BI || {});
