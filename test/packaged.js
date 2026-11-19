// Smoke test of the packaged program: starts dist\win-unpacked\YTM Desktop.exe
// with a throwaway profile and checks the window and music page come up.
const path = require('path');
const { _electron: electron } = require('playwright-core');
(async () => {
  const exe = path.join(__dirname, '..', 'dist', 'win-unpacked', 'YTM Desktop.exe');
  const app = await electron.launch({ executablePath: exe, args: [], env: { ...process.env, YTM_TEST: '1', YTM_USER_DATA: path.join(__dirname, 'out', 'profile-packaged') } });
  await new Promise((r) => setTimeout(r, 12000));
  const pages = app.windows();
  const ytm = pages.find((p) => !p.url().startsWith('file:'));
  const info = await app.evaluate(({ app, BrowserWindow }) => ({ packaged: app.isPackaged, visible: BrowserWindow.getAllWindows()[0].isVisible() }));
  const styled = await ytm.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-accent').trim() && Boolean(document.getElementById('ytmd-album-button')));
  console.log(JSON.stringify({ ...info, url: ytm.url(), styledAndAlbumButton: styled }));
  await app.close();
})().catch((e) => { console.error(e); process.exit(1); });
