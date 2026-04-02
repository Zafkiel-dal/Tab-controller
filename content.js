// Ensure we don't inject multiple times per frame
if (typeof window.__mediaControllerInjected === 'undefined') {
    window.__mediaControllerInjected = true;

    // We store references to avoid garbage collection and re-creating nodes
    const state = {
        audioContext: null,
        gainNode: null,
        mediaSources: new WeakMap(),
        currentVolume: 1.0,
        currentSpeed: 1.0
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
            sendResponse({ success: true });
        } else if (message.action === 'setSpeed') {
            state.currentSpeed = message.value;
            hookMediaElements();
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
