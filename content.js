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
                gap: 0;
                background: rgba(15, 15, 20, 0.82);
                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 0;
                user-select: none;
                box-shadow: 0 2px 10px rgba(0,0,0,0.35);
                opacity: var(--mc-idle-opacity, 0.45);
                transition: opacity 0.2s ease;
                pointer-events: auto;
            }

            .mc-badge:hover {
                opacity: 1 !important;
            }

            /* ── Chip (each half of the badge) ── */
            .mc-zone {
                position: relative;
                display: flex;
                align-items: center;
                padding: 4px 8px;
                cursor: default;
            }

            .mc-zone::after {
                content: '';
                position: absolute;
                bottom: -10px;
                left: 0;
                right: 0;
                height: 10px;
            }

            .mc-zone-speed {
                border-radius: 8px 0 0 8px;
            }
            .mc-zone-speed:hover {
                background: rgba(166, 227, 161, 0.08);
            }

            .mc-zone-vol {
                border-radius: 0;
            }
            .mc-zone-vol:hover {
                background: rgba(137, 180, 250, 0.08);
            }

            .mc-sep {
                width: 1px;
                height: 16px;
                background: rgba(255, 255, 255, 0.1);
                flex-shrink: 0;
            }

            .mc-badge.mc-dragging {
                cursor: grabbing !important;
                opacity: 1 !important;
                transition: none !important;
            }

            /* ── Opacity Slider (Eye Zone) ── */
            .mc-zone-eye {
                border-radius: 0;
                color: rgba(205, 214, 244, 0.5);
                border-left: 1px solid rgba(255, 255, 255, 0.06);
            }
            .mc-zone-eye:hover {
                background: rgba(255, 255, 255, 0.08);
                color: rgba(205, 214, 244, 0.9);
            }

            /* ── Reset Zone ── */
            .mc-zone-reset {
                border-radius: 0 8px 8px 0;
                color: rgba(205, 214, 244, 0.4);
                border-left: 1px solid rgba(255, 255, 255, 0.06);
                cursor: pointer;
            }
            .mc-zone-reset:hover {
                background: rgba(243, 139, 168, 0.08); /* slight red tint on hover */
                color: #f38ba8;
            }

            .mc-eye-pop {
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%) translateY(4px) scale(0.95);
                display: flex;
                align-items: center;
                gap: 6px;
                background: rgba(15, 15, 20, 0.92);
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 7px;
                padding: 5px 10px;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.15s ease, transform 0.15s ease;
                box-shadow: 0 4px 16px rgba(0,0,0,0.4);
                white-space: nowrap;
            }

            .mc-zone-eye:hover .mc-eye-pop {
                opacity: 1;
                pointer-events: auto;
                transform: translateX(-50%) translateY(4px) scale(1);
            }

            .mc-label {
                font-size: 11px;
                font-weight: 600;
                color: rgba(205, 214, 244, 0.85);
                white-space: nowrap;
                letter-spacing: 0.01em;
            }

            .mc-speed-val { color: #a6e3a1; }
            .mc-vol-val   { color: #89b4fa; }

            /* ── Speed popover (3 buttons) ── */
            .mc-spd-pop {
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%) translateY(4px) scale(0.95);
                display: flex;
                align-items: center;
                gap: 2px;
                background: rgba(15, 15, 20, 0.92);
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 7px;
                padding: 3px 4px;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.15s ease, transform 0.15s ease;
                box-shadow: 0 4px 16px rgba(0,0,0,0.4);
            }


            .mc-zone-speed:hover .mc-spd-pop {
                opacity: 1;
                pointer-events: auto;
                transform: translateX(-50%) translateY(4px) scale(1);
            }

            .mc-sbtn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: auto;
                height: 22px;
                border: none;
                border-radius: 4px;
                background: transparent;
                color: rgba(205, 214, 244, 0.8);
                font-size: 13px;
                font-weight: 700;
                cursor: pointer;
                transition: background 0.12s, color 0.12s;
                padding: 0 5px;
                line-height: 1;
                font-family: inherit;
            }

            .mc-sbtn:hover {
                background: rgba(166, 227, 161, 0.18);
                color: #a6e3a1;
            }

            .mc-sbtn-rst {
                font-size: 10px;
                width: auto;
                padding: 0 6px;
                color: rgba(205, 214, 244, 0.55);
                font-weight: 600;
            }
            .mc-sbtn-rst:hover {
                color: #a6e3a1;
            }

            /* ── Volume popover (slider) ── */
            .mc-vol-pop {
                position: absolute;
                top: 100%;
                left: 50%;
                transform: translateX(-50%) translateY(4px) scale(0.95);
                display: flex;
                align-items: center;
                gap: 6px;
                background: rgba(15, 15, 20, 0.92);
                backdrop-filter: blur(14px);
                -webkit-backdrop-filter: blur(14px);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 7px;
                padding: 5px 10px;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.15s ease, transform 0.15s ease;
                box-shadow: 0 4px 16px rgba(0,0,0,0.4);
                white-space: nowrap;
            }


            .mc-zone-vol:hover .mc-vol-pop {
                opacity: 1;
                pointer-events: auto;
                transform: translateX(-50%) translateY(4px) scale(1);
            }

            .mc-vslider {
                -webkit-appearance: none;
                appearance: none;
                width: 90px;
                height: 3px;
                border-radius: 2px;
                background: rgba(255, 255, 255, 0.12);
                outline: none;
                cursor: pointer;
            }

            .mc-vslider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #89b4fa;
                border: 1.5px solid rgba(255, 255, 255, 0.15);
                cursor: pointer;
                box-shadow: 0 1px 4px rgba(0,0,0,0.3);
                transition: transform 0.12s;
            }
            .mc-vslider::-webkit-slider-thumb:hover {
                transform: scale(1.15);
            }

            .mc-vslider::-moz-range-thumb {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #89b4fa;
                border: 1.5px solid rgba(255, 255, 255, 0.15);
                cursor: pointer;
            }

            .mc-vpct {
                font-size: 10px;
                font-weight: 700;
                color: #89b4fa;
                min-width: 32px;
                text-align: right;
                font-variant-numeric: tabular-nums;
            }
        `;
    }

    // ── Helper ──────────────────────────────────────────────────────────
    function createEl(tag, className, text = '', props = {}) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (text) el.textContent = text;
        Object.assign(el, props);
        return el;
    }

    function createOverlayForVideo(video) {
        if (state.overlays.has(video)) return;

        const host = createEl('div', '__mc-overlay-host');
        host.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';

        const shadow = host.attachShadow({ mode: 'closed' });
        const styleEl = createEl('style', '', buildOverlayStyles());
        shadow.appendChild(styleEl);

        // ── Badge ──
        const badge = createEl('div', 'mc-badge');

        // Speed zone
        const speedZone = createEl('div', 'mc-zone mc-zone-speed');
        const speedFormatted = Number.isInteger(state.currentSpeed) ? state.currentSpeed.toFixed(1) : state.currentSpeed.toString();
        const speedLabel = createEl('span', 'mc-label mc-speed-val', speedFormatted + 'x');

        // Speed popover: − | 1× | +
        const spdPop = createEl('div', 'mc-spd-pop');
        const btnMinus = createEl('button', 'mc-sbtn', '\u2212');
        const btnReset = createEl('button', 'mc-sbtn mc-sbtn-rst', '1\u00d7');
        const btnPlus = createEl('button', 'mc-sbtn', '+');

        spdPop.append(btnMinus, btnReset, btnPlus);
        speedZone.append(speedLabel, spdPop);

        // Separator
        const sep = createEl('div', 'mc-sep');

        // Volume zone
        const volZone = createEl('div', 'mc-zone mc-zone-vol');
        const volPercentStr = Math.round(state.currentVolume * 100) + '%';
        const volLabel = createEl('span', 'mc-label mc-vol-val', volPercentStr);

        // Volume popover: slider + percentage
        const volPop = createEl('div', 'mc-vol-pop');
        const volSlider = createEl('input', 'mc-vslider', '', {
            type: 'range', min: '0', max: '500', step: '1',
            value: String(Math.round(state.currentVolume * 100))
        });
        const volPct = createEl('span', 'mc-vpct', volPercentStr);

        volPop.append(volSlider, volPct);
        volZone.append(volLabel, volPop);

        // ── Opacity Zone ──
        const eyeZone = createEl('div', 'mc-zone mc-zone-eye');
        const eyeIcon = createEl('span', 'mc-label');
        eyeIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`; // SVG eye icon

        const eyePop = createEl('div', 'mc-eye-pop');
        const eyeSlider = createEl('input', 'mc-vslider', '', {
            type: 'range', min: '20', max: '100', step: '5', value: '45'
        });
        const eyePct = createEl('span', 'mc-vpct', '45%');

        eyePop.append(eyeSlider, eyePct);
        eyeZone.append(eyeIcon, eyePop);

        // ── Reset Zone ──
        const resetZone = createEl('div', 'mc-zone mc-zone-reset');
        resetZone.title = "Reset (1.0x Speed, 100% Volume)";
        resetZone.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>`; // SVG reset icon
        resetZone.addEventListener('click', (e) => {
            e.stopPropagation();
            state.currentSpeed = 1.0;
            state.currentVolume = 1.0;
            applySpeed();
            applyVolume();
            persistState();
            syncDisplay();
        });

        eyeSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            const val = e.target.value;
            eyePct.textContent = val + '%';
            badge.style.setProperty('--mc-idle-opacity', val / 100);
        });

        // Capture pointer on slider thumb to prevent video player interaction
        eyeSlider.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            eyeSlider.setPointerCapture(e.pointerId);
        });
        eyeSlider.addEventListener('pointermove', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        });
        eyeSlider.addEventListener('pointerup', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        });

        eyeZone.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const step = e.deltaY < 0 ? 5 : -5;
            let next = parseInt(eyeSlider.value, 10) + step;
            next = Math.max(20, Math.min(100, next));
            eyeSlider.value = next;
            eyePct.textContent = next + '%';
            badge.style.setProperty('--mc-idle-opacity', next / 100);
        }, { passive: false });

        badge.appendChild(speedZone);
        badge.appendChild(sep);
        badge.appendChild(volZone);
        badge.appendChild(eyeZone);
        badge.appendChild(resetZone);
        shadow.appendChild(badge);

        // ── Sync helper ──
        function syncDisplay() {
            const volPercent = Math.round(state.currentVolume * 100);
            const speedFormatted = Number.isInteger(state.currentSpeed) ? state.currentSpeed.toFixed(1) : state.currentSpeed.toString();

            speedLabel.textContent = speedFormatted + 'x';
            volLabel.textContent = volPercent + '%';
            volSlider.value = volPercent;
            volPct.textContent = volPercent + '%';
        }

        // ── Speed buttons ──
        const SPEED_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

        function stepSpeed(direction) {
            let curr = state.currentSpeed;
            let closestIdx = 0;
            let minDiff = Infinity;
            SPEED_PRESETS.forEach((v, i) => {
                const diff = Math.abs(v - curr);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIdx = i;
                }
            });
            let nextIdx = Math.max(0, Math.min(SPEED_PRESETS.length - 1, closestIdx + direction));
            state.currentSpeed = SPEED_PRESETS[nextIdx];
            applySpeed();
            persistState();
            syncDisplay();
        }

        btnMinus.addEventListener('click', (e) => { e.stopPropagation(); stepSpeed(-1); });
        btnPlus.addEventListener('click', (e) => { e.stopPropagation(); stepSpeed(1); });
        btnReset.addEventListener('click', (e) => {
            e.stopPropagation();
            state.currentSpeed = 1.0;
            applySpeed();
            persistState();
            syncDisplay();
        });

        // ── Scroll wheel on speed zone ──
        speedZone.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const direction = e.deltaY < 0 ? 1 : -1; // scroll up = faster
            stepSpeed(direction);
        }, { passive: false });

        // ── Volume slider ──
        volSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            const val = parseInt(e.target.value, 10);
            state.currentVolume = val / 100;
            applyVolume();
            persistState();
            syncDisplay();
        });

        // Capture pointer on volume slider to prevent video player interaction
        volSlider.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
            volSlider.setPointerCapture(e.pointerId);
        });
        volSlider.addEventListener('pointermove', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        });
        volSlider.addEventListener('pointerup', (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        });

        // ── Scroll wheel on volume zone ──
        volZone.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const step = e.deltaY < 0 ? 5 : -5; // scroll up = louder
            let next = Math.round(state.currentVolume * 100) + step;
            next = Math.max(0, Math.min(500, next));
            state.currentVolume = next / 100;
            applyVolume();
            persistState();
            syncDisplay();
        }, { passive: false });

        // ── Drag to reposition ──
        let dragging = false;
        let dragStartX = 0, dragStartY = 0;
        let badgeX = 8, badgeY = 8;

        badge.addEventListener('mousedown', (e) => {
            e.stopPropagation(); // Always stop it from reaching YouTube!

            // Don't drag from interactive elements
            const t = e.target;
            if (t.closest && (t.closest('.mc-sbtn') || t.closest('.mc-vslider') || t.closest('.mc-eye-pop'))) return;

            // Prevent text selection / native browser drag sequence
            e.preventDefault();

            dragStartX = e.clientX;
            dragStartY = e.clientY;
            dragging = false;

            const onMove = (me) => {
                me.stopPropagation();
                me.preventDefault();
                const dx = me.clientX - dragStartX;
                const dy = me.clientY - dragStartY;

                if (!dragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
                    dragging = true;
                    badge.classList.add('mc-dragging');
                }

                if (dragging) {
                    badge.style.left = (badgeX + dx) + 'px';
                    badge.style.top = (badgeY + dy) + 'px';
                }
            };

            const onUp = (ue) => {
                ue.stopPropagation();
                if (dragging) {
                    badgeX += ue.clientX - dragStartX;
                    badgeY += ue.clientY - dragStartY;
                    badge.classList.remove('mc-dragging');
                }
                dragging = false;
                ['mousemove', 'pointermove', 'touchmove'].forEach(evt => document.removeEventListener(evt, onMove, true));
                ['mouseup', 'pointerup', 'touchend', 'touchcancel'].forEach(evt => document.removeEventListener(evt, onUp, true));
            };

            ['mousemove', 'pointermove', 'touchmove'].forEach(evt => document.addEventListener(evt, onMove, true));
            ['mouseup', 'pointerup', 'touchend', 'touchcancel'].forEach(evt => document.addEventListener(evt, onUp, true));
        });

        // ── Prevent video player interaction ──
        ['mousedown', 'click', 'dblclick', 'mouseup', 'pointerdown', 'pointerup', 'pointermove', 'mousemove', 'contextmenu', 'wheel',
            'dragstart', 'drag', 'drop', 'touchstart', 'touchmove', 'keydown', 'keyup', 'keypress'
        ].forEach(evt => badge.addEventListener(evt, (e) => e.stopPropagation(), false)); // false = bubble phase
        badge.addEventListener('dragstart', (e) => { e.preventDefault(); e.stopPropagation(); }, false);

        // Position and insert
        positionOverlay(video, host);
        state.overlays.set(video, { host, syncDisplay });
    }

    function positionOverlay(video, host) {
        const parent = video.parentElement;
        if (!parent) return;

        const parentStyle = getComputedStyle(parent);
        if (parentStyle.position === 'static') {
            parent.style.position = 'relative';
        }

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

        syncAllOverlays();
    }

    function applySpeed() {
        document.querySelectorAll('video, audio').forEach(media => {
            media.playbackRate = state.currentSpeed;
        });

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

    // ── Persist state to chrome.storage so popup can read live values ──
    function persistState() {
        chrome.runtime.sendMessage({
            action: 'persistState',
            volume: Math.round(state.currentVolume * 100),
            speed: Math.round(state.currentSpeed * 10)
        }).catch(() => { /* popup/bg might not be listening */ });
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
        } else if (message.action === 'getState') {
            sendResponse({
                volume: Math.round(state.currentVolume * 100),
                speed: Math.round(state.currentSpeed * 10)
            });
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
