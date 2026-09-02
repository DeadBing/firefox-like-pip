# Picture-in-Picture for Chrome

A Chrome extension that brings Firefox’s Picture-in-Picture player to Chromium: a hover toggle on videos, a floating always-on-top window, and the extra controls Firefox users actually use.

Chrome’s built-in video PiP only offers play/pause. This extension opens a [Document Picture-in-Picture](https://developer.chrome.com/docs/web-platform/document-picture-in-picture) window and rebuilds the Firefox player around a live clone of the page video.

## Firefox behavior that is implemented

- Hover toggle on eligible videos (45+ seconds, at least 140×140, unless you choose “always show”)
- Click on the toggle does not leak through to the page
- Toolbar button and right-click **Watch in Picture-in-Picture**
- Page shortcut **Ctrl+Shift+]** (macOS **⌘⇧⌥]**) plus Chrome’s assignable **Ctrl+Shift+9**
- Play / pause, ±5 s seek, mute, volume slider, scrubber, timestamp
- Captions and subtitles (WebVTT plus on-page caption nodes such as YouTube)
- Caption size (small / medium / large)
- Playback speed (0.5×–2×)
- Fullscreen via **F** or double-click (Document PiP cannot use the Fullscreen API, so the window is resized to the work area)
- Close pauses by default; **Shift+click** close or **Shift+Esc** leaves the video playing
- **Ctrl+W** closes the player
- **Back to tab** returns focus to the original page
- Placeholder overlay on the original video
- Auto-PiP when switching tabs (Media Session `enterpictureinpicture`, same idea as Firefox’s tab-switch setting)
- Options page that maps to the Firefox prefs

## Keyboard map (player)

| Key | Action |
| --- | --- |
| Space | Play / pause |
| ← / → | Seek 5 seconds |
| Ctrl+← / Ctrl+→ | Seek 10% |
| ↑ / ↓ | Volume |
| Ctrl+↑ / Ctrl+↓ | Unmute / mute |
| Home / End | Start / end |
| F or double-click | Fullscreen |
| Ctrl+W | Close and pause |
| Shift+Esc or Shift+click close | Close without pausing |

## Chrome limits you cannot paper over

- Chromium allows **one** Document Picture-in-Picture window at a time. Firefox can keep several.
- Encrypted / DRM videos (some Netflix streams, etc.) cannot be cloned with `captureStream()`. The extension falls back to Chrome’s native video PiP.
- Iframe embeds (Alloha-style players, many “запасной плеер” hosts) clone the video through a same-tab WebRTC bridge. The top frame must send the WebRTC answer *before* waiting for `ontrack`, or Chrome never delivers the track and the empty (white) Document PiP window closes. If the site’s file is cross-origin without CORS, `captureStream()` can still be a black frame; native video PiP is only a last resort because embed players often exit it immediately.
- Document PiP windows cannot enter OS fullscreen; the fullscreen control maximizes the floating window instead.
- Chrome always draws a title bar (site origin) on Document PiP windows. The player sizes the *viewport* to the video, so that bar sits outside the picture instead of covering it. Native video PiP can hide that chrome; Document PiP cannot.
- Chrome may clamp a window to a minimum size, and `resizeTo` only works with a user gesture. Portrait and ultrawide clips request a matching rectangle. If Chrome still refuses the size, the video letterboxes rather than being cropped.

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this repository root
4. Optional: set the shortcut at `chrome://extensions/shortcuts`

## Settings

Open the extension’s options page from `chrome://extensions`. Defaults match Firefox: the toggle is on, short/tiny videos stay hidden, websites that set `disablePictureInPicture` are respected, and closing the player pauses the video.

## Development

```bash
npm test
npm run build
python3 scripts/generate-icons.py
```

Content scripts are shipped as the generated classic file `content/injected.js`. Chrome often injects static content scripts as classic scripts, so `import` in `content/content.js` would throw `Cannot use import statement outside a module`. Rebuild the bundle after editing the ESM sources.

The `demo/index.html` page is a local fixture with a captioned sample video.

## License

Source in this repository is original. The player layout and shortcut map follow Firefox’s documented Picture-in-Picture behavior.
