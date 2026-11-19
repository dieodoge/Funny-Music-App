// Looks up time-synced lyrics on LRCLIB (https://lrclib.net), a free public
// lyrics database. Only the song's title, artist, album and length are sent.
const { net } = require('electron');

const API = 'https://lrclib.net/api';
// LRCLIB asks apps to name themselves; no personal details are included.
const HEADERS = { 'User-Agent': 'YTM Desktop (personal music player)' };
const cache = new Map();

const text = (value, max = 300) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

// "Song (Official Video) [4K] ft. Someone" -> "Song"
function cleanTitle(title) {
  return title
    .replace(/\s*[([][^)\]]*(official|video|audio|lyric|visualizer|remaster|live|hd|4k|mv)[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([]\s*(feat|ft)\.?[^)\]]*[)\]]/gi, '')
    .replace(/\s+(feat|ft)\.?\s.*$/i, '')
    .trim();
}

// "Artist & Other, Third" -> "Artist"
const firstArtist = (artist) => artist.split(/\s*(?:,|&|\sx\s|\sand\s|feat\.?|ft\.?)\s*/i)[0].trim();

// "[01:02.34] words" -> [{ time: 62.34, text: 'words' }], sorted by time.
function parseLrc(lrc) {
  const lines = [];
  for (const raw of String(lrc || '').split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2}(?:[.:]\d{1,3})?)\]/g)];
    if (!stamps.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const [, min, sec] of stamps) {
      lines.push({ time: Number(min) * 60 + Number(sec.replace(':', '.')), text: words });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

async function getJson(url) {
  const response = await net.fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(9000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`LRCLIB answered ${response.status}`);
  return response.json();
}

function toResult(record) {
  if (!record) return null;
  const synced = parseLrc(record.syncedLyrics);
  return {
    synced,
    plain: typeof record.plainLyrics === 'string' ? record.plainLyrics : '',
    instrumental: Boolean(record.instrumental),
  };
}

async function lookUp(query) {
  const title = text(query.title);
  const artist = text(query.artist);
  const album = text(query.album);
  const duration = Number.isFinite(query.duration) ? Math.round(query.duration) : 0;
  if (!title || !artist) return null;

  const key = `${title}\n${artist}\n${duration}`.toLowerCase();
  if (cache.has(key)) return cache.get(key);

  let found = null;
  // 1. Exact match: title, artist, album and length.
  if (duration) {
    const params = new URLSearchParams({ track_name: title, artist_name: artist, duration: String(duration) });
    if (album) params.set('album_name', album);
    found = toResult(await getJson(`${API}/get?${params}`));
  }
  // 2. Search with a cleaned-up title and the main artist, keeping only
  //    versions whose length matches the one playing.
  if (!found || (!found.synced.length && !found.instrumental)) {
    const params = new URLSearchParams({ track_name: cleanTitle(title), artist_name: firstArtist(artist) });
    const results = (await getJson(`${API}/search?${params}`)) || [];
    const close = results
      .filter((r) => r && r.syncedLyrics && (!duration || Math.abs((r.duration || 0) - duration) <= 4))
      .sort((a, b) => Math.abs((a.duration || 0) - duration) - Math.abs((b.duration || 0) - duration));
    if (close.length) found = toResult(close[0]);
  }

  const result = found || { synced: [], plain: '', instrumental: false };
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  cache.set(key, result);
  return result;
}

module.exports = { lookUp, parseLrc, cleanTitle };
