/* ============================================================
 * sprites.js —— 场景与道具的程序化绘制 + 角色绘制
 *
 * 分工（见设计方案 §5.1）：
 *   场景/道具（地板、硬墙、软砖、炸弹、火焰、道具）= 代码画
 *   角色 = 外部素材（M6 接入），M1 先用几何占位小人
 * ============================================================ */
(function (BI) {
  'use strict';

  var CFG = BI.config, T = BI.T, D = BI.draw, G = BI.grid;
  var C = CFG.C, TILE = CFG.TILE, TAU = D.TAU;

  /* 静态图动效补偿参数（M6 由素材配置覆盖） */
  var MOTION = { bounce: 4, wobble: 4, breathe: 0.04, squash: 0.22 };

  var sprites = BI.sprites = {
    MOTION: MOTION,

    /* 手绘玩具质感：静态地图以双倍分辨率缓存，细节不会拖慢每帧。 */
    drawFloor: function (ctx, theme, map) {
      var cols = G.cols(map), rows = G.rows(map), fw = cols * TILE, fh = rows * TILE;
      theme = theme || sprites._theme || 'forest';
      var p = BI.THEMES[theme] || BI.THEMES.forest;
      ctx.fillStyle = p.floor; ctx.fillRect(0, 0, fw, fh);
      for (var r = 0; r < rows; r++) {
        for (var c = 0; c < cols; c++) {
          var x = c * TILE, y = r * TILE, seed = (c * 37 + r * 61) % 17;
          var grad = ctx.createLinearGradient(x, y, x + TILE, y + TILE);
          grad.addColorStop(0, (c + r) % 2 ? p.floor : p.floorAlt);
          grad.addColorStop(1, p.floor);
          ctx.fillStyle = grad; ctx.fillRect(x, y, TILE, TILE);
          ctx.lineWidth = 1; ctx.strokeStyle = theme === 'forest' ? 'rgba(80,109,64,.06)' : 'rgba(80,95,115,.12)';
          ctx.strokeRect(x + .5, y + .5, TILE - 1, TILE - 1);
          if (theme === 'forest') {
            if (seed % 3 === 0) {
              ctx.strokeStyle = 'rgba(90,125,70,.30)'; ctx.lineWidth = 1.4;
              ctx.beginPath(); ctx.moveTo(x + 12, y + 35); ctx.quadraticCurveTo(x + 9, y + 27, x + 7, y + 29);
              ctx.moveTo(x + 12, y + 35); ctx.quadraticCurveTo(x + 14, y + 25, x + 17, y + 28); ctx.stroke();
            }
            if (seed === 4 || seed === 12) {
              for (var k = 0; k < 5; k++) {
                D.circle(ctx, x + 33 + Math.cos(k * TAU / 5) * 2.6, y + 17 + Math.sin(k * TAU / 5) * 2.6, 2.2);
                ctx.fillStyle = seed === 4 ? '#fff7d8' : '#f4c8b8'; ctx.fill();
              }
              D.circle(ctx, x + 33, y + 17, 1.5); ctx.fillStyle = '#d9b764'; ctx.fill();
            }
            if (seed % 4 === 1) {
              D.ellipse(ctx, x + 20, y + 14, 2, 1.2); ctx.fillStyle = 'rgba(255,255,225,.5)'; ctx.fill();
            }
          } else if (theme === 'factory') {
            D.blob(ctx, x + 3, y + 3, 42, 42, 5, null, 'rgba(248,255,255,.35)', 1);
            if (seed % 3 === 0) {
              [8, 40].forEach(function (dx) { D.circle(ctx, x + dx, y + 8, 1.2); ctx.fillStyle = '#8ea6ae'; ctx.fill(); });
              ctx.strokeStyle = 'rgba(80,113,127,.17)'; ctx.lineWidth = 1.5;
              ctx.beginPath(); ctx.moveTo(x + 12, y + 36); ctx.lineTo(x + 36, y + 12); ctx.stroke();
            }
            if ((c === 4 || c === 10) && r % 3 === 1) {
              ctx.strokeStyle = 'rgba(221,175,74,.55)'; ctx.lineWidth = 2;
              ctx.beginPath(); ctx.moveTo(x + 17, y + 25); ctx.lineTo(x + 24, y + 18); ctx.lineTo(x + 31, y + 25); ctx.stroke();
            }
          } else {
            if (seed % 3 === 0) {
              ctx.save(); ctx.translate(x + 24, y + 24); ctx.rotate(Math.PI / 4);
              D.blob(ctx, -6, -6, 12, 12, 3, ['#e8bccc', '#b9d9d4', '#ddcca7'][seed % 3], null); ctx.restore();
            }
            if (seed % 4 === 0) {
              ctx.fillStyle = 'rgba(190,146,182,.38)'; ctx.fillRect(x + 9, y + 12, 2, 4);
              D.circle(ctx, x + 37, y + 36, 1.5); ctx.fillStyle = '#ebc387'; ctx.fill();
            }
          }
        }
      }
    },

    drawHard: function (ctx, c, r, theme) {
      theme = theme || sprites._theme || 'forest';
      var p = BI.THEMES[theme] || BI.THEMES.forest;
      var x = c * TILE, y = r * TILE, seed = (c * 13 + r * 7) % 5;
      ctx.save();
      D.blob(ctx, x + 3, y + 8, 43, 39, 12, 'rgba(32,54,56,.22)', null);
      var shade = ctx.createLinearGradient(x, y, x, y + 47);
      shade.addColorStop(0, p.wall); shade.addColorStop(1, p.wallDark);
      D.blob(ctx, x + 2, y + 3, 44, 41, 11, shade, p.wallDark, 1.5);
      if (theme === 'forest' && seed === 1) {
        D.blob(ctx, x + 19, y + 27, 10, 15, 3, '#ad8b5b', '#6d644b', 1);
        [[35, 21], [27, 17], [19, 13]].forEach(function (v, i) {
          ctx.beginPath(); ctx.moveTo(x + 24, y + v[0] - 26); ctx.lineTo(x + 24 + v[1], y + v[0]);
          ctx.quadraticCurveTo(x + 24, y + v[0] + 6, x + 24 - v[1], y + v[0]); ctx.closePath();
          ctx.fillStyle = ['#47866a', '#62a47d', '#87bb90'][i]; ctx.fill(); ctx.strokeStyle = '#416b56'; ctx.lineWidth = 1; ctx.stroke();
        });
      } else if (theme === 'forest' && seed === 3) {
        D.blob(ctx, x + 18, y + 25, 12, 17, 4, '#b29469', '#74674d', 1);
        [[15,20,12],[30,20,13],[23,11,12]].forEach(function (v, i) {
          D.circle(ctx, x+v[0],y+v[1],v[2]); ctx.fillStyle=['#96b994','#aec999','#bdd5a1'][i];ctx.fill();
        });
        [[12,17],[29,12],[33,24],[22,28]].forEach(function(v){
          D.circle(ctx,x+v[0],y+v[1],3);ctx.fillStyle='#f5d1d1';ctx.fill();
          D.circle(ctx,x+v[0],y+v[1],1);ctx.fillStyle='#e6ad87';ctx.fill();
        });
      } else if (theme === 'forest') {
        D.blob(ctx, x + 17, y + 24, 14, 19, 4, '#987b56', '#695b46', 1);
        ctx.strokeStyle = '#ba9a6c'; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.moveTo(x + 22, y + 30); ctx.lineTo(x + 21, y + 39); ctx.stroke();
        var leaf = ctx.createLinearGradient(x, y, x, y + 35);
        leaf.addColorStop(0, seed % 2 ? '#b4cf8e' : '#a3c58c');
        leaf.addColorStop(.5, p.wall); leaf.addColorStop(1, '#4f8063');
        ctx.beginPath(); ctx.moveTo(x + 5, y + 29);
        ctx.bezierCurveTo(x - 1, y + 20, x + 7, y + 12, x + 13, y + 13);
        ctx.bezierCurveTo(x + 10, y - 1, x + 34, y - 1, x + 35, y + 11);
        ctx.bezierCurveTo(x + 48, y + 11, x + 48, y + 30, x + 40, y + 32);
        ctx.quadraticCurveTo(x + 23, y + 41, x + 5, y + 29); ctx.closePath();
        ctx.fillStyle = leaf; ctx.fill(); ctx.strokeStyle = '#49705a'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x + 9, y + 20); ctx.quadraticCurveTo(x + 15, y + 15, x + 18, y + 18);
        ctx.moveTo(x + 21, y + 8); ctx.quadraticCurveTo(x + 28, y + 4, x + 31, y + 11);
        ctx.strokeStyle = 'rgba(232,246,177,.6)'; ctx.lineWidth = 2.2; ctx.stroke();
        D.ellipse(ctx, x + 33, y + 26, 4, 2); ctx.fillStyle = '#a0bd79'; ctx.fill();
        if (seed === 0) { D.circle(ctx, x + 14, y + 27, 2.5); ctx.fillStyle = '#e7be9a'; ctx.fill(); }
      } else if (theme === 'factory') {
        D.blob(ctx, x + 5, y + 4, 38, 9, 4, p.top, null);
        D.blob(ctx, x + 8, y + 17, 32, 19, 4, '#304e60', '#a0bcc7', 1);
        if (seed % 2) {
          for (var v = 0; v < 4; v++) D.blob(ctx, x + 12, y + 20 + v * 3.5, 17, 1.6, 1, '#7798a6', null);
          D.circle(ctx, x + 35, y + 24, 2.3); ctx.fillStyle = '#b5e7d6'; ctx.fill();
          D.circle(ctx, x + 35, y + 31, 1.7); ctx.fillStyle = '#ffcd84'; ctx.fill();
        } else {
          var glass = ctx.createLinearGradient(x, y + 18, x + 36, y + 35);
          glass.addColorStop(0, '#9edbd2'); glass.addColorStop(1, '#4e94a7');
          D.blob(ctx, x + 12, y + 20, 24, 12, 3, glass, null);
          ctx.strokeStyle = 'rgba(227,255,247,.65)'; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x + 15, y + 26); ctx.lineTo(x + 20, y + 26); ctx.lineTo(x + 23, y + 22);
          ctx.lineTo(x + 26, y + 29); ctx.lineTo(x + 32, y + 25); ctx.stroke();
        }
        [[8, 10], [40, 10], [8, 39], [40, 39]].forEach(function (v) {
          D.circle(ctx, x + v[0], y + v[1], 1.6); ctx.fillStyle = '#d1e3e6'; ctx.fill();
        });
      } else {
        D.blob(ctx, x + 6, y + 15, 36, 26, 7, '#b28fb4', null);
        D.blob(ctx, x + 12, y + 22, 24, 14, 5, '#f6dcdf', '#926e98', 1);
        ctx.save();
        D.roundRect(ctx, x + 3, y + 4, 42, 18, 7); ctx.clip();
        ctx.fillStyle = '#f9e5dc'; ctx.fillRect(x + 3, y + 4, 42, 18);
        for (var k = 0; k < 5; k++) {
          ctx.fillStyle = k % 2 ? '#a5d5d0' : '#dc9fbd'; ctx.fillRect(x + 3 + k * 9, y + 4, 6, 18);
        }
        ctx.restore();
        D.blob(ctx, x + 3, y + 4, 42, 18, 7, null, '#9c789e', 1.5);
        sprites.drawItemIcon(ctx, 'star', x + 24, y + 29, 11);
        D.circle(ctx, x + 9, y + 40, 2); D.circle(ctx, x + 39, y + 40, 2);
        ctx.fillStyle = '#ffe1a4'; ctx.fill();
      }
      ctx.restore();
    },

    drawBrick: function (ctx, c, r, theme, variant) {
      theme = theme || sprites._theme || 'forest';
      var x = c * TILE, y = r * TILE;
      variant = variant || 0;
      if (variant) { sprites.drawBrickVariant(ctx, c, r, theme, variant); return; }
      ctx.save();
      D.blob(ctx, x + 5, y + 9, 39, 37, 8, 'rgba(45,50,56,.18)', null);
      if (theme === 'forest') {
        var wood = ctx.createLinearGradient(x, y, x + 38, y + 42);
        wood.addColorStop(0, '#dfbc87'); wood.addColorStop(.5, '#c49d6b'); wood.addColorStop(1, '#ae8358');
        D.blob(ctx, x + 5, y + 5, 38, 37, 6, wood, '#947451', 1.5);
        ctx.strokeStyle = '#b18b5e'; ctx.lineWidth = 1;
        for (var j = 0; j < 3; j++) { ctx.beginPath(); ctx.moveTo(x + 8, y + 14 + j * 8); ctx.lineTo(x + 40, y + 14 + j * 8); ctx.stroke(); }
        D.blob(ctx, x + 8, y + 6, 5, 34, 1, '#efd2a2', '#b48d61', 1);
        D.blob(ctx, x + 35, y + 6, 5, 34, 1, '#efd2a2', '#b48d61', 1);
        ctx.strokeStyle = '#efd0a0'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(x + 15, y + 34); ctx.lineTo(x + 33, y + 13); ctx.stroke();
        ctx.fillStyle = '#755e49'; [[10, 10], [38, 10], [10, 37], [38, 37]].forEach(function (p) { D.circle(ctx, x + p[0], y + p[1], 1); ctx.fill(); });
      } else if (theme === 'factory') {
        var box = ctx.createLinearGradient(x, y, x, y + 42);
        box.addColorStop(0, '#e5b57f'); box.addColorStop(1, '#bf8a63');
        D.blob(ctx, x + 5, y + 5, 38, 37, 5, box, '#956e56', 1.5);
        D.blob(ctx, x + 7, y + 7, 34, 5, 2, '#f3d2a0', null);
        D.blob(ctx, x + 8, y + 28, 32, 9, 2, '#f1cc7d', null);
        ctx.save(); D.roundRect(ctx, x + 8, y + 28, 32, 9, 2); ctx.clip();
        ctx.strokeStyle = '#716558'; ctx.lineWidth = 4;
        for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(x + 7 + i * 9, y + 38); ctx.lineTo(x + 15 + i * 9, y + 27); ctx.stroke(); }
        ctx.restore();
        D.blob(ctx, x + 17, y + 15, 14, 9, 2, '#e6dfcd', null);
        ctx.fillStyle = '#a09684'; ctx.fillRect(x + 21, y + 18, 6, 2);
      } else {
        var pink = (c + r) % 2 === 0;
        D.blob(ctx, x + 6, y + 10, 36, 32, 6, pink ? '#dcadbd' : '#a9cfcb', pink ? '#b7829b' : '#76a6a3', 1.5);
        D.blob(ctx, x + 4, y + 6, 40, 10, 4, pink ? '#f4c9d5' : '#c6e4dc', null);
        D.blob(ctx, x + 20, y + 6, 8, 36, 1, '#fff0ca', null);
        D.blob(ctx, x + 6, y + 23, 36, 6, 1, '#fff0ca', null);
        ctx.strokeStyle = '#d8b77d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(x + 18, y + 6, 7, 4, .4, 0, TAU); ctx.ellipse(x + 30, y + 6, 7, 4, -.4, 0, TAU); ctx.stroke();
      }
      ctx.restore();
    },

    drawBrickVariant: function (ctx, c, r, theme, variant) {
      var x=c*TILE, y=r*TILE;
      ctx.save(); D.groundShadow(ctx,x+24,y+40,18,5,.18);
      if(theme==='forest' && variant===1) {
        // 横卧空心树干：端面年轮、树皮与侧芽。
        D.blob(ctx,x+6,y+15,35,23,9,'#ad855b','#806749',1.5);
        D.ellipse(ctx,x+37,y+26,7,12);ctx.fillStyle='#e4c69a';ctx.fill();ctx.strokeStyle='#916f4d';ctx.stroke();
        D.ellipse(ctx,x+38,y+26,3,7);ctx.fillStyle='#725f48';ctx.fill();
        ctx.strokeStyle='#d2ae7e';ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(x+10,y+20);ctx.quadraticCurveTo(x+22,y+17,x+31,y+20);
        ctx.moveTo(x+11,y+31);ctx.lineTo(x+27,y+32);ctx.stroke();
        D.ellipse(ctx,x+18,y+13,7,3);ctx.fillStyle='#96b87c';ctx.fill();
      } else if(theme==='forest' && variant===3) {
        // 幼树属于软障碍：细树干、浅色嫩叶与松土底座，与硬树篱明显区分。
        D.ellipse(ctx,x+24,y+39,17,5);ctx.fillStyle='#c0a97e';ctx.fill();
        D.blob(ctx,x+21,y+20,6,20,2,'#c8a276','#9c805d',1);
        [[15,20,10],[32,20,10],[24,11,12]].forEach(function(v,i){
          D.circle(ctx,x+v[0],y+v[1],v[2]);ctx.fillStyle=['#c2d99c','#a8cd8f','#d0e2ab'][i];ctx.fill();ctx.strokeStyle='#91b27c';ctx.lineWidth=1;ctx.stroke();
        });
        ctx.strokeStyle='#eff3cb';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x+23,y+10,6,3.6,5.1);ctx.stroke();
      } else if(theme==='forest') {
        // 蘑菇丛：可破坏的森林软障碍。
        [[16,29,11,'#d38f78'],[32,33,10,'#d8ad78'],[26,19,12,'#d89c9a']].forEach(function(v){
          D.blob(ctx,x+v[0]-3,y+v[1]-2,6,12,3,'#f3e4bf','#bcab83',1);
          ctx.beginPath();ctx.ellipse(x+v[0],y+v[1]-4,v[2],8,0,Math.PI,TAU);ctx.quadraticCurveTo(x+v[0],y+v[1]+2,x+v[0]-v[2],y+v[1]-4);
          ctx.fillStyle=v[3];ctx.fill();ctx.strokeStyle='#aa826e';ctx.lineWidth=1;ctx.stroke();
          D.circle(ctx,x+v[0]-3,y+v[1]-8,2);ctx.fillStyle='#fff0d6';ctx.fill();
        });
      } else if(theme==='factory' && variant===1) {
        D.blob(ctx,x+8,y+11,32,29,6,'#ba9475','#816e5e',1.5);
        D.ellipse(ctx,x+24,y+11,16,6);ctx.fillStyle='#d6b596';ctx.fill();ctx.strokeStyle='#907762';ctx.stroke();
        D.blob(ctx,x+7,y+16,34,4,2,'#677d87',null);D.blob(ctx,x+7,y+32,34,4,2,'#677d87',null);
        D.circle(ctx,x+24,y+26,4);ctx.fillStyle='#f5d68e';ctx.fill();
      } else if(theme==='factory') {
        D.blob(ctx,x+9,y+10,30,31,6,'#c1a789','#8b7a65',1.5);
        D.blob(ctx,x+16,y+5,16,8,3,'#b7c8c4','#6c868b',1);
        D.blob(ctx,x+14,y+17,20,15,4,'#7ca5a1','#5a8587',1);
        ctx.strokeStyle='#d4f2d3';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x+20,y+20);ctx.lineTo(x+27,y+20);ctx.lineTo(x+22,y+28);ctx.lineTo(x+29,y+28);ctx.stroke();
      } else if(variant===1) {
        D.blob(ctx,x+9,y+29,30,12,4,'#d4a8bf','#a77f9d',1);
        [[15,15,'#a9dcd5'],[31,14,'#efb7c8'],[24,10,'#eed19b']].forEach(function(v){
          ctx.beginPath();ctx.moveTo(x+v[0],y+v[1]+9);ctx.lineTo(x+24,y+33);ctx.strokeStyle='#b894b3';ctx.lineWidth=1;ctx.stroke();
          D.ellipse(ctx,x+v[0],y+v[1],7,9);ctx.fillStyle=v[2];ctx.fill();ctx.strokeStyle='#ac8da7';ctx.stroke();
          D.circle(ctx,x+v[0]-2,y+v[1]-3,1.5);ctx.fillStyle='#fff1df';ctx.fill();
        });
      } else {
        D.blob(ctx,x+8,y+29,32,13,4,'#a5cfcd','#7da4ab',1);
        ctx.strokeStyle='#bd9a7b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+24,y+30);ctx.lineTo(x+24,y+12);ctx.stroke();
        [[18,17,9],[29,16,10],[24,9,10]].forEach(function(v){D.circle(ctx,x+v[0],y+v[1],v[2]);ctx.fillStyle='#f2c6d6';ctx.fill();});
        ctx.strokeStyle='#d7a3ba';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(x+24,y+14,8,.3,2.6);ctx.stroke();
      }
      ctx.restore();
    },

    drawTrack: function(ctx, lm) {
      if(!lm || !lm.path.length)return;
      var park=lm.theme==='park';
      ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
      ctx.beginPath();lm.path.forEach(function(cell,i){var x=G.centerX(cell[0]),y=G.centerY(cell[1]);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();
      ctx.lineWidth=46;ctx.strokeStyle=park?'#b38ba5':'#7a9197';ctx.stroke();
      ctx.lineWidth=40;ctx.strokeStyle=park?'#ead3b9':'#3e5560';ctx.stroke();
      ctx.lineWidth=32;ctx.strokeStyle=park?'#dec0cb':'#596e76';ctx.stroke();
      ctx.setLineDash(park?[3,9]:[2,10]);ctx.lineWidth=30;ctx.strokeStyle=park?'rgba(255,246,213,.42)':'rgba(183,208,206,.22)';ctx.stroke();
      ctx.restore();
    },

    drawLandmark: function(ctx, lm) {
      if(!lm)return;
      var x=G.centerX(7),y=G.centerY(6);
      ctx.save();
      D.groundShadow(ctx,x,y+58,68,17,.28);
      if(lm.theme==='forest') {
        // 三格宽的古树轮廓完全落在真实碰撞区域内。
        [[-42,53,27,11],[35,51,29,12],[-17,60,29,9]].forEach(function(v){
          D.ellipse(ctx,x+v[0],y+v[1],v[2],v[3]);ctx.fillStyle='#927353';ctx.fill();
        });
        var bark=ctx.createLinearGradient(x-25,y,x+30,y+65);bark.addColorStop(0,'#c1a16c');bark.addColorStop(1,'#80634d');
        D.blob(ctx,x-27,y-12,54,76,17,bark,'#6e6248',2);
        ctx.strokeStyle='#e3c38b';ctx.lineWidth=3;
        ctx.beginPath();ctx.moveTo(x-12,y+5);ctx.quadraticCurveTo(x-20,y+35,x-10,y+53);
        ctx.moveTo(x+17,y+8);ctx.quadraticCurveTo(x+7,y+31,x+18,y+53);ctx.stroke();
        D.ellipse(ctx,x+1,y+30,11,16);ctx.fillStyle='#6d6149';ctx.fill();
        var leaves=ctx.createLinearGradient(x,y-68,x,y+22);leaves.addColorStop(0,'#d0dc9d');leaves.addColorStop(.4,'#8fba7a');leaves.addColorStop(1,'#4e8565');
        [[-39,-13,29],[-32,-39,32],[2,-43,35],[37,-30,30],[40,0,27],[2,2,37]].forEach(function(v){
          D.circle(ctx,x+v[0],y+v[1],v[2]);ctx.fillStyle=leaves;ctx.fill();ctx.strokeStyle='#4e7857';ctx.lineWidth=1;ctx.stroke();
        });
        ctx.strokeStyle='#e1e7af';ctx.lineWidth=3;
        [[-41,-42],[2,-59],[37,-36]].forEach(function(v){ctx.beginPath();ctx.arc(x+v[0],y+v[1],12,3.7,5.3);ctx.stroke();});
        [[-42,-10],[17,-22],[42,0],[-5,-52]].forEach(function(v){
          D.circle(ctx,x+v[0],y+v[1],5);ctx.fillStyle='#f0c284';ctx.fill();
          D.ellipse(ctx,x+v[0]+3,y+v[1]-6,4,2);ctx.fillStyle='#527c51';ctx.fill();
        });
      } else if(lm.theme==='factory') {
        var steel=ctx.createLinearGradient(x-60,y-60,x+60,y+60);steel.addColorStop(0,'#b6c8c9');steel.addColorStop(1,'#4e6c7d');
        D.blob(ctx,x-65,y-63,130,129,17,steel,'#40596d',3);
        D.blob(ctx,x-55,y-51,110,106,11,'#41596a','#c3d7d4',2);
        D.circle(ctx,x,y-1,43);ctx.fillStyle='#a4b8bc';ctx.fill();ctx.lineWidth=4;ctx.strokeStyle='#d4e0d6';ctx.stroke();
        D.circle(ctx,x,y-1,33);ctx.fillStyle='#547e8b';ctx.fill();
        var glow=ctx.createRadialGradient(x-7,y-12,2,x,y,28);glow.addColorStop(0,'#e9f7d4');glow.addColorStop(.5,'#96d2c0');glow.addColorStop(1,'#4c97a5');
        D.circle(ctx,x,y-1,25);ctx.fillStyle=glow;ctx.fill();
        for(var k=0;k<4;k++) {var a=k*Math.PI/2+.4;D.circle(ctx,x+Math.cos(a)*51,y+Math.sin(a)*51,4);ctx.fillStyle='#efd39b';ctx.fill();}
        D.blob(ctx,x-42,y+48,84,8,3,'#d8ba79',null);
        for(var n=0;n<5;n++){ctx.fillStyle='#5b6670';ctx.fillRect(x-35+n*16,y+49,7,6);}
      } else {
        D.ellipse(ctx,x,y+37,68,28);ctx.fillStyle='#b68b9e';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#886d8c';ctx.stroke();
        D.ellipse(ctx,x,y+29,65,27);ctx.fillStyle='#e6c6bb';ctx.fill();ctx.strokeStyle='#f9e0b8';ctx.stroke();
        [-43,43].forEach(function(dx){D.blob(ctx,x+dx-3,y-31,6,62,3,'#e7c791','#a48772',1);});
        D.blob(ctx,x-7,y-53,14,85,5,'#efd5a8','#b29581',1);
        // 旋转木马的分瓣帐篷与珠灯。
        for(var i=0;i<8;i++) {
          var a0=Math.PI+i*Math.PI/8,a1=Math.PI+(i+1)*Math.PI/8;
          ctx.beginPath();ctx.moveTo(x,y-64);ctx.lineTo(x+Math.cos(a0)*69,y-13+Math.sin(a0)*15);
          ctx.lineTo(x+Math.cos(a1)*69,y-13+Math.sin(a1)*15);ctx.closePath();
          ctx.fillStyle=i%2?'#f5dfb9':'#d5a2c1';ctx.fill();
        }
        D.blob(ctx,x-69,y-17,138,12,6,'#f0c9ca','#b58b9e',1.5);
        for(var j=0;j<10;j++){D.circle(ctx,x-59+j*13,y-11,2.7);ctx.fillStyle='#fff1ba';ctx.fill();}
        sprites.drawItemIcon(ctx,'star',x,y-66,17);
      }
      ctx.restore();
    },

    drawSceneryMotion: function(ctx,lm,time) {
      if(!lm)return;
      ctx.save();
      if(lm.theme==='factory') {
        for(var i=0;i<lm.path.length;i++) {
          var progress=i+((time||0)*1.65)%1,pt=BI.scenery.point(lm.path,progress);
          var at=BI.scenery.nearest(lm.path,pt.x,pt.y);
          ctx.save();ctx.translate(pt.x,pt.y);ctx.rotate(Math.atan2(at.dy,at.dx));
          ctx.strokeStyle='#e8ce8c';ctx.lineWidth=2;ctx.lineCap='round';
          ctx.beginPath();ctx.moveTo(-4,-5);ctx.lineTo(2,0);ctx.lineTo(-4,5);ctx.stroke();ctx.restore();
        }
        var x=G.centerX(7),y=G.centerY(6);ctx.save();ctx.translate(x,y-1);ctx.rotate((time||0)*.6);
        ctx.strokeStyle='rgba(232,255,222,.65)';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,19,.3,2.4);ctx.arc(0,0,19,3.4,5.5);ctx.stroke();ctx.restore();
      } else if(lm.theme==='park') {
        for(var k=0;k<6;k++) {
          var p=BI.scenery.point(lm.path,k*lm.path.length/6+(time||0)*1.8);
          var bob=Math.sin((time||0)*4+k)*2;
          ctx.save();ctx.translate(p.x,p.y+bob);
          ctx.strokeStyle='#b29177';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-24);ctx.lineTo(0,12);ctx.stroke();
          D.blob(ctx,-12,-8,24,14,6,k%2?'#f7e3bf':'#b7d7d0','#b2919d',1);
          D.blob(ctx,5,-18,9,17,4,k%2?'#f7e3bf':'#b7d7d0','#b2919d',1);
          ctx.beginPath();ctx.moveTo(7,-17);ctx.lineTo(4,-24);ctx.lineTo(10,-19);ctx.fillStyle='#b58fa8';ctx.fill();
          ctx.strokeStyle='#a7839b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-8,3);ctx.lineTo(-8,11);ctx.moveTo(8,3);ctx.lineTo(8,11);ctx.stroke();
          D.blob(ctx,-5,-10,10,6,2,'#d09bb6',null);D.circle(ctx,11,-15,1);ctx.fillStyle='#5b5266';ctx.fill();ctx.restore();
        }
      }
      ctx.restore();
    },

    drawMap: function (ctx, map, theme, time) {
      var cols = G.cols(map), rows = G.rows(map), fw = cols * TILE, fh = rows * TILE;
      theme = BI.THEMES[theme] ? theme : 'forest';
      var landmark = map.landmark && map.landmark.theme === theme ? map.landmark : null;
      var key = cols + 'x' + rows + ':' + theme + ':' + (landmark ? 'landmark:' : '') + Array.prototype.join.call(map, '') + ':' + (map.variants ? Array.prototype.join.call(map.variants, '') : '');
      var cached = sprites._mapCache;
      if (!cached || cached.key !== key) {
        var off = document.createElement('canvas'); off.width = fw * 2; off.height = fh * 2;
        var pen = off.getContext('2d'); pen.scale(2, 2);
        sprites.drawFloor(pen, theme, map);
        sprites.drawTrack(pen, landmark);
        for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
          var v = map[r * cols + c];
          if (landmark && BI.levelgen.isCore(theme,c,r)) continue;
          if (v === T.HARD) sprites.drawHard(pen, c, r, theme);
          else if (v === T.BRICK) sprites.drawBrick(pen, c, r, theme, map.variants ? map.variants[r*cols+c] : 0);
        }
        sprites.drawLandmark(pen,landmark);
        // 外缘灯串与树影都只占用不可通行的边界。
        if (theme === 'park') {
          pen.strokeStyle = '#8c718d'; pen.lineWidth = 1.5; pen.beginPath();
          pen.moveTo(12, 8); pen.quadraticCurveTo(fw / 2, 35, fw - 12, 8); pen.stroke();
          for (var k = 1; k < 20; k++) {
            var xx = k * 36, yy = 8 + Math.sin(k / 20 * Math.PI) * 13;
            D.circle(pen, xx, yy, 3); pen.fillStyle = ['#ffdf9a', '#dcafc7', '#a9e0d5'][k % 3]; pen.fill();
          }
        }
        cached = sprites._mapCache = { key: key, canvas: off };
      }
      ctx.drawImage(cached.canvas, 0, 0, fw, fh);
      sprites.drawSceneryMotion(ctx,landmark,time);
      // 前景柔光微粒：没有碰撞，不盖住炸弹与道具。
      ctx.save();
      for (var i = 0; i < 14; i++) {
        var xx = (i * 97 + Math.sin((time || 0) * .3 + i) * 13) % fw;
        var yy = (i * 83 - (time || 0) * (theme === 'forest' ? 4 : 2) + fh * 10) % fh;
        D.circle(ctx, xx, yy, i % 3 === 0 ? 2 : 1); ctx.fillStyle = 'rgba(255,249,214,.38)'; ctx.fill();
      }
      ctx.restore();
    },

    /* ---------------- 炸弹 ---------------- */

    /**
     * 爆炸范围预览：把「这颗炸弹会炸到哪几格」铺在地上。
     *
     * 范围来自 rules.bombCells —— 和真实爆炸同一份计算，
     * 所以预览永远不会和实际炸的范围不一致。
     * 画在道具下面，免得盖住道具图标。
     */
    drawBombZones: function (ctx, world, time) {
      var insight = world.players.some(function (p) { return p.alive && p.assetId === 'xiaotian' && p.insightTime > 0; });
      if (!insight || !world.bombs.length) return;

      for (var i = 0; i < world.bombs.length; i++) {
        var b = world.bombs[i];
        var geo = BI.rules.bombCells(world, b);

        var total = b.fuseTotal || CFG.FUSE;
        var urgency = 1 - Math.max(0, b.fuse) / total;   // 0 -> 1，越接近爆炸越大
        var danger = b.fuse <= CFG.FUSE_BLINK;

        for (var j = 0; j < geo.cells.length; j++) {
          var c = geo.cells[j][0], r = geo.cells[j][1];
          // 会被炸掉的软砖标得更重 —— 让玩家一眼看出"这一格炸完就通了"
          var isBrick = false;
          for (var k = 0; k < geo.bricks.length; k++) {
            if (geo.bricks[k][0] === c && geo.bricks[k][1] === r) { isBrick = true; break; }
          }

          ctx.save();
          // 透明度要够狠才看得见：橙色低透明度铺在绿地上只会变成一层"脏绿"，
          // 完全读不出来（第一版就是这样，截图放大才看出来）。
          var alpha = danger
            ? (Math.sin(time * 24) > 0 ? 0.52 : 0.32)
            : 0.30 + urgency * 0.16;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = insight ? '#5dc7e6' : (isBrick ? '#ff5a3c' : '#ff3d1f');
          D.roundRect(ctx, c * TILE + 3, r * TILE + 3, TILE - 6, TILE - 6, 9);
          ctx.fill();

          // 白描边：软砖本来就是橙的，只有描边才能让范围在砖块上也分得清
          ctx.globalAlpha = Math.min(1, alpha * 1.7);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
          ctx.restore();
        }
      }
    },

    /** 引信倒计时环 + 剩余秒数 */
    drawFuseIndicator: function (ctx, cx, cy, fuse, total, time) {
      if (!CFG.SHOW_FUSE_TIMER) return;
      var frac = Math.max(0, Math.min(1, fuse / (total || CFG.FUSE)));
      var danger = fuse <= CFG.FUSE_BLINK;

      // 环：从 12 点开始顺时针消耗
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 21, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = danger
        ? (Math.sin(time * 26) > 0 ? '#ff5a3c' : '#ff9e8c')
        : 'rgba(255,255,255,.9)';
      ctx.stroke();

      // 底圈：让剩余量看得更清楚
      ctx.beginPath();
      ctx.arc(cx, cy, 21, 0, Math.PI * 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(0,0,0,.28)';
      ctx.stroke();
      ctx.restore();

      // 秒数：压在弹身上（弹是深色，白字清楚）
      D.text(ctx, fuse.toFixed(1), cx, cy + 0.5, {
        font: 'bold 13px Consolas, monospace',
        align: 'center', baseline: 'middle',
        fill: danger ? '#ffd0c8' : '#ffffff',
        stroke: 'rgba(0,0,0,.55)', strokeWidth: 3
      });
    },

    drawBombs: function (ctx, bombs, time) {
      for (var i = 0; i < bombs.length; i++) {
        var b = bombs[i];
        var pos = G.bombPosition(b), cx = pos.x, cy = pos.y;

        // 引信快到了：闪红 + 加速脉动
        var danger = b.fuse <= CFG.FUSE_BLINK;
        var pulseSpeed = danger ? 22 : 6;
        var pulse = 1 + Math.sin(time * pulseSpeed) * (danger ? 0.13 : 0.06);
        var blink = danger && (Math.sin(time * 30) > 0);
        var body = blink ? C.bombHot : C.bombBody;

        D.groundShadow(ctx, cx, cy + 15, 15, 5.5, .22);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(pulse, pulse);
        // 弹身
        D.circle(ctx, 0, 0, CFG.BOMB_RADIUS);
        ctx.fillStyle = body; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.stroke();
        if (b.breakHard) {
          D.circle(ctx, 0, 0, CFG.BOMB_RADIUS + 2);
          ctx.lineWidth = 2; ctx.strokeStyle = '#f6a35e'; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(3, -1);
          ctx.lineTo(-2, 2); ctx.lineTo(4, 9);
          ctx.strokeStyle = '#ffe2a3'; ctx.stroke();
        }
        // 高光
        ctx.globalAlpha = .55;
        D.ellipse(ctx, -5.5, -6, 5, 3.6);
        ctx.fillStyle = C.bombHi; ctx.fill();
        ctx.globalAlpha = 1;
        // 引信
        ctx.beginPath();
        ctx.moveTo(0, -16);
        ctx.quadraticCurveTo(6, -24, 2, -28);
        ctx.lineWidth = 3; ctx.strokeStyle = '#c9a227'; ctx.lineCap = 'round'; ctx.stroke();
        ctx.restore();
      }
    },

    /**
     * 引信倒计时环 + 剩余秒数。
     *
     * 与弹身处于相同的场地深度，后方读数不会穿透前方角色。
     */
    drawFuseTimers: function (ctx, bombs, time) {
      if (!CFG.SHOW_FUSE_TIMER) return;
      for (var i = 0; i < bombs.length; i++) {
        var b = bombs[i];
        var pos = G.bombPosition(b), cx = pos.x, cy = pos.y;
        sprites.drawFuseIndicator(ctx, cx, cy, b.fuse, b.fuseTotal, time);
      }
    },

    /* ---------------- 火焰 ---------------- */
    drawFlames: function (ctx, flames) {
      for (var i = 0; i < flames.length; i++) {
        var f = flames[i];
        var age = 1 - f.t / f.total;              // 0 -> 1
        // 扩张然后消退
        var grow = age < 0.25 ? (age / 0.25) : 1;
        var fade = age < 0.7 ? 1 : 1 - (age - 0.7) / 0.3;

        for (var j = 0; j < f.cells.length; j++) {
          var c = f.cells[j][0], r = f.cells[j][1];
          var cx = c * TILE + TILE / 2, cy = r * TILE + TILE / 2;
          var size = (TILE / 2 - 1) * grow;

          ctx.save();
          ctx.globalAlpha = D.clamp(fade, 0, 1);

          // 外圈橙
          D.roundRect(ctx, cx - size, cy - size, size * 2, size * 2, size * 0.55);
          ctx.fillStyle = C.flameOut; ctx.fill();
          // 中圈黄
          var s2 = size * 0.62;
          D.roundRect(ctx, cx - s2, cy - s2, s2 * 2, s2 * 2, s2 * 0.55);
          ctx.fillStyle = C.flameMid; ctx.fill();
          // 核心白
          var s3 = size * 0.30;
          D.roundRect(ctx, cx - s3, cy - s3, s3 * 2, s3 * 2, s3 * 0.6);
          ctx.fillStyle = C.flameCore; ctx.fill();

          ctx.restore();
        }
      }
    },

    /* ---------------- 道具 ---------------- */
    // 以 32×32 为坐标绘制，缩放后仍保持清晰；道具本体不依赖文字或字体。
    drawItemIcon: function (ctx, type, x, y, size) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(size / 32, size / 32);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.lineWidth = 2; ctx.strokeStyle = '#39445c';
      function shape(fill) { ctx.fillStyle = fill; ctx.fill(); ctx.stroke(); }
      function dot(x, y, r, color) { D.circle(ctx, x, y, r); ctx.fillStyle = color; ctx.fill(); }
      if (type === 'speed') {
        ctx.beginPath(); ctx.moveTo(-12, 1); ctx.lineTo(-9, -9);
        ctx.quadraticCurveTo(-4, -5, 0, -8); ctx.lineTo(4, -1);
        ctx.quadraticCurveTo(14, -1, 14, 6); ctx.lineTo(13, 10);
        ctx.lineTo(-12, 10); ctx.closePath(); shape('#6de0b6');
        ctx.beginPath(); ctx.moveTo(-11, 6); ctx.lineTo(13, 6); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(2, -4);
        ctx.moveTo(0, 0); ctx.lineTo(5, -1); ctx.stroke();
      } else if (type === 'glove') {
        ctx.beginPath(); ctx.moveTo(-8, 8); ctx.lineTo(-13, -1);
        ctx.quadraticCurveTo(-17, -10, -11, -8); ctx.lineTo(-7, -3); ctx.lineTo(-7, -10);
        ctx.bezierCurveTo(-7, -17, 10, -17, 11, -8); ctx.lineTo(11, 4);
        ctx.quadraticCurveTo(11, 11, 5, 11); ctx.lineTo(-5, 11); ctx.closePath(); shape('#ffc077');
        D.blob(ctx, -8, 7, 17, 7, 3, '#f18b72', '#39445c', 2);
        ctx.strokeStyle = '#fff3d6'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-2, -9); ctx.quadraticCurveTo(4, -12, 7, -7); ctx.stroke();
      } else if (type === 'fruit') {
        ctx.beginPath();ctx.moveTo(0,-8);ctx.bezierCurveTo(-14,-16,-17,5,-6,12);
        ctx.quadraticCurveTo(0,16,6,12);ctx.bezierCurveTo(17,5,14,-16,0,-8);shape('#efb389');
        ctx.beginPath();ctx.moveTo(0,-7);ctx.quadraticCurveTo(-2,-12,1,-15);ctx.stroke();
        D.ellipse(ctx,6,-12,6,3);ctx.fillStyle='#8db775';ctx.fill();
        D.ellipse(ctx,-6,-1,2,4);ctx.fillStyle='#ffe6bc';ctx.fill();
      } else if (type === 'fire') {
        ctx.beginPath(); ctx.moveTo(0, -14); ctx.bezierCurveTo(3, -5, 12, -4, 12, 4);
        ctx.bezierCurveTo(12, 17, -13, 17, -12, 3);
        ctx.quadraticCurveTo(-12, -2, -6, -7); ctx.quadraticCurveTo(-6, -1, -3, 0);
        ctx.quadraticCurveTo(2, -5, 0, -14); shape('#ff8c58');
        ctx.beginPath(); ctx.moveTo(0, -2); ctx.quadraticCurveTo(10, 11, 0, 12);
        ctx.quadraticCurveTo(-9, 11, 0, -2); ctx.fillStyle = '#ffe17e'; ctx.fill();
      } else if (type === 'bomb') {
        ctx.beginPath(); ctx.moveTo(3, -8); ctx.quadraticCurveTo(1, -17, 10, -12); ctx.stroke();
        dot(10, -12, 3, '#ffb957');
        D.circle(ctx, -1, 3, 11); shape('#64719d');
        D.ellipse(ctx, -5, -2, 3.5, 2); ctx.fillStyle = '#d6e5ff'; ctx.fill();
      } else if (type === 'star') {
        ctx.beginPath();
        for (var k = 0; k < 10; k++) {
          var a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 7.5 : 15;
          if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath(); shape('#ffdc65');
        dot(-4, -1, 1.5, '#55483c'); dot(4, -1, 1.5, '#55483c');
        ctx.beginPath(); ctx.arc(0, 1, 3.5, 0, Math.PI); ctx.stroke();
        dot(-7, 3, 1.9, '#ffac9b'); dot(7, 3, 1.9, '#ffac9b');
      } else if (type === 'shield') {
        ctx.beginPath(); ctx.moveTo(0, -13); ctx.quadraticCurveTo(6, -9, 12, -10);
        ctx.lineTo(11, 2); ctx.quadraticCurveTo(10, 10, 0, 15);
        ctx.quadraticCurveTo(-10, 10, -11, 2); ctx.lineTo(-12, -10);
        ctx.quadraticCurveTo(-6, -9, 0, -13); shape('#7bcfff');
        ctx.strokeStyle = '#e9faff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-5, 0); ctx.lineTo(-1, 4); ctx.lineTo(6, -4); ctx.stroke();
      }
      ctx.restore();
    },

    drawItems: function (ctx, items, time) {
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var cx = it.c * TILE + TILE / 2;
        var cy = it.r * TILE + TILE / 2 + Math.sin(time * 3 + i) * 3;
        var info = BI.ITEM_INFO[it.type] || BI.ITEM_INFO.fire;

        // 光晕
        ctx.save();
        ctx.globalAlpha = .30 + Math.sin(time * 4 + i) * .10;
        D.circle(ctx, cx, cy, 19);
        ctx.fillStyle = info.color; ctx.fill();
        ctx.restore();

        D.groundShadow(ctx, it.c * TILE + TILE / 2, it.r * TILE + TILE - 6, 13, 4.5, .18);

        // 透明泡泡：淡色玻璃、外缘、弧形反光，中心保持通透。
        ctx.save();
        var glass = ctx.createRadialGradient(cx - 8, cy - 9, 1, cx, cy, 21);
        glass.addColorStop(0, 'rgba(255,255,255,.32)');
        glass.addColorStop(.65, 'rgba(222,247,255,.08)');
        glass.addColorStop(1, 'rgba(191,231,255,.42)');
        D.circle(ctx, cx, cy, 21); ctx.fillStyle = glass; ctx.fill();
        ctx.lineWidth = 1.7; ctx.strokeStyle = 'rgba(245,253,255,.92)'; ctx.stroke();
        sprites.drawItemIcon(ctx, it.type, cx, cy + 1, 29);
        ctx.beginPath(); ctx.arc(cx, cy, 17.5, Math.PI * 1.12, Math.PI * 1.48);
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineCap = 'round'; ctx.stroke();
        D.circle(ctx, cx + 11, cy + 12, 2); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fill();
        ctx.restore();
      }
    },

    drawSkills: function (ctx, world) {
      ctx.save();
      world.players.concat(world.enemies || []).forEach(function (actor) {
        if (!actor.alive || !(actor.soulSlowTime > 0)) return;
        var strong = actor.soulSlowRate >= .5;
        ctx.save(); ctx.strokeStyle = strong ? '#dca5ed' : '#82cfdf'; ctx.lineWidth = strong ? 2.5 : 1.5;
        D.ellipse(ctx, actor.x, actor.y + 9, 17, 6); ctx.stroke();
        for (var i = 0; i < 3; i++) {
          var angle = world.time * 2 + i * TAU / 3, x = actor.x + Math.cos(angle) * 19, y = actor.y + Math.sin(angle) * 9;
          ctx.beginPath();ctx.moveTo(x,y-4);ctx.lineTo(x+2.5,y);ctx.lineTo(x,y+4);ctx.lineTo(x-2.5,y);ctx.closePath();ctx.fillStyle=ctx.strokeStyle;ctx.fill();
        }
        ctx.restore();
      });
      if (world.timeStop) {
        ctx.fillStyle = 'rgba(146,196,235,.10)'; ctx.fillRect(0, 0, G.cols(world.map) * TILE, G.rows(world.map) * TILE);
        world.enemies.forEach(function (e) {
          if (!e.alive) return;
          D.circle(ctx, e.x, e.y - 8, 24); ctx.strokeStyle = 'rgba(186,233,255,.85)'; ctx.lineWidth = 2; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(e.x, e.y - 25); ctx.lineTo(e.x, e.y - 15); ctx.lineTo(e.x + 6, e.y - 12); ctx.stroke();
        });
      }
      (world.skillEffects || []).forEach(function (fx) {
        var phase = 1 - fx.t / fx.total;
        ctx.globalAlpha = (1 - phase) * .8;
        ctx.strokeStyle = fx.color; ctx.lineWidth = 4 * (1 - phase) + 1;
        if (fx.type === 'soulPulse') {
          sprites.drawSoulPulse(ctx, fx, phase);
        } else if (fx.type === 'soulAwaken') {
          var caster = world.playerById(fx.ownerId);
          if (caster && caster.alive) sprites.drawSoulAwaken(ctx, caster.x, caster.y, phase);
        } else if (fx.type === 'flameReflect') {
          sprites.drawFlameReflect(ctx, fx, phase);
        } else if (fx.type === 'axiu') {
          ctx.lineWidth = 13 * (1 - phase) + 2; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(fx.x, fx.y - 10); ctx.lineTo(fx.toX, fx.toY - 10); ctx.stroke();
        } else {
          D.circle(ctx, fx.x, fx.y - 6, 16 + phase * (fx.type === 'arui' ? 96 : 48)); ctx.stroke();
          ctx.lineWidth = 1; D.circle(ctx, fx.x, fx.y - 6, 11 + phase * 40); ctx.stroke();
        }
      });
      ctx.restore();
    },

    spiritSpark: function (ctx, x, y, size, color) {
      ctx.beginPath();ctx.moveTo(x,y-size);ctx.lineTo(x+size*.32,y-size*.32);
      ctx.lineTo(x+size,y);ctx.lineTo(x+size*.32,y+size*.32);ctx.lineTo(x,y+size);
      ctx.lineTo(x-size*.32,y+size*.32);ctx.lineTo(x-size,y);ctx.lineTo(x-size*.32,y-size*.32);
      ctx.closePath();ctx.fillStyle=color;ctx.fill();
    },

    drawSoulPulse: function (ctx, fx, phase) {
      var side=(fx.radius*2+1)*TILE, half=side/2-3;
      ctx.save();ctx.translate(fx.x,fx.y);
      D.blob(ctx,-half,-half,half*2,half*2,12,fx.evolved?'rgba(224,171,242,.14)':'rgba(139,232,249,.13)',fx.color,2);
      D.roundRect(ctx,-half,-half,half*2,half*2,12);ctx.clip();
      var glow=ctx.createRadialGradient(0,0,2,0,0,half);
      glow.addColorStop(0,fx.evolved?'rgba(255,238,255,.6)':'rgba(217,253,255,.5)');glow.addColorStop(1,'rgba(135,223,252,0)');
      ctx.fillStyle=glow;ctx.fillRect(-half,-half,half*2,half*2);
      ctx.globalCompositeOperation='source-over';
      for(var ring=0;ring<3;ring++){
        var radius=8+(half-8)*Math.min(1,phase*1.6+ring*.18);
        ctx.strokeStyle=ring%2?'#edb7f4':'#a5efff';ctx.lineWidth=ring===0?2.8:1.2;
        ctx.setLineDash(ring===1?[3,8]:[]);ctx.lineDashOffset=-phase*45;
        D.circle(ctx,0,0,radius);ctx.stroke();
      }
      ctx.setLineDash([]);ctx.lineWidth=1.4;
      for(var arm=0;arm<2;arm++){
        ctx.beginPath();
        for(var step=0;step<=24;step++){
          var t=step/24,angle=t*TAU+phase*4+arm*Math.PI,rad=8+t*half*.82;
          var x=Math.cos(angle)*rad,y=Math.sin(angle)*rad;
          if(step)ctx.lineTo(x,y);else ctx.moveTo(x,y);
        }ctx.strokeStyle=arm?'#eebff2':'#b5f7ff';ctx.stroke();
      }
      for(var spark=0;spark<(fx.evolved?16:10);spark++){
        var theta=spark*2.399+phase*1.4,rr=(.3+(spark%5)*.13)*half;
        sprites.spiritSpark(ctx,Math.cos(theta)*rr,Math.sin(theta)*rr,2+(spark%3),spark%2?'#ffe0fb':'#cfffff');
      }
      ctx.restore();
    },

    /**
     * 小炎吸火后的反弹：把 5×5 的作用范围画成一个火焰方框，
     * 让玩家一眼看出「刚才那一下反弹打到了多大一片」。
     */
    drawFlameReflect: function (ctx, fx, phase) {
      var radius = fx.radius || 2;
      var side = (radius * 2 + 1) * TILE, half = side / 2 - 3;
      ctx.save(); ctx.translate(fx.x, fx.y);
      D.blob(ctx, -half, -half, half * 2, half * 2, 12, 'rgba(255,150,70,.14)', fx.color, 2);
      D.roundRect(ctx, -half, -half, half * 2, half * 2, 12); ctx.clip();
      var glow = ctx.createRadialGradient(0, 0, 3, 0, 0, half);
      glow.addColorStop(0, 'rgba(255,236,180,.55)');
      glow.addColorStop(1, 'rgba(255,110,40,0)');
      ctx.fillStyle = glow; ctx.fillRect(-half, -half, half * 2, half * 2);
      ctx.strokeStyle = '#ffd08a'; ctx.lineWidth = 3 * (1 - phase) + 1;
      D.circle(ctx, 0, 0, half * Math.min(1, phase * 1.35)); ctx.stroke();
      ctx.setLineDash([4, 7]); ctx.lineDashOffset = -phase * 40;
      ctx.strokeStyle = fx.color; ctx.lineWidth = 1.4;
      D.circle(ctx, 0, 0, half * .62); ctx.stroke();
      ctx.setLineDash([]);
      for (var spark = 0; spark < 10; spark++) {
        var theta = spark * 2.399 + phase * 2, rr = (.35 + (spark % 5) * .13) * half;
        sprites.spiritSpark(ctx, Math.cos(theta) * rr, Math.sin(theta) * rr,
          2 + (spark % 3), spark % 2 ? '#ffe6a8' : '#ff9a4d');
      }
      ctx.restore();
    },

    drawSoulAwaken: function (ctx, x, y, phase) {
      ctx.save();ctx.translate(x,y);ctx.globalCompositeOperation='source-over';
      var power=Math.sin(Math.PI*phase);
      var beam=ctx.createLinearGradient(0,-145,0,20);
      beam.addColorStop(0,'rgba(155,235,255,0)');beam.addColorStop(.55,'rgba(204,249,255,.2)');beam.addColorStop(1,'rgba(244,207,255,.45)');
      ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(-10-power*18,16);ctx.lineTo(-30-power*12,-145);
      ctx.lineTo(30+power*12,-145);ctx.lineTo(10+power*18,16);ctx.closePath();ctx.fill();
      ctx.save();ctx.translate(0,12);ctx.scale(1,.36);ctx.rotate(phase*2);
      [34,48,62].forEach(function(radius,i){D.circle(ctx,0,0,radius+power*14);ctx.strokeStyle=i%2?'#edb8fa':'#b3f6ff';ctx.lineWidth=i===1?3:1.5;ctx.stroke();});
      for(var glyph=0;glyph<12;glyph++){var a=glyph*TAU/12;sprites.spiritSpark(ctx,Math.cos(a)*59,Math.sin(a)*59,4,'#eaffff');}ctx.restore();
      var colors=['#9cefff','#f3b9ef','#d6c2ff','#fff0b0','#b8ffdf'];
      for(var soul=0;soul<5;soul++){
        var angle=soul*TAU/5+phase*7,orbit=18+75*Math.pow(1-phase,1.5);
        var sx=Math.cos(angle)*orbit,sy=-40+Math.sin(angle)*orbit*.65;
        ctx.beginPath();ctx.moveTo(sx,sy);ctx.quadraticCurveTo(sx*.6,-30,sx*.12,-28);
        ctx.lineWidth=2;ctx.strokeStyle=colors[soul];ctx.stroke();
        sprites.spiritSpark(ctx,sx,sy,5+power*3,colors[soul]);
      }
      for(var halo=0;halo<2;halo++){
        ctx.beginPath();ctx.ellipse(0,-45,48+phase*37,66+power*22,halo?-.3:.3,phase*TAU+halo*Math.PI,phase*TAU+halo*Math.PI+Math.PI*1.2);
        ctx.strokeStyle=halo?'#f1c2ff':'#a8f4ff';ctx.lineWidth=2.5;ctx.stroke();
      }
      ctx.restore();
    },

    /* ---------------- 角色 ---------------- */

    /**
     * 绘制一个角色。
     * 位置约定：p.x / p.y 是「碰撞盒中心」，绘制时以脚底锚点对齐。
     * 所有动效都绕脚底锚点进行 —— 角色才是「踩在地上弹」，
     * 而不是「在屏幕中间飘」。
     *
     * alpha   = 逻辑帧之间的插值比例（0..1），只用来插值位置
     * opacity = 整体不透明度，只有淡出之类的效果才用得上
     * 这两个绝不能混用：把插值比例当不透明度用，画面会在某些帧率下整个消失。
     */
    drawCharacter: function (ctx, p, time, alpha, opacity) {
      alpha = (alpha == null) ? 1 : alpha;
      opacity = (opacity == null) ? 1 : opacity;

      // 上一逻辑帧与当前帧插值，让 144Hz 屏幕也丝滑
      var px = D.lerp(p.px == null ? p.x : p.px, p.x, alpha);
      var py = D.lerp(p.py == null ? p.y : p.py, p.y, alpha);

      var anchorX = px;
      var anchorY = py + CFG.BOX / 2;     // 脚底

      var m = p.motion || MOTION;
      var bob = 0, wob = 0, sx = 1, sy = 1;

      if (p.alive) {
        if (p.moving) {
          var ph = time * 11;                        // 步伐相位
          bob = -Math.abs(Math.sin(ph)) * m.bounce;  // 上下弹跳
          wob = Math.sin(ph) * (m.wobble * Math.PI / 180); // 摇摆，与弹跳错开相位
        } else {
          var br = Math.sin(time * 2.4) * m.breathe; // 待机呼吸
          sx = 1 + br; sy = 1 - br * 0.6;
        }
        // 放炸弹 / 受击的挤压拉伸
        if (p.squash > 0) {
          var s = p.squash * m.squash;
          sx *= 1 + s; sy *= 1 - s;
        }
      }

      // 落地阴影（对「活着」的感觉贡献最大的一项）
      if (p.alive) {
        var shrink = 1 - Math.abs(bob) / 26;
        D.groundShadow(ctx, anchorX, anchorY, 15 * shrink, 5.4 * shrink, .26);
      }

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(anchorX, anchorY + bob);
      if (wob) ctx.rotate(wob);
      ctx.scale(sx, sy);
      if (p.alive && p.assetId === 'weilai' && p.soulAwakenTime > 0) {
        var awakenPhase=1-p.soulAwakenTime/1.6;
        var bloom=1+Math.sin(Math.PI*awakenPhase)*.07;
        ctx.scale(bloom,bloom);
      }

      // 死亡：变白 + 轻微摇晃
      if (!p.alive) {
        ctx.globalAlpha = opacity * 0.55;
        ctx.rotate(Math.sin(time * 6) * 0.25);
      }

      if (p.asset && p.asset.img && p.asset.img.complete && p.asset.img.naturalWidth) {
        sprites.drawAssetCharacter(ctx, p, anchorX, anchorY);
      } else {
        sprites.drawPlaceholder(ctx, p, time);
      }

      ctx.restore();

      // 受击白闪
      if (p.alive && p.invuln > 0 && Math.sin(time * 26) > 0) {
        ctx.save();
        ctx.globalAlpha = .45;
        ctx.fillStyle = '#fff';
        D.ellipse(ctx, anchorX, anchorY - 26, 18, 30);
        ctx.fill();
        ctx.restore();
      }

      if (p.alive && (p.flameGuard > 0 || p.insightTime > 0)) {
        ctx.save();
        var aura = p.insightTime > 0 ? '#82d4ed' : '#ffc18a';
        D.ellipse(ctx, anchorX, anchorY - 4, 23 + Math.sin(time * 5), 8);
        ctx.strokeStyle = aura; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.restore();
      }

      if (p.alive && p.assetId === 'weilai' && p.soulEvolved) {
        ctx.save();ctx.strokeStyle='#b5f0fa';ctx.lineWidth=1.8;
        D.ellipse(ctx, anchorX, anchorY - 2, 23, 7);ctx.stroke();
        for(var spirit=0;spirit<3;spirit++){
          var orbit=time*1.8+spirit*TAU/3,xx=anchorX+Math.cos(orbit)*27,yy=anchorY-30+Math.sin(orbit)*22;
          ctx.fillStyle=spirit%2?'#f3b9ea':'#d5fbff';ctx.beginPath();ctx.moveTo(xx,yy-4);ctx.lineTo(xx+3,yy);ctx.lineTo(xx,yy+4);ctx.lineTo(xx-3,yy);ctx.closePath();ctx.fill();
        }ctx.restore();
      }

      // 护盾气泡
      if (p.alive && p.shield > 0) {
        ctx.save();
        ctx.globalAlpha = .38 + Math.sin(time * 7) * .12;
        D.circle(ctx, anchorX, anchorY - 26, 30);
        ctx.fillStyle = 'rgba(120,200,255,.35)'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = '#8fd8ff'; ctx.stroke();
        ctx.restore();
      }

      if (p.alive && p.starTime > 0) {
        ctx.save();
        D.circle(ctx, anchorX, anchorY - 26, 32);
        ctx.strokeStyle = '#ffe382'; ctx.lineWidth = 3;
        ctx.fillStyle = 'rgba(255,217,91,.14)'; ctx.fill(); ctx.stroke();
        for (var i = 0; i < 3; i++) {
          var angle = time * 3 + i * TAU / 3;
          sprites.drawItemIcon(ctx, 'star', anchorX + Math.cos(angle) * 32,
            anchorY - 26 + Math.sin(angle) * 29, 12);
        }
        ctx.restore();
      }
    },

    /** 几何占位小人（未导入素材时使用） */
    drawPlaceholder: function (ctx, p, time) {
      var body = p.color || C.p1;
      var dark = 'rgba(0,0,0,.38)';

      // 身体
      D.blob(ctx, -13, -26, 26, 26, 9, body, dark, 2);
      // 头（大头娃娃比例）
      D.circle(ctx, 0, -42, 17);
      ctx.fillStyle = body; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = dark; ctx.stroke();
      // 脸
      D.circle(ctx, 0, -42, 12.5);
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
      // 眼睛
      var blink = (Math.sin(time * 1.7) > 0.97) ? 0.15 : 1;   // 偶尔眨眼
      ctx.fillStyle = '#2b2b3d';
      D.ellipse(ctx, -5, -43, 2.6, 3.4 * blink); ctx.fill();
      D.ellipse(ctx, 5, -43, 2.6, 3.4 * blink); ctx.fill();
      // 高光
      ctx.fillStyle = '#fff';
      D.circle(ctx, -5.9, -44.4, 1.0); ctx.fill();
      D.circle(ctx, 4.1, -44.4, 1.0); ctx.fill();
      // 腮红
      ctx.save(); ctx.globalAlpha = .5; ctx.fillStyle = '#ff8fa8';
      D.ellipse(ctx, -9.5, -37, 3.2, 2.1); ctx.fill();
      D.ellipse(ctx, 9.5, -37, 3.2, 2.1); ctx.fill();
      ctx.restore();
      // 呆毛
      ctx.beginPath();
      ctx.moveTo(0, -58);
      ctx.quadraticCurveTo(6, -66, -1, -70);
      ctx.lineWidth = 3; ctx.strokeStyle = body; ctx.lineCap = 'round'; ctx.stroke();
    },

    /**
     * 外部素材角色（角色图片由 assets/characters.js 配置）。
     * 锚点在脚底中心：anchor=[0.5, 0.92] 表示「水平居中、垂直 92% 处」对准脚底。
     * 这个点必须真的落在角色脚上，否则角色会「飘」起来。
     */
    drawAssetCharacter: function (ctx, p, anchorX, anchorY) {
      var a = p.asset, img = a.sprite || a.img;
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      var h = CFG.TILE * (a.height || 1.55);
      var w = h * (iw / ih);
      var ax = (a.anchor && a.anchor[0] != null) ? a.anchor[0] : 0.5;
      var ay = (a.anchor && a.anchor[1] != null) ? a.anchor[1] : 0.92;

      ctx.save();
      if (a.flipForLeft && p.facing < 0) ctx.scale(-1, 1);

      // 通灵光晕沿透明素材的真实轮廓绘制，缓存蒙版以避免逐帧处理原图。
      if (p.alive && p.assetId === 'weilai' && p.soulEvolved) {
        if (!a._soulMask) {
          var mask=document.createElement('canvas');mask.width=iw;mask.height=ih;
          var pen=mask.getContext('2d');pen.drawImage(img,0,0);
          pen.globalCompositeOperation='source-in';pen.fillStyle='#d0fbff';pen.fillRect(0,0,iw,ih);a._soulMask=mask;
        }
        ctx.save();ctx.shadowColor='#91e8f4';ctx.shadowBlur=10;
        ctx.drawImage(a._soulMask,-w*ax,-h*ay,w,h);ctx.shadowBlur=0;
        for(var edge=0;edge<8;edge++){
          var angle=edge*TAU/8;ctx.drawImage(a._soulMask,-w*ax+Math.cos(angle)*1.3,-h*ay+Math.sin(angle)*1.3,w,h);
        }ctx.restore();
      }

      if (a.tint) {
        // 染色结果缓存起来 —— 每帧新建离屏 canvas 会把帧率拖垮
        if (!a._tinted || a._tintedSrc !== img) {
          var off = document.createElement('canvas');
          off.width = iw;
          off.height = ih;
          var octx = off.getContext('2d');
          octx.drawImage(img, 0, 0);
          octx.globalCompositeOperation = 'source-atop';
          octx.fillStyle = a.tint;
          octx.fillRect(0, 0, off.width, off.height);
          a._tinted = off;
          a._tintedSrc = img;
        }
        ctx.drawImage(a._tinted, -w * ax, -h * ay, w, h);
      } else {
        ctx.drawImage(img, -w * ax, -h * ay, w, h);
      }
      ctx.restore();
    },

    /* ---------------- 敌人 ---------------- */

    /** 一对 Q 版大眼睛（look 是瞳孔偏移，用来表现"盯着你"） */
    enemyEyes: function (ctx, y, spread, size, look) {
      var ex = spread == null ? 5.5 : spread;
      var s = size == null ? 4 : size;
      ctx.fillStyle = '#ffffff';
      D.ellipse(ctx, -ex, y, s, s * 1.15); ctx.fill();
      D.ellipse(ctx, ex, y, s, s * 1.15); ctx.fill();
      ctx.fillStyle = '#2b2b3d';
      var lx = (look || 0) * 1.3;
      D.ellipse(ctx, -ex + lx, y + 0.5, s * 0.52, s * 0.66); ctx.fill();
      D.ellipse(ctx, ex + lx, y + 0.5, s * 0.52, s * 0.66); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      D.circle(ctx, -ex + lx - 1, y - 1.2, s * 0.22); ctx.fill();
      D.circle(ctx, ex + lx - 1, y - 1.2, s * 0.22); ctx.fill();
    },

    /**
     * 敌人绘制。锚点和玩家一致：脚底居中，所有动效绕脚底进行。
     * 三种怪用不同的剪影，一眼能分辨谁是谁。
     */
    drawPoison: function (ctx, world) {
      (world.poison || []).forEach(function (f) {
        var x = f.c * TILE, y = f.r * TILE, warning = f.warn > 0;
        ctx.save();
        // 所有图案限制在一格内，预警与真实伤害落点完全一致。
        D.blob(ctx, x + 3, y + 3, TILE - 6, TILE - 6, 7,
          warning ? 'rgba(255,205,88,.26)' : 'rgba(132,64,172,.40)', warning ? '#d79026' : '#77509a', 2);
        ctx.translate(x + TILE / 2, y + TILE / 2);
        if (warning) {
          D.circle(ctx, 0, 0, 14); ctx.strokeStyle = '#d79026'; ctx.lineWidth = 2; ctx.stroke();
          D.text(ctx, '!', 0, 0, {font: 'bold 23px sans-serif', fill: '#9f5228', align: 'center', baseline: 'middle'});
          ctx.beginPath(); ctx.arc(0, 0, 18, -Math.PI / 2, -Math.PI / 2 + TAU * D.clamp(1 - f.warn / CFG.BOSS_POISON_WARN, 0, 1));
          ctx.strokeStyle = '#ffe59b'; ctx.lineWidth = 3; ctx.stroke();
        } else {
          ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 5;
          ctx.strokeStyle = '#e5ffa3';
          ctx.beginPath(); ctx.moveTo(0, 15); ctx.lineTo(0, -14);
          ctx.moveTo(-10, -14); ctx.lineTo(-10, -3); ctx.quadraticCurveTo(0, 5, 10, -3); ctx.lineTo(10, -14); ctx.stroke();
          D.circle(ctx, 0, 15, 3); ctx.fillStyle = '#c797f3'; ctx.fill();
        }
        ctx.restore();
      });
    },

    drawEnemy: function (ctx, e, time, alpha) {
      alpha = alpha == null ? 1 : alpha;
      var px = D.lerp(e.px == null ? e.x : e.px, e.x, alpha);
      var py = D.lerp(e.py == null ? e.y : e.py, e.y, alpha);
      var bob = e.moving ? -Math.abs(Math.sin(time * 8)) * 2.5 : Math.sin(time * 2.2) * 1.1;
      var boss = e.type === 'boss';
      if (e.alive) D.groundShadow(ctx, px, py + 13, boss ? 32 : 15, boss ? 9 : 5, .22);
      ctx.save();
      // 插值仅用于位置；存活 NPC 始终不透明，避免高刷新率下虚化闪烁。
      ctx.globalAlpha = e.alive ? 1 : Math.max(0, 1 - (time - (e.deadAt || 0)) / .7);
      ctx.translate(px, py + 14 + bob);
      if (!e.alive) ctx.scale(1, .65);
      var stage = BI.entities.bossStage(e);
      if (e.alive && stage && stage.id > 1) {
        ctx.save();
        ctx.globalAlpha = .65 + Math.sin(time * 6) * .15;
        D.ellipse(ctx, 0, -1, 37, 10);
        ctx.strokeStyle = stage.color; ctx.lineWidth = stage.id === 3 ? 3 : 2; ctx.stroke();
        if (e.phaseFlash > 0) {
          ctx.globalAlpha = e.phaseFlash / 1.4;
          D.ellipse(ctx, 0, -1, 38 + (1.4-e.phaseFlash) * 36, 11 + (1.4-e.phaseFlash) * 10); ctx.stroke();
        }
        ctx.restore();
      }
      if (e.alive && (e.shield > 0 || e.starTime > 0)) {
        D.ellipse(ctx, 0, boss ? -39 : -21, boss ? 53 : 28, boss ? 56 : 30);
        ctx.fillStyle = e.starTime > 0 ? 'rgba(255,220,101,.15)' : 'rgba(123,207,255,.16)'; ctx.fill();
        ctx.strokeStyle = e.starTime > 0 ? '#ffdc65' : '#7bcfff'; ctx.lineWidth = 2; ctx.stroke();
      }
      var npcArt = !boss && BI.assets && BI.assets.readyEnemy(e.type);
      if (npcArt) {
        var size = BI.assets.enemySize, crop = npcArt.crop;
        ctx.save();
        if (e.facing < 0) ctx.scale(-1, 1);
        ctx.drawImage(npcArt.img, crop[0], crop[1], crop[2], crop[3],
          -size.width / 2, -size.height + 2, size.width, size.height);
        ctx.restore();
      } else if (boss) {
        var art = BI.assets && ((stage && stage.id === 3 && BI.assets.readyEnemy('bossRage')) || BI.assets.enemyArt);
        if (art && art.ok) {
          var h = 96, crop = art.crop, w = h * crop[2] / crop[3];
          ctx.drawImage(art.img, crop[0], crop[1], crop[2], crop[3], -w / 2, -h + 8, w, h);
        } else {
          // 图片解码前的同色剪影；加载完成自动换成完整素材。
          D.blob(ctx, -29, -31, 58, 30, 15, '#9271c9', '#5c477c', 3);
          D.circle(ctx, 0, -50, 23); ctx.fillStyle = '#f4ceb1'; ctx.fill();
          D.blob(ctx, -24, -74, 48, 18, 9, '#24ad9a', '#206963', 2);
          sprites.enemyEyes(ctx, -50, 9, 4.2, e.facing || 0);
        }
      } else {
        var look = e.dir ? e.dir.x : (e.facing || 0);
        // 三种新 NPC 都有实体轮廓、奶油色面罩和不同装饰。
        D.blob(ctx, -13, -8, 10, 10, 4, e.dark, '#334856', 1.4);
        D.blob(ctx, 3, -8, 10, 10, 4, e.dark, '#334856', 1.4);
        D.blob(ctx, -16, -35, 32, 33, 13, e.color, e.dark, 2.3);
        if (e.type === 'gugu') {
          [-1, 1].forEach(function (side) {
            D.blob(ctx, side < 0 ? -22 : 15, -29, 7, 16, 3, '#e1d8a9', e.dark, 1.5);
          });
          ctx.lineWidth = 2; ctx.strokeStyle = e.dark;
          ctx.beginPath(); ctx.moveTo(0, -35); ctx.lineTo(0, -43); ctx.stroke();
          ['#ed8575', '#e5c566', '#83bb87', '#7299d4'].forEach(function (color, i) {
            D.circle(ctx, -7.5 + i * 5, -42, 3); ctx.fillStyle = color; ctx.fill();
          });
        } else if (e.type === 'claude') {
          for (var j = 0; j < 8; j++) {
            var angle = j * TAU / 8;
            D.circle(ctx, Math.cos(angle) * 13, -31 + Math.sin(angle) * 9, 5);
            ctx.fillStyle = '#f3b296'; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = e.dark; ctx.stroke();
          }
          D.blob(ctx, 12, -17, 10, 16, 2, '#f9e4c1', e.dark, 1.5);
          ctx.strokeStyle = '#c6a989'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(15, -12); ctx.lineTo(20, -12); ctx.moveTo(15, -8); ctx.lineTo(20, -8); ctx.stroke();
        } else {
          D.blob(ctx, -21, -25, 7, 21, 3, '#85b4a8', e.dark, 1.5);
          D.blob(ctx, 14, -25, 7, 21, 3, '#85b4a8', e.dark, 1.5);
          D.circle(ctx, 0, -37, 6); ctx.fillStyle = '#e5fae9'; ctx.fill(); ctx.strokeStyle = e.dark; ctx.lineWidth = 1.4; ctx.stroke();
          D.circle(ctx, 0, -37, 2.5); ctx.fillStyle = '#72bfb0'; ctx.fill();
        }
        D.blob(ctx, -12, -30, 24, 17, 8, '#fff4dc', e.dark, 1.4);
        sprites.enemyEyes(ctx, -22, 4.5, 3.1, look);
        // 怀里的炸弹是攻击提示的一部分；仅星星状态的NPC有碰撞伤害。
        var lift = e.windup > 0 ? -9 : 0;
        D.circle(ctx, 0, -7 + lift, 6); ctx.fillStyle = '#384758'; ctx.fill();
        ctx.strokeStyle = '#edd393'; ctx.lineWidth = 2; ctx.beginPath();
        ctx.moveTo(1, -12 + lift); ctx.quadraticCurveTo(5, -17 + lift, 2, -18 + lift); ctx.stroke();
        D.circle(ctx, -2, -9 + lift, 1.5); ctx.fillStyle = '#8194a5'; ctx.fill();
      }
      if (e.hitFlash > 0) {
        D.circle(ctx, 0, boss ? -65 : -24, boss ? 33 : 19);
        ctx.strokeStyle = '#fff9c3'; ctx.lineWidth = 3; ctx.stroke();
      }
      if (e.windup > 0) {
        D.text(ctx, '!', 0, boss ? -142 : -54, {font: 'bold 23px sans-serif', fill: '#ffca68', stroke: '#65503d', strokeWidth: 3, align: 'center'});
        D.ellipse(ctx, 0, -1, boss ? 35 : 21, 8); ctx.lineWidth = 2.5; ctx.strokeStyle = '#f5c560'; ctx.stroke();
      }
      ctx.restore();
    },

    /** 1P / 2P 头顶小标签 */
    drawPlayerTag: function (ctx, p, text, time, viewScale) {
      var scale = viewScale || 1;
      if (!p.alive) return;
      var y = p.y - (p.assetId === 'weilai' && p.soulEvolved ? 130 : 62) + Math.sin(time * 3) * 1.5;
      D.text(ctx, text, p.x, y, {
        font: 'bold ' + (13 / scale) + 'px "Microsoft YaHei", sans-serif',
        align: 'center', baseline: 'middle',
        fill: p.color, stroke: 'rgba(0,0,0,.55)', strokeWidth: 3 / scale
      });
    },

    /**
     * 把角色素材等比装进一个矩形（菜单选人头像用）。
     * 素材没加载好时画个几何占位小人，保证菜单永远有东西可看。
     */
    drawAssetFit: function (ctx, asset, x, y, w, h, color) {
      var pad = 4;
      var bw = w - pad * 2, bh = h - pad * 2;

      if (asset && asset.img && asset.img.complete && asset.img.naturalWidth) {
        var img = asset.sprite || asset.img;
        var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
        var s = Math.min(bw / iw, bh / ih);
        var dw = iw * s, dh = ih * s;
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
        return;
      }

      // 占位小人
      var cx = x + w / 2, cy = y + h / 2;
      var body = color || C.p1;
      ctx.save();
      D.blob(ctx, cx - 13, cy - 4, 26, 26, 9, body, 'rgba(0,0,0,.38)', 2);
      D.circle(ctx, cx, cy - 18, 17);
      ctx.fillStyle = body; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.38)'; ctx.stroke();
      D.circle(ctx, cx, cy - 18, 12.5);
      ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.fill();
      ctx.fillStyle = '#2b2b3d';
      D.ellipse(ctx, cx - 5, cy - 19, 2.6, 3.4); ctx.fill();
      D.ellipse(ctx, cx + 5, cy - 19, 2.6, 3.4); ctx.fill();
      ctx.restore();
    }
  };

})(window.BI = window.BI || {});
