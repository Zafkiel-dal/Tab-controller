// Ensure we don't inject multiple times per frame
if (typeof window.__mediaControllerInjected === 'undefined') {
    window.__mediaControllerInjected = true;

    // We store references to avoid garbage collection and re-creating nodes
    const state = {
        audioContext: null,
        gainNode: null,
        mediaSources: new WeakMap(),
        currentVolume: 1.0,
        currentSpeed: 1.0,
        overlays: new WeakMap()
    };

    function initAudio() {
        if (!state.audioContext) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return false;

            state.audioContext = new AudioCtx();
            state.gainNode = state.audioContext.createGain();
            state.gainNode.gain.value = state.currentVolume;
            state.gainNode.connect(state.audioContext.destination);
        }
        return true;
    }

    // Resume AudioContext if browser suspended it (autoplay policy)
    // This must be called from a user-gesture context or periodically
    function resumeAudioContext() {
        if (state.audioContext && state.audioContext.state === 'suspended') {
            state.audioContext.resume().catch(() => { });
        }
    }

    // Listen for any user interaction to resume a suspended context
    const interactionEvents = ['click', 'keydown', 'touchstart', 'pointerdown'];
    interactionEvents.forEach(evt => {
        document.addEventListener(evt, resumeAudioContext, { passive: true, capture: true });
    });

    // ── Overlay Widget ──────────────────────────────────────────────────
    function buildOverlayStyles() {
        return `
            :host {
                all: initial;
                position: absolute;
                z-index: 2147483647;
                font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
                pointer-events: auto;
            }

            .mc-badge {
                position: absolute;
                top: 8px;
                left: 8px;
                display: flex;
                align-items: center;
                gap: 6px;
                background: rgba(15, 15, 20, 0.82);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                padding: 5px 10px;
                cursor: pointer;
                user-select: none;
                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 2px 12px rgba(0,0,0,0.4);
                opacity: 0;
                transform: translateY(-4px);
                pointer-events: auto;
            }

            :host(:hover) .mc-badge,
            .mc-badge.mc-visible {
                opacity: 1;
                transform: translateY(0);
            }

            .mc-badge:hover {
                background: rgba(15, 15, 20, 0.92);
                border-color: rgba(137, 180, 250, 0.3);
                box-shadow: 0 4px 20px rgba(0,0,0,0.5), 0 0 0 1px rgba(137, 180, 250, 0.15);
            }

            .mc-chip {
                display: flex;
                align-items: center;
                gap: 3px;
                font-size: 11px;
                font-weight: 600;
                color: #cdd6f4;
                letter-spacing: 0.02em;
                white-space: nowrap;
            }

            .mc-chip-icon {
                font-size: 12px;
                line-height: 1;
            }

            .mc-divider {
                width: 1px;
                height: 14px;
                background: rgba(255, 255, 255, 0.15);
                flex-shrink: 0;
            }

            /* ── Expanded Panel ── */
            .mc-panel {
                position: absolute;
                top: 8px;
                left: 8px;
                background: rgba(15, 15, 20, 0.92);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 14px;
                padding: 14px 16px;
                min-width: 220px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.55), 0 0 0 1px rgba(137, 180, 250, 0.1);
                opacity: 0;
                transform: scale(0.92) translateY(-6px);
                transform-origin: top left;
                pointer-events: none;
                transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .mc-panel.mc-open {
                opacity: 1;
                transform: scale(1) translateY(0);
                pointer-events: auto;
            }

            .mc-panel-row {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .mc-panel-label {
                font-size: 11px;
                font-weight: 600;
                color: rgba(205, 214, 244, 0.7);
                min-width: 18px;
                text-align: center;
                flex-shrink: 0;
            }

            .mc-panel-value {
                font-size: 12px;
                font-weight: 700;
                color: #89b4fa;
                min-width: 42px;
                text-align: right;
                font-variant-numeric: tabular-nums;
                flex-shrink: 0;
            }

            /* ── Custom Slider ── */
            .mc-slider {
                -webkit-appearance: none;
                appearance: none;
                flex: 1;
                height: 4px;
                border-radius: 2px;
                background: rgba(255, 255, 255, 0.1);
                outline: none;
                cursor: pointer;
                transition: height 0.15s;
            }

            .mc-slider:hover {
                height: 6px;
            }

            .mc-slider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: #89b4fa;
                border: 2px solid rgba(255, 255, 255, 0.2);
                cursor: pointer;
                box-shadow: 0 1px 6px rgba(0,0,0,0.3);
                transition: transform 0.15s, box-shadow 0.15s;
            }

            .mc-slider::-webkit-slider-thumb:hover {
                transform: scale(1.2);
                box-shadow: 0 0 10px rgba(137, 180, 250, 0.5);
            }

            .mc-slider::-moz-range-thumb {
                width: 14px;
                height: 14px;
                border-radius: 50%;
                background: #89b4fa;
                border: 2px solid rgba(255, 255, 255, 0.2);
                cursor: pointer;
            }

            /* Speed slider accent */
            .mc-slider-speed::-webkit-slider-thumb {
                background: #a6e3a1;
            }
            .mc-slider-speed::-moz-range-thumb {
                background: #a6e3a1;
            }

            .mc-panel-value.mc-speed-val {
                color: #a6e3a1;
            }

            /* ── Quick Buttons ── */
            .mc-quick-btns {
                display: flex;
                gap: 4px;
                flex-wrap: wrap;
                justify-content: center;
                padding-top: 4px;
                border-top: 1px solid rgba(255,255,255,0.06);
            }

            .mc-qbtn {
                font-size: 10px;
                font-weight: 600;
                color: #cdd6f4;
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 6px;
                padding: 3px 8px;
                cursor: pointer;
                transition: all 0.15s;
                white-space: nowrap;
            }

            .mc-qbtn:hover {
                background: rgba(137, 180, 250, 0.15);
                border-color: rgba(137, 180, 250, 0.3);
                color: #89b4fa;
            }
        `;
    }

    function createOverlayForVideo(video) {
        if (state.overlays.has(video)) return;

        // Create a host element
        const host = document.createElement('div');
        host.className = '__mc-overlay-host';
        host.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';

        const shadow = host.attachShadow({ mode: 'closed' });

        // Styles
        const styleEl = document.createElement('style');
        styleEl.textContent = buildOverlayStyles();
        shadow.appendChild(styleEl);

        // Badge (collapsed state)
        const badge = document.createElement('div');
        badge.className = 'mc-badge';

        const speedChip = document.createElement('span');
        speedChip.className = 'mc-chip';
        speedChip.innerHTML = '<span class="mc-chip-icon">⚡</span><span class="mc-chip-speed-val">1.0x</span>';

        const divider = document.createElement('span');
        divider.className = 'mc-divider';

        const volChip = document.createElement('span');
        volChip.className = 'mc-chip';
        volChip.innerHTML = '<span class="mc-chip-icon">🔊</span><span class="mc-chip-vol-val">100%</span>';

        badge.appendChild(speedChip);
        badge.appendChild(divider);
        badge.appendChild(volChip);
        shadow.appendChild(badge);

        // Panel (expanded state)
        const panel = document.createElement('div');
        panel.className = 'mc-panel';
        panel.innerHTML = `
            <div class="mc-panel-row">
                <span class="mc-panel-label">🔊</span>
                <input type="range" class="mc-slider mc-slider-vol" min="0" max="500" value="${Math.round(state.currentVolume * 100)}" step="1">
                <span class="mc-panel-value mc-vol-val">${Math.round(state.currentVolume * 100)}%</span>
            </div>
            <div class="mc-panel-row">
                <span class="mc-panel-label">⚡</span>
                <input type="range" class="mc-slider mc-slider-speed" min="1" max="160" value="${Math.round(state.currentSpeed * 10)}" step="1">
                <span class="mc-panel-value mc-speed-val">${state.currentSpeed.toFixed(1)}x</span>
            </div>
            <div class="mc-quick-btns">
                <button class="mc-qbtn" data-action="vol" data-val="100">100%</button>
                <button class="mc-qbtn" data-action="vol" data-val="200">200%</button>
                <button class="mc-qbtn" data-action="vol" data-val="0">Mute</button>
                <button class="mc-qbtn" data-action="speed" data-val="10">1x</button>
                <button class="mc-qbtn" data-action="speed" data-val="15">1.5x</button>
                <button class="mc-qbtn" data-action="speed" data-val="20">2x</button>
            </div>
        `;
        shadow.appendChild(panel);

        // References within shadow DOM
        const volSlider = panel.querySelector('.mc-slider-vol');
        const speedSlider = panel.querySelector('.mc-slider-speed');
        const volValLabel = panel.querySelector('.mc-vol-val');
        const speedValLabel = panel.querySelector('.mc-speed-val');
        const chipSpeedVal = speedChip.querySelector('.mc-chip-speed-val');
        const chipVolVal = volChip.querySelector('.mc-chip-vol-val');

        // Update display values
        function syncDisplay() {
            const volPercent = Math.round(state.currentVolume * 100);
            const speedFixed = state.currentSpeed.toFixed(1);

            chipSpeedVal.textContent = speedFixed + 'x';
            chipVolVal.textContent = volPercent + '%';
            volSlider.value = volPercent;
            speedSlider.value = Math.round(state.currentSpeed * 10);
            volValLabel.textContent = volPercent + '%';
            speedValLabel.textContent = speedFixed + 'x';
        }

        // Show panel, hide badge
        let panelOpen = false;
        let hideTimeout = null;

        function openPanel() {
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
            syncDisplay();
            badge.style.pointerEvents = 'none';
            badge.style.opacity = '0';
            panel.classList.add('mc-open');
            panelOpen = true;
        }

        function closePanel() {
            panel.classList.remove('mc-open');
            badge.style.pointerEvents = '';
            badge.style.opacity = '';
            panelOpen = false;
        }

        badge.addEventListener('click', (e) => {
            e.stopPropagation();
            openPanel();
        });

        // Close when mouse leaves the entire host area
        host.addEventListener('mouseleave', () => {
            if (panelOpen) {
                hideTimeout = setTimeout(() => closePanel(), 350);
            }
        });

        panel.addEventListener('mouseenter', () => {
            if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
        });

        panel.addEventListener('mouseleave', () => {
            hideTimeout = setTimeout(() => closePanel(), 350);
        });

        // Volume slider handler
        volSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            const val = parseInt(e.target.value, 10);
            state.currentVolume = val / 100;
            volValLabel.textContent = val + '%';
            chipVolVal.textContent = val + '%';
            applyVolume();
        });

        // Speed slider handler
        speedSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            const raw = parseInt(e.target.value, 10);
            state.currentSpeed = raw / 10;
            const display = state.currentSpeed.toFixed(1);
            speedValLabel.textContent = display + 'x';
            chipSpeedVal.textContent = display + 'x';
            applySpeed();
        });

        // Quick buttons
        panel.querySelectorAll('.mc-qbtn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const val = parseInt(btn.dataset.val, 10);

                if (action === 'vol') {
                    state.currentVolume = val / 100;
                    applyVolume();
                } else if (action === 'speed') {
                    state.currentSpeed = val / 10;
                    applySpeed();
                }
                syncDisplay();
            });
        });

        // Prevent clicks on overlay from affecting video player beneath
        host.addEventListener('click', (e) => {
            // Only stop propagation when clicking on interactive elements
        }, true);

        // Ensure the video's parent is positioned so the overlay aligns
        positionOverlay(video, host);

        state.overlays.set(video, { host, syncDisplay });

        // Show badge briefly on load
        badge.classList.add('mc-visible');
        setTimeout(() => badge.classList.remove('mc-visible'), 2500);
    }

    function positionOverlay(video, host) {
        const parent = video.parentElement;
        if (!parent) return;

        // Make sure parent is a positioning context
        const parentStyle = getComputedStyle(parent);
        if (parentStyle.position === 'static') {
            parent.style.position = 'relative';
        }

        // Insert overlay as sibling right after the video
        if (video.nextSibling) {
            parent.insertBefore(host, video.nextSibling);
        } else {
            parent.appendChild(host);
        }
    }

    function applyVolume() {
        hookMediaElements();

        if (state.gainNode) {
            resumeAudioContext();
            state.gainNode.gain.setTargetAtTime(
                state.currentVolume,
                state.audioContext.currentTime,
                0.05
            );
        } else {
            document.querySelectorAll('video, audio').forEach(media => {
                media.volume = Math.min(1.0, state.currentVolume);
            });
        }

        // Sync all overlays
        syncAllOverlays();
    }

    function applySpeed() {
        document.querySelectorAll('video, audio').forEach(media => {
            media.playbackRate = state.currentSpeed;
        });

        // Sync all overlays
        syncAllOverlays();
    }

    function syncAllOverlays() {
        document.querySelectorAll('video').forEach(video => {
            const overlay = state.overlays.get(video);
            if (overlay) overlay.syncDisplay();
        });
    }

    // ── Original Logic ──────────────────────────────────────────────────

    function applyStateToElement(media) {
        // Apply speed always (no API restrictions here)
        media.playbackRate = state.currentSpeed;

        // If already connected, nothing more to do
        if (state.mediaSources.has(media)) return;

        // Hook via Web Audio API for volume boost
        try {
            if (initAudio()) {
                resumeAudioContext();
                const source = state.audioContext.createMediaElementSource(media);
                source.connect(state.gainNode);
                state.mediaSources.set(media, source);
            }
        } catch (e) {
            // DOMException: cross-origin or already captured — fall back silently
        }
    }

    function hookMediaElements() {
        document.querySelectorAll('video, audio').forEach(media => {
            // For lazy-loaded media, wait until it has a src assigned
            if (!media.src && !media.currentSrc && media.readyState === 0) {
                // Watch for when this specific element gets a src
                const srcObserver = new MutationObserver(() => {
                    if (media.src || media.currentSrc) {
                        srcObserver.disconnect();
                        applyStateToElement(media);
                    }
                });
                srcObserver.observe(media, { attributes: true, attributeFilter: ['src'] });

                // Also listen for the loadstart event in case src is set programmatically
                media.addEventListener('loadstart', () => {
                    applyStateToElement(media);
                }, { once: true });
            } else {
                applyStateToElement(media);
            }

            // Create overlay for video elements
            if (media.tagName === 'VIDEO') {
                createOverlayForVideo(media);
            }
        });
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'setVolume') {
            state.currentVolume = message.value;
            hookMediaElements();

            if (state.gainNode) {
                resumeAudioContext();
                // Smoothly transition volume to avoid popping sounds
                state.gainNode.gain.setTargetAtTime(
                    state.currentVolume,
                    state.audioContext.currentTime,
                    0.05
                );
            } else {
                // Fallback if AudioContext is strictly unavailable
                document.querySelectorAll('video, audio').forEach(media => {
                    media.volume = Math.min(1.0, state.currentVolume);
                });
            }
            syncAllOverlays();
            sendResponse({ success: true });
        } else if (message.action === 'setSpeed') {
            state.currentSpeed = message.value;
            hookMediaElements();
            syncAllOverlays();
            sendResponse({ success: true });
        }
        return true;
    });

    // Watch for dynamically added media elements (SPAs like IG/Bilibili replace elements often)
    const observer = new MutationObserver((mutations) => {
        let shouldHook = false;
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeName === 'VIDEO' || node.nodeName === 'AUDIO') {
                    shouldHook = true;
                    break;
                }
                if (node.querySelectorAll && node.querySelectorAll('video, audio').length > 0) {
                    shouldHook = true;
                    break;
                }
            }
            if (shouldHook) break;
        }

        if (shouldHook) {
            hookMediaElements();
        }
    });

    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });

    // Initial hook for elements already present when the script loads
    hookMediaElements();
}
