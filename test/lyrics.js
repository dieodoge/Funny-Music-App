// Checks the synced lyrics in the Lyrics tab (looks lyrics up on LRCLIB).
// Run with:  node test/lyrics.js
const path = require('path'); const fs = require('fs');
const { _electron: electron } = require('playwright-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const until = async (fn, t) => { const end = Date.now() + t; for (;;) { try { const v = await fn(); if (v) return v; } catch {} if (Date.now() > end) return null; await sleep(300); } };
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  — ' + detail : '')); };
(async () => {
  const profile = path.join(__dirname, 'out', 'profile-lyrics');
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'ytm-desktop.json'), JSON.stringify({ glass: true, colors: { accent: '#c2185b', background: '#fbe8ee', text: '#3a1424' }, window: { x: 60, y: 40, width: 1300, height: 760 } }));
  const app = await electron.launch({ args: [path.join(__dirname, '..')], env: { ...process.env, YTM_TEST: '1', YTM_USER_DATA: profile } });
  await sleep(9000);
  const ytm = app.windows().find(p => !p.url().startsWith('file:'));
  await require('./pick-song')(ytm, until, sleep);
  for (let i = 0; i < 60; i++) { await sleep(1000); const ok = await ytm.evaluate(() => { const s = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button'); if (s && s.offsetParent) s.click(); return !document.querySelector('ytmusic-player .ad-showing') && document.querySelector('video').currentTime > 1; }); if (ok) break; }
  await ytm.evaluate(() => { const t = [...document.querySelectorAll('ytmusic-player-page tp-yt-paper-tab')].find(t => /lyrics/i.test(t.textContent)); t.click(); });
  const shown = await until(() => ytm.evaluate(() => { const s = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button'); if (s && s.offsetParent) s.click(); const l = document.getElementById('ytmd-lyrics'); return l && l.isConnected && l.querySelectorAll('.line').length; }), 120000);
  await ytm.evaluate(() => { document.querySelector('video').currentTime = 35; });
  await sleep(2000);
  check('Synced lyrics appear in the Lyrics tab', shown > 2, JSON.stringify(await ytm.evaluate(() => { const m = navigator.mediaSession.metadata; return m && [m.title, m.artist]; })) + ', ' + shown + ' lines');
  if (!shown) { await app.close().catch(() => {}); process.exit(1); }
  const now = () => ytm.evaluate(() => { const n = document.querySelector('#ytmd-lyrics .line.now'); const v = document.querySelector('video'); return { t: Math.round(v.currentTime), line: n && n.textContent, idx: n && n.dataset.index, y: n && Math.round(n.getBoundingClientRect().top) }; });
  const n1 = await now();
  await sleep(6000);
  const n2 = await now();
  check('The current line follows the song', n1.idx !== null && n2.idx !== null && Number(n2.idx) > Number(n1.idx), n1.t + 's line ' + n1.idx + ' -> ' + n2.t + 's line ' + n2.idx);
  check('The current line is kept near the middle', n2.y > 150 && n2.y < 560, 'at ' + n2.y + 'px');
  check('The current line uses the accent colour', await ytm.evaluate(() => getComputedStyle(document.querySelector('#ytmd-lyrics .line.now')).color === getComputedStyle(document.querySelector('ytmusic-player-bar #play-pause-button')).backgroundColor));
  await require('./screen-grab')(app, path.join(__dirname, 'out', '16-lyrics.png'));
  const target = await ytm.evaluate(() => { const rows = document.querySelectorAll('#ytmd-lyrics .line'); const r = rows[Math.min(rows.length - 1, 25)]; return { time: Number(r.dataset.time), idx: r.dataset.index }; });
  await ytm.evaluate((i) => document.querySelectorAll('#ytmd-lyrics .line')[Number(i)].click(), target.idx);
  await sleep(1500);
  const n3 = await now();
  check('Clicking a line jumps the song there', Math.abs(n3.t - target.time) < 3 && n3.idx === target.idx, 'line ' + target.idx + ' at ' + Math.round(target.time) + 's, now ' + n3.t + 's');
  await app.close().catch(() => {});
  process.exit(failed ? 1 : 0);
})();
