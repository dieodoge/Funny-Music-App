// Checks the 3D CD case stays on screen through ordinary YouTube Music changes
// (other pages, search, the Colors panel, closing the small player), and only
// steps aside for the full now-playing page. Run with:  node test/case-stays.js
const path = require('path');
const fs = require('fs');
const { _electron: electron } = require('playwright-core');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, t) => {
  const end = Date.now() + t;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      /* retry */
    }
    if (Date.now() > end) return null;
    await sleep(300);
  }
};
let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};

(async () => {
  const profile = path.join(__dirname, 'out', 'profile-case-stays');
  fs.rmSync(profile, { recursive: true, force: true });
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(profile, 'ytm-desktop.json'), JSON.stringify({ case3d: true, glass: true, window: { x: 60, y: 40, width: 1300, height: 760 } }));
  const app = await electron.launch({ args: [path.join(__dirname, '..')], env: { ...process.env, YTM_TEST: '1', YTM_USER_DATA: profile } });
  await sleep(9000);
  const shell = app.windows().find((p) => p.url().startsWith('file:'));
  const ytm = app.windows().find((p) => !p.url().startsWith('file:'));

  await require('./pick-song')(ytm, until, sleep);
  await until(
    () =>
      ytm.evaluate(() => {
        const s = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
        if (s && s.offsetParent) s.click();
        return !document.querySelector('ytmusic-player .ad-showing') && document.querySelector('video').currentTime > 1;
      }),
    120000,
  );
  // Close the full player so the small one (and the case) show.
  await ytm.evaluate(() => {
    if (!document.querySelector('ytmusic-app-layout[player-page-open]')) return;
    const h = document.querySelector('ytmusic-player-bar .toggle-player-page-button');
    (h.querySelector('button') || h).click();
  });

  const caseShown = () =>
    ytm.evaluate(() => {
      const c = document.getElementById('ytmd-case');
      if (!c || c.hidden) return false;
      const r = c.getBoundingClientRect();
      return r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
    });
  check('Case shows while a song plays', await until(caseShown, 8000));

  // Watch it 5 times a second while doing things.
  let samples = 0;
  let missing = 0;
  let watching = true;
  const watcher = (async () => {
    while (watching) {
      samples++;
      if (!(await caseShown().catch(() => false))) missing++;
      await sleep(200);
    }
  })();
  const step = async (name, action, settle = 2500) => {
    const before = missing;
    await action().catch(() => {});
    await sleep(settle);
    check(`Case stays during: ${name}`, missing === before, missing === before ? '' : `missing in ${missing - before} checks`);
  };
  await step('opening Explore', () => ytm.click('ytmusic-guide-entry-renderer:has-text("Explore")'));
  await step('opening Library', () => ytm.click('ytmusic-guide-entry-renderer:has-text("Library")'));
  await step('going Home', () => ytm.click('ytmusic-guide-entry-renderer:has-text("Home")'));
  await step('using the search box', async () => {
    await ytm.click('ytmusic-search-box');
    await ytm.keyboard.type('jazz');
    await sleep(1200);
    await ytm.keyboard.press('Escape');
  });
  await step('opening and closing the Colors panel', async () => {
    await shell.click('#btn-settings');
    await sleep(1500);
    await shell.click('#btn-drawer-close');
  });
  await step('scrolling the page', async () => {
    await ytm.mouse.move(600, 380);
    for (let i = 0; i < 5; i++) {
      await ytm.mouse.wheel(0, 600);
      await sleep(200);
    }
  });
  await step('pausing', () => ytm.evaluate(() => {
    const h = document.querySelector('ytmusic-player-bar #play-pause-button');
    (h.querySelector('button') || h).click();
  }));
  const turning = await ytm.evaluate(async () => {
    const y = () => Number((document.querySelector('#ytmd-case .box').style.transform.match(/rotateY\(([-0-9.]+)deg\)/) || [])[1]);
    const a = y();
    await new Promise((r) => setTimeout(r, 1500));
    return y() - a;
  });
  check('Case keeps slowly turning while paused', turning > 1, `${turning.toFixed(1)}° in 1.5 s`);
  await step('playing again', () => ytm.evaluate(() => {
    const h = document.querySelector('ytmusic-player-bar #play-pause-button');
    (h.querySelector('button') || h).click();
  }));
  watching = false;
  await watcher;
  check('Case never disappeared while watching', missing === 0, `${samples} checks, missing in ${missing}`);

  // The full now-playing page shows the big artwork, so the case steps aside.
  await ytm.evaluate(() => {
    const h = document.querySelector('ytmusic-player-bar .toggle-player-page-button');
    (h.querySelector('button') || h).click();
  });
  check('Case steps aside for the full now-playing page', await until(async () => !(await caseShown()), 6000));
  await ytm.evaluate(() => {
    const h = document.querySelector('ytmusic-player-bar .toggle-player-page-button');
    (h.querySelector('button') || h).click();
  });
  check('Case comes back when the now-playing page closes', await until(caseShown, 6000));

  await app.close().catch(() => {});
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
