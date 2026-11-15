# YTM Desktop

A personal desktop window for YouTube Music on Windows. It opens the real
`music.youtube.com` page — you sign in with your own Google account there — and
puts a custom layout and your own colors on top of it.

It does not download or copy audio and does not block adverts.

## Start it

Double-click **YTM Desktop** on the desktop (or find it in the Start menu).

The program itself lives in `dist\win-unpacked\YTM Desktop.exe`.

## What is where

- **Top bar**: back / forward / reload / home, the colors button (sun-shaped
  icon), then minimize, maximize and close.
- **Left**: Home, Explore, Library and your playlists.
- **Bottom bar**: track art, title and artist on the left; previous, play/pause,
  next and the seek bar in the middle; the **Album** button and volume on the
  right.
- **Album button**: opens the full album of the song that is playing. It is
  greyed out when the track has no album.
- Keyboard media keys (play/pause, next, previous) work while music is loaded.

## Change the colors

Click the colors button in the top bar. Pick a preset, or click the round
swatches next to Accent, Background and Text to choose your own. Changes show
immediately and are remembered. **Reset to default** undoes everything.

## For rebuilding (only needed after changing the code)

Node.js is bundled in `.tools\node` (not installed system-wide). From this folder:

```
.tools\node\npm.cmd start        run from source
.tools\node\npm.cmd test         launch the app and click through every control
.tools\node\npm.cmd run build    rebuild dist\win-unpacked
```

Code layout: `src/main.js` (window, settings, saving), `src/shell.*` (top bar and
colors panel), `src/ytm-style.css` (layout and colors applied to the page),
`src/ytm-preload.js` (the Album button), `src/theme.js` (presets).
