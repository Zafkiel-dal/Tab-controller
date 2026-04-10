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

    const hookedMedia = new WeakSet();

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

    // Sites where TikTok-style layering blocks normal absolute positioning,
    // OR where videos live inside Shadow DOMs making container lookup impossible.
    const FIXED_OVERLAY_HOSTNAMES = [
        'www.tiktok.com', 'tiktok.com',
        'www.reddit.com', 'reddit.com', 'old.reddit.com', 'sh.reddit.com',
        'www.facebook.com', 'facebook.com', 'web.facebook.com',
        'm.youtube.com'
    ];

    function needsFixedOverlay() {
        const host = window.location.hostname;
        return FIXED_OVERLAY_HOSTNAMES.some(h => host === h || host.endsWith('.' + h));
    }

    function buildOverlayStyles(fixed) {
        return `
            :host {
                all: initial;
                position: ${fixed ? 'fixed' : 'absolute'};
                top: 0;
                left: 0;
                ${fixed ? '' : 'width: 100%; height: 100%;'}
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                pointer-events: none;
                z-index: 2147483647;
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
                touch-action: none; /* Prevent scrolling when dragging the badge */
                z-index: 2147483647 !important; /* Reinforce z-index */
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
        const existing = state.overlays.get(video);
        if (existing) {
            const h = existing.host;
            // Re-attach if the host was removed from DOM entirely, OR if its parent
            // container was recycled (Facebook Reels swaps containers without removing video).
            const hostDetached = !document.contains(h) || !h.parentElement;
            if (hostDetached) {
                positionOverlay(video, h);
            }
            return;
        }

        const host = createEl('div', '__mc-overlay-host');
        host.__mcVideo = video; // Store reference to video for cleanup
        const isFixed = needsFixedOverlay();
        host.dataset.mcFixed = isFixed ? '1' : '0';
        if (isFixed) {
            host.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:2147483647;';
        } else {
            host.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:2147483647;';
        }

        const shadow = host.attachShadow({ mode: 'closed' });
        const styleEl = createEl('style', '', buildOverlayStyles(isFixed));
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
        eyeSlider.addEventListener('pointerup', (e) => {
            if (e.pointerId && eyeSlider.hasPointerCapture(e.pointerId)) {
                eyeSlider.releasePointerCapture(e.pointerId);
            }
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
        function stepSpeed(direction) {
            let curr = Math.round(state.currentSpeed * 100);
            let step = 25;
            if (direction > 0) {
                if (curr >= 800) step = 100;
                else if (curr >= 400) step = 50;
                state.currentSpeed = Math.min(1600, Math.ceil((curr + 1) / step) * step) / 100;
            } else {
                if (curr > 800) step = 100;
                else if (curr > 400) step = 50;
                state.currentSpeed = Math.max(25, Math.floor((curr - 1) / step) * step) / 100;
            }
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
            if (e.pointerId && volSlider.hasPointerCapture(e.pointerId)) {
                volSlider.releasePointerCapture(e.pointerId);
            }
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
        let manuallyMoved = false;
        let dragStartX = 0, dragStartY = 0;
        let badgeX = 0, badgeY = 8;
        let lastDragX = 0, lastDragY = 0;

        const clampBadgePosition = (x, y) => {
            if (!Number.isFinite(x) || !Number.isFinite(y)) {
                return { x: badgeX, y: badgeY };
            }
            const hostRect = host.getBoundingClientRect();
            const badgeRect = badge.getBoundingClientRect();
            const hostWidth = hostRect.width || host.offsetWidth || 0;
            const hostHeight = hostRect.height || host.offsetHeight || 0;
            const badgeWidth = badgeRect.width || badge.offsetWidth || 0;
            const badgeHeight = badgeRect.height || badge.offsetHeight || 0;

            // On some players (e.g. YouTube during control/layout transitions),
            // dimensions can briefly report as 0. Keep last committed position in that case.
            if (hostWidth <= 0 || hostHeight <= 0 || badgeWidth <= 0 || badgeHeight <= 0) {
                return { x: badgeX, y: badgeY };
            }

            const maxX = Math.max(0, hostWidth - badgeWidth);
            const maxY = Math.max(0, hostHeight - badgeHeight);
            return {
                x: Math.max(0, Math.min(maxX, x)),
                y: Math.max(0, Math.min(maxY, y))
            };
        };

        function startDrag(startX, startY, e) {
            dragStartX = startX;
            dragStartY = startY;
            lastDragX = startX;
            lastDragY = startY;
            dragging = false;
            manuallyMoved = true;

            const onMove = (me) => {
                me.stopPropagation();
                me.preventDefault();
                const cx = me.touches ? me.touches[0].clientX : me.clientX;
                const cy = me.touches ? me.touches[0].clientY : me.clientY;
                if (!Number.isFinite(cx) || !Number.isFinite(cy)) return;
                lastDragX = cx;
                lastDragY = cy;
                const dx = cx - dragStartX;
                const dy = cy - dragStartY;

                if (!dragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
                    dragging = true;
                    badge.classList.add('mc-dragging');
                }

                if (dragging) {
                    const next = clampBadgePosition(badgeX + dx, badgeY + dy);
                    badge.style.left = next.x + 'px';
                    badge.style.top = next.y + 'px';
                }
            };

            const onUp = (ue) => {
                ue.stopPropagation();
                if (dragging) {
                    const endTouch = ue.changedTouches && ue.changedTouches[0];
                    const cx = endTouch ? endTouch.clientX : ue.clientX;
                    const cy = endTouch ? endTouch.clientY : ue.clientY;
                    const safeX = Number.isFinite(cx) ? cx : lastDragX;
                    const safeY = Number.isFinite(cy) ? cy : lastDragY;
                    const finalPos = clampBadgePosition(
                        badgeX + (safeX - dragStartX),
                        badgeY + (safeY - dragStartY)
                    );
                    badgeX = finalPos.x;
                    badgeY = finalPos.y;
                    badge.style.left = badgeX + 'px';
                    badge.style.top = badgeY + 'px';
                }
                // Always clear drag visual state
                badge.classList.remove('mc-dragging');
                dragging = false;

                if (e.pointerId && badge.releasePointerCapture) {
                    badge.releasePointerCapture(e.pointerId);
                }

                const passiveFalse = { capture: true, passive: false };
                ['mousemove', 'pointermove', 'touchmove'].forEach(evt => document.removeEventListener(evt, onMove, passiveFalse));
                ['mouseup', 'pointerup', 'pointercancel', 'touchend', 'touchcancel'].forEach(evt => document.removeEventListener(evt, onUp, passiveFalse));
            };

            const passiveFalse = { capture: true, passive: false };
            ['mousemove', 'pointermove', 'touchmove'].forEach(evt => document.addEventListener(evt, onMove, passiveFalse));
            ['mouseup', 'pointerup', 'pointercancel', 'touchend', 'touchcancel'].forEach(evt => document.addEventListener(evt, onUp, passiveFalse));
        }

        const canStartDragFromTarget = (target) => {
            if (!target || !target.closest) return true;
            return !target.closest('.mc-sbtn') && !target.closest('.mc-vslider') && !target.closest('.mc-eye-pop') && !target.closest('.mc-zone-reset');
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
        window.addEventListener('resize', () => {
            if (!manuallyMoved) anchorBadgeToTopCenter();
        });

        badge.addEventListener('pointerdown', (e) => {
            // Only handle primary button or touch
            if (e.pointerType === 'mouse' && e.button !== 0) return;

            const t = e.target;
            if (!canStartDragFromTarget(t)) return;

            e.stopPropagation();
            if (badge.setPointerCapture) badge.setPointerCapture(e.pointerId);
            startDrag(e.clientX, e.clientY, e);
        });

        // Use fallback for non-pointer browsers if needed, but pointer is standard in Chrome
        badge.addEventListener('touchstart', (e) => {
            const t = e.target;
            if (!canStartDragFromTarget(t)) return;
            // startDrag called here will still work if browser doesn't trigger pointerdown
        }, { passive: true });


        // ── Prevent video player interaction ──
        ['mousedown', 'click', 'dblclick', 'mouseup', 'pointerdown', 'pointerup', 'pointermove', 'mousemove', 'contextmenu', 'wheel',
            'dragstart', 'drag', 'drop', 'touchstart', 'touchmove', 'keydown', 'keyup', 'keypress'
        ].forEach(evt => badge.addEventListener(evt, (e) => e.stopPropagation(), false)); // false = bubble phase
        badge.addEventListener('dragstart', (e) => { e.preventDefault(); e.stopPropagation(); }, false);

        // Position and insert — retry a few times to handle Facebook's lazy container rendering.
        // Facebook Reels can add the <video> before its player wrapper is positioned/sized,
        // so the first positionOverlay call may attach to a still-unstyled parent.
        let attachAttempts = 0;
        const tryAttach = () => {
            positionOverlay(video, host);
            attachAttempts++;
            // Check if we actually got inserted into a valid container
            const inDom = document.contains(host);
            if (!inDom && attachAttempts < 4) {
                setTimeout(tryAttach, 200);
            } else if (inDom) {
                // Trigger a re-center after the layout has settled
                setTimeout(anchorBadgeToTopCenter, 50);
            }
        };
        tryAttach();
        state.overlays.set(video, { host, syncDisplay });
    }

    function positionOverlay(video, host) {
        const isFixed = host.dataset.mcFixed === '1';

        if (isFixed) {
            // ── Fixed mode: attach to body and track the video's screen rect ──
            // This breaks out of any stacking context the site may create,
            // which is required for TikTok Live whose UI layers block normal z-index.
            document.body.appendChild(host);
            syncFixedHostToVideo(video, host);

            // Support Fullscreen: if video's parent goes fullscreen, we must reparent
            // the host to the fullscreen element, otherwise document.body's children are hidden.
            const adjustFullscreenParent = () => {
                const fsNode = document.fullscreenElement || document.webkitFullscreenElement;
                if (fsNode && host.parentElement !== fsNode) {
                    fsNode.appendChild(host);
                } else if (!fsNode && host.parentElement !== document.body) {
                    document.body.appendChild(host);
                }
            };
            document.addEventListener('fullscreenchange', adjustFullscreenParent);
            document.addEventListener('webkitfullscreenchange', adjustFullscreenParent);

            // Keep position in sync with video rect when the page changes
            const updatePos = () => syncFixedHostToVideo(video, host);
            window.addEventListener('scroll', updatePos, { passive: true, capture: true });
            window.addEventListener('resize', updatePos, { passive: true });

            if (typeof ResizeObserver !== 'undefined') {
                const ro = new ResizeObserver(updatePos);
                ro.observe(video);
                // Disconnect when host is removed from DOM
                const mo = new MutationObserver(() => {
                    if (!document.contains(host)) { ro.disconnect(); mo.disconnect(); }
                });
                mo.observe(document.body, { childList: true, subtree: false });
            }
        } else {
            // ── Absolute mode: classic container-relative positioning (YouTube, FB, etc.) ──
            let container = video.closest('.html5-video-player, .ytp-player-content, .x1n2onr6, ._video_wrapper, .video-container, ytd-reel-video-renderer, .bpx-player-video-area, shreddit-player, shreddit-post');

            if (!container) {
                let curr = video.parentElement;
                for (let i = 0; i < 4 && curr && curr !== document.body; i++) {
                    const style = getComputedStyle(curr);
                    if (style.position !== 'static') {
                        container = curr;
                        break;
                    }
                    curr = curr.parentElement;
                }
            }

            const player = container || video.parentElement;
            if (!player) return;

            const playerStyle = getComputedStyle(player);
            if (playerStyle.position === 'static') {
                player.style.position = 'relative';
            }

            // host is position:absolute; 100%x100% — fill the player container
            host.style.width = '100%';
            host.style.height = '100%';
            player.appendChild(host);
        }
    }

    function syncFixedHostToVideo(video, host) {
        const r = video.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(video);

        // Hide overlay if the video is no longer visible (e.g. background video when theater mode opens)
        if (r.width === 0 || r.height === 0 || 
            computedStyle.visibility === 'hidden' || 
            computedStyle.display === 'none' ||
            computedStyle.opacity === '0') {
            host.style.display = 'none';
            return;
        }

        host.style.display = ''; // Restore display
        host.style.left = r.left + 'px';
        host.style.top = r.top + 'px';
        host.style.width = r.width + 'px';
        host.style.height = r.height + 'px';
    }

    // Recursively collect all video/audio elements, including those nested inside Shadow DOMs.
    // Reddit (shreddit-player) and other custom elements use Shadow DOM to host video tags.
    function deepQueryMediaAll(root) {
        const results = [];
        const walk = (node) => {
            if (!node) return;
            // Check the node itself
            if (node.nodeName === 'VIDEO' || node.nodeName === 'AUDIO') {
                results.push(node);
            }
            // Descend into shadow root if present
            if (node.shadowRoot) {
                walk(node.shadowRoot);
            }
            // Walk children
            const children = node.children || node.querySelectorAll('*') || [];
            for (let i = 0; i < children.length; i++) {
                walk(children[i]);
            }
        };
        // Use querySelectorAll for speed on the main document, then shadow-pierce for custom elements
        const flatList = root.querySelectorAll ? Array.from(root.querySelectorAll('video, audio')) : [];
        flatList.forEach(el => results.push(el));
        // Also deep-walk to pierce Shadow DOMs not reachable by querySelectorAll
        const allElements = root.querySelectorAll ? Array.from(root.querySelectorAll('*')) : [];
        allElements.forEach(el => {
            if (el.shadowRoot) {
                const inner = el.shadowRoot.querySelectorAll('video, audio');
                inner.forEach(m => { if (!results.includes(m)) results.push(m); });
                // Double-depth: custom elements inside shadow roots that also have shadow roots
                el.shadowRoot.querySelectorAll('*').forEach(innerEl => {
                    if (innerEl.shadowRoot) {
                        innerEl.shadowRoot.querySelectorAll('video, audio').forEach(m => {
                            if (!results.includes(m)) results.push(m);
                        });
                    }
                });
            }
        });
        return results;
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
            deepQueryMediaAll(document).forEach(media => {
                media.volume = Math.min(1.0, state.currentVolume);
            });
        }

        syncAllOverlays();
    }

    function applySpeed() {
        deepQueryMediaAll(document).forEach(media => {
            media.playbackRate = state.currentSpeed;
        });

        syncAllOverlays();
    }

    function syncAllOverlays() {
        deepQueryMediaAll(document).forEach(media => {
            if (media.tagName !== 'VIDEO') return;
            const overlay = state.overlays.get(media);
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
        // --- Global cleanup for orphaned overlays ---
        // If a video element is completely removed from the DOM, its overlay host
        // might remain in the body (especially in fixed mode). We must clean them up.
        document.querySelectorAll('.__mc-overlay-host').forEach(host => {
            if (host.__mcVideo && !document.contains(host.__mcVideo)) {
                try { host.remove(); } catch (e) {}
            }
        });

        deepQueryMediaAll(document).forEach(media => {
            // --- Stale overlay recovery ---
            // Facebook Reels recycles video elements: the same <video> DOM node gets
            // reused with a new src and a new surrounding container. When that happens
            // the old overlay host is still tracked in state.overlays but its parent
            // element has been detached. Detect this and clear the stale record so a
            // fresh overlay is created for the new container.
            if (hookedMedia.has(media) && media.tagName === 'VIDEO') {
                const existing = state.overlays.get(media);
                if (existing) {
                    const h = existing.host;
                    const stale = !document.contains(h) || !h.parentElement;
                    if (stale) {
                        // Remove the orphaned host from DOM if it somehow still exists
                        try { h.parentElement && h.parentElement.removeChild(h); } catch (_) { }
                        state.overlays.delete(media);
                        hookedMedia.delete(media); // allow re-hooking
                    }
                }
            }

            // Prevent duplicate listeners by tracking object reference directly (handles cloned DOM nodes)
            if (hookedMedia.has(media)) return;
            hookedMedia.add(media);

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
            applySpeed();
            sendResponse({ success: true });
        } else if (message.action === 'getState') {
            sendResponse({
                volume: Math.round(state.currentVolume * 100),
                speed: Math.round(state.currentSpeed * SPEED_SCALE)
            });
        }
        return true;
    });

    // Custom elements that use Shadow DOM for their video player (e.g. Reddit's shreddit-player).
    // We watch for these being added to the DOM, then observe their shadow root too.
    const SHADOW_HOST_TAGS = new Set(['SHREDDIT-PLAYER', 'SHREDDIT-POST', 'SHREDDIT-ASYNC-LOADER']);

    // Attach a MutationObserver to a shadow root so we pick up videos added inside it.
    const observedShadowRoots = new WeakSet();
    function observeShadowRoot(shadowRoot) {
        if (!shadowRoot || observedShadowRoots.has(shadowRoot)) return;
        observedShadowRoots.add(shadowRoot);
        const shadowObs = new MutationObserver((mutations) => {
            let shouldHook = false;
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeName === 'VIDEO' || node.nodeName === 'AUDIO') {
                        shouldHook = true; break;
                    }
                    if (node.querySelectorAll && node.querySelectorAll('video, audio').length > 0) {
                        shouldHook = true; break;
                    }
                    if (node.shadowRoot) {
                        observeShadowRoot(node.shadowRoot);
                        shouldHook = true;
                    }
                }
                if (shouldHook) break;
            }
            if (shouldHook) hookMediaElements();
        });
        shadowObs.observe(shadowRoot, { childList: true, subtree: true });
    }

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
                // Watch custom elements that render video inside Shadow DOM (e.g. Reddit)
                if (node.nodeType === 1 && SHADOW_HOST_TAGS.has(node.nodeName)) {
                    // Shadow root may not be attached yet; poll briefly
                    const tryObserveShadow = (attempts) => {
                        if (node.shadowRoot) {
                            observeShadowRoot(node.shadowRoot);
                            hookMediaElements();
                        } else if (attempts > 0) {
                            setTimeout(() => tryObserveShadow(attempts - 1), 80);
                        }
                    };
                    tryObserveShadow(10);
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

    // Observe any shadow roots that already exist on page load (Reddit pre-renders some elements)
    document.querySelectorAll('*').forEach(el => {
        if (el.shadowRoot && SHADOW_HOST_TAGS.has(el.nodeName)) {
            observeShadowRoot(el.shadowRoot);
        }
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

    // ── Safety net: play-event hook + periodic scan ───────────────────────────
    // Facebook (and some other SPAs) add <video> elements asynchronously after
    // document_end, sometimes in timing gaps that MutationObserver misses.
    //
    // 1. Capture-phase 'play' listener — when ANY video plays, re-run hookMediaElements.
    //    This guarantees the playing video gets an overlay even if we missed its insertion.
    document.addEventListener('play', (e) => {
        if (e.target && (e.target.tagName === 'VIDEO' || e.target.tagName === 'AUDIO')) {
            hookMediaElements();
        }
    }, { capture: true, passive: true });

    // 2. Periodic scan for the first 30 seconds after injection (12 × 2.5 s).
    //    Facebook's lazy hydration can delay video insertion well past document_end.
    let periodicScanCount = 0;
    const periodicScan = setInterval(() => {
        hookMediaElements();
        periodicScanCount++;
        if (periodicScanCount >= 12) clearInterval(periodicScan);
    }, 2500);
}
