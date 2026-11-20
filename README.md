# YTM Desktop

An unofficial personal desktop window for YouTube Music on Windows (not affiliated with Google or YouTube). It opens the real
`music.youtube.com` page — you sign in with your own Google account there — and
puts a custom layout and your own colors on top of it.

It does not download or copy audio and does not block adverts.

## Download (Windows)

1. Open the [latest release](https://github.com/dieodoge/Funny-Music-App/releases/latest).
2. Under **Assets**, download the `YTM-Desktop-Setup` `.exe` file and open it. It installs in a
   few seconds and adds a **YTM Desktop** shortcut to the desktop and the Start menu.
3. Windows may say "Windows protected your PC", because the app is not signed with a paid
   certificate. Click **More info**, then **Run anyway**.
4. In the app, click **Sign in** and sign in with your own Google account.

Each person's sign-in, colors and settings stay on their own PC. To remove the app, use
Windows Settings > Apps > Installed apps > YTM Desktop > Uninstall.

## Start it

Double-click **YTM Desktop** on the desktop (or find it in the Start menu).

## What is where

- **Top bar**: back / forward / reload / home, the colors button (sun-shaped
  icon), then minimize, maximize and close.
- **Left**: Home, Explore, Library and your playlists.
- **Bottom bar**: track art, title and artist on the left with the **Album**
  button beside them; previous, play/pause, next and the seek bar in the middle;
  volume and extras on the right.
- **Album button**: opens the full album of the song that is playing. It is
  greyed out when the track has no album.
- Keyboard media keys (play/pause, next, previous) work while music is loaded.

## Change the colors

Click the colors button in the top bar. Pick a preset, or click the round
swatches next to Accent, Background and Text to choose your own. Changes show
immediately and are remembered. **Reset to default** undoes everything.

## Extras

In the colors panel, under **Style**:

- **Glass background**: a glossy, see-through look. Your desktop shows blurred
  behind the app and the panels become tinted glass. Switches instantly.
- **3D album case**: the small album picture at the bottom right (shown while
  you browse during a song) becomes a CD case. It turns by itself while music
  plays; drag it to turn or tilt it; click it to open the full player.

Always on:

- **Synced lyrics**: open the Lyrics tab on the now-playing page. When timed
  lyrics exist on LRCLIB (https://lrclib.net), the line being sung lights up in
  your accent colour and the view follows the song; click a line to jump there,
  scroll to look around. Only the song title, artist, album and length are sent
  to LRCLIB. Songs it does not have keep YouTube Music's normal lyrics.
- **Spinning album disc**: with the 3D case off, the small album picture is a
  round disc that spins while music plays and stops when paused.
- **Adverts stay rectangular**: during an advert the small picture is a plain
  rectangle, not a disc or case.
- **Album art instead of a blank video**: if the player is in video mode and no
  picture arrives within a few seconds, the album art is shown there.

## Signing in

Google refuses sign-in from apps built like this one. To get past that, the app
asks for Google's sign-in page (accounts.google.com only) the way Firefox would.
You type your own email and password on Google's real page. If Google changes
its checks this may stop working.

## Sharing with friends

Send them the link to the [latest release](https://github.com/dieodoge/Funny-Music-App/releases/latest)
and the steps under **Download** above.

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

## License

MIT; see [LICENSE](LICENSE).
