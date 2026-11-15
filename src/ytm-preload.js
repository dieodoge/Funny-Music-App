// Runs inside the YouTube Music page. Its only job is the "View full album"
// button in the player bar: it finds the album link YouTube Music already
// shows for the current track and opens it when the button is clicked.

const BUTTON_ID = 'ytmd-album-button';
const SVG_NS = 'http://www.w3.org/2000/svg';

function albumLink() {
  const links = document.querySelectorAll('ytmusic-player-bar .byline a[href]');
  for (const link of links) {
    const href = link.getAttribute('href') || '';
    // Album pages are "browse/MPRE..." ; artists are "channel/...".
    if (/browse\/MPRE/.test(href)) return link;
  }
  return null;
}

function hasTrack() {
  const title = document.querySelector('ytmusic-player-bar .title');
  return Boolean(title && title.textContent.trim());
}

function buildButton() {
  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const outer = document.createElementNS(SVG_NS, 'circle');
  outer.setAttribute('cx', '12');
  outer.setAttribute('cy', '12');
  outer.setAttribute('r', '8.5');
  const inner = document.createElementNS(SVG_NS, 'circle');
  inner.setAttribute('cx', '12');
  inner.setAttribute('cy', '12');
  inner.setAttribute('r', '2.2');
  svg.append(outer, inner);

  const label = document.createElement('span');
  label.textContent = 'Album';

  button.append(svg, label);
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const link = albumLink();
    if (!link) return;
    link.click();
  });
  return button;
}

function sync() {
  const bar = document.querySelector('ytmusic-player-bar');
  if (!bar) return;
  const host = bar.querySelector('#right-controls');
  if (!host) return;

  let button = document.getElementById(BUTTON_ID);
  if (!button) button = buildButton();
  // First item in the right-hand group, just before the volume control.
  if (button.parentElement !== host || host.firstElementChild !== button) host.prepend(button);

  const link = albumLink();
  const disabled = !link;
  if (button.disabled !== disabled) button.disabled = disabled;
  const tip = link
    ? `View full album: ${link.textContent.trim()}`
    : hasTrack()
      ? 'This track has no album page'
      : 'Play something to see its album';
  if (button.title !== tip) {
    button.title = tip;
    button.setAttribute('aria-label', tip);
  }
}

let queued = false;
function scheduleSync() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    try {
      sync();
    } catch {
      /* the page is mid-update; the next change will retry */
    }
  });
}

function start() {
  if (location.hostname !== 'music.youtube.com') return;
  new MutationObserver(scheduleSync).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['href'],
  });
  // Safety net for changes made while the window is hidden (no animation frames).
  setInterval(() => {
    try {
      sync();
    } catch {
      /* ignore */
    }
  }, 2000);
  scheduleSync();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
