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
function variablesCss(input) {
  const p = palette(input);
  return `:root{
  --app-accent:${p.accent};--app-bg:${p.bg};--app-text:${p.text};--app-base:${p.base};
  --app-surface:${p.surface};--app-surface2:${p.surface2};--app-border:${p.border};
  --app-muted:${p.muted};--app-on-accent:${p.onAccent};--app-accent-soft:${p.accentSoft};
  color-scheme:${p.dark ? 'dark' : 'light'};
}`;
}

module.exports = { PRESETS, DEFAULT_COLORS, sanitize, palette, variablesCss, isHex };
