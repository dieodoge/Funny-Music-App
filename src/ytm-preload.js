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

// ---------- small visual helpers used by the stylesheet ----------

// Marks the page while music is actually playing (the mini album disc spins then).
function markPlaying() {
  const media = document.querySelector('video');
  document.documentElement.toggleAttribute('ytmd-playing', Boolean(media && !media.paused && !media.ended));
}

// Scroll position, used in see-through mode to keep content out from under the bars.
function markScroll() {
  document.documentElement.style.setProperty('--ytmd-scroll', `${window.scrollY}px`);
}

// The current track's artwork. Depending on the track and the window size the
// page keeps it in different places, so several are tried; any that failed to
// load is skipped next time.
const brokenArt = new Set();
function currentArt() {
  const found = [];
  const add = (url) => {
    if (typeof url === 'string' && /^https:/.test(url) && !brokenArt.has(url)) found.push(url);
  };
  const big = document.querySelector('ytmusic-player #song-image img');
  add(big && big.src);
  try {
    const art = (navigator.mediaSession.metadata && navigator.mediaSession.metadata.artwork) || [];
    for (const item of [...art].reverse()) add(item.src); // largest is listed last
  } catch {
    /* no media info yet */
  }
  const small = document.querySelector('ytmusic-player-bar .thumbnail-image-wrapper img, ytmusic-player-bar img.image');
  add(small && small.src && small.src.replace(/=w\d+-h\d+/, '=w544-h544'));
  add(small && small.src);
  const queue = document.querySelector('ytmusic-player-queue-item[selected] img');
  add(queue && queue.src);
  return found[0] || '';
}

// When the player is in video mode but no picture arrives, show the album art.
let noPictureSince = 0;
function checkVideoPicture() {
  const player = document.querySelector('ytmusic-player');
  if (!player) return;
  const area = player.querySelector('#song-video');
  const media = player.querySelector('video');
  const advert = player.querySelector('.html5-video-player.ad-showing');
  const areaShown = Boolean(area && area.getClientRects().length);
  const missing = areaShown && !advert && media && media.videoWidth === 0;
  if (!missing) {
    noPictureSince = 0;
    if (player.hasAttribute('ytmd-no-video')) player.removeAttribute('ytmd-no-video');
    return;
  }
  if (!noPictureSince) noPictureSince = Date.now();
  // Give a real video a few seconds to start before deciding there is none.
  if (Date.now() - noPictureSince < 3000) return;
  const src = currentArt();
  if (!src) return;
  player.style.setProperty('--ytmd-art', `url("${src.replace(/["\\\n]/g, '')}")`);
  if (!player.hasAttribute('ytmd-no-video')) player.setAttribute('ytmd-no-video', '');
}

// Marks the page while an advert is playing, so the mini picture stays a plain
// rectangle for adverts instead of being cropped into a disc.
function advertShowing() {
  const bar = document.querySelector('ytmusic-player-bar');
  const badge = bar && bar.querySelector('.badge-style-type-ad-stark');
  return Boolean(
    document.querySelector('ytmusic-player .html5-video-player.ad-showing') ||
      (badge && badge.getClientRects().length),
  );
}

// ---------- 3D CD case (optional, replaces the flat spinning disc) ----------

const CASE_SPIN = 26; // degrees per second while music plays
const spin = { el: null, box: null, y: -28, x: 10, speed: CASE_SPIN, dragging: false, moved: 0, last: 0, frame: 0 };

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function buildCase() {
  const host = el('div');
  host.id = 'ytmd-case';
  host.title = 'Drag to turn - click to open the player';
  const box = el('div', 'box');

  const front = el('div', 'face front');
  front.append(el('div', 'hinge'), el('img'));
  const back = el('div', 'face back');
  back.append(el('img'), el('b'), el('span'));
  for (const img of [front.querySelector('img'), back.querySelector('img')]) {
    img.alt = '';
    img.draggable = false;
    // If this picture cannot be loaded, remember it so the next source is used.
    img.addEventListener('error', () => {
      if (img.src) brokenArt.add(img.src);
    });
  }
  box.append(front, back);
  for (const side of ['left', 'right', 'top', 'bottom']) box.append(el('div', `face side ${side}`));
  host.append(el('div', 'shadow'), box);

  host.addEventListener('pointerdown', (event) => {
    spin.dragging = true;
    spin.moved = 0;
    host.classList.add('dragging');
    host.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  host.addEventListener('pointermove', (event) => {
    if (!spin.dragging) return;
    spin.moved += Math.abs(event.movementX) + Math.abs(event.movementY);
    spin.y += event.movementX * 0.7;
    spin.x = Math.max(-65, Math.min(65, spin.x - event.movementY * 0.5));
    // A flick keeps the case turning for a moment after letting go.
    spin.speed = Math.max(-720, Math.min(720, event.movementX * 40));
  });
  const release = () => {
    if (!spin.dragging) return;
    spin.dragging = false;
    host.classList.remove('dragging');
    if (spin.moved < 5) {
      // A plain click (no drag) opens the full player, like the normal mini picture.
      spin.speed = CASE_SPIN;
      const toggle = document.querySelector('ytmusic-player-bar .toggle-player-page-button');
      if (toggle) (toggle.querySelector('button') || toggle).click();
    }
  };
  host.addEventListener('pointerup', release);
  host.addEventListener('pointercancel', release);

  spin.el = host;
  spin.box = box;
  return host;
}

function turnCase(now) {
  spin.frame = 0;
  if (!spin.el || spin.el.hidden) return;
  const dt = Math.min(0.1, (now - (spin.last || now)) / 1000);
  spin.last = now;
  if (!spin.dragging) {
    const playing = document.documentElement.hasAttribute('ytmd-playing');
    const target = playing ? CASE_SPIN : 0;
    // Ease from a flick (or a stop) back to the steady turning speed.
    spin.speed += (target - spin.speed) * Math.min(1, dt * 2.2);
    spin.y += spin.speed * dt;
    spin.x += (10 - spin.x) * Math.min(1, dt * 1.5);
  }
  spin.box.style.transform = `rotateX(${spin.x.toFixed(2)}deg) rotateY(${spin.y.toFixed(2)}deg)`;
  spin.frame = requestAnimationFrame(turnCase);
}

function syncCase() {
  const root = document.documentElement;
  const player = document.querySelector('ytmusic-player');
  const advert = advertShowing();
  root.toggleAttribute('ytmd-ad', advert);

  const wanted =
    getComputedStyle(root).getPropertyValue('--app-case3d').trim() === '1' &&
    player &&
    player.getAttribute('player-ui-state') === 'MINIPLAYER' &&
    player.getAttribute('playback-mode') === 'ATV_PREFERRED' &&
    !advert;

  if (!wanted) {
    if (spin.el && !spin.el.hidden) spin.el.hidden = true;
    root.removeAttribute('ytmd-case-on');
    return;
  }

  const host = spin.el || buildCase();
  if (!host.isConnected) document.body.append(host);
  const src = currentArt();
  for (const img of host.querySelectorAll('img')) {
    if (src && img.src !== src) img.src = src;
  }
  const title = document.querySelector('ytmusic-player-bar .title');
  const byline = document.querySelector('ytmusic-player-bar .byline');
  const titleText = title ? title.textContent.trim() : '';
  const bylineText = byline ? byline.textContent.trim() : '';
  const b = host.querySelector('.back b');
  const span = host.querySelector('.back span');
  if (b.textContent !== titleText) b.textContent = titleText;
  if (span.textContent !== bylineText) span.textContent = bylineText;

  if (host.hidden) host.hidden = false;
  root.setAttribute('ytmd-case-on', '');
  if (!spin.frame) {
    spin.last = 0;
    spin.frame = requestAnimationFrame(turnCase);
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

  // Media events do not bubble, so listen during the capture phase.
  for (const type of ['play', 'playing', 'pause', 'ended', 'emptied']) {
    document.addEventListener(type, markPlaying, true);
  }
  window.addEventListener('scroll', markScroll, { passive: true });
  markScroll();
  setInterval(() => {
    try {
      markPlaying();
      checkVideoPicture();
    } catch {
      /* ignore */
    }
  }, 1000);
  setInterval(() => {
    try {
      syncCase();
    } catch {
      /* ignore */
    }
  }, 400);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
