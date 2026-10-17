(async function () {
  'use strict';
  var lines = [], fail = 0, pass = 0;
  function ok(value, label) { if (value) { pass++; lines.push('PASS ' + label); } else { fail++; lines.push('FAIL ' + label); } }
  function delay(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  try {
    var V = window.BombItReplayViewer;
    for (var tries = 0; tries < 400 && !V.player; tries++) {
      if (document.getElementById('notice').classList.contains('error')) throw new Error(document.getElementById('notice').textContent);
      await delay(25);
    }
    var p = V.player; if (!p) throw new Error('Replay load timed out');
    ok(p.verified && p.world.frame === 0, 'Replay verified and initially paused');
    ok(document.getElementById('verified').textContent === '逐步校验通过', 'Visible verification badge');
    document.getElementById('step').click(); ok(p.world.frame === 1 && !V.playing, 'Step frame button');
    document.getElementById('restart').click(); document.getElementById('action').click();
    ok(p.world.frame === p.data.history[0].advancedFrames, 'Step action button');
    var target = Math.min(500, p.totalFrames), timeline = document.getElementById('timeline');
    timeline.value = target; timeline.dispatchEvent(new Event('input'));
    ok(p.world.frame === target, 'Timeline seeks to an exact frame');
    document.getElementById('back').click(); ok(p.world.frame === Math.max(0,target-300), 'Back five seconds');
    document.getElementById('forward').click(); ok(p.world.frame === target, 'Forward five seconds');
    var markers = document.getElementById('markers').querySelectorAll('button');
    ok(markers.length === p.markers.length, 'Level and death markers rendered');
    for (var i = 0; i < markers.length; i++) { markers[i].click(); if (p.world.frame !== p.markers[i].frame) throw new Error('Marker seek failed'); }
    ok(true, 'All keyframe buttons seek correctly');
    V.seek(p.totalFrames); V.draw();
    ok(await V.digest(BI.snapshot.save(p.world)) === p.finalHash, 'Rendering preserves the final deterministic state');
    V.seek(Math.max(0,p.totalFrames - 12)); document.getElementById('speed').value = '16';
    document.getElementById('play').click(); await delay(250);
    ok(p.world.frame === p.totalFrames && !V.playing, 'Playback reaches the end and pauses');
    document.getElementById('play').click(); await delay(50); document.getElementById('play').click();
    ok(!V.playing && p.world.frame < p.totalFrames, 'Play from end restarts; pause button works');
    var boss = p.markers.find(function (m) { return m.type === 'level_started' && m.label === '第 10 关'; });
    V.seek(boss ? boss.frame + 120 : Math.min(50,p.totalFrames));
  } catch (error) { fail++; lines.push('FAIL ' + (error.stack || error.message)); }
  var report = document.createElement('pre'); report.id = 'replay-test-report'; report.hidden = true;
  report.textContent = 'BI_REPLAY_TEST_BEGIN\n' + lines.join('\n') + '\nSUMMARY pass=' + pass + ' fail=' + fail + '\nBI_REPLAY_TEST_END';
  document.body.appendChild(report); document.body.dataset.testStatus = fail ? 'fail' : 'pass';
})();
