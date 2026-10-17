/* ============================================================
 * rules.js —— 游戏规则：放弹、爆炸、连锁、道具、伤害
 * 所有函数都作用在 world 这个"世界对象"上
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, T = BI.T, G = BI.grid;

  var rules = BI.rules = {

    lifeCount: function (p) { return Math.max(0, Math.min(CFG.MAX_LIVES, Math.floor(p.lives || 0))); },
    changeLives: function (p, amount) {
      p.lives = Math.max(0, Math.min(CFG.MAX_LIVES, rules.lifeCount(p) + amount));
      return p.lives;
    },

    /* ---------------- 放炸弹 ---------------- */

    /**
     * 玩家尝试在脚下放炸弹。
     * 三重限制：该格已有炸弹 / 自己的炸弹数已达上限 / 已死
     */
    tryPlaceBomb: function (world, p) {
      if (!p.alive) return false;

      var c = G.col(p.x), r = G.row(p.y);

      var mine = 0;
      for (var i = 0; i < world.bombs.length; i++) {
        var b = world.bombs[i];
        var pos = G.bombPosition(b);
        if ((b.cx === c && b.cy === r) || Math.hypot(pos.x-G.centerX(c),pos.y-G.centerY(r)) < CFG.BOMB_RADIUS*2+1) return false;      // 这一格已经有炸弹了
        if (b.ownerId === p.id) mine++;
      }
      if (mine >= p.maxBombs) return false;              // 自己的配额用完了

      world.bombs.push({
        cx: c, cy: r,
        power: Math.min(CFG.MAX_POWER, p.power),
        fuse: CFG.FUSE,
        fuseTotal: CFG.FUSE,   // 倒计时环按各自的引信总长来算，敌人的更长
        ownerId: p.id,
        passFor: world.players.filter(function (o) {
          return o.alive && Math.hypot(o.x - G.centerX(c), o.y - G.centerY(r)) < CFG.BOMB_RADIUS + CFG.PLAYER_BOMB_RADIUS;
        }).map(function (o) { return o.id; }),
        freeFor: p.id,        // 主人可以踩着自己刚放的炸弹走出去
        color: p.color,
        slide: null           // 踢弹滑行状态
      });
      p.bombsOut = mine + 1;
      p.squash = 1;           // 放弹时身体下压（动效）
      BI.skills.onBombPlaced(world, p, c, r);
      return true;
    },

    /* ---------------- 每帧推进炸弹 ---------------- */

    updateBombs: function (world, dt) {
      // 连锁爆炸会删除任意位置的炸弹，不能继续使用旧数组下标。
      // 固定本帧待处理对象，并跳过已经被连锁引爆的对象。
      var pending = world.bombs.slice();
      for (var i = pending.length - 1; i >= 0; i--) {
        var b = pending[i];
        if (world.bombs.indexOf(b) < 0) continue;

        // 主人走出去之后，炸弹变成实体障碍
        if (b.freeFor !== null) {
          var owner = world.playerById(b.freeFor);
          if (!owner || !G.bombOverlapsPlayer(b, owner)) {
            b.freeFor = null;
          }
        }

        if (b.passFor) b.passFor = b.passFor.filter(function (id) {
          var p = world.playerById(id); return p && p.alive && G.bombOverlapsPlayer(b, p);
        });
        var frozen = b.byEnemy && world.timeStop && world.timeStop.remaining > 0;
        if (!frozen) {
          if (b.slide) {
            var distance = b.slide.speed * CFG.TILE * dt;
            var parts = Math.max(1, Math.ceil(distance / 2));
            for (var step = 0; step < parts && b.slide; step++) {
              var pos = G.bombPosition(b), dx = b.slide.dc, dy = b.slide.dr;
              if (!rules.moveBomb(world, b, pos.x + dx * distance / parts, pos.y + dy * distance / parts)) {
                b.slide = null;
              }
            }
          } else if (BI.scenery) BI.scenery.carryBomb(world, b, dt);
        }

        // 引信
        if (!frozen) b.fuse -= dt;
        if (b.fuse <= 0) {
          world.bombs.splice(world.bombs.indexOf(b), 1);
          rules.detonate(world, b);
        }
      }
    },

    // 连续位置用于真实碰撞和绘制；格子坐标只用于放弹与爆炸落点。
    slideForecast: function (world, b) {
      if (!b.slide) return [];
      var probe = Object.assign({}, b), view = Object.create(world), cells = [], seen = {};
      view.bombs = world.bombs.map(function (other) { return other === b ? probe : other; });
      var limit = (G.cols(world.map) + G.rows(world.map)) * CFG.TILE / 2;
      for (var i = 0; i < limit; i++) {
        var pos = G.bombPosition(probe);
        if (!rules.moveBomb(view, probe, pos.x + b.slide.dc * 2, pos.y + b.slide.dr * 2)) break;
        var key = probe.cx + ',' + probe.cy;
        if (!seen[key]) { seen[key] = true; cells.push([probe.cx, probe.cy]); }
      }
      return cells;
    },

    moveBomb: function (world, b, x, y) {
      if (!G.canStand(world.map, [], x, y, CFG.BOMB_RADIUS * 2, null)) return false;
      if (world.bombs.some(function (other) {
        if (other === b) return false;
        var pos = G.bombPosition(other);
        return Math.hypot(pos.x - x, pos.y - y) < CFG.BOMB_RADIUS * 2 + 1;
      })) return false;
      var actors = world.players.concat(world.enemies || []), old = G.bombPosition(b);
      if (actors.some(function (p) {
        if (!p.alive || G.bombAllows(b, p.id)) return false;
        var radius = CFG.BOMB_RADIUS + (p.isEnemy ? CFG.ENEMY_BOX / 2 : CFG.PLAYER_BOMB_RADIUS);
        var before = Math.hypot(old.x - p.x, old.y - p.y), after = Math.hypot(x - p.x, y - p.y);
        // 已重叠的出生瞬间可以向外离开，不能再挤入角色身体。
        return after < radius && after <= before + 1e-6;
      })) return false;
      b.x = x; b.y = y; b.cx = G.col(x); b.cy = G.row(y);
      return true;
    },

    /** 踢弹滑行的目标格是否被挡住 */
    bombBlockedAt: function (world, self, c, r) {
      if (!G.inBounds(c, r, world.map)) return true;
      if (G.isWall(world.map, c, r)) return true;
      for (var i = 0; i < world.bombs.length; i++) {
        var o = world.bombs[i];
        if (o !== self && o.cx === c && o.cy === r) return true;
      }
      return false;
    },

    /* ---------------- 爆炸与连锁 ---------------- */

    /**
     * 计算一颗炸弹会覆盖到哪些格子。**纯几何，没有副作用。**
     *
     * 预览和真实爆炸必须共用这一份计算 —— 分成两处写迟早会对不上，
     * 而「显示的范围和实际炸的范围不一致」是最伤玩家的 bug。
     *
     * 规则：
     *   硬墙 -> 挡住；暴走BOSS弹可烧掉场内硬墙，该方向仍停止
     *   软砖 -> 会显示火焰、会被炸掉，该方向停止
     *   炸弹 -> 会显示火焰并连锁引爆，该方向停止
     *
     * 返回 { cells:[[c,r]...], bricks:[[c,r]...], hardWalls:[[c,r]...], chain:[bomb...] }
     */
    bombCells: function (world, bomb) {
      var cells = [[bomb.cx, bomb.cy]];
      var bricks = [];
      var hardWalls = [];
      var chain = [];
      var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

      for (var d = 0; d < 4; d++) {
        for (var k = 1; k <= bomb.power; k++) {
          var c = bomb.cx + dirs[d][0] * k;
          var r = bomb.cy + dirs[d][1] * k;
          if (!G.inBounds(c, r, world.map)) break;

          var t = G.at(world.map, c, r);
          if (t === T.HARD) {
            if (bomb.breakHard && G.canBreakHard(world.map,c,r)) {
              cells.push([c,r]); hardWalls.push([c,r]);
            }
            break; // 即使被炸开，硬墙也吸收本次该方向的火焰。
          }

          cells.push([c, r]);

          if (t === T.BRICK) { bricks.push([c, r]); break; }   // 软砖吸火，该方向停止

          var hit = rules.bombAt(world, c, r, bomb);
          if (hit) { chain.push(hit); break; }           // 火焰被炸弹吸收，转为连锁
        }
      }
      return { cells: cells, bricks: bricks, hardWalls: hardWalls, chain: chain };
    },

    /**
     * 引爆一颗炸弹。
     * 火焰范围、该炸哪些砖、该连锁谁 —— 全部来自 bombCells，和预览同源。
     */
    detonate: function (world, bomb) {
      var geo = rules.bombCells(world, bomb);
      var cells = geo.cells;
      var i;

      // ⚠ 顺序很重要：**先烧地上的道具，再炸砖掉道具**。
      // 反过来的话，砖块刚掉出来的道具正好落在火焰格里，
      // 会被同一发爆炸立刻烧掉 —— 结果就是道具几乎永远见不到。
      for (i = 0; i < cells.length; i++) {
        rules.burnItem(world, cells[i][0], cells[i][1]);
      }

      // 软砖：炸掉，并可能掉道具
      for (i = 0; i < geo.bricks.length; i++) {
        G.set(world.map, geo.bricks[i][0], geo.bricks[i][1], T.EMPTY);
        rules.maybeDropItem(world, geo.bricks[i][0], geo.bricks[i][1]);
      }
      geo.hardWalls.forEach(function (cell) { G.set(world.map,cell[0],cell[1],T.EMPTY); });

      world.flames.push({
        cells: cells,
        t: CFG.FLAME_TIME,
        total: CFG.FLAME_TIME,
        cx: bomb.cx, cy: bomb.cy, ownerId: bomb.ownerId
      });
      world.onExplode(bomb, cells);

      // 连锁引爆（先从数组里摘掉再递归，保证一定会终止）
      for (i = 0; i < geo.chain.length; i++) {
        var idx = world.bombs.indexOf(geo.chain[i]);
        if (idx >= 0) {
          world.bombs.splice(idx, 1);
          rules.detonate(world, geo.chain[i]);
        }
      }
    },

    bombAt: function (world, c, r, except) {
      for (var i = 0; i < world.bombs.length; i++) {
        var b = world.bombs[i];
        if (b !== except && b.cx === c && b.cy === r) return b;
      }
      return null;
    },

    /* ---------------- 道具 ---------------- */

    maybeDropItem: function (world, c, r) {
      if (!world.rng.chance(CFG.ITEM_DROP_RATE)) return;
      var pool = rules.itemPool(world);
      world.items.push({
        c: c, r: r,
        type: world.rng.pick(pool),
        born: world.time
      });
    },

    /** 火焰烧掉地上的道具（经典规则）。返回是否烧到了东西。 */
    burnItem: function (world, c, r) {
      if (!world.burnItems) return false;
      for (var i = world.items.length - 1; i >= 0; i--) {
        var it = world.items[i];
        if (it.c === c && it.r === r) {
          world.items.splice(i, 1);
          if (world.onItemBurned) world.onItemBurned(c, r, it.type);
          return true;
        }
      }
      return false;
    },

    updateItems: function (world, dt) {
      var collectors = world.players.concat((world.enemies || []).filter(function (e) {
        return !(world.timeStop && world.timeStop.remaining > 0) && !(e.stun > 0);
      }));
      for (var i = world.items.length - 1; i >= 0; i--) {
        var it = world.items[i];
        for (var j = 0; j < collectors.length; j++) {
          var p = collectors[j];
          if (!p.alive) continue;
          if (G.col(p.x) === it.c && G.row(p.y) === it.r) {
            rules.applyItem(p, it.type, world.mode);
            world.items.splice(i, 1);
            world.onPickup(p, it);
            break;
          }
        }
      }
    },

    applyItem: function (p, type, mode) {
      if (type === 'fire') p.power = Math.min(p.power + 1, CFG.MAX_POWER);
      else if (type === 'bomb') p.maxBombs = Math.min(p.maxBombs + 1, p.isEnemy ? 3 : CFG.MAX_BOMBS);
      else if (type === 'speed') {
        var before = p.speedBonus || 0;
        p.speedBonus = Math.min(before + CFG.SPEED_STEP, CFG.SPEED_MAX_BONUS);
        if (p.isEnemy) p.speed *= (1 + p.speedBonus) / (1 + before);
      }
      else if (type === 'fruit') {
        if (!p.isEnemy && mode !== 'versus' && rules.lifeCount(p) < CFG.MAX_LIVES) rules.changeLives(p, 1);
        else p.shield = 1;
      }
      else if (type === 'shield') p.shield = 1;
      else if (type === 'star') p.starTime = CFG.STAR_TIME;
      else if (type === 'kick') p.kick = true;
      else if (type === 'glove') p.glove = true;
      if (!p.picked) p.picked = {};
      p.picked[type] = (p.picked[type] || 0) + 1;
    },

    itemPool: function (world) {
      var pool = ['fire', 'bomb', 'speed', 'star', 'shield', 'glove'];
      if (world.itemPool === 'full') pool.push('kick');
      return pool;
    },

    /* ---------------- 火焰与伤害 ---------------- */

    updateFlames: function (world, dt) {
      for (var i = world.flames.length - 1; i >= 0; i--) {
        var f = world.flames[i];
        f.t -= dt;
        if (f.t <= 0) world.flames.splice(i, 1);
      }
    },

    flameAt: function (world, c, r) {
      return !!rules.flameSourceAt(world, c, r);
    },

    flameSourceAt: function (world, c, r) {
      for (var i = 0; i < world.flames.length; i++) {
        var cells = world.flames[i].cells;
        for (var j = 0; j < cells.length; j++) {
          if (cells[j][0] === c && cells[j][1] === r) return world.flames[i];
        }
      }
      return null;
    },

    /** 玩家是否正踩在火焰上 */
    playerBurning: function (world, p) {
      return rules.flameAt(world, G.col(p.x), G.row(p.y));
    },

    // 毒叉的伤害与渲染都以同一落点格为准，不扩散至相邻格。
    updatePoison: function (world, dt) {
      if (world.timeStop && world.timeStop.remaining > 0) return;
      var list = world.poison || [];
      for (var i = list.length - 1; i >= 0; i--) {
        var f = list[i];
        if (f.warn > 0) {
          var rest = Math.max(0, dt - f.warn);
          f.warn = Math.max(0, f.warn - dt); f.life -= rest;
        } else f.life -= dt;
        if (f.life <= 0) list.splice(i, 1);
      }
    },
    poisonAt: function (world, c, r) {
      return (world.poison || []).some(function (f) { return f.warn <= 0 && f.c === c && f.r === r; });
    },

    hurtPlayer: function (world, p, cause) {
      if (!p.alive || p.invuln > 0 || p.starTime > 0) return;
      if (cause === 'flame' && p.flameGuard > 0) {
        // 小炎：吸收这一次爆炸，并把它反弹给周围 5×5 内的敌人。
        p.flameGuard = 0; p.invuln = .8;
        var reflected = BI.skills.reflectFlame(world, p);
        if (world.onSkill) {
          world.onSkill(p, reflected ? '吸收爆炸 · 反弹 ' + reflected + ' 个目标' : '吸收爆炸 · 周围无敌人');
        }
        return;
      }
      if (p.shield > 0) {
        p.shield = 0;
        p.invuln = CFG.SHIELD_INVULN_TIME;
        world.onShieldBreak(p);
      } else {
        p.alive = false;
        p.starTime = 0;
        p.deadAt = world.time;
        world.onDeath(p);
      }
    },

    killEnemy: function (world, e, ownerId) {
      if (!e.alive) return;
      // 因未来减速而没能逃离自身炸弹，按她的战术击杀结算。
      if (ownerId === e.id && e.soulSlowOwnerId && world.time <= e.soulSlowAssistUntil) ownerId = e.soulSlowOwnerId;
      e.hp = 0;
      e.alive = false;
      e.deadAt = world.time;
      e.killedBy = ownerId || null;
      if (e.type === 'boss') world.poison = [];
      // 击杀通灵：打死任意一只敌方，未来的通灵条直接满（放弹累计是另一条路）。
      // 无归属击杀（自爆、毒叉）拿不到归属，自然也就不会通灵。
      if (ownerId) BI.skills.chargeSoul(world, world.playerById(ownerId), BI.SKILLS.weilai.bombsToEvolve);
      rules.dropFromEnemy(world, e);
      world.onEnemyDeath(e);
    },

    updateDamage: function (world, dt) {
      // 统一推进计时，避免两名玩家的处理顺序影响碰撞结果。
      world.players.forEach(function (p) {
        p.starTime = Math.max(0, (p.starTime || 0) - dt);
        if (p.starTime < 1e-9) p.starTime = 0;
        p.invuln = Math.max(0, (p.invuln || 0) - dt);
      });
      for (var i = 0; i < world.players.length; i++) {
        var p = world.players[i];
        if (!p.alive) continue;

        if (p.starTime > 0) {
          var reach = (CFG.BOX + CFG.ENEMY_BOX) / 2 - 7;
          (world.enemies || []).forEach(function (e) {
            if (e.alive && Math.abs(e.x - p.x) < reach && Math.abs(e.y - p.y) < reach) {
              rules.hurtEnemy(world, e, p.id);
            }
          });
          world.players.forEach(function (other) {
            if (other !== p && Math.abs(other.x - p.x) < CFG.BOX - 7 &&
                Math.abs(other.y - p.y) < CFG.BOX - 7) rules.hurtPlayer(world, other, 'contact');
          });
          continue;
        }
        if (p.invuln > 0) continue;

        // 只有吃到星星的敌人才有碰撞伤害；仍由统一伤害入口处理护盾与扣命。
        var contactReach = (CFG.BOX + CFG.ENEMY_BOX) / 2 - 7;
        if ((world.enemies || []).some(function (e) {
          return e.alive && e.starTime > 0 && Math.abs(e.x-p.x) < contactReach && Math.abs(e.y-p.y) < contactReach;
        })) rules.hurtPlayer(world, p, 'contact');
        if (!p.alive || p.invuln > 0) continue;

        var burning = rules.playerBurning(world, p);
        var poisoned = rules.poisonAt(world, G.col(p.x), G.row(p.y));

        if (burning || poisoned) {
          rules.hurtPlayer(world, p, burning ? 'flame' : 'poison');
        }
      }
    },

    /* ---------------- 敌人 ---------------- */

    /**
     * 打死敌人时掉道具。
     * 这条规则放在 rules.js 而不是 main.js 里 —— 规则属于游戏逻辑，
     * 放在渲染/装配层会导致「测试里造的世界」和「真实世界」行为不一致。
     */
    dropFromEnemy: function (world, e) {
      if (!world.rng.chance(CFG.ENEMY_DROP_RATE)) return null;
      var pool = rules.itemPool(world);
      var it = {
        c: G.col(e.x), r: G.row(e.y),
        type: world.rng.pick(pool), born: world.time
      };
      world.items.push(it);
      return it;
    },

    /** 敌人推进：踩到火焰就掉血，血掉光就死 */
    updateEnemies: function (world, dt) {
      if (!world.enemies) return;
      for (var i = 0; i < world.enemies.length; i++) {
        var e = world.enemies[i];
        if (!e.alive) continue;
        e.starTime = Math.max(0, (e.starTime || 0) - dt);

        if (e.invuln > 0) { e.invuln = Math.max(0, e.invuln - dt); continue; }

        var flame = rules.flameSourceAt(world, G.col(e.x), G.row(e.y));
        if (flame) {
          rules.hurtEnemy(world, e, flame.ownerId);
        }
      }
    },

    hurtEnemy: function (world, e, ownerId) {
      if (!e.alive || e.invuln > 0 || e.starTime > 0) return;
      e.hitFlash = 1;
      if (e.shield > 0) {
        e.shield = 0; e.invuln = CFG.SHIELD_INVULN_TIME;
        if (world.onShieldBreak) world.onShieldBreak(e);
        return;
      }
      e.invuln = CFG.ENEMY_HIT_INVULN;
      e.hp--;
      if (e.hp <= 0) rules.killEnemy(world, e, ownerId);
      else if (e.type === 'boss') BI.entities.syncBossPhase(world, e);
    },

    /** 玩家是否还能被炸死（用于 AI 判断危险） */
    isInvulnerable: function (p) {
      return !p.alive || p.invuln > 0 || p.starTime > 0 || p.shield > 0;
    }
  };

  // 精灵技能为本作玩法改编；技能计时只随对局逻辑推进。
  BI.skills = {
    info: function (p) { return BI.SKILLS[p.assetId] || BI.SKILLS.xiaonuo; },
    reset: function (p) {
      p.flameGuard = 0; p.insightTime = 0; p.slowTime = 0;
      p.castFlash = 0; p.aimX = 1; p.aimY = 0;
      p.soulSlowTime = 0; p.soulSlowRate = 0;
      p.soulAwakenTime = 0;
    },
    resetLevel: function (p) {
      p.soulEvolved = false; p.soulBombs = 0; p.soulAwakenTime = 0;
    },
    /**
     * 通灵条充能。两条路都汇到这里：
     *   · 成功放弹 +1（见 onBombPlaced）
     *   · 击杀一只敌人直接喂满（见 rules.killEnemy）
     * 只有未来的玩家会攒条；已通灵的不再重复累计。
     */
    chargeSoul: function (world, p, amount) {
      if (!p || p.assetId !== 'weilai' || p.soulEvolved) return 0;
      var info = BI.SKILLS.weilai;
      var before = p.soulBombs || 0;
      p.soulBombs = Math.min(info.bombsToEvolve, before + (amount > 0 ? amount : 0));
      if (p.soulBombs >= info.bombsToEvolve) BI.skills.awaken(world, p);
      return p.soulBombs - before;
    },
    slowFactor: function (actor) {
      return actor.soulSlowTime > 0 ? 1 - (actor.soulSlowRate || 0) : 1;
    },
    onBombPlaced: function (world, p, c, r) {
      if (p.assetId !== 'weilai') return;
      var info = BI.SKILLS.weilai;
      BI.skills.chargeSoul(world, p, 1);
      var effect = p.soulEvolved ? info.evolved : info.normal;
      var targets = (world.enemies || []).concat(world.players.filter(function (other) { return other !== p; }));
      targets.forEach(function (target) {
        if (!target.alive || Math.abs(G.col(target.x) - c) > effect.radius || Math.abs(G.row(target.y) - r) > effect.radius) return;
        // 同一种减速只刷新，不叠乘；弱形态不会覆盖仍在生效的强减速。
        if (target.soulSlowTime > 0 && target.soulSlowRate > effect.rate) return;
        target.soulSlowRate = effect.rate; target.soulSlowTime = effect.duration;
        target.soulSlowOwnerId = p.id;
        target.soulSlowAssistUntil = world.time + Math.max(effect.duration, 4.2 + CFG.FLAME_TIME);
      });
      var effects = world.skillEffects || (world.skillEffects = []);
      effects.push({ type: 'soulPulse', x: G.centerX(c), y: G.centerY(r), radius: effect.radius,
        evolved: !!p.soulEvolved, t: .8, total: .8, color: p.soulEvolved ? '#f6c2f1' : info.color });
    },
    awaken: function (world, p) {
      if (p.soulEvolved || p.assetId !== 'weilai') return;
      p.soulEvolved = true;
      p.soulBombs = BI.SKILLS.weilai.bombsToEvolve;   // 击杀通灵也要把条画满
      p.soulAwakenTime = 1.6;
      var effects = world.skillEffects || (world.skillEffects = []);
      effects.push({ type: 'soulAwaken', ownerId: p.id, x: p.x, y: p.y, t: 1.6, total: 1.6, color: '#c3f4fa' });
      if (world.onSkill) world.onSkill(p, '通灵觉醒');
    },

    /**
     * 小炎的炎灭火舞：把吸收掉的这次爆炸反弹出去，
     * 周围 5×5（以自己所在格为中心，半径 2 格）内的敌人各吃一次伤害。
     * 对战模式下对手玩家同样算敌人 —— 不然这个技能在双人局里等于没有。
     */
    reflectFlame: function (world, p) {
      var info = BI.SKILLS.xiaoyan, radius = 2;
      var c = G.col(p.x), r = G.row(p.y), hits = 0;
      function inRange(actor) {
        return Math.abs(G.col(actor.x) - c) <= radius && Math.abs(G.row(actor.y) - r) <= radius;
      }
      (world.enemies || []).forEach(function (e) {
        if (e.alive && inRange(e)) { rules.hurtEnemy(world, e, p.id); hits++; }
      });
      world.players.forEach(function (other) {
        if (other !== p && other.alive && inRange(other)) { rules.hurtPlayer(world, other, 'skill'); hits++; }
      });
      var effects = world.skillEffects || (world.skillEffects = []);
      effects.push({ type: 'flameReflect', x: G.centerX(c), y: G.centerY(r),
        radius: radius, t: .7, total: .7, color: info.color });
      return hits;
    },
    update: function (world, dt) {
      world.players.forEach(function (p) {
        ['skillCd', 'flameGuard', 'insightTime', 'slowTime', 'castFlash', 'soulAwakenTime'].forEach(function (key) {
          p[key] = Math.max(0, (p[key] || 0) - dt);
        });
      });
      world.players.concat(world.enemies || []).forEach(function (actor) {
        if (actor.isEnemy && world.timeStop && world.timeStop.remaining > 0) return;
        actor.soulSlowTime = Math.max(0, (actor.soulSlowTime || 0) - dt);
        if (!actor.soulSlowTime) actor.soulSlowRate = 0;
      });
      if (world.timeStop) {
        world.timeStop.remaining -= dt;
        var caster = world.playerById(world.timeStop.ownerId);
        if (world.timeStop.remaining <= 0 || !caster || !caster.alive) world.timeStop = null;
      }
      var effects = world.skillEffects || [];
      for (var i = effects.length - 1; i >= 0; i--) {
        effects[i].t -= dt;
        if (effects[i].t <= 0) effects.splice(i, 1);
      }
    },
    cast: function (world, p) {
      if (!p.alive || p.skillCd > 0 || (world.match && world.match.over) || world.briefing) return false;
      var info = BI.skills.info(p), id = p.assetId || 'xiaonuo';
      if (info.passive) return false;
      var x0 = p.x, y0 = p.y;
      if (id === 'xiaonuo') {
        world.timeStop = { ownerId: p.id, remaining: 3 };
        world.players.forEach(function (o) { if (o !== p && o.alive) o.slowTime = Math.max(o.slowTime || 0, 3); });
      } else if (id === 'axiu') {
        var dc = p.aimX || 0, dr = p.aimY || 0;
        if (!dc && !dr) dc = p.facing || 1;
        var c = G.col(p.x), r = G.row(p.y), path = [];
        // 每一步都做真实碰撞检查，墙和炸弹都不能被穿过。
        for (var step = 1; step <= 3; step++) {
          var nc = c + dc * step, nr = r + dr * step;
          if (!G.canStand(world.map, world.bombs, G.centerX(nc), G.centerY(nr), CFG.BOX, p.id)) break;
          path.push([nc, nr]);
        }
        if (!path.length) return false;
        var visited = {};
        path.forEach(function (cell) {
          (world.enemies || []).forEach(function (e) {
            if (!e.alive || e.invuln > 0 || visited[e.id]) return;
            if (Math.abs(e.x - G.centerX(cell[0])) < CFG.TILE * .7 &&
                Math.abs(e.y - G.centerY(cell[1])) < CFG.TILE * .7) {
              visited[e.id] = true; rules.hurtEnemy(world, e, p.id);
            }
          });
          world.players.forEach(function (o) {
            if (o !== p && !visited[o.id] && G.col(o.x) === cell[0] && G.row(o.y) === cell[1]) {
              visited[o.id] = true; rules.hurtPlayer(world, o, 'skill');
            }
          });
        });
        var last = path[path.length - 1];
        p.x = G.centerX(last[0]); p.y = G.centerY(last[1]); p.px = p.x; p.py = p.y;
        p.invuln = Math.max(p.invuln, .5);
      } else if (id === 'arui') {
        p.shield = 1;
        var start = [G.col(p.x), G.row(p.y), 0], q = [start], seen = {}, head = 0;
        seen[start[0] + ',' + start[1]] = true;
        while (head < q.length) {
          var cur = q[head++];
          if (cur[2] >= 2) continue;
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
            var nc = cur[0] + d[0], nr = cur[1] + d[1], key = nc + ',' + nr;
            if (seen[key] || !G.inBounds(nc, nr, world.map) || G.isWall(world.map, nc, nr)) return;
            seen[key] = true; q.push([nc, nr, cur[2] + 1]);
          });
        }
        (world.enemies || []).forEach(function (e) { if (e.alive && seen[G.col(e.x) + ',' + G.row(e.y)]) e.stun = 2; });
        world.players.forEach(function (o) { if (o !== p && o.alive && seen[G.col(o.x) + ',' + G.row(o.y)]) o.slowTime = 2; });
      } else if (id === 'xiaoyan') {
        // 吸火窗口没结束前不能重复施放，否则白白吃掉一次冷却
        if (p.flameGuard > 0) return false;
        p.flameGuard = 4;
      } else if (id === 'xiaotian') {
        p.insightTime = 6;
      } else return false;
      p.skillCd = info.cd; p.castFlash = .8;
      if (!world.skillEffects) world.skillEffects = [];
      world.skillEffects.push({ type: id, x: x0, y: y0, toX: p.x, toY: p.y,
        t: .65, total: .65, color: info.color });
      if (world.onSkill) world.onSkill(p, info.name);
      return true;
    }
  };

})(window.BI = window.BI || {});
