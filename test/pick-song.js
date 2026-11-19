// Starts something to play for the tests. Prefers a song ("plays") row from
// the home page; if there is none, opens a known album and plays a track there
// (signed out, YouTube may play the music-video version of it).
module.exports = async function playSong(ytm, until, sleep) {
  const fromHome = await ytm.evaluate(() => {
    const rows = [...document.querySelectorAll('ytmusic-browse-response ytmusic-responsive-list-item-renderer')];
    const song = rows.find((r) => / plays/.test(r.textContent) && r.querySelector('ytmusic-play-button-renderer'));
    if (!song) return false;
    song.querySelector('ytmusic-play-button-renderer').click();
    return true;
  });
  if (fromHome) return;
  await ytm.evaluate(() => { location.href = 'https://music.youtube.com/browse/MPREb_QC0L98k1tGe'; }).catch(() => {});
  const albumRow = 'ytmusic-browse-response ytmusic-responsive-list-item-renderer ytmusic-play-button-renderer';
  await until(
    () =>
      ytm.evaluate(
        (sel) => /OLAK5uy_|MPRE/.test(location.href) && document.querySelectorAll(sel).length > 2,
        albumRow,
      ),
    45000,
  );
  await sleep(1500);
  await ytm.evaluate((sel) => document.querySelectorAll(sel)[2].click(), albumRow);
};

// Makes sure what plays is a real song (album picture, not a video picture):
// presses YouTube's own Song switch, and if the track only exists as a video,
// skips ahead until a song comes up.
module.exports.preferSong = async function preferSong(ytm, until) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isSong = () =>
    ytm.evaluate(() => {
      const p = document.querySelector('ytmusic-player');
      const img = p && p.querySelector('#song-image');
      const ad = document.querySelector('ytmusic-player .ad-showing');
      return Boolean(!ad && p.getAttribute('playback-mode') === 'ATV_PREFERRED' && img && img.getClientRects().length);
    });
  for (let attempt = 0; attempt < 8; attempt++) {
    await ytm.evaluate(() => {
      const skip = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button');
      if (skip && skip.offsetParent) skip.click();
      const button = document.querySelector('ytmusic-av-toggle .song-button[aria-pressed="false"]');
      if (button) button.click();
    });
    if (await until(isSong, 6000)) return true;
    if (await ytm.evaluate(() => Boolean(document.querySelector('ytmusic-player .ad-showing')))) continue;
    await ytm.evaluate(() => {
      const next = document.querySelector('ytmusic-player-bar .next-button');
      (next.querySelector('button') || next).click();
    });
    await sleep(3000);
  }
  // Signed out, YouTube sometimes only offers videos. Lay the player out the way
  // it is for a song (album picture shown, video area hidden) so the song-only
  // features can still be checked, and say so in the results.
  await ytm.evaluate(() => {
    const p = document.querySelector('ytmusic-player');
    const style = document.createElement('style');
    style.id = 'ytmd-test-song-layout';
    style.textContent = 'ytmusic-player #song-video{display:none !important} ytmusic-player #song-image{display:block !important}';
    document.head.append(style);
    const img = p.querySelector('#song-image img');
    const thumb = document.querySelector('ytmusic-player-bar .thumbnail-image-wrapper img');
    if (img && thumb && !img.src) img.src = thumb.src;
  });
  return 'simulated';
};
