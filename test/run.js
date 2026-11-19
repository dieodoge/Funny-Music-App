// End-to-end check: launches the real app with a throwaway profile (muted),
// clicks every control this app adds, and reports PASS/FAIL for each.
// Run with:  npm test          (add  --no-media-keys  to skip real key presses)
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { _electron: electron } = require('playwright-core');
const theme = require('../src/theme');

const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'out');
const profile = path.join(out, 'profile-run');
const MEDIA_KEYS = !process.argv.includes('--no-media-keys');

fs.rmSync(profile, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}
function note(name, detail) {
  results.push({ name, ok: null, detail });
  console.log(`SKIP  ${name}  — ${detail}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 15000, step = 250) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch {
      /* page busy; retry */
    }
    if (Date.now() > end) return null;
    await sleep(step);
  }
}

async function launch() {
  const app = await electron.launch({
    args: [root],
    env: { ...process.env, YTM_TEST: '1', YTM_USER_DATA: profile },
  });
  await until(() => app.windows().length >= 2, 30000);
  const pages = app.windows();
  const shell = pages.find((p) => p.url().startsWith('file:'));
  const ytm = pages.find((p) => !p.url().startsWith('file:'));
  await until(() => ytm.evaluate(() => ['ytmusic-nav-bar', '#nav-bar-background', 'ytmusic-player-bar', 'ytmusic-guide-entry-renderer', '#ytmd-album-button'].every((s) => document.querySelector(s))), 60000);
  await sleep(2500);
  return { app, shell, ytm };
}

const winState = (app) =>
  app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return {
      maximized: w.isMaximized(),
      minimized: w.isMinimized(),
      bounds: w.getBounds(),
      view: w.contentView.children[0].getBounds(),
    };
  });

const shellVar = (shell, name) =>
  shell.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const ytmVar = (ytm, name) =>
  ytm.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const video = (ytm) =>
  ytm.evaluate(() => {
    const v = document.querySelector('video');
    return v ? { paused: v.paused, time: v.currentTime, duration: v.duration, volume: v.volume } : null;
  });
const trackTitle = (ytm) =>
  ytm.evaluate(() => (document.querySelector('ytmusic-player-bar .title')?.textContent || '').trim());
const albumButton = (ytm) =>
  ytm.evaluate(() => {
    const b = document.getElementById('ytmd-album-button');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { disabled: b.disabled, title: b.title, visible: r.width > 0 && r.height > 0 };
  });

function pressMediaKey(vk) {
  const script =
    "$k = Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern void keybd_event(byte v, byte s, uint f, System.UIntPtr e);' -Name Kb -Namespace YtmdTest -PassThru; " +
    `$k::keybd_event(${vk},0,1,[UIntPtr]::Zero); Start-Sleep -Milliseconds 60; $k::keybd_event(${vk},0,3,[UIntPtr]::Zero)`;
  execFileSync('powershell', ['-NoProfile', '-Command', script], { stdio: 'ignore' });
}

// Waits until a real song (not an advert) is in the player bar.
async function waitForSong(ytm, timeout = 120000) {
  return until(
    async () => {
      await ytm.evaluate(() => {
        const skip = document.querySelector(
          '.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button',
        );
        if (skip && skip.offsetParent) skip.click();
      });
      return ytm.evaluate(() => {
        const bar = document.querySelector('ytmusic-player-bar');
        const ad = bar.querySelector('.badge-style-type-ad-stark');
        const adShowing = ad && ad.offsetParent;
        const v = document.querySelector('video');
        return !adShowing && !document.querySelector('ytmusic-player .ad-showing') && !/after ad/i.test(bar.textContent) && v && v.duration > 0 && bar.querySelector('#progress-bar').offsetParent !== null;
      });
    },
    timeout,
    1000,
  );
}

// Screenshots are for looking at afterwards; they never fail the run.
async function shot(page, name, barOnly = false) {
  try {
    const options = { path: path.join(out, name), timeout: 10000 };
    if (barOnly) {
      const r = await page.evaluate(() => { const b = document.querySelector('ytmusic-player-bar').getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
      options.clip = r;
    }
    await page.screenshot(options);
  } catch (err) {
    console.log(`(screenshot ${name} skipped: ${String(err.message).split('\n')[0]})`);
  }
}

async function main() {
  let { app, shell, ytm } = await launch();

  // ---------- 1. it launches and shows YouTube Music in the new layout ----------
  check('App launches and loads music.youtube.com', ytm.url().startsWith('https://music.youtube.com'));
  const layout = await ytm.evaluate(() => {
    const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
    const guide = r('ytmusic-guide-renderer');
    const bar = r('ytmusic-player-bar');
    return {
      guideLeft: guide && guide.left < 10 && guide.width > 150,
      entries: [...document.querySelectorAll('ytmusic-guide-entry-renderer .title')].map((e) => e.textContent.trim()),
      barBg: getComputedStyle(document.querySelector('#nav-bar-background')).backgroundColor,
      panel: getComputedStyle(document.querySelector('ytmusic-app'), '::after').borderTopLeftRadius,
      barArea: getComputedStyle(document.querySelector('ytmusic-player-bar')).gridTemplateAreas,
      bar,
    };
  });
  check('Sidebar on the left with Home / Explore / Library', layout.guideLeft && ['Home', 'Explore', 'Library'].every((n) => layout.entries.includes(n)), layout.entries.join(', '));
  check('Custom layout CSS is applied to the page', layout.panel === '12px' && /middle start end/.test(layout.barArea));
  const s0 = await winState(app);
  check('Music view sits under the custom title bar', s0.view.y === 44 && s0.view.width === s0.bounds.width);

  // ---------- 2. album button with nothing playing ----------
  const ab0 = await albumButton(ytm);
  check('Album button exists and is disabled when nothing is playing', ab0 && ab0.disabled, ab0 && ab0.title);

  // ---------- 3. window controls ----------
  await shell.click('#btn-max');
  check('Maximize button maximizes', await until(async () => (await winState(app)).maximized, 5000));
  check('Maximize icon switches to "restore"', await shell.evaluate(() => document.body.classList.contains('maximized')));
  await shell.click('#btn-max');
  check('Maximize button restores', await until(async () => !(await winState(app)).maximized, 5000));
  await shell.click('#btn-min');
  check('Minimize button minimizes', await until(async () => (await winState(app)).minimized, 5000));
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].restore());
  await until(async () => !(await winState(app)).minimized, 5000);
  await sleep(500);

  // ---------- 4. settings panel ----------
  await shell.click('#btn-settings');
  check('Gear button opens the Colors panel', await shell.isVisible('#drawer'));
  const s1 = await until(async () => {
    const s = await winState(app);
    return s.view.width === s.bounds.width - 340 ? s : null;
  }, 5000);
  check('Music view makes room for the panel', Boolean(s1));
  await sleep(600);
  await shot(shell, '01-settings-shell.png');
  await shot(ytm, '02-home-with-panel-open.png');

  // presets
  for (const preset of theme.PRESETS) {
    await shell.click(`.preset[data-id="${preset.id}"]`);
    const ok = await until(async () => {
      const a = await shellVar(shell, '--app-accent');
      const b = await ytmVar(ytm, '--app-accent');
      const bg = await ytmVar(ytm, '--app-bg');
      const text = await ytmVar(ytm, '--ytmusic-text-primary');
      return a === preset.accent && b === preset.accent && bg === preset.background && text === preset.text;
    }, 5000);
    const active = await shell.evaluate((id) => document.querySelector(`.preset[data-id="${id}"]`).classList.contains('active'), preset.id);
    check(`Preset "${preset.name}" recolors title bar and music page live`, ok && active);
    if (preset.id === 'paper' || preset.id === 'ocean') {
      await sleep(500);
      await shot(ytm, `03-preset-${preset.id}.png`);
    }
  }

  // individual pickers (setting the value is exactly what the system color dialog does)
  const custom = { accent: '#ff5500', background: '#101820', text: '#e0ffe0' };
  await shell.fill('#color-accent', custom.accent);
  check('Accent picker changes accent live', await until(async () =>
    (await ytmVar(ytm, '--app-accent')) === custom.accent &&
    (await ytm.evaluate(() => getComputedStyle(document.querySelector('#play-pause-button')).backgroundColor)) === hexToRgb(custom.accent) &&
    (await shell.evaluate(() => getComputedStyle(document.querySelector('.logo-bg')).fill)) === hexToRgb(custom.accent), 5000));
  await shell.fill('#color-background', custom.background);
  check('Background picker changes background live', await until(async () =>
    (await ytmVar(ytm, '--app-bg')) === custom.background &&
    (await ytm.evaluate(() => getComputedStyle(document.querySelector('ytmusic-player-page')).backgroundColor)) === hexToRgb(custom.background), 5000));
  await shell.fill('#color-text', custom.text);
  check('Text picker changes text color live', await until(async () =>
    (await ytmVar(ytm, '--app-text')) === custom.text &&
    (await ytm.evaluate(() => getComputedStyle(document.querySelector('ytmusic-guide-entry-renderer:not([active]) .title')).color)) === hexToRgb(custom.text) &&
    (await shell.evaluate(() => getComputedStyle(document.querySelector('.name')).color)) === hexToRgb(custom.text), 5000));
  check('Hex labels follow the pickers', (await shell.textContent('#hex-accent')) === custom.accent);
  await sleep(400);
  await shot(ytm, '04-custom-colors.png');

  // reset
  await shell.click('#btn-reset');
  check('Reset returns to the default colors', await until(async () =>
    (await ytmVar(ytm, '--app-accent')) === theme.DEFAULT_COLORS.accent &&
    (await ytmVar(ytm, '--app-bg')) === theme.DEFAULT_COLORS.background &&
    (await ytmVar(ytm, '--app-text')) === theme.DEFAULT_COLORS.text &&
    (await shell.inputValue('#color-accent')) === theme.DEFAULT_COLORS.accent, 5000));

  // closing the panel: X button, gear toggle, Escape
  await shell.click('#btn-drawer-close');
  check('Panel X button closes the panel', !(await shell.isVisible('#drawer')) && (await until(async () => { const s = await winState(app); return s.view.width === s.bounds.width; }, 5000)));
  await shell.click('#btn-settings');
  await shell.click('#btn-settings');
  check('Gear button toggles the panel closed', !(await shell.isVisible('#drawer')));
  await shell.click('#btn-settings');
  await shell.press('body', 'Escape');
  check('Escape closes the panel', !(await shell.isVisible('#drawer')));

  // ---------- 5. navigation buttons ----------
  check('Back is disabled on the first page', await shell.isDisabled('#btn-back'));
  await ytm.click('ytmusic-guide-entry-renderer:has-text("Explore")');
  await until(() => ytm.url().includes('/explore'), 10000);
  check('Sidebar "Explore" works and enables Back', await until(() => shell.isEnabled('#btn-back'), 5000), ytm.url());
  await shell.click('#btn-back');
  check('Back button goes back', await until(() => !ytm.url().includes('/explore'), 10000));
  check('Forward becomes enabled', await until(() => shell.isEnabled('#btn-forward'), 5000));
  await shell.click('#btn-forward');
  check('Forward button goes forward', await until(() => ytm.url().includes('/explore'), 10000));
  await shell.click('#btn-home');
  check('Home button returns to the home page', await until(() => /music\.youtube\.com\/?$/.test(ytm.url()), 15000), ytm.url());
  await until(() => ytm.evaluate(() => Boolean(document.querySelector('ytmusic-nav-bar'))), 30000);
  await ytm.evaluate(() => { window.__ytmdMarker = 1; });
  await shell.click('#btn-reload');
  check('Reload button reloads the page', await until(() => ytm.evaluate(() => window.__ytmdMarker === undefined && Boolean(document.querySelector('ytmusic-nav-bar'))), 30000));
  check('Layout and colors are re-applied after reload', await until(async () => (await ytmVar(ytm, '--app-accent')) === theme.DEFAULT_COLORS.accent, 10000));

  // ---------- 6. playback, player bar and album button (signed out, muted) ----------
  await until(() => ytm.evaluate(() => Boolean(document.querySelector('ytmusic-browse-response ytmusic-play-button-renderer'))), 30000);
  await sleep(1500);
  await require('./pick-song')(ytm, until, sleep);
  const song = await waitForSong(ytm);
  if (!song) {
    note('Playback checks', 'no song started within 2 minutes (adverts or network), so player-bar checks were not run');
  } else {
    await sleep(1500);
    check('A song plays', !(await video(ytm)).paused, await trackTitle(ytm));
    const info = await ytm.evaluate(() => {
      const bar = document.querySelector('ytmusic-player-bar');
      const rect = (sel) => { const r = bar.querySelector(sel).getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      return {
        width: bar.getBoundingClientRect().width,
        art: rect('.thumbnail-image-wrapper'), title: rect('.title'), controls: rect('.left-controls-buttons'),
        seek: rect('#progress-bar'), volume: rect('.right-controls-buttons .volume'), album: rect('#ytmd-album-button'),
        artist: bar.querySelector('.byline').textContent.trim(),
        artSrc: bar.querySelector('.thumbnail-image-wrapper img')?.src || '',
      };
    });
    const mid = info.width / 2;
    check('Player bar: art + title + artist on the left', info.art.x < 60 && info.title.x < mid / 2 && info.title.w > 40 && info.artist.length > 0 && info.artSrc.length > 0, info.artist);
    check('Player bar: prev / play / next centered with seek bar below', Math.abs(info.controls.x + info.controls.w / 2 - mid) < 30 && Math.abs(info.seek.x + info.seek.w / 2 - mid) < 30 && info.seek.y + info.seek.h / 2 > info.controls.y + info.controls.h / 2);
    check('Player bar: volume and album button on the right', info.volume.x > mid && info.album.x > mid && info.album.w > 0);
    await shot(ytm, '05-player-bar.png', true);
    await shot(ytm, '06-now-playing.png');

    // play / pause
    await ytm.click('ytmusic-player-bar #play-pause-button');
    check('Play/pause button pauses', await until(async () => (await video(ytm)).paused, 5000));
    await ytm.click('ytmusic-player-bar #play-pause-button');
    check('Play/pause button resumes', await until(async () => !(await video(ytm)).paused, 5000));

    // seek bar
    const box = await ytm.locator('ytmusic-player-bar #progress-bar #sliderBar').boundingBox();
    await ytm.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
    const seeked = await until(async () => { const v = await video(ytm); return Math.abs(v.time / v.duration - 0.5) < 0.06 ? v : null; }, 5000);
    check('Seek bar jumps to the clicked position', Boolean(seeked), seeked ? `${Math.round(seeked.time)}s of ${Math.round(seeked.duration)}s` : JSON.stringify(await video(ytm)));

    // volume
    const sliderValue = () => ytm.evaluate(() => Number(document.querySelector('#volume-slider').value));
    const before = await sliderValue();
    await ytm.hover('ytmusic-player-bar .right-controls-buttons .volume');
    await sleep(600);
    const vbox = await ytm.locator('ytmusic-player-bar #volume-slider #sliderBar').boundingBox();
    if (vbox && vbox.width > 0) {
      await ytm.mouse.click(vbox.x + vbox.width * 0.25, vbox.y + vbox.height / 2);
      const after = await until(async () => { const v = await sliderValue(); return v !== before ? { volume: v } : null; }, 5000);
      check('Volume slider changes the volume', Boolean(after), after ? `${before} → ${after.volume}` : `stayed ${before}`);
    } else {
      note('Volume slider', 'slider not visible at this window width');
    }

    // album button
    const ab1 = await albumButton(ytm);
    check('Album button is enabled and visible for a track with an album', ab1 && !ab1.disabled && ab1.visible, ab1 && ab1.title);
    const titleBefore = await trackTitle(ytm);
    await ytm.evaluate(() => { window.__ytmdSamePage = 1; });
    await ytm.click('#ytmd-album-button');
    const onAlbum = await until(() => /browse\/MPRE|browse\/VLOLAK|playlist\?list=OLAK/.test(ytm.url()), 15000);
    check('Album button opens the album page', Boolean(onAlbum), ytm.url());
    await until(() => ytm.evaluate(() => Boolean(document.querySelector('ytmusic-responsive-header-renderer, ytmusic-detail-header-renderer'))), 15000);
    await sleep(2500);
    const albumPage = await ytm.evaluate(() => ({
      heading: (document.querySelector('ytmusic-responsive-header-renderer .title, ytmusic-detail-header-renderer .title')?.textContent || '').trim(),
      tracks: document.querySelectorAll('ytmusic-browse-response ytmusic-responsive-list-item-renderer').length,
      playerPageOpen: Boolean(document.querySelector('ytmusic-app-layout')?.hasAttribute('player-page-open')),
    }));
    check('Album opens without reloading the page', await ytm.evaluate(() => window.__ytmdSamePage === 1));
    check('Album page shows the album with its track list', albumPage.tracks > 0 && !albumPage.playerPageOpen, `"${albumPage.heading}", ${albumPage.tracks} tracks`);
    check('Music keeps playing while viewing the album', !(await video(ytm)).paused && (await trackTitle(ytm)) === titleBefore);
    await shot(ytm, '07-album-page.png');

    // next / previous buttons
    await ytm.click('ytmusic-player-bar .next-button');
    const nextTitle = await until(async () => { const t = await trackTitle(ytm); return t && t !== titleBefore ? t : null; }, 15000);
    check('Next button changes track', Boolean(nextTitle), `${titleBefore} → ${nextTitle}`);
    await waitForSong(ytm);
    await sleep(1500);
    await ytm.click('ytmusic-player-bar .previous-button');
    const prevDone = await until(async () => { const t = await trackTitle(ytm); const v = await video(ytm); return t === titleBefore || (v && v.time < 3) ? t : null; }, 15000);
    check('Previous button goes back', Boolean(prevDone), String(prevDone));
    await waitForSong(ytm);
    await sleep(1500);

    // ---------- 7. keyboard media keys ----------
    if (!MEDIA_KEYS) {
      note('Media keys', 'skipped by --no-media-keys');
    } else {
      await ytm.evaluate(() => { const v = document.querySelector('video'); if (v.paused) v.play(); });
      await until(async () => !(await video(ytm)).paused, 5000);
      await sleep(1500);
      pressMediaKey('0xB3');
      const paused = await until(async () => (await video(ytm)).paused, 5000);
      check('Media key Play/Pause pauses', Boolean(paused));
      if (paused) {
        pressMediaKey('0xB3');
        check('Media key Play/Pause resumes', await until(async () => !(await video(ytm)).paused, 5000));
        const t0 = await trackTitle(ytm);
        pressMediaKey('0xB0');
        const t1 = await until(async () => { const t = await trackTitle(ytm); return t && t !== t0 ? t : null; }, 15000);
        check('Media key Next changes track', Boolean(t1), `${t0} → ${t1}`);
        await waitForSong(ytm);
        await sleep(4000);
        pressMediaKey('0xB1');
        const t2 = await until(async () => { const t = await trackTitle(ytm); const v = await video(ytm); return t !== t1 || (v && v.time < 4) ? t : null; }, 30000, 100);
        check('Media key Previous goes back', Boolean(t2), String(t2));
      } else {
        // Undo the key press in case it reached another app instead.
        pressMediaKey('0xB3');
      }
    }

    // ---------- 8. a track with no album ----------
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.loadURL('https://music.youtube.com/watch?v=jNQXAC9IVRw').catch(() => {});
    });
    const gotVideo = await until(async () => /zoo/i.test(await trackTitle(ytm)), 45000);
    let how = 'a real video with no album';
    if (gotVideo) {
      await waitForSong(ytm, 90000);
      await sleep(2000);
    } else {
      // YouTube did not switch to the album-less video this time; take the album
      // link away from the current track instead, which is what such a track looks like.
      how = 'album link removed from the current track';
      await ytm.evaluate(() => {
        for (const a of document.querySelectorAll('ytmusic-player-bar .byline a[href*="browse/MPRE"]')) a.setAttribute('href', 'channel/none');
      });
      await sleep(1500);
    }
    const ab2 = await albumButton(ytm);
    const links = await ytm.evaluate(() => [...document.querySelectorAll('ytmusic-player-bar .byline a')].map((a) => a.getAttribute('href')));
    check('Album button is disabled for a track without an album', ab2 && ab2.disabled && !links.some((h) => /MPRE/.test(h)), `${how}: ${await trackTitle(ytm)} — ${ab2 && ab2.title}`);
    await shot(ytm, '08-player-bar-no-album.png', true);
  }

  // ---------- 9. things remembered between launches ----------
  await shell.click('#btn-settings');
  await shell.click('.preset[data-id="rose"]');
  await shell.fill('#color-accent', '#12cc88');
  await shell.click('#btn-drawer-close');
  const target = { x: 140, y: 90, width: 1111, height: 777 };
  await app.evaluate(({ BrowserWindow }, b) => BrowserWindow.getAllWindows()[0].setBounds(b), target);
  await sleep(1200);
  const closed = new Promise((resolve) => app.once('close', resolve));
  await shell.click('#btn-close');
  const didClose = await Promise.race([closed.then(() => true), sleep(10000).then(() => false)]);
  check('Close button closes the app', didClose);
  if (!didClose) await app.close();

  ({ app, shell, ytm } = await launch());
  const s2 = await winState(app);
  check('Window size and position are remembered', ['x', 'y', 'width', 'height'].every((k) => s2.bounds[k] === target[k]), JSON.stringify(s2.bounds));
  check('Colors are remembered', (await ytmVar(ytm, '--app-accent')) === '#12cc88' && (await ytmVar(ytm, '--app-bg')) === '#1b1218' && (await shellVar(shell, '--app-accent')) === '#12cc88');
  const cookies = await app.evaluate(({ session }) => session.defaultSession.cookies.get({ domain: '.youtube.com' }).then((c) => c.filter((x) => !x.session).length));
  check('Site cookies are kept on disk between launches (what keeps a sign-in remembered)', cookies > 0, `${cookies} saved cookies`);
  const ua = await ytm.evaluate(() => navigator.userAgent);
  check('Page sees a plain Chrome browser identity (needed for Google sign-in)', !/Electron|ytm/i.test(ua), ua);
  await shot(ytm, '09-relaunch.png');
  await app.close();

  const failed = results.filter((r) => r.ok === false);
  const skipped = results.filter((r) => r.ok === null);
  console.log(`\n${results.length - failed.length - skipped.length} passed, ${failed.length} failed, ${skipped.length} skipped`);
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2));
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
