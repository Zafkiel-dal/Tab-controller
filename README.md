# Media Controller

A Chrome extension for controlling volume and playback speed on a per-tab basis. Useful when you want to boost audio beyond what the browser normally allows, or speed through long videos without digging into site-specific settings.

## What it does

- **Volume boost up to 500%** — Goes way past the default limit using the Web Audio API.
- **Speed control from 0.1x to 16x** — Fine-grained slider, not just the usual 0.5x/1x/2x presets.
- **Per-tab settings** — Each tab keeps its own volume and speed. Changing one tab won't affect another.
- **On-video overlay** — A small floating badge appears on the corner of video players. Click it to adjust speed and volume right there, without opening the extension popup.
- **Light and dark theme** — Toggle from the popup header. Preference is saved.
- **Cleans up after itself** — When you close a tab, its stored settings are removed automatically.

## Installation

1. Open a Chromium-based browser (Chrome, Edge, Brave, etc.).
2. Go to `chrome://extensions/`.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select this folder.
5. Done. The extension icon should appear in your toolbar.

## How to use

**From the popup:**
Click the extension icon on any tab that has audio or video. You'll get sliders for volume and speed, plus a few preset buttons.

**From the video overlay:**
When you hover over a video, a small badge shows the current speed and volume in the top-left corner. Click it to expand a mini control panel with sliders and quick-access buttons — no need to open the popup at all.

**Theme switching:**
There's a toggle button at the top of the popup to switch between dark and light mode.


