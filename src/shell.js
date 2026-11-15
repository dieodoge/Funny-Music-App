const api = window.ytmd;
const $ = (id) => document.getElementById(id);

const KEYS = ['accent', 'background', 'text'];
let presets = [];
let colors = {};

// ---------- window buttons ----------

$('btn-min').addEventListener('click', () => api.minimize());
$('btn-max').addEventListener('click', () => api.toggleMaximize());
$('btn-close').addEventListener('click', () => api.close());
$('titlebar').addEventListener('dblclick', (event) => {
  if (!event.target.closest('button')) api.toggleMaximize();
});

api.onWindowState((state) => {
  document.body.classList.toggle('maximized', state.maximized);
  $('btn-max').title = state.maximized ? 'Restore' : 'Maximize';
  $('btn-max').setAttribute('aria-label', $('btn-max').title);
});

// ---------- navigation buttons ----------

$('btn-back').addEventListener('click', () => api.back());
$('btn-forward').addEventListener('click', () => api.forward());
$('btn-reload').addEventListener('click', () => api.reload());
$('btn-home').addEventListener('click', () => api.home());

api.onNavState((state) => {
  $('btn-back').disabled = !state.canGoBack;
  $('btn-forward').disabled = !state.canGoForward;
});

api.onPageTitle((title) => {
  const clean = String(title || '').replace(/\s*[-|]\s*YouTube Music\s*$/i, '');
  $('page-title').textContent = /^YouTube Music$/i.test(clean) ? '' : clean;
});

// ---------- settings drawer ----------

function setDrawer(open) {
  $('drawer').hidden = !open;
  $('btn-settings').setAttribute('aria-expanded', String(open));
  api.setDrawer(open);
}

$('btn-settings').addEventListener('click', () => setDrawer($('drawer').hidden));
$('btn-drawer-close').addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('drawer').hidden) setDrawer(false);
});

function render(theme) {
  colors = theme.colors;
  const root = document.documentElement.style;
  const p = theme.palette;
  root.setProperty('--app-accent', p.accent);
  root.setProperty('--app-bg', p.bg);
  root.setProperty('--app-text', p.text);
  root.setProperty('--app-base', p.base);
  root.setProperty('--app-surface', p.surface);
  root.setProperty('--app-surface2', p.surface2);
  root.setProperty('--app-border', p.border);
  root.setProperty('--app-muted', p.muted);
  root.setProperty('--app-on-accent', p.onAccent);
  root.setProperty('--app-accent-soft', p.accentSoft);
  root.setProperty('color-scheme', p.dark ? 'dark' : 'light');

  for (const key of KEYS) {
    const input = $('color-' + key);
    // Don't fight the picker while the user is dragging inside it.
    if (input.value !== colors[key]) input.value = colors[key];
    $('hex-' + key).textContent = colors[key];
  }
  for (const button of document.querySelectorAll('.preset')) {
    const preset = presets.find((item) => item.id === button.dataset.id);
    const active = KEYS.every((key) => preset[key] === colors[key]);
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  }
}

function buildPresets() {
  const host = $('presets');
  host.textContent = '';
  for (const preset of presets) {
    const button = document.createElement('button');
    button.className = 'preset';
    button.dataset.id = preset.id;
    button.title = `Use the ${preset.name} colors`;

    const swatch = document.createElement('div');
    swatch.className = 'swatch';
    swatch.style.background = preset.background;
    const textBar = document.createElement('u');
    textBar.style.background = preset.text;
    const accentBar = document.createElement('i');
    accentBar.style.background = preset.accent;
    swatch.append(textBar, accentBar);

    const label = document.createElement('span');
    label.textContent = preset.name;

    button.append(swatch, label);
    button.addEventListener('click', () => {
      api.setColors({ accent: preset.accent, background: preset.background, text: preset.text });
    });
    host.append(button);
  }
}

for (const key of KEYS) {
  $('color-' + key).addEventListener('input', (event) => {
    api.setColors({ [key]: event.target.value });
  });
}

$('btn-reset').addEventListener('click', () => api.resetColors());

api.onTheme(render);

api.getSettings().then((settings) => {
  presets = settings.presets;
  buildPresets();
  render(settings);
});
