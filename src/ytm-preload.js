// Runs inside the YouTube Music page. Its only job is the "View full album"
// button in the player bar: it finds the album link YouTube Music already
// shows for the current track and opens it when the button is clicked.

const { ipcRenderer } = require('electron');

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

// Music videos have no album link, but when one was started from an album the
// page address names that album's playlist ("list=OLAK5uy_..."). Remember it so
// the button can still open the album after browsing elsewhere.
let albumListId = '';
function rememberAlbumList() {
  if (location.pathname !== '/watch') return;
  const list = new URL(location.href).searchParams.get('list') || '';
  albumListId = /^OLAK5uy_[\w-]+$/.test(list) ? list : '';
}

// What the album button opens: the album link, else the remembered album playlist.
function albumTarget() {
  const link = albumLink();
  if (link) return { name: link.textContent.trim(), open: () => link.click() };
  if (!albumListId || !hasTrack()) return null;
  const id = albumListId;
  return {
    name: '',
    // The page's own navigation, so the music keeps playing.
    open: () =>
      document.querySelector('ytmusic-app').dispatchEvent(
        new CustomEvent('yt-navigate', {
          bubbles: true,
          composed: true,
          detail: { endpoint: { browseEndpoint: { browseId: `VL${id}` } } },
        }),
      ),
  };
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
    const target = albumTarget();
    if (target) target.open();
  });
  return button;
}

function sync() {
  const bar = document.querySelector('ytmusic-player-bar');
  if (!bar) return;
  // At some widths the page keeps two copies of the title block and hides one;
  // the button goes right after whichever one is showing.
  // (At those widths there can even be two player bars, so search them all.)
  const blocks = [...document.querySelectorAll('ytmusic-player-bar .content-info-wrapper')];
  const info = blocks.find((block) => block.getBoundingClientRect().width > 0) || blocks[0];
  if (!info) return;

  let button = document.getElementById(BUTTON_ID);
  if (!button) button = buildButton();
  if (info.nextElementSibling !== button) info.after(button);

  rememberAlbumList();
  const target = albumTarget();
  const disabled = !target;
  if (button.disabled !== disabled) button.disabled = disabled;
  const tip = target
    ? target.name
      ? `View full album: ${target.name}`
      : 'View full album'
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

function videoAreaShown() {
  const area = document.querySelector('ytmusic-player #song-video');
  return Boolean(area && area.getClientRects().length);
}

// Settings sent by the app (see main.js): currently only the 3D case switch.
const options = { case3d: false };
ipcRenderer.on('ytmd-options', (_event, next) => {
  Object.assign(options, next || {});
});

function syncCase() {
  const root = document.documentElement;
  const player = document.querySelector('ytmusic-player');
  const advert = advertShowing();
  const videoShown = videoAreaShown();
  // Adverts and music videos keep the plain rectangle (a wide video cropped
  // into a circle becomes a squashed oval).
  root.toggleAttribute('ytmd-ad', advert || videoShown);

  const wanted =
    options.case3d &&
    player &&
    player.getAttribute('player-ui-state') === 'MINIPLAYER' &&
    player.getAttribute('playback-mode') === 'ATV_PREFERRED' &&
    !advert &&
    !videoShown;

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

  // Sit exactly where the page puts its small player, so the case follows it
  // when the window or the Colors panel changes the space available.
  const spot = player.getBoundingClientRect();
  if (spot.width > 40 && spot.height > 40) {
    const size = 200;
    const left = Math.round(Math.max(8, Math.min(innerWidth - size - 8, spot.left + spot.width / 2 - size / 2)));
    const top = Math.round(Math.max(72, Math.min(innerHeight - size - 8, spot.top + spot.height / 2 - size / 2)));
    if (host.style.left !== `${left}px`) host.style.left = `${left}px`;
    if (host.style.top !== `${top}px`) host.style.top = `${top}px`;
    host.style.right = 'auto';
    host.style.bottom = 'auto';
  }
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

// ---------- synced lyrics in the Lyrics tab ----------
//
// When the Lyrics tab is open and timed lyrics exist for the song, they are
// shown line by line: the line being sung is lit in the accent color, the view
// keeps it centred, and clicking a line jumps the song there. Without timed
// lyrics, YouTube Music's own lyrics are left as they are.

const LYRICS_ID = 'ytmd-lyrics';
const lyricState = {
  key: '',
  lines: [],
  status: 'idle', // idle | loading | ready | none | error
  plainFromSite: false,
  el: null,
  list: null,
  current: -2,
  frame: 0,
  manualUntil: 0,
  manualShift: 0,
};

function currentTrack() {
  const media = document.querySelector('video');
  const meta = navigator.mediaSession && navigator.mediaSession.metadata;
  if (!media || !meta || !meta.title || advertShowing()) return null;
  const duration = Number.isFinite(media.duration) ? media.duration : 0;
  if (!duration) return null;
  return { title: meta.title, artist: meta.artist || '', album: meta.album || '', duration };
}

function lyricsTab() {
  const tab = document.querySelector('ytmusic-player-page ytmusic-tab-renderer[page-type="MUSIC_PAGE_TYPE_TRACK_LYRICS"]');
  return tab && tab.getClientRects().length ? tab : null;
}

function buildLyrics() {
  const host = document.createElement('div');
  host.id = LYRICS_ID;
  const list = document.createElement('div');
  list.className = 'lines';
  const credit = document.createElement('div');
  credit.className = 'credit';
  credit.textContent = 'Synced lyrics from LRCLIB';
  const viewport = document.createElement('div');
  viewport.className = 'viewport';
  viewport.append(list);
  host.append(viewport, credit);

  list.addEventListener('click', (event) => {
    const line = event.target.closest('.line');
    const media = document.querySelector('video');
    if (!line || !media) return;
    const time = Number(line.dataset.time);
    if (Number.isFinite(time)) {
      media.currentTime = Math.max(0, time - 0.05);
      lyricState.manualUntil = 0;
      lyricState.manualShift = 0;
    }
  });
  // Scrolling with the mouse looks around; following resumes a few seconds later.
  host.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      lyricState.manualShift -= event.deltaY;
      lyricState.manualUntil = Date.now() + 3500;
      placeLines(true);
    },
    { passive: false },
  );
  lyricState.el = host;
  lyricState.list = list;
  return host;
}

function fillLines() {
  const list = lyricState.list;
  list.textContent = '';
  lyricState.lines.forEach((line, index) => {
    const row = document.createElement('div');
    row.className = 'line';
    row.dataset.time = String(line.time);
    row.dataset.index = String(index);
    if (line.text) {
      row.textContent = line.text;
    } else {
      // A gap in the singing: three soft dots.
      row.classList.add('pause');
      row.textContent = '• • •';
    }
    list.append(row);
  });
  lyricState.current = -2;
}

function lineAt(time) {
  const lines = lyricState.lines;
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function placeLines(instant) {
  const { el, list, current } = lyricState;
  if (!el || !list) return;
  const row = list.children[Math.max(0, current)];
  const centre = el.clientHeight * 0.42;
  const target = row ? row.offsetTop + row.offsetHeight / 2 : 0;
  const follow = Date.now() > lyricState.manualUntil;
  if (follow) lyricState.manualShift = 0;
  list.style.transition = instant ? 'none' : '';
  list.style.transform = `translateY(${Math.round(centre - target + lyricState.manualShift)}px)`;
}

function tickLyrics() {
  lyricState.frame = 0;
  const tab = lyricsTab();
  const media = document.querySelector('video');
  if (!tab || !media || document.hidden || lyricState.status !== 'ready' || !lyricState.el || !lyricState.el.isConnected) return;
  // A touch early, so the line lights up as it starts being sung.
  const index = lineAt(media.currentTime + 0.25);
  if (index !== lyricState.current) {
    const rows = lyricState.list.children;
    for (let i = 0; i < rows.length; i++) {
      rows[i].classList.toggle('now', i === index);
      rows[i].classList.toggle('past', i < index);
    }
    lyricState.current = index;
    placeLines(false);
  } else if (Date.now() > lyricState.manualUntil && lyricState.manualShift) {
    placeLines(false);
  }
  lyricState.frame = requestAnimationFrame(tickLyrics);
}

async function loadLyrics(track) {
  const key = `${track.title}\n${track.artist}\n${Math.round(track.duration)}`;
  if (key === lyricState.key) return;
  lyricState.key = key;
  lyricState.status = 'loading';
  lyricState.lines = [];
  let result = null;
  try {
    result = await ipcRenderer.invoke('lyrics:get', track);
  } catch {
    result = null;
  }
  if (key !== lyricState.key) return; // the song changed while waiting
  if (result && Array.isArray(result.synced) && result.synced.length > 2) {
    lyricState.lines = result.synced;
    lyricState.status = 'ready';
    if (lyricState.list) fillLines();
  } else {
    lyricState.status = result && result.error ? 'error' : 'none';
  }
}

function syncLyrics() {
  const track = currentTrack();
  if (track) loadLyrics(track);

  const tab = lyricsTab();
  const show = Boolean(tab && lyricState.status === 'ready');
  if (tab) tab.toggleAttribute('ytmd-synced', show);
  if (!show) {
    if (lyricState.el && lyricState.el.isConnected) lyricState.el.remove();
    return;
  }
  const host = lyricState.el || buildLyrics();
  if (host.parentElement !== tab) {
    tab.prepend(host);
    fillLines();
  } else if (lyricState.list.children.length !== lyricState.lines.length) {
    fillLines();
  }
  if (!lyricState.frame) lyricState.frame = requestAnimationFrame(tickLyrics);
}

function start() {
  if (location.hostname !== 'music.youtube.com') return;
  // Watch only the player bar (title, artist and album links live there); the
  // rest of the page changes constantly and is not needed.
  const watchBar = () => {
    const bar = document.querySelector('ytmusic-player-bar');
    if (!bar) return false;
    new MutationObserver(scheduleSync).observe(bar, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['href'],
    });
    return true;
  };
  if (!watchBar()) {
    const waitForBar = setInterval(() => {
      if (watchBar()) clearInterval(waitForBar);
    }, 500);
  }
  // Safety net, and the page address (for album playlists) is not in the bar.
  setInterval(() => {
    if (document.hidden) return;
    try {
      sync();
    } catch {
      /* ignore */
    }
  }, 2000);
  scheduleSync();

  // In glass mode the page scrolls inside the main panel; a newly opened page
  // starts at its top, as it does when the whole window scrolls.
  window.addEventListener('yt-navigate-finish', () => {
    const panel = document.querySelector('ytmusic-app-layout > #content');
    if (panel && panel.scrollTop) panel.scrollTop = 0;
  });

  // Synced lyrics: checked twice a second (cheap), animated only while the Lyrics tab is open.
  setInterval(() => {
    if (document.hidden) return;
    try {
      syncLyrics();
    } catch {
      /* ignore */
    }
  }, 500);

  // Media events do not bubble, so listen during the capture phase.
  for (const type of ['play', 'playing', 'pause', 'ended', 'emptied']) {
    document.addEventListener(type, markPlaying, true);
  }
  setInterval(() => {
    if (document.hidden) return;
    try {
      markPlaying();
      checkVideoPicture();
    } catch {
      /* ignore */
    }
  }, 1000);
  setInterval(() => {
    // Nothing to do unless the 3D case is switched on (or still showing).
    if (document.hidden || (!options.case3d && !(spin.el && !spin.el.hidden))) {
      if (!options.case3d) document.documentElement.toggleAttribute('ytmd-ad', advertShowing() || videoAreaShown());
      return;
    }
    try {
      syncCase();
    } catch {
      /* ignore */
    }
  }, 500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
