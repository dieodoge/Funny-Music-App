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
  const thumb = document.querySelector('ytmusic-player-bar .thumbnail-image-wrapper img');
  const src = thumb && thumb.src ? thumb.src.replace(/=w\d+-h\d+/, '=w544-h544') : '';
  if (!src) return;
  player.style.setProperty('--ytmd-art', `url("${src.replace(/["\\\n]/g, '')}")`);
  if (!player.hasAttribute('ytmd-no-video')) player.setAttribute('ytmd-no-video', '');
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
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
