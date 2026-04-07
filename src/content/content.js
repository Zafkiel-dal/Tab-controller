// Ensure we don't inject multiple times per frame
if (typeof window.__mediaControllerInjected === 'undefined') {
    window.__mediaControllerInjected = true;
    const SPEED_SCALE = 100;

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
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                pointer-events: none; /* Let clicks pass through the host... */
            }

            .mc-badge {
                position: absolute;
                top: 8px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                align-items: center;
                gap: 2px;
                background: rgba(15, 15, 20, 0.75);
                backdrop-filter: blur(20px) saturate(180%);
                -webkit-backdrop-filter: blur(20px) saturate(180%);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 100px;
                padding: 2px 4px;
                user-select: none;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
                opacity: var(--mc-idle-opacity, 0.45);
                transition: opacity 0.3s ease, background 0.3s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                pointer-events: auto; /* ...but capture clicks on the badge itself */
                -webkit-tap-highlight-color: transparent;
                z-index: 2147483647; /* Reinforce z-index */
            }

            .mc-badge:hover, .mc-badge.mc-pop-active {
                opacity: 1 !important;
                background: rgba(15, 15, 20, 0.88);
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
                transform: translateX(-50%) scale(1.03);
            }

            /* ── Smooth Dragging Fix ── */
            /* Disable ALL transitions during dragging to follow the cursor instantly */
            .mc-badge.mc-dragging {
                opacity: 1 !important;
                background: rgba(15, 15, 20, 0.88);
                transition: none !important;
                transform: none !important; /* Managed by direct top/left updates */
            }

            /* ── Chip (each half of the badge) ── */
            .mc-zone {
                position: relative;
                display: flex;
                align-items: center;
                padding: 4px 10px;
                cursor: default;
                border-radius: 100px;
                transition: all 0.2s ease;
                touch-action: manipulation;
            }

            .mc-zone-speed:hover { background: rgba(166, 227, 161, 0.12); }
            .mc-zone-vol:hover   { background: rgba(137, 180, 250, 0.12); }
            .mc-zone-eye:hover   { background: rgba(255, 255, 255, 0.1); }
            .mc-zone-reset { color: #ffffff !important; } /* White by default as requested */
            .mc-zone-reset:hover { background: rgba(255, 255, 255, 0.15); }

            .mc-sep {
                width: 1px;
                height: 12px;
                background: rgba(255, 255, 255, 0.1);
                margin: 0;
            }

            .mc-label {
                font-size: 10px;
                font-weight: 700;
                color: rgba(205, 214, 244, 0.9);
                white-space: nowrap;
                letter-spacing: 0.02em;
                font-variant-numeric: tabular-nums;
            }

            .mc-speed-val { color: #a6e3a1; } 
            .mc-vol-val   { color: #89b4fa; }

            /* ── Popovers (Speed/Vol/Eye) ── */
            .mc-spd-pop, .mc-vol-pop, .mc-eye-pop {
                position: absolute;
                top: calc(100% - 2px); /* Slight overlap to maintain hover */
                left: 50%;
                transform: translateX(-50%) scale(0.95);
                display: flex;
                align-items: center;
                gap: 6px;
                background: rgba(24, 24, 37, 0.98);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                border: 1px solid rgba(255, 255, 255, 0.12);
                border-radius: 12px;
                padding: 8px 10px;
                opacity: 0;
                pointer-events: none;
                transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                box-shadow: 0 12px 48px rgba(0, 0, 0, 0.6);
                margin-top: 5px;
            }

            /* Transparent bridge to prevent losing hover in the gap */
            .mc-spd-pop::before, .mc-vol-pop::before, .mc-eye-pop::before {
                content: "";
                position: absolute;
                top: -10px;
                left: 0;
                right: 0;
                height: 10px;
                background: transparent;
            }

            .mc-zone:hover .mc-spd-pop, .mc-zone:hover .mc-vol-pop, .mc-zone:hover .mc-eye-pop,
            .mc-zone.mc-open .mc-spd-pop, .mc-zone.mc-open .mc-vol-pop, .mc-zone.mc-open .mc-eye-pop {
                opacity: 1;
                pointer-events: auto;
                transform: translateX(-50%) scale(1);
            }

            /* ── Interactive Elements inside Popovers ── */
            .mc-sbtn {
                display: flex;
                align-items: center;
                justify-content: center;
                min-width: 26px;
                height: 26px;
                border: none;
                border-radius: 7px;
                background: rgba(255, 255, 255, 0.05);
                color: rgba(205, 214, 244, 0.9);
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.15s ease;
                padding: 0 5px;
            }

            .mc-sbtn:hover { background: rgba(166, 227, 161, 0.2); color: #a6e3a1; }
            .mc-sbtn:active { transform: scale(0.92); }

            .mc-vslider {
                -webkit-appearance: none;
                appearance: none;
                width: 84px;
                height: 3px;
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.1);
                outline: none;
            }

            .mc-vslider::-webkit-slider-thumb {
                -webkit-appearance: none;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #89b4fa;
                box-shadow: 0 0 10px rgba(137, 180, 250, 0.4);
                cursor: pointer;
                border: 2px solid #1e1e2e;
            }

            .mc-vpct {
                font-size: 10px;
                font-weight: 800;
                color: #89b4fa;
                min-width: 30px;
                text-align: right;
            }

            /* Reset Icons */
            .mc-zone-reset svg {
                transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            .mc-zone-reset:hover svg {
                transform: rotate(-180deg) scale(1.1);
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

    function createSvgIcon({ width, height, viewBox, stroke = 'currentColor', attrs = {}, children = [] }) {
        const SVG_NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('xmlns', SVG_NS);
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.setAttribute('viewBox', viewBox);
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', stroke);
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');

        Object.entries(attrs).forEach(([key, value]) => {
            svg.setAttribute(key, String(value));
        });

        children.forEach(({ tag, attrs: childAttrs }) => {
            const child = document.createElementNS(SVG_NS, tag);
            Object.entries(childAttrs).forEach(([key, value]) => {
                child.setAttribute(key, String(value));
            });
            svg.appendChild(child);
        });

        return svg;
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
        const speedFormatted = state.currentSpeed.toFixed(2);
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
        eyeIcon.appendChild(createSvgIcon({
            width: 13,
            height: 13,
            viewBox: '0 0 24 24',
            children: [
                { tag: 'path', attrs: { d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0' } },
                { tag: 'circle', attrs: { cx: '12', cy: '12', r: '3' } }
            ]
        })); // SVG eye icon

        const eyePop = createEl('div', 'mc-eye-pop');
        const eyeSlider = createEl('input', 'mc-vslider', '', {
            type: 'range', min: '15', max: '100', step: '5', value: '45'
        });
        const eyePct = createEl('span', 'mc-vpct', '45%');

        eyePop.append(eyeSlider, eyePct);
        eyeZone.append(eyeIcon, eyePop);

        // ── Reset Zone ──
        const resetZone = createEl('div', 'mc-zone mc-zone-reset');
        resetZone.title = "Reset (1.0x Speed, 100% Volume)";
        resetZone.appendChild(createSvgIcon({
            width: 13,
            height: 13,
            viewBox: '0 0 24 24',
            attrs: { style: 'color:#ffffff !important;' },
            children: [
                { tag: 'path', attrs: { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' } },
                { tag: 'path', attrs: { d: 'M3 3v5h5' } }
            ]
        })); // SVG reset icon
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

        // Capture pointer events to ensure the slider works even on complex sites
        const stopImmediate = (e) => {
            e.stopPropagation();
            e.stopImmediatePropagation();
        };

        ['pointerdown', 'mousedown', 'touchstart'].forEach(evt => {
            eyeSlider.addEventListener(evt, (e) => {
                stopImmediate(e);
                if (e.pointerId) eyeSlider.setPointerCapture(e.pointerId);
            }, { capture: true });
        });

        ['pointermove', 'mousemove', 'touchmove', 'pointerup', 'mouseup', 'touchend', 'click'].forEach(evt => {
            eyeSlider.addEventListener(evt, stopImmediate, { capture: true });
        });

        eyeZone.addEventListener('wheel', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const step = e.deltaY < 0 ? 5 : -5;
            let next = parseInt(eyeSlider.value, 10) + step;
            next = Math.max(15, Math.min(100, next));
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
            const speedFormatted = state.currentSpeed.toFixed(2);

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

        volSlider.addEventListener('input', (e) => {
            e.stopPropagation();
            const val = parseInt(e.target.value, 10);
            state.currentVolume = val / 100;
            applyVolume();
            persistState();
            syncDisplay();
        });

        ['pointerdown', 'mousedown', 'touchstart'].forEach(evt => {
            volSlider.addEventListener(evt, (e) => {
                stopImmediate(e);
                if (e.pointerId) volSlider.setPointerCapture(e.pointerId);
            }, { capture: true });
        });

        ['pointermove', 'mousemove', 'touchmove', 'pointerup', 'mouseup', 'touchend', 'click'].forEach(evt => {
            volSlider.addEventListener(evt, stopImmediate, { capture: true });
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

        // ── Touch tap-toggle for popovers (Android / no-hover devices) ──
        // We use window.matchMedia('(hover: none)') to detect touch-primary
        // devices. On hover-capable devices the CSS :hover rules already handle it.
        const isTouchPrimary = () => window.matchMedia('(hover: none)').matches;

        const toggleZones = [
            { zone: speedZone, key: 'speed' },
            { zone: volZone, key: 'vol' },
            { zone: eyeZone, key: 'eye' },
        ];

        function closeAllPops(exceptKey) {
            toggleZones.forEach(({ zone, key }) => {
                if (key !== exceptKey) zone.classList.remove('mc-open');
            });
            const anyOpen = toggleZones.some(({ zone }) => zone.classList.contains('mc-open'));
            badge.classList.toggle('mc-pop-active', anyOpen);
        }

        toggleZones.forEach(({ zone, key }) => {
            zone.addEventListener('click', (e) => {
                if (!isTouchPrimary()) return; // handled by CSS hover on desktop
                e.stopPropagation();
                // Ignore clicks that originated from interactive children
                if (e.target.closest && (e.target.closest('.mc-sbtn') || e.target.closest('.mc-vslider'))) return;
                const wasOpen = zone.classList.contains('mc-open');
                closeAllPops(null);
                if (!wasOpen) {
                    zone.classList.add('mc-open');
                    badge.classList.add('mc-pop-active');
                }
            });
        });

        // Close all popovers when tapping outside the badge
        document.addEventListener('click', (e) => {
            if (!isTouchPrimary()) return;
            // e.composedPath() works across Shadow DOM
            const path = e.composedPath ? e.composedPath() : [];
            if (!path.includes(badge)) {
                closeAllPops(null);
            }
        }, { capture: true, passive: true });

        // ── Drag to reposition (mouse + touch) ──
        // Keep interactions reliable: do not start drag from interactive zones.
        let dragging = false;
        let dragStartX = 0, dragStartY = 0;
        let badgeX = 0, badgeY = 8;

        function startDrag(startX, startY, e) {
            dragStartX = startX;
            dragStartY = startY;
            dragging = false;

            const onMove = (me) => {
                me.stopPropagation();
                me.preventDefault();
                const cx = me.touches ? me.touches[0].clientX : me.clientX;
                const cy = me.touches ? me.touches[0].clientY : me.clientY;
                const dx = cx - dragStartX;
                const dy = cy - dragStartY;

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
                    const cx = ue.changedTouches ? ue.changedTouches[0].clientX : ue.clientX;
                    const cy = ue.changedTouches ? ue.changedTouches[0].clientY : ue.clientY;
                    badgeX += cx - dragStartX;
                    badgeY += cy - dragStartY;
                    badge.classList.remove('mc-dragging');
                }
                dragging = false;
                ['mousemove', 'pointermove', 'touchmove'].forEach(evt => document.removeEventListener(evt, onMove, true));
                ['mouseup', 'pointerup', 'touchend', 'touchcancel'].forEach(evt => document.removeEventListener(evt, onUp, true));
            };

            ['mousemove', 'pointermove', 'touchmove'].forEach(evt => document.addEventListener(evt, onMove, true));
            ['mouseup', 'pointerup', 'touchend', 'touchcancel'].forEach(evt => document.addEventListener(evt, onUp, true));
        }

        const canStartDragFromTarget = (target) => {
            if (!target || !target.closest) return true;
            return !target.closest('.mc-sbtn') && !target.closest('.mc-vslider') && !target.closest('.mc-eye-pop');
        };

        const anchorBadgeToTopCenter = () => {
            badge.style.transform = 'none';
            const badgeWidth = badge.offsetWidth || 0;
            const hostWidth = host.offsetWidth || 0;
            badgeX = Math.max(0, Math.round((hostWidth - badgeWidth) / 2));
            badgeY = 8;
            badge.style.left = badgeX + 'px';
            badge.style.top = badgeY + 'px';
        };

        // Ensure centered placement after render and whenever layout changes.
        setTimeout(anchorBadgeToTopCenter, 0);
        window.addEventListener('resize', anchorBadgeToTopCenter);

        badge.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            const t = e.target;
            if (!canStartDragFromTarget(t)) return;
            startDrag(e.clientX, e.clientY, e);
        });

        badge.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            const t = e.target;
            if (!canStartDragFromTarget(t)) return;
            const touch = e.touches[0];
            startDrag(touch.clientX, touch.clientY, e);
        }, { passive: true });


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
            // Prevent duplicate listeners by marking the tag
            if (media.dataset.mcHooked) return;
            media.dataset.mcHooked = "true";

            const enforceState = () => {
                if (Math.abs(media.playbackRate - state.currentSpeed) > 0.05) {
                    media.playbackRate = state.currentSpeed;
                }
            };

            // Aggressive strict adherence to extension state
            media.addEventListener('ratechange', enforceState);
            media.addEventListener('loadeddata', enforceState);
            media.addEventListener('play', enforceState);
            media.addEventListener('loadstart', () => {
                // Re-fetch preset whenever a new clip/source starts loading.
                // This makes Default mode reset on each clip change even when URL does not change.
                fetchAndApplyPreset();
            });

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

    // Keep state in extension memory (background) only, never on disk.
    function persistState() {
        chrome.runtime.sendMessage({
            action: 'persistState',
            volume: Math.round(state.currentVolume * 100),
            speed: Math.round(state.currentSpeed * SPEED_SCALE)
        }).catch(() => { });
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
                speed: Math.round(state.currentSpeed * SPEED_SCALE)
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

    // Request session preset from background memory.
    const currentDomain = window.location.hostname;
    function fetchAndApplyPreset() {
        chrome.runtime.sendMessage({ action: 'requestInitialState', domain: currentDomain }, (response) => {
            if (!response) return;
            if (response.volume !== undefined) state.currentVolume = response.volume / 100;
            if (response.speed !== undefined) state.currentSpeed = response.speed / SPEED_SCALE;
            applySpeed();
            applyVolume();
        });
    }

    // Run on initial load.
    fetchAndApplyPreset();
    hookMediaElements();

    // Detect URL changes for SPA navigation (e.g. YouTube sidebar clicks)
    // so we can restore the Baseline Preset over any temporary slider adjustments
    let lastUrl = location.href;
    new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
            lastUrl = url;
            // Delay slightly to ensure new elements have settled.
            setTimeout(fetchAndApplyPreset, 100);
        }
    }).observe(document.body || document.documentElement, { subtree: true, childList: true });
}
