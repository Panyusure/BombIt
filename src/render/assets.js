/* ============================================================
 * assets.js —— 角色素材加载
 *
 * 设计原则：**素材加载失败绝不能影响游戏运行**。
 *   · 图片没加载好 / 路径写错 / 文件缺失 -> 自动回退几何占位小人
 *   · 加载是异步的，游戏立刻就能开始，图片到了再无缝换上
 * ============================================================ */
(function (BI) {
  'use strict';

  var PROJECT_BASE = document.currentScript ? new URL('../../', document.currentScript.src).href : document.baseURI;
  var ART_BASE = document.currentScript ? new URL('../../assets/enemies/', document.currentScript.src).href : 'assets/enemies/';
  var ENEMY_ART = BI.ENEMY_ART = {
    gugu: { file: 'gugu.png', crop: [82, 95, 1148, 1060] },
    claude: { file: 'claude.png', crop: [62, 67, 1166, 1089] },
    oupao: { file: 'oupao.png', crop: [91, 67, 1143, 1092] },
    boss: { file: 'luludan.png', crop: [189, 16, 922, 1192] },
    bossRage: { file: 'luludan-rage-v2.png', crop: [189, 16, 922, 1192] }
  };
  var DEFAULT_HEIGHT = 1.55;
  var DEFAULT_ANCHOR = [0.5, 0.92];
  var DEFAULT_MOTION = { bounce: 4, wobble: 4, breathe: 0.04, squash: 0.22 };

  /* 开始界面壁纸（原始素材在 aqcs/，这里用处理好的运行期副本） */
  var WALLPAPER = { file: 'assets/ui/menu-wallpaper.png', focusX: .5, maxScale: 2 };

  var assets = BI.assets = {
    config: null,
    enemyArt: null,
    enemySprites: {},
    enemySize: { width: 52, height: 48 },
    pool: {},          // id -> 素材对象
    order: [],         // 保持配置里的顺序
    total: 0,
    done: 0,
    failures: [],
    loading: { done: 0, total: 0 },
    settled: {},
    onProgress: null,
    wallpaper: { ok: false, canvas: null, img: null, file: WALLPAPER.file },

    /** 读取配置并把所有图片挂上加载回调 */
    init: function () {
      if (this.order.length) return;
      this.loading.total += Object.keys(ENEMY_ART).length + Object.keys(BI.CHARACTERS?.characters || {}).length;
      var owner = this;
      Object.keys(ENEMY_ART).forEach(function (id) {
        var def = ENEMY_ART[id], art = { img: new Image(), crop: def.crop, ok: false };
        art.img.onload = function () {
          art.ok = art.img.naturalWidth > 0;
          owner.settle('enemy:' + id);
        };
        art.img.onerror = function () { owner.settle('enemy:' + id); };
        art.img.src = ART_BASE + def.file;
        owner.enemySprites[id] = art;
      });
      this.enemyArt = this.enemySprites.boss;
      var cfg = BI.CHARACTERS;
      if (!cfg || !cfg.characters) {
        this.config = null;
        return;
      }
      this.config = cfg;
      var self = this;

      Object.keys(cfg.characters).forEach(function (id) {
        var c = cfg.characters[id] || {};
        var a = {
          id: id,
          name: c.name || id,
          image: c.image,
          crop: c.crop || null, sprite: null,
          height: c.height || DEFAULT_HEIGHT,
          anchor: c.anchor || DEFAULT_ANCHOR,
          flipForLeft: c.flipForLeft !== false,
          tint: c.tint || null,
          motion: c.motion || DEFAULT_MOTION,
          img: new Image(),
          ok: false
        };

        a.img.onload = function () {
          if (!a.img.naturalWidth) { a.img.onerror(); return; }
          // 只在加载时裁去留白，并缓存适合实际游戏显示的纹理。
          // 每帧从千像素原图重新缩小会浪费绘制时间。
          var crop = a.crop || [0, 0, a.img.naturalWidth, a.img.naturalHeight];
          var scale = Math.min(1, 512 / crop[3]);
          var sprite = document.createElement('canvas');
          sprite.width = Math.max(1, Math.round(crop[2] * scale));
          sprite.height = Math.max(1, Math.round(crop[3] * scale));
          var pen = sprite.getContext('2d'); pen.imageSmoothingEnabled = true; pen.imageSmoothingQuality = 'high';
          pen.drawImage(a.img, crop[0], crop[1], crop[2], crop[3], 0, 0, sprite.width, sprite.height);
          a.sprite = sprite;
          a.ok = true;
          self.done++;
          self.settle('character:' + id);
        };
        a.img.onerror = function () {
          a.ok = false;
          self.done++;
          self.failures.push(a.name + '(' + a.image + ')');
          self.settle('character:' + id);
          if (window.console) {
            console.warn('[素材] 加载失败，将回退成几何占位小人：' + a.image);
          }
        };

        try {
          a.img.src = new URL(a.image, PROJECT_BASE).href;
        } catch (e) {
          a.img.onerror();
        }

        self.pool[id] = a;
        self.order.push(id);
      });
      this.total = this.order.length;
    },

    settle: function (key) {
      if (this.settled[key]) return;
      this.settled[key] = true; this.loading.done++;
      if (this.onProgress) this.onProgress(this.loading.done, this.loading.total);
    },

    readyEnemy: function (id) {
      var a = this.enemySprites[id]; return a && a.ok ? a : null;
    },

    /**
     * 壁纸取景：算出「铺满 viewW×viewH」要从源图裁哪一块（cover 裁切）。
     * 单独拆成纯函数是为了能无头测试 —— 壁纸是 1.72:1 的横图、菜单接近正方形，
     * 这一步必然要切掉左右两边，切错了会把人切没，值得单独测。
     */
    coverRect: function (sw, sh, viewW, viewH, focusX) {
      var cover = Math.max(viewW / sw, viewH / sh);   // 铺满所需的缩放比
      var cw = viewW / cover, ch = viewH / cover;     // 要裁下来的源矩形
      focusX = (focusX == null) ? .5 : focusX;
      return { x: (sw - cw) * focusX, y: (sh - ch) * .5, w: cw, h: ch };
    },

    /* ============================================================
     * 开始界面壁纸
     *
     * 两条与角色素材一致的原则：
     *   1. 加载失败绝不能挡住开始界面 —— ok 保持 false，菜单照旧用渐变背景。
     *   2. 原始壁纸是 3500px 级别的大图，**只在加载完成后按菜单尺寸裁一次**并缓存，
     *      之后每帧只画缓存。否则每帧缩放整张原图，白白吃掉帧率。
     * ============================================================ */
    loadWallpaper: function (viewW, viewH, dpr) {
      var wallpaper = this.wallpaper, img = new Image();
      if (!wallpaper.img) this.loading.total++;
      wallpaper.img = img;

      img.onload = function () {
        if (!img.naturalWidth || !img.naturalHeight) return;
        var scale = Math.max(1, Math.min(WALLPAPER.maxScale, dpr || 1));
        var rect = assets.coverRect(img.naturalWidth, img.naturalHeight, viewW, viewH, WALLPAPER.focusX);
        var cv = document.createElement('canvas');
        cv.width = Math.round(viewW * scale);
        cv.height = Math.round(viewH * scale);
        var pen = cv.getContext('2d');
        pen.imageSmoothingEnabled = true; pen.imageSmoothingQuality = 'high';
        pen.drawImage(img, rect.x, rect.y, rect.w, rect.h, 0, 0, cv.width, cv.height);
        wallpaper.canvas = cv;
        wallpaper.ok = true;
        assets.settle('wallpaper');
      };

      img.onerror = function () {
        wallpaper.ok = false;
        assets.settle('wallpaper');
        if (window.console) {
          console.warn('[素材] 开始界面壁纸加载失败，回退渐变背景：' + WALLPAPER.file);
        }
      };

      try {
        img.src = new URL(WALLPAPER.file, PROJECT_BASE).href;
      } catch (e) {
        img.onerror();
      }
      return this;
    },

    /** 已加载好才返回素材对象，否则返回 null（调用方据此回退占位小人） */
    ready: function (id) {
      var a = id ? this.pool[id] : null;
      return (a && a.ok) ? a : null;
    },

    get: function (id) { return this.pool[id] || null; },

    /** 某个位置（p1/p2）的默认角色 id */
    defaultIdFor: function (playerId) {
      var cfg = this.config;
      if (!cfg || !cfg.defaults) return null;
      return cfg.defaults[playerId] || null;
    },

    /** 可选角色列表（过滤掉配置里不存在的 id） */
    selectable: function () {
      var cfg = this.config;
      if (!cfg || !cfg.selectable) return [];
      var self = this;
      return cfg.selectable.filter(function (id) { return !!self.pool[id]; });
    },

    /** 给玩家对象套上素材；没加载好就保持 null，渲染时自动用占位小人 */
    applyTo: function (p) {
      var visualId = p.assetId === 'weilai' && p.soulEvolved ? 'weilai-awakened' : p.assetId;
      var back = p.facingDir === 'up';
      var a = (back && this.ready(visualId + '-back')) || this.ready(visualId) ||
        (back && this.ready(p.assetId + '-back')) || this.ready(p.assetId);
      p.asset = a;
      if (a) {
        p.motion = a.motion;
        p.charName = a.name;
      }
      return a;
    },

    /** 一次性给所有玩家刷新素材（图片异步到达后自动换上） */
    refreshAll: function (players) {
      for (var i = 0; i < players.length; i++) this.applyTo(players[i]);
    },

    status: function () {
      if (!this.config) return '未配置角色素材';
      if (this.done < this.total) return '素材加载中 ' + this.done + '/' + this.total;
      if (this.failures.length) return '素材失败 ' + this.failures.length + ' 个（已回退占位小人）';
      return '素材就绪 ' + this.total + ' 个';
    }
  };

})(window.BI = window.BI || {});
