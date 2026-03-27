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
            state.gainNode.connect(state.audioContext.destination);
        }
        return true;
    }

    function applyStateToElement(media) {
        // Apply Volume Boost via Web Audio API if not already connected
        if (!state.mediaSources.has(media)) {
            try {
                if (initAudio()) {
                    const source = state.audioContext.createMediaElementSource(media);
                    source.connect(state.gainNode);
                    state.mediaSources.set(media, source);
                }
            } catch (e) {
                // Ignore DOMException for cross-origin elements preventing capture
            }
        }

        // Apply Speed Control natively
        media.playbackRate = state.currentSpeed;
    }

    function hookMediaElements() {
        const elements = document.querySelectorAll('video, audio');
        elements.forEach(media => {
            applyStateToElement(media);
        });
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'setVolume') {
            state.currentVolume = message.value;
            hookMediaElements();

            if (state.gainNode) {
                // Smoothly transition volume to avoid popping sounds
                state.gainNode.gain.setTargetAtTime(
                    state.currentVolume,
                    state.audioContext.currentTime,
                    0.05
                );
            } else {
                // Fallback approach if AudioContext is strictly unavailable
                const elements = document.querySelectorAll('video, audio');
                elements.forEach(media => {
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

    // Check for any new media elements recursively added to the DOM dynamically over time
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
}
