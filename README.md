# Media Controller 

This is a simple browser extension I put together to give you more control over your browser's audio and video. If you've ever felt like a video was too quiet even at 100%, or if you wanted to fly through a long lecture without clicking menus, this is for you.

## Downloads

| Browser | Link |
| :--- | :--- |
| <img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/chromium/chromium_16x16.png" width="16" height="16" /><br>**Chrome / Edge / Brave / Chromium based** | [Install from Chrome Web Store](https://chromewebstore.google.com/detail/volume-booster-video-spee/mimbgeljdhgcmenoplikfeeicimfjjai) |
| <img src="https://raw.githubusercontent.com/alrra/browser-logos/main/src/firefox/firefox_16x16.png" width="16" height="16" /><br>**Firefox** | [Install from Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/media-controller_ets/) |


## Why this exists

I was tired of browser limitations, so I built this to do a few specific things:

- **Volume Boost (Up to 500%)**: Sometimes 100% just isn't enough. This uses the Web Audio API to crank things up to 5x the normal volume. Great for quiet laptop speakers!
- **Insane Speed Control**: You can go anywhere from 0.25x (super slow) to 16x (super fast). It's a smooth slider, so you aren't stuck with just the standard presets.
- **Per-Tab Customization**: The best part? Each tab is independent. You can boost a video in one tab while keeping music at a normal level in another.
- **On-Video Controls**: Instead of clicking the extension icon every time, a small badge appears right on the video player. You can tweak speed, volume, and opacity from there, and even drag it anywhere on the screen.
- **Smart Preset System**: Don't want to adjust settings every time? Save your settings to a specific **Tab**, an entire **Domain** (e.g., all of YouTube), or **Globally** across the internet.
- **It’s Light & Dark**: If you prefer dark mode, it looks great. If you're a fan of light mode, there's a toggle for that too.

## Detailed User Manual

### 1. The Video Overlay (Quick Controls)
Whenever you watch a video, a tiny controller badge will appear in the top-left corner of the video player.

- **Speed (e.g., 1.00x)**: Hover over the speed text to reveal a slider. You can dial it anywhere from 0.25x to 16x. You also have quick buttons for 1.5x, 2.0x, etc.
- **Volume (e.g., 100%)**: Hover over the volume text to reveal a slider. This goes up to 500% to boost quiet audio!
- **Reset**: Click this immediately reset the video speed to 1.0x and volume to 100%.
- **Save Mode**: Lock your settings so they stick (explained below in *Preset Memory System*).
- **Opacity Eye**: Makes the badge more transparent so it doesn't distract you while watching.
- **Drag & Drop**: Click and hold any empty space on the badge to drag it around the screen. If the video player shrinks, the badge is smart enough to slide back into bounds!

### 2. The Full Dashboard (Popup)
Click the extension icon in your toolbar to see the full dashboard. You'll find sliders, a theme toggle, and the central hub for managing your saved Presets.

### 3. The Preset Memory System (How to lock your settings)
By default, changed speeds and volumes are **temporary**. If you open a new video or refresh the page, they reset back to 1.0x / 100%.

If you want your settings to stick, you need to save them using the **Save Mode** menu on the video overlay or within the extension popup.

**The 3 Save Modes:**
1. **[T] Tab Mode**: Locks the speed/volume for **this specific browser tab**. No matter what URL you visit within this tab, the settings will remain locked.
2. **[D] Domain Mode**: Locks the settings for **the entire website** (e.g., all of `youtube.com`). Whenever you open a video on this site, it will automatically apply your saved speed/volume. 
3. **[G] Global Mode**: Locks the settings across the **entire internet**. Every video on every website will inherit these settings.

**Reset to Default (Clear)**
If you click **[✕]** on the overlay or **"Reset to Default"** in the popup, you will clear all saved presets. This returns the extension to **Default Tracking Mode**.

### 4. How "Default Mode" actually works (Advanced)
If you don't save your settings (meaning you are in "Default Mode"), the extension uses an intelligent system to decide when to reset the video back to 1.0x / 100%.

- **Scenario A: YouTube, Netflix, Courses**: If you open a new video link or the website autoloads the next video in a playlist, the extension detects the clip change and **resets the speed back to 1.0x**. This prevents loud, fast audio from suddenly blasting your ears on a new video.
- **Scenario B: Facebook, Reddit, X (Endless Scrolling)**: When you scroll through a social media feed, videos are dynamically loaded into the background. In Default Mode, your temporary speed setting (e.g., 1.5x) will naturally "bleed" onto nearby clips as you scroll! This acts as a comfortable mini-feature, letting you watch an entire session of scrolling memes at 1.5x without having to explicitly lock the Tab. *(If you want to absolutely guarantee a strict speed across your entire scrolling session, use the **[T] Tab** lock).*

### 5. YouTube Synchronization
The extension is deeply integrated with YouTube. If you use YouTube's native gear icon or keyboard shortcuts (`Shift + .`) to change the video speed, the extension will instantly sync and adopt YouTube's speed, ensuring everything stays perfectly aligned without fighting each other!

