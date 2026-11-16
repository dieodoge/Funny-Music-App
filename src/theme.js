// Color presets and helpers. The user picks three colors (accent, background,
// text); every other shade used by the app is derived from those here.

const PRESETS = [
  { id: 'midnight', name: 'Midnight', accent: '#8b7cf6', background: '#14141b', text: '#f2f2f7' },
  { id: 'ocean', name: 'Ocean', accent: '#38bdf8', background: '#0e1826', text: '#e6f1fa' },
  { id: 'ember', name: 'Ember', accent: '#fb7a3c', background: '#1a1413', text: '#f7ece6' },
  { id: 'moss', name: 'Moss', accent: '#b4d455', background: '#131812', text: '#ecf2e6' },
  { id: 'rose', name: 'Rose', accent: '#f472b6', background: '#1b1218', text: '#fae8f1' },
  { id: 'paper', name: 'Paper', accent: '#4f46e5', background: '#f4f2ec', text: '#1c1b22' },
];

const DEFAULT_COLORS = {
  accent: PRESETS[0].accent,
  background: PRESETS[0].background,
  text: PRESETS[0].text,
};

const HEX = /^#[0-9a-f]{6}$/i;

function isHex(value) {
  return typeof value === 'string' && HEX.test(value);
}

function sanitize(colors) {
  const out = { ...DEFAULT_COLORS };
  if (colors && typeof colors === 'object') {
    for (const key of Object.keys(DEFAULT_COLORS)) {
      if (isHex(colors[key])) out[key] = colors[key].toLowerCase();
    }
  }
  return out;
}

function toRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb) {
  return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
}

// Blend color a toward color b by amount t (0..1).
function mix(a, b, t) {
  const ra = toRgb(a);
  const rb = toRgb(b);
  return toHex(ra.map((v, i) => v + (rb[i] - v) * t));
}

function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function palette(input) {
  const c = sanitize(input);
  const dark = luminance(c.background) < 0.4;
  return {
    accent: c.accent,
    bg: c.background,
    text: c.text,
    dark,
    base: dark ? mix(c.background, '#000000', 0.5) : mix(c.background, '#000000', 0.08),
    surface: mix(c.background, c.text, 0.07),
    surface2: mix(c.background, c.text, 0.14),
    border: mix(c.background, c.text, 0.12),
    muted: mix(c.text, c.background, 0.38),
    onAccent: luminance(c.accent) > 0.4 ? '#0b0b0f' : '#ffffff',
    accentSoft: mix(c.background, c.accent, 0.22),
  };
}

// CSS custom properties shared by the shell and the YouTube Music page.
// With `glass` on, the window uses Windows' frosted-glass backdrop: the desktop
// shows through, blurred, and the panels become tinted, glossy sheets on top.
// `case3d` only tells the page which style of mini album art to use.
function variablesCss(input, options = {}) {
  const p = palette(input);
  const glass = Boolean(options.glass);
  const vars = `:root{
  --app-accent:${p.accent};--app-bg:${p.bg};--app-text:${p.text};
  --app-base:${glass ? 'transparent' : p.base};
  --app-panel:${glass ? `color-mix(in srgb, ${p.bg} 46%, transparent)` : p.bg};
  --app-surface:${glass ? `color-mix(in srgb, ${p.text} 9%, transparent)` : p.surface};
  --app-surface2:${glass ? `color-mix(in srgb, ${p.text} 16%, transparent)` : p.surface2};
  --app-border:${glass ? `color-mix(in srgb, ${p.text} 16%, transparent)` : p.border};
  --app-muted:${p.muted};--app-on-accent:${p.onAccent};--app-accent-soft:${p.accentSoft};
  --app-solid:${p.surface};
  --app-glass:${glass ? 1 : 0};--app-case3d:${options.case3d ? 1 : 0};
  color-scheme:${p.dark ? 'dark' : 'light'};
}`;
  if (!glass) return vars;
  return `${vars}
/* Panels become glossy sheets: a light sheen across the top-left, a fine bright edge. */
ytmusic-app::before,ytmusic-app::after{
  background:linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.04) 32%, transparent 60%), var(--app-panel) !important;
  border:1px solid color-mix(in srgb, ${p.text} 18%, transparent);
  box-shadow:inset 0 1px 0 rgba(255,255,255,0.28), 0 10px 30px rgba(0,0,0,0.18);
  box-sizing:border-box;
}
/* Menus and dialogs stay solid so they are easy to read. */
html:root{
  --ytmusic-dropdown-background:var(--app-solid) !important;--ytmusic-dialog-background-color:var(--app-solid) !important;
  --ytmusic-menu-popup-background:var(--app-solid) !important;--yt-spec-menu-background:var(--app-solid) !important;
  --yt-spec-raised-background:var(--app-solid) !important;--ytmusic-search-background:var(--app-solid) !important;
  --ytmusic-color-black1:var(--app-solid) !important;--ytmusic-brand-background-solid:var(--app-solid) !important;
}
ytmusic-player-page{background:transparent !important;}
/* The now-playing page sits on top of the browse page; hide what is under it. */
ytmusic-app-layout[player-page-open] > #content{visibility:hidden !important;}
/* Keep scrolling content from showing through the see-through top and bottom bars. */
ytmusic-app-layout > #content{
  --ytmd-top:calc(var(--ytmd-scroll,0px) + 64px);
  --ytmd-end:calc(var(--ytmd-scroll,0px) + 100vh - var(--ytmd-bottom,88px));
  clip-path:polygon(0 var(--ytmd-top),100% var(--ytmd-top),100% var(--ytmd-end),0 var(--ytmd-end));
}
ytmusic-app:has(ytmusic-app-layout[player-ui-state='INACTIVE']){--ytmd-bottom:0px;}`;
}

module.exports = { PRESETS, DEFAULT_COLORS, sanitize, palette, variablesCss, isHex };
