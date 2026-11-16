const { app, BrowserWindow, WebContentsView, ipcMain, shell, screen, globalShortcut, nativeTheme } = require('electron');
const fs = require('fs');
const path = require('path');
const theme = require('./theme');

const HOME_URL = 'https://music.youtube.com/';
const TITLE_BAR_HEIGHT = 44;
const DRAWER_WIDTH = 340;
const TEST_MODE = process.env.YTM_TEST === '1';

// Tests use a throwaway profile so they never touch the real sign-in or settings.
if (process.env.YTM_USER_DATA) app.setPath('userData', process.env.YTM_USER_DATA);

// YouTube Music sees the plain identity of the Chrome engine this app is built on.
const chromeMajor = process.versions.chrome.split('.')[0];
const CHROME_UA =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ` +
  `Chrome/${chromeMajor}.0.0.0 Safari/537.36`;
app.userAgentFallback = CHROME_UA;

// Google's own sign-in page (accounts.google.com) turns this kind of app away
// with "This browser or app may not be secure". The owner of this app asked
// for that page, and only that page, to be requested with a Firefox identity,
// which Google accepts. The owner types their own password on Google's page.
const SIGN_IN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';

function isSignInUrl(url) {
  try {
    // accounts.google.com, its country versions, and YouTube's own account host.
    return /^accounts\.(google\.[a-z.]{2,6}|youtube\.com)$/.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// This app handles the keyboard media keys itself (see registerMediaKeys).
// Turn off the engine's built-in handling so a key press is not acted on twice.
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');

if (!app.requestSingleInstanceLock()) app.quit();

// ---------- small JSON store (settings + window position) ----------

const storeFile = () => path.join(app.getPath('userData'), 'ytm-desktop.json');
let store = { colors: { ...theme.DEFAULT_COLORS }, glass: false, case3d: false, window: null };
let saveTimer = null;

function loadStore() {
  try {
    const raw = JSON.parse(fs.readFileSync(storeFile(), 'utf8'));
    store.colors = theme.sanitize(raw.colors);
    store.glass = raw.glass === true;
    store.case3d = raw.case3d === true;
    if (raw.window && typeof raw.window === 'object') store.window = raw.window;
  } catch {
    /* first launch or unreadable file: keep defaults */
  }
}

function saveStoreNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
    fs.writeFileSync(storeFile(), JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('Could not save settings:', err.message);
  }
}

function saveStoreSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveStoreNow, 400);
}

// ---------- window ----------

let win = null;
let view = null;
let drawerOpen = false;
let variablesKey = null;
let rebuilding = false;

function restoredBounds() {
  const saved = store.window;
  const fallback = { width: 1280, height: 820 };
  if (!saved || !Number.isFinite(saved.width) || !Number.isFinite(saved.height)) return fallback;
  const bounds = {
    width: Math.max(940, Math.round(saved.width)),
    height: Math.max(600, Math.round(saved.height)),
  };
  if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
    // Only reuse the position if it is still on a connected screen.
    const visible = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return (
        saved.x < a.x + a.width - 80 &&
        saved.x + bounds.width > a.x + 80 &&
        saved.y >= a.y - 10 &&
        saved.y < a.y + a.height - 80
      );
    });
    if (visible) {
      bounds.x = Math.round(saved.x);
      bounds.y = Math.round(saved.y);
    }
  }
  return bounds;
}

function rememberBounds() {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  const maximized = win.isMaximized();
  // Keep the last un-maximized size so "restore" still gives a sensible window.
  const normal = maximized ? store.window || {} : win.getBounds();
  store.window = { x: normal.x, y: normal.y, width: normal.width, height: normal.height, maximized };
  saveStoreSoon();
}

function layout() {
  if (!win || win.isDestroyed() || !view) return;
  const [width, height] = win.getContentSize();
  const drawer = drawerOpen ? Math.min(DRAWER_WIDTH, Math.max(0, width - 400)) : 0;
  view.setBounds({
    x: 0,
    y: TITLE_BAR_HEIGHT,
    width: Math.max(0, width - drawer),
    height: Math.max(0, height - TITLE_BAR_HEIGHT),
  });
}

function sendToShell(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function sendWindowState() {
  if (!win || win.isDestroyed()) return;
  sendToShell('win:state', { maximized: win.isMaximized(), focused: win.isFocused() });
}

function sendNavState() {
  if (!view) return;
  const nav = view.webContents.navigationHistory;
  let onMusic = false;
  try {
    onMusic = new URL(view.webContents.getURL()).hostname === 'music.youtube.com';
  } catch {
    /* blank page */
  }
  sendToShell('nav:state', { canGoBack: nav.canGoBack(), canGoForward: nav.canGoForward(), onMusic });
}

function isMusicPage(contents) {
  try {
    return new URL(contents.getURL()).hostname === 'music.youtube.com';
  } catch {
    return false;
  }
}

const layoutCss = () => fs.readFileSync(path.join(__dirname, 'ytm-style.css'), 'utf8');

async function applyVariables() {
  if (!view || !isMusicPage(view.webContents)) return;
  const previous = variablesKey;
  try {
    variablesKey = await view.webContents.insertCSS(theme.variablesCss(store.colors, { glass: store.glass, case3d: store.case3d }));
    if (previous) await view.webContents.removeInsertedCSS(previous);
  } catch {
    /* page went away mid-update */
  }
}

function applyTheme() {
  const p = theme.palette(store.colors);
  const paint = store.glass ? '#00000000' : p.base;
  // Windows tints the glass dark or light; make it follow the chosen colors.
  nativeTheme.themeSource = p.dark ? 'dark' : 'light';
  if (win && !win.isDestroyed()) {
    win.setBackgroundMaterial(store.glass ? 'acrylic' : 'none');
    win.setBackgroundColor(paint);
  }
  if (view) view.setBackgroundColor(paint);
  sendToShell('theme', { colors: store.colors, palette: p, glass: store.glass, case3d: store.case3d });
  applyVariables();
}

// Pages we keep inside the app: YouTube Music itself and Google's sign-in.
function staysInApp(url) {
  try {
    const { protocol, hostname } = new URL(url);
    if (protocol !== 'https:') return false;
    return (
      /(^|\.)youtube\.com$/.test(hostname) ||
      /(^|\.)google\.[a-z.]{2,6}$/.test(hostname) ||
      /(^|\.)gstatic\.com$/.test(hostname)
    );
  } catch {
    return false;
  }
}

function openOutside(url) {
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
}

function createWindow() {
  const p = theme.palette(store.colors);
  win = new BrowserWindow({
    ...restoredBounds(),
    minWidth: 940,
    minHeight: 600,
    frame: false,
    show: false,
    // Glass look: Windows draws a blurred view of the desktop behind the window.
    backgroundMaterial: store.glass ? 'acrylic' : 'none',
    backgroundColor: store.glass ? '#00000000' : p.base,
    title: 'YTM Desktop',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'shell-preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'ytm-preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  view.setBackgroundColor(store.glass ? '#00000000' : p.base);
  win.contentView.addChildView(view);
  layout();

  const wc = view.webContents;
  if (TEST_MODE) wc.setAudioMuted(true);

  wc.on('dom-ready', async () => {
    variablesKey = null;
    if (!isMusicPage(wc)) return;
    try {
      await wc.insertCSS(layoutCss());
    } catch {
      /* navigated away */
    }
    applyVariables();
  });
  // While music plays the page asks "leave site?". There is no such dialog in
  // this app, so without this the Sign in, Reload and Home buttons would do nothing.
  wc.on('will-prevent-unload', (event) => event.preventDefault());
  wc.on('did-navigate', sendNavState);
  wc.on('did-navigate-in-page', sendNavState);
  wc.on('page-title-updated', (_e, title) => sendToShell('page:title', title));
  // Requests to the sign-in page carry the sign-in identity; everything else is Chrome.
  wc.session.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders;
    if (isSignInUrl(details.url)) {
      for (const name of Object.keys(headers)) {
        if (/^user-agent$/i.test(name) || /^sec-ch-ua/i.test(name)) delete headers[name];
      }
      headers['User-Agent'] = SIGN_IN_UA;
    }
    callback({ requestHeaders: headers });
  });
  // Second variant: only the request headers change. The first variant also
  // changed what the page's own scripts saw, and Google still refused; a page
  // claiming Firefox while behaving like Chrome may itself have been the giveaway.
  wc.on('will-navigate', (event, url) => {
    if (!staysInApp(url)) {
      event.preventDefault();
      openOutside(url);
    }
  });
  wc.setWindowOpenHandler(({ url }) => {
    if (staysInApp(url)) {
      // Keep sign-in and other Google/YouTube links in this window.
      wc.loadURL(url);
    } else {
      openOutside(url);
    }
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  win.on('resize', () => {
    layout();
    rememberBounds();
  });
  win.on('move', rememberBounds);
  for (const evt of ['maximize', 'unmaximize', 'focus', 'blur', 'restore']) {
    win.on(evt, () => {
      layout();
      sendWindowState();
      if (evt === 'maximize' || evt === 'unmaximize') rememberBounds();
    });
  }
  win.on('close', saveStoreNow);
  const thisWindow = win;
  win.on('closed', () => {
    if (win !== thisWindow) return; // already replaced by a new window
    win = null;
    view = null;
  });

  win.once('ready-to-show', () => {
    if (store.window && store.window.maximized) win.maximize();
    win.show();
  });

  win.loadFile(path.join(__dirname, 'shell.html'));
  wc.loadURL(HOME_URL);
}

// ---------- messages from the title bar / settings panel ----------

ipcMain.on('win:minimize', () => win && win.minimize());
ipcMain.on('win:toggle-maximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('win:close', () => win && win.close());

ipcMain.on('nav:back', () => view && view.webContents.navigationHistory.goBack());
ipcMain.on('nav:forward', () => view && view.webContents.navigationHistory.goForward());
ipcMain.on('nav:reload', () => view && view.webContents.reload());
ipcMain.on('nav:home', () => view && view.webContents.loadURL(HOME_URL));

ipcMain.handle('settings:get', () => ({
  colors: store.colors,
  palette: theme.palette(store.colors),
  glass: store.glass,
  case3d: store.case3d,
  presets: theme.PRESETS,
  defaults: theme.DEFAULT_COLORS,
}));

ipcMain.on('settings:set-colors', (_event, colors) => {
  store.colors = theme.sanitize({ ...store.colors, ...(colors || {}) });
  saveStoreSoon();
  applyTheme();
});

ipcMain.on('settings:reset', () => {
  store.colors = { ...theme.DEFAULT_COLORS };
  saveStoreSoon();
  applyTheme();
});

// Glass look on/off. Applied live: the music keeps playing.
ipcMain.on('settings:set-glass', (_event, on) => {
  store.glass = Boolean(on);
  saveStoreSoon();
  applyTheme();
});

// Flat spinning disc or the 3D CD case for the mini album art.
ipcMain.on('settings:set-case3d', (_event, on) => {
  store.case3d = Boolean(on);
  saveStoreSoon();
  applyTheme();
});

ipcMain.on('drawer:set', (_event, open) => {
  drawerOpen = Boolean(open);
  layout();
});

// ---------- app lifecycle ----------

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

// Keyboard media keys press the page's own player buttons. The click runs as
// a user gesture; without that the browser engine may refuse to start playback.
function registerMediaKeys() {
  const keys = {
    MediaPlayPause: '#play-pause-button',
    MediaNextTrack: '.next-button',
    MediaPreviousTrack: '.previous-button',
  };
  for (const [key, selector] of Object.entries(keys)) {
    const ok = globalShortcut.register(key, () => {
      if (!view || !isMusicPage(view.webContents)) return;
      const code =
        `(() => { const host = document.querySelector('ytmusic-player-bar ${selector}');` +
        ` if (host) (host.querySelector('button') || host).click(); })()`;
      view.webContents.executeJavaScript(code, true).catch(() => {});
    });
    if (!ok) console.warn(`Could not claim the ${key} key (another program holds it).`);
  }
}

app.whenReady().then(() => {
  loadStore();
  nativeTheme.themeSource = theme.palette(store.colors).dark ? 'dark' : 'light';
  createWindow();
  registerMediaKeys();
});

app.on('will-quit', () => globalShortcut.unregisterAll());

app.on('window-all-closed', () => {
  if (!rebuilding) app.quit();
});
