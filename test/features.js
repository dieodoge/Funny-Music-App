// Checks for the later additions: spinning mini album art, album art shown
// when a video has no picture, and the see-through background switch.
// Run with:  node test/features.js
const path = require('path');
const fs = require('fs');
const { _electron: electron } = require('playwright-core');

const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'out');
const profile = path.join(out, 'profile-features');
fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 15000, step = 300) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      /* retry */
    }
    if (Date.now() > end) return null;
    await sleep(step);
  }
}

// The window is rebuilt when the see-through switch changes, so always look
// the two pages up again.
async function pages(app) {
  return until(async () => {
    const open = app.windows().filter((p) => !p.isClosed());
    const shell = open.find((p) => p.url().startsWith('file:'));
    const ytm = open.find((p) => p.url().startsWith('https://music.youtube.com'));
    if (!shell || !ytm) return null;
    const ready = await ytm.evaluate(() => Boolean(document.querySelector('ytmusic-nav-bar') && document.getElementById('ytmd-album-button')));
    return ready ? { shell, ytm } : null;
  }, 60000);
}

const main = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const all = BrowserWindow.getAllWindows();
    const w = all[0];
    return { count: all.length, background: w.getBackgroundColor(), resizable: w.isResizable(), maximized: w.isMaximized(), bounds: w.getBounds() };
  });

async function waitForSong(ytm) {
  return until(
    () =>
      ytm.evaluate(() => {
        const skip = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
        if (skip && skip.offsetParent) skip.click();
        const bar = document.querySelector('ytmusic-player-bar');
        const ad = bar.querySelector('.badge-style-type-ad-stark');
        const v = document.querySelector('video');
        return !(ad && ad.offsetParent) && v && v.duration > 0 && bar.querySelector('#progress-bar').offsetParent !== null;
      }),
    120000,
    1000,
  );
}

(async () => {
  const app = await electron.launch({ args: [root], env: { ...process.env, YTM_TEST: '1', YTM_USER_DATA: profile } });
  let { shell, ytm } = await pages(app);
  await sleep(2000);

  // ---------- spinning mini album art ----------
  await until(() => ytm.evaluate(() => Boolean(document.querySelector('ytmusic-browse-response ytmusic-play-button-renderer'))), 30000);
  await ytm.evaluate(() => document.querySelector('ytmusic-browse-response ytmusic-play-button-renderer').click());
  await waitForSong(ytm);
  await sleep(1500);
  const mode = await ytm.evaluate(() => document.querySelector('ytmusic-player').getAttribute('playback-mode'));
  const mini = () =>
    ytm.evaluate(() => {
      const p = document.querySelector('ytmusic-player');
      const art = getComputedStyle(p.querySelector('#song-image'));
      const r = p.getBoundingClientRect();
      return {
        state: p.getAttribute('player-ui-state'),
        radius: getComputedStyle(p).borderTopLeftRadius,
        animation: art.animationName,
        running: art.animationPlayState,
        transform: art.transform,
        size: Math.round(r.width),
        playingFlag: document.documentElement.hasAttribute('ytmd-playing'),
      };
    });

  // ---------- album art when the video has no picture ----------
  // A song has no picture in its video element; showing the video area for it
  // is exactly the "video doesn't show up" situation.
  await ytm.evaluate(() => { document.querySelector('ytmusic-player #song-video').style.display = 'block'; });
  const fallback = await until(() => ytm.evaluate(() => {
    const p = document.querySelector('ytmusic-player');
    return p.hasAttribute('ytmd-no-video') ? p.style.getPropertyValue('--ytmd-art') : null;
  }), 10000);
  check('Album art is shown when the video area has no picture', Boolean(fallback) && /^url\("https:\/\//.test(fallback), String(fallback).slice(0, 60));
  await ytm.screenshot({ path: path.join(out, '10-video-fallback.png'), timeout: 10000 }).catch(() => {});
  await ytm.evaluate(() => { document.querySelector('ytmusic-player #song-video').style.display = ''; });
  check('Fallback goes away again when it is not needed', await until(() => ytm.evaluate(() => !document.querySelector('ytmusic-player').hasAttribute('ytmd-no-video')), 6000));

  await ytm.click('ytmusic-player-bar .toggle-player-page-button');
  const m1 = await until(async () => { const m = await mini(); return m.state === 'MINIPLAYER' ? m : null; }, 8000);
  await sleep(1500);
  const m2 = await mini();
  check('Mini album art is a round disc', m1 && m2.radius === '50%' && mode === 'ATV_PREFERRED', `${m2.size}px, mode ${mode}`);
  check('Disc spins while music plays', m2.animation === 'ytmd-spin' && m2.running === 'running' && m2.playingFlag);
  await sleep(1200);
  const m3 = await mini();
  check('Disc is actually turning', m3.transform !== m2.transform, `${m2.transform.slice(0, 30)} → ${m3.transform.slice(0, 30)}`);
  await ytm.screenshot({ path: path.join(out, '11-mini-disc.png'), timeout: 10000 }).catch(() => {});
  await ytm.click('ytmusic-player-bar #play-pause-button');
  check('Disc stops when paused', await until(async () => (await mini()).running === 'paused', 5000));
  await ytm.hover('ytmusic-player');
  await sleep(500);
  await ytm.click('ytmusic-player .player-maximize-button');
  check('Disc button still opens the full player', await until(async () => (await mini()).state === 'PLAYER_PAGE_OPEN', 8000));

  // ---------- see-through background ----------
  const before = await main(app);
  check('Normal window is solid and resizable', !/^#00/.test(before.background) && before.resizable, before.background);
  await shell.click('#btn-settings');
  await shell.click('#toggle-clear');
  await sleep(3000);
  ({ shell, ytm } = await pages(app));
  await sleep(2500);
  const clear = await main(app);
  check('Switch rebuilds the window as see-through', clear.count === 1 && /^#00/.test(clear.background), `${clear.background}, ${clear.count} window`);
  check('Window keeps its size and position', ['x', 'y', 'width', 'height'].every((k) => clear.bounds[k] === before.bounds[k]));
  const vars = await ytm.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { panel: cs.getPropertyValue('--app-panel').trim(), base: cs.getPropertyValue('--app-base').trim(), html: cs.backgroundColor, bar: getComputedStyle(document.querySelector('#nav-bar-background')).backgroundColor, text: cs.getPropertyValue('--app-text').trim() };
  });
  check('Page backgrounds are fully clear', vars.panel === 'transparent' && vars.base === 'transparent' && vars.html === 'rgba(0, 0, 0, 0)' && vars.bar === 'rgba(0, 0, 0, 0)', JSON.stringify(vars));
  check('Title bar is clear too', (await shell.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgba(0, 0, 0, 0)');
  check('Switch shows as on after the rebuild', await shell.evaluate(() => document.getElementById('toggle-clear').checked));
  await ytm.screenshot({ path: path.join(out, '12-clear-top.png'), omitBackground: true, timeout: 10000 }).catch(() => {});
  await ytm.evaluate(() => window.scrollTo(0, 700));
  await sleep(1000);
  await ytm.screenshot({ path: path.join(out, '13-clear-scrolled.png'), omitBackground: true, timeout: 10000 }).catch(() => {});
  await shell.click('#btn-max');
  check('Maximize works in see-through mode', await until(async () => (await main(app)).maximized, 5000));
  await shell.click('#btn-max');
  await until(async () => !(await main(app)).maximized, 5000);
  const saved = JSON.parse(fs.readFileSync(path.join(profile, 'ytm-desktop.json'), 'utf8'));
  check('See-through choice is saved', saved.clear === true);

  await shell.click('#btn-settings');
  await shell.click('#toggle-clear');
  await sleep(3000);
  ({ shell, ytm } = await pages(app));
  const solid = await main(app);
  check('Switching off returns a solid window', solid.count === 1 && !/^#00/.test(solid.background) && solid.resizable, solid.background);
  check('Colors are solid again', (await ytm.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-panel').trim())) !== 'transparent');

  await app.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
