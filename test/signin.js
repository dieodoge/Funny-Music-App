// Clicks every sign-in button of a signed-out copy of the app and checks each
// one reaches Google's sign-in page with its email box. Nothing is typed in.
// Run with:  node test/signin.js
const path = require('path'); const fs = require('fs');
const { _electron: electron } = require('playwright-core');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const profile = path.join(__dirname, 'out', 'profile-sign');
  fs.rmSync(profile, { recursive: true, force: true });
  const app = await electron.launch({ args: [path.join(__dirname, '..')], env: { ...process.env, YTM_TEST: '1', YTM_USER_DATA: profile } });
  await sleep(9000);
  await app.evaluate(({ BrowserWindow }) => { const wc = BrowserWindow.getAllWindows()[0].contentView.children[0].webContents; global.__log = []; for (const ev of ['will-navigate', 'did-start-navigation', 'did-fail-load', 'will-prevent-unload']) wc.on(ev, (e, a, b, c) => global.__log.push(ev + ' ' + String(a).slice(0, 90) + ' ' + String(b).slice(0, 40))); const orig = wc.loadURL.bind(wc); wc.loadURL = (u, o) => { global.__log.push('loadURL ' + String(u).slice(0, 90)); return orig(u, o); }; });
  const ytmPage = () => app.windows().find(p => !p.isClosed() && !p.url().startsWith('file:'));
  const shell = app.windows().find(p => p.url().startsWith('file:'));
  const tryButton = async (name, prepare, click) => {
    let ytm = ytmPage();
    if (prepare) await prepare(ytm);
    await app.evaluate(() => { global.__log.length = 0; });
    let err = '';
    try { await click(ytm); } catch (e) { err = String(e.message).split('\n')[0]; }
    let ok = false;
    for (let i = 0; i < 24 && !ok; i++) { await sleep(500); ok = /^https:\/\/accounts\.google\.com\//.test(ytmPage().url()); }
    let email = false;
    if (ok) { await sleep(2500); email = await ytmPage().evaluate(() => Boolean(document.querySelector('input[type="email"], #identifierId')) && !/may not be secure/i.test(document.body.innerText)).catch(() => false); }
    console.log(`${ok && email ? 'PASS' : 'FAIL'}  ${name}  url=${ytmPage().url().slice(0, 60)} ${err}`);
    if (!ok) console.log('   log: ' + JSON.stringify(await app.evaluate(() => global.__log)));
    await shell.click('#btn-home');
    for (let i = 0; i < 60; i++) { await sleep(500); const p = ytmPage(); if (p.url().startsWith('https://music.youtube.com') && await p.evaluate(() => Boolean(document.querySelector('ytmusic-guide-signin-promo-renderer button'))).catch(() => false)) break; }
    await sleep(2000);
  };
  await tryButton('Top bar "Sign in"', null, (p) => p.click('ytmusic-nav-bar a.sign-in-link'));
  await tryButton('Sidebar "Sign in"', null, (p) => p.click('ytmusic-guide-signin-promo-renderer button'));
  await tryButton('Library page "Sign in"', async (p) => { await p.click('ytmusic-guide-entry-renderer:has-text("Library")'); await sleep(4000); console.log('   library buttons: ' + JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('ytmusic-browse-response a, ytmusic-browse-response button')].filter(e => e.getClientRects().length).map(e => e.tagName + ':' + e.textContent.trim().slice(0, 20) + ':' + (e.href || '').slice(0, 50))))); }, (p) => p.click('ytmusic-browse-response :is(a, button):has-text("Sign in")', { timeout: 5000 }));
  await tryButton('Top bar "Sign in" while a song plays', async (p) => { await p.evaluate(() => document.querySelector('ytmusic-browse-response ytmusic-play-button-renderer').click()); await sleep(12000); }, (p) => p.click('ytmusic-nav-bar a.sign-in-link'));
  await tryButton('Like button sign-in prompt while a song plays', async (p) => { await p.evaluate(() => document.querySelector('ytmusic-browse-response ytmusic-play-button-renderer').click()); await sleep(12000); await p.evaluate(() => { const b = document.querySelector('ytmusic-player-bar #like-button-renderer button[aria-label*="ike"]'); if (b) b.click(); }); await sleep(2500); console.log('   popup: ' + JSON.stringify(await p.evaluate(() => [...document.querySelectorAll('ytmusic-popup-container a, ytmusic-popup-container button, tp-yt-iron-dropdown a, tp-yt-iron-dropdown button')].filter(e => e.getClientRects().length).map(e => e.tagName + ':' + e.textContent.trim().slice(0, 20) + ':' + (e.href || '').slice(0, 60))))); }, (p) => p.click(':is(ytmusic-popup-container, tp-yt-iron-dropdown) :is(a, button):has-text("Sign in")', { timeout: 5000 }));
  await app.close();
})();
