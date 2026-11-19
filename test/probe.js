// Developer helper: launches the app with a throwaway profile, takes a
// screenshot and prints facts about the YouTube Music page structure.
const path = require('path');
const fs = require('fs');
const { _electron: electron } = require('playwright-core');

const root = path.join(__dirname, '..');
const out = path.join(__dirname, 'out');
fs.mkdirSync(out, { recursive: true });

(async () => {
  const app = await electron.launch({
    args: [root],
    env: { ...process.env, YTM_TEST: '1', YTM_USER_DATA: path.join(out, 'profile') },
  });
  await new Promise((r) => setTimeout(r, 9000));
  const pages = app.windows();
  for (const p of pages) console.log('PAGE', p.url());
  const ytm = pages.find((p) => p.url().includes('youtube') || p.url().includes('google'));
  const code = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : 'document.title';
  if (ytm) {
    try {
      console.log(JSON.stringify(await ytm.evaluate(code)));
    } catch (e) {
      console.log('EVAL ERROR', e.message);
    }
  }
  if (ytm) await ytm.screenshot({ path: path.join(out, 'ytm.png') });
  const shellPage = pages.find((p) => p.url().startsWith('file:'));
  if (shellPage) await shellPage.screenshot({ path: path.join(out, 'shell.png') });
  await app.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
