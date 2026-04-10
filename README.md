# Media Controller 🔊⚡

Hey there! This is a simple browser extension I put together to give you more control over your browser's audio and video. If you've ever felt like a video was too quiet even at 100%, or if you wanted to fly through a long lecture without clicking menus, this is for you.

## Why this exists

I was tired of browser limitations, so I built this to do a few specific things:

- **Volume Boost (Up to 500%)**: Sometimes 100% just isn't enough. This uses the Web Audio API to crank things up to 5x the normal volume. Great for quiet laptop speakers!
- **Insane Speed Control**: You can go anywhere from 0.25x (super slow) to 16x (super fast). It's a smooth slider, so you aren't stuck with just the standard presets.
- **Per-Tab Customization**: The best part? Each tab is independent. You can boost a video in one tab while keeping music at a normal level in another.
- **On-Video Controls**: Instead of clicking the extension icon every time, a small badge appears right on the video player. You can tweak everything from there.
- **It’s Light & Dark**: If you prefer dark mode, it looks great. If you're a fan of light mode, there's a toggle for that too.

## Downloads

| Browser | Link |
| :--- | :--- |
| <img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/chrome/chrome_16x16.png" width="16" height="16" /> **Chrome / Edge** | [Install from Chrome Web Store](https://chrome.google.com/webstore/detail/...) |
| <img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/firefox/firefox_16x16.png" width="16" height="16" /> **Firefox** | [Install from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/media-controller_ets/) |

## Getting Started (Local Development)

1. Download or clone this folder.
2. Open Chrome (or any Chromium browser like Edge/Brave) and go to `chrome://extensions/`.
3. Flip the **Developer mode** switch in the top right.
4. Click **Load unpacked** and pick this folder.
5. For Firefox (dev mode): open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on...**, then select `manifest.json`.
6. That’s it! Pin the extension to your toolbar for easy access.

## How to use it

**The Quick Way (Overlay):**
Hover over any video, and you'll see a tiny badge in the corner. Click it, and you'll get a mini-panel to change speed or volume on the fly without leaving the page.

**The Full Way (Popup):**
Click the extension icon in your toolbar to see the full dashboard. You'll find sliders and some "Reset" buttons if you want to get back to normal quickly.
