// Checks for the later additions: spinning mini album art, album art shown
// when a video has no picture, rectangular adverts, the 3D CD case, the glass
// background switch and the sign-in page identity.
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
        return !(ad && ad.offsetParent) && !document.querySelector('ytmusic-player .ad-showing') && !/after ad/i.test(bar.textContent) && v && v.duration > 0 && bar.querySelector('#progress-bar').offsetParent !== null;
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
  await require('./pick-song')(ytm, until, sleep);
  await waitForSong(ytm);
  const songMode = await require('./pick-song').preferSong(ytm, until);
  check('Test is playing a song (not a music video)', Boolean(songMode), songMode === 'simulated' ? 'YouTube only offered videos signed out; song layout simulated' : 'real song');
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
  // The video area is shown while the video element reports no picture.
  await ytm.evaluate(() => {
    const sim = document.getElementById('ytmd-test-song-layout');
    if (sim) sim.disabled = true;
    document.querySelector('ytmusic-player #song-video').style.setProperty('display', 'block', 'important');
    const v = document.querySelector('video');
    Object.defineProperty(v, 'videoWidth', { configurable: true, get: () => 0 });
  });
  const fallback = await until(() => ytm.evaluate(() => {
    const p = document.querySelector('ytmusic-player');
    return p.hasAttribute('ytmd-no-video') ? p.style.getPropertyValue('--ytmd-art') : null;
  }), 10000);
  check('Album art is shown when the video area has no picture', Boolean(fallback) && /^url\("https:\/\//.test(fallback), String(fallback).slice(0, 60));
  await ytm.screenshot({ path: path.join(out, '10-video-fallback.png'), timeout: 10000 }).catch(() => {});
  await ytm.evaluate(() => {
    document.querySelector('ytmusic-player #song-video').style.removeProperty('display');
    delete document.querySelector('video').videoWidth;
    const sim = document.getElementById('ytmd-test-song-layout');
    if (sim) sim.disabled = false;
  });
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

  // ---------- adverts stay rectangular ----------
  const press = (selector) => ytm.evaluate((s) => { const host = document.querySelector(s); (host.querySelector('button') || host).click(); }, selector);
  await press('ytmusic-player-bar #play-pause-button');
  await press('ytmusic-player-bar .toggle-player-page-button');
  await until(async () => (await mini()).state === 'MINIPLAYER', 8000);
  await sleep(1000);
  await ytm.evaluate(() => document.querySelector('ytmusic-player .html5-video-player').classList.add('ad-showing'));
  const adLook = await until(async () => { const m = await mini(); return m.radius !== '50%' && m.animation !== 'ytmd-spin' ? m : null; }, 5000);
  check('Mini picture is a plain rectangle during an advert', Boolean(adLook) && (await ytm.evaluate(() => document.documentElement.hasAttribute('ytmd-ad'))), adLook ? `corner radius ${adLook.radius}` : 'still round');
  await ytm.evaluate(() => document.querySelector('ytmusic-player .html5-video-player').classList.remove('ad-showing'));
  check('Disc comes back after the advert', await until(async () => (await mini()).radius === '50%', 5000));

  // ---------- 3D CD case ----------
  const caseState = () => ytm.evaluate(() => {
    const host = document.getElementById('ytmd-case');
    if (!host || host.hidden) return { shown: false, on: document.documentElement.hasAttribute('ytmd-case-on') };
    const r = host.getBoundingClientRect();
    const t = host.querySelector('.box').style.transform;
    const y = Number((t.match(/rotateY\(([-0-9.]+)deg\)/) || [])[1]);
    const x = Number((t.match(/rotateX\(([-0-9.]+)deg\)/) || [])[1]);
    return { shown: r.width > 0, on: document.documentElement.hasAttribute('ytmd-case-on'), x, y, cx: r.x + r.width / 2, cy: r.y + r.height / 2,
      art: host.querySelector('.front img').src, title: host.querySelector('.back b').textContent, faces: host.querySelectorAll('.face').length,
      depth: getComputedStyle(host.querySelector('.box')).transformStyle, flatOpacity: getComputedStyle(document.querySelector('ytmusic-player')).opacity };
  });
  await shell.click('#btn-settings');
  await shell.click('#toggle-case3d');
  const c1 = await until(async () => { const c = await caseState(); return c.shown ? c : null; }, 6000);
  check('3D case switch shows the CD case instead of the disc', Boolean(c1) && c1.on && c1.flatOpacity === '0' && c1.faces === 6 && c1.depth === 'preserve-3d', c1 ? `${c1.faces} faces` : 'not shown');
  check('Case shows the current album art and title', Boolean(c1) && c1.art.startsWith('https://') && c1.title.length > 0, c1 ? c1.title : '');
  await sleep(1500);
  const c2 = await caseState();
  await sleep(1000);
  const c3 = await caseState();
  check('Case turns by itself while music plays', c3.y - c2.y > 8, `${c2.y}° → ${c3.y}°`);
  await ytm.mouse.move(c3.cx, c3.cy);
  await ytm.mouse.down();
  await ytm.mouse.move(c3.cx + 90, c3.cy - 40, { steps: 10 });
  const c4 = await caseState();
  await ytm.mouse.up();
  check('Dragging turns the case (sideways and tilt)', c4.y - c3.y > 40 && Math.abs(c4.x - c3.x) > 8, `turn ${c3.y}° → ${c4.y}°, tilt ${c3.x}° → ${c4.x}°`);
  await ytm.screenshot({ path: path.join(out, '15-cd-case.png'), timeout: 10000 }).catch(() => {});
  await sleep(2500);
  const c5 = await caseState();
  check('Case settles back upright after letting go', Math.abs(c5.x - 10) < 6, `tilt ${c5.x}°`);
  await ytm.mouse.click(c5.cx, c5.cy);
  check('Clicking the case opens the full player', await until(async () => (await mini()).state === 'PLAYER_PAGE_OPEN' && !(await caseState()).shown, 8000));
  await press('ytmusic-player-bar .toggle-player-page-button');
  await until(async () => (await caseState()).shown, 8000);
  await shell.click('#toggle-case3d');
  check('Switching the case off brings the flat disc back', await until(async () => { const c = await caseState(); const m = await mini(); return !c.shown && !c.on && m.radius === '50%'; }, 6000));

  // ---------- glass background ----------
  const glassVars = () => ytm.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return { glass: cs.getPropertyValue('--app-glass').trim(), base: cs.getPropertyValue('--app-base').trim(), html: cs.backgroundColor,
      nav: getComputedStyle(document.querySelector('#nav-bar-background')).backgroundColor, scroller: getComputedStyle(document.querySelector('ytmusic-app-layout > #content')).position + '/' + getComputedStyle(document.querySelector('ytmusic-app-layout > #content')).overflowY, pageLayer: getComputedStyle(document.querySelector('ytmusic-browse-response, ytmusic-app-layout > #content > *')).backgroundColor,
      panel: getComputedStyle(document.querySelector('ytmusic-app'), '::after').backgroundColor,
      edge: getComputedStyle(document.querySelector('ytmusic-app'), '::after').borderTopWidth };
  });
  const before = await main(app);
  await ytm.evaluate(() => { window.__ytmdSamePage = 1; });
  await shell.click('#toggle-glass');
  const g = await until(async () => { const v = await glassVars(); return v.glass === '1' ? v : null; }, 6000);
  check('Glass switch makes the page see-through', Boolean(g) && g.base === 'transparent' && g.html === 'rgba(0, 0, 0, 0)' && Number((g.nav.match(/[\d.]+(?=\)$)/) || [1])[0]) < 0.5 && g.pageLayer === 'rgba(0, 0, 0, 0)', JSON.stringify(g));
  check('In glass mode the page scrolls inside the main panel', Boolean(g) && g.scroller === 'fixed/auto', g ? g.scroller : '');
  const alpha = g ? Number((g.panel.match(/[\d.]+(?=\)$)/) || [1])[0]) : 1;
  check('Panels are lightly tinted glass with a bright edge', Boolean(g) && alpha > 0.05 && alpha < 0.5 && g.edge === '1px', g ? g.panel : '');
  check('Title bar and settings panel go glass, tinted with the chosen colors', await shell.evaluate(() => document.documentElement.classList.contains('glass') && getComputedStyle(document.body).backgroundImage.includes('gradient') && getComputedStyle(document.documentElement).backgroundColor === 'rgba(0, 0, 0, 0)'));
  const during = await main(app);
  check('Window stays resizable and in place', during.resizable && during.count === 1 && ['x', 'y', 'width', 'height'].every((k) => during.bounds[k] === before.bounds[k]));
  check('Music keeps playing through the switch (no reload)', await ytm.evaluate(() => window.__ytmdSamePage === 1 && !document.querySelector('video').paused));
  await sleep(1000);
  const saved = JSON.parse(fs.readFileSync(path.join(profile, 'ytm-desktop.json'), 'utf8'));
  check('Glass choice is saved', saved.glass === true);
  await ytm.screenshot({ path: path.join(out, '12-glass.png'), omitBackground: true, timeout: 10000 }).catch(() => {});
  await shell.click('#toggle-glass');
  check('Switching glass off returns the solid look', await until(async () => { const v = await glassVars(); return v.glass === '0' && v.base !== 'transparent' && v.html !== 'rgba(0, 0, 0, 0)'; }, 6000));
  await shell.click('#btn-drawer-close');

  // ---------- sign-in page identity (nothing is typed into Google's form) ----------
  await app.evaluate(({ session }) => {
    global.__signInUa = null;
    session.defaultSession.webRequest.onSendHeaders({ urls: ['https://accounts.google.com/*'] }, (details) => {
      if (!global.__signInUa) global.__signInUa = details.requestHeaders['User-Agent'];
    });
  });
  await ytm.evaluate(() => {
    const link = [...document.querySelectorAll('ytmusic-nav-bar a, ytmusic-nav-bar yt-button-shape a')].find((a) => /accounts\.google\.com|ServiceLogin/.test(a.href));
    location.href = link ? link.href : 'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F';
  }).catch(() => {});
  const signIn = await until(() => {
    const p = app.windows().find((w) => !w.isClosed() && /^https:\/\/accounts\.google\.com\//.test(w.url()));
    return p || null;
  }, 20000);
  check('Sign in opens Google\'s sign-in page inside the app', Boolean(signIn), signIn ? new URL(signIn.url()).pathname : 'did not get there');
  if (signIn) {
    await sleep(3000);
    const seen = await signIn.evaluate(() => ({ ua: navigator.userAgent, email: Boolean(document.querySelector('input[type="email"], #identifierId')), refused: /may not be secure/i.test(document.body.innerText) }));
    const sent = await app.evaluate(() => global.__signInUa);
    check('Sign-in page is requested with the Firefox identity', /Firefox\//.test(sent || '') && !/Chrome|Electron/.test(sent || ''), String(sent));
    check('Scripts on the sign-in page still see plain Chrome', /Chrome\//.test(seen.ua) && !/Electron/.test(seen.ua), seen.ua);
    check('Sign-in page shows the email box, not a refusal', seen.email && !seen.refused);
    await signIn.screenshot({ path: path.join(out, '14-sign-in-page.png'), timeout: 10000 }).catch(() => {});
    await shell.click('#btn-home');
    const back = await until(async () => {
      const p = app.windows().find((w) => !w.isClosed() && w.url().startsWith('https://music.youtube.com'));
      return p && (await p.evaluate(() => Boolean(document.querySelector('ytmusic-nav-bar')))) ? p : null;
    }, 30000);
    const ua = back ? await back.evaluate(() => navigator.userAgent) : '';
    check('YouTube Music still sees the Chrome identity afterwards', /Chrome\//.test(ua) && !/Firefox/.test(ua), ua);
  }

  await app.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
