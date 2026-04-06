document.addEventListener('DOMContentLoaded', () => {
    // Theme Switch logic
    const themeToggle = document.getElementById('themeToggle');
    const rootElement = document.documentElement;

    // Load Theme preference
    chrome.storage.local.get(['themePref'], (result) => {
        if (result.themePref === 'light') {
            rootElement.setAttribute('data-theme', 'light');
            themeToggle.checked = false;
        } else {
            themeToggle.checked = true;
        }
    });

    // Toggle and save theme
    themeToggle.addEventListener('change', (e) => {
        const newTheme = e.target.checked ? 'dark' : 'light';
        if (newTheme === 'light') {
            rootElement.setAttribute('data-theme', 'light');
        } else {
            rootElement.removeAttribute('data-theme');
        }
        chrome.storage.local.set({ themePref: newTheme });
    });

    // Volume Elements
    const volSlider = document.getElementById('volumeSlider');
    const volValueDisplay = document.getElementById('volumeValue');
    const btnVolReset = document.getElementById('btnVolReset');
    const btnVolMute = document.getElementById('btnVolMute');

    // Speed Elements
    const speedSlider = document.getElementById('speedSlider');
    const speedValueDisplay = document.getElementById('speedValue');
    const btnSpeedReset = document.getElementById('btnSpeedReset');
    const btnSpeedFast = document.getElementById('btnSpeedFast');

    // Shared communication logic
    function sendToContentScript(action, value, tabId, storageKey) {
        const data = {};
        data[storageKey] = value;
        chrome.storage.local.set(data);

        const convertedValue = action === 'setVolume' ? parseInt(value, 10) / 100 : parseFloat(value) / 10;

        chrome.tabs.sendMessage(tabId, {
            action: action,
            value: convertedValue
        }).catch(err => {
            // First time script injection fallback
            chrome.scripting.executeScript({
                target: { tabId: tabId, allFrames: true },
                files: ['content.js']
            }).then(() => {
                chrome.tabs.sendMessage(tabId, {
                    action: action,
                    value: convertedValue
                });
            }).catch(e => console.error("Could not inject script: ", e));
        });
    }

    // Trigger UI updates
    function updateVolume(vol, tabId) {
        volSlider.value = vol;
        volValueDisplay.textContent = vol + '%';
        sendToContentScript('setVolume', vol, tabId, `tab_volume_${tabId}`);
    }

    function updateSpeed(speedScaled, tabId) {
        speedSlider.value = speedScaled;
        const actualSpeed = (speedScaled / 10).toFixed(1);
        speedValueDisplay.textContent = actualSpeed + 'x';
        sendToContentScript('setSpeed', speedScaled, tabId, `tab_speed_${tabId}`);
    }

    // Apply values to UI
    function applyToUI(vol, speed) {
        volSlider.value = vol;
        volValueDisplay.textContent = vol + '%';
        speedSlider.value = speed;
        speedValueDisplay.textContent = (speed / 10).toFixed(1) + 'x';
    }

    // Initialize State for current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const tabId = tabs[0].id;

        // Try to get live state from content script first, fall back to storage
        chrome.tabs.sendMessage(tabId, { action: 'getState' })
            .then((response) => {
                if (response && response.volume !== undefined) {
                    applyToUI(response.volume, response.speed);
                    // Also update storage to keep in sync
                    chrome.storage.local.set({
                        [`tab_volume_${tabId}`]: response.volume,
                        [`tab_speed_${tabId}`]: response.speed
                    });
                } else {
                    // Fallback to storage
                    loadFromStorage(tabId);
                }
            })
            .catch(() => {
                // Content script not available, fallback to storage
                loadFromStorage(tabId);
            });

        function loadFromStorage(tid) {
            chrome.storage.local.get([`tab_volume_${tid}`, `tab_speed_${tid}`], (result) => {
                const currentVol = result[`tab_volume_${tid}`] !== undefined ? result[`tab_volume_${tid}`] : 100;
                const currentSpeed = result[`tab_speed_${tid}`] !== undefined ? result[`tab_speed_${tid}`] : 10;
                applyToUI(currentVol, currentSpeed);
            });
        }

        // Event Listeners for Volume
        volSlider.addEventListener('input', (e) => updateVolume(e.target.value, tabId));
        btnVolReset.addEventListener('click', () => updateVolume(100, tabId));
        btnVolMute.addEventListener('click', () => updateVolume(0, tabId));

        // Event Listeners for Speed
        speedSlider.addEventListener('input', (e) => updateSpeed(e.target.value, tabId));
        btnSpeedReset.addEventListener('click', () => updateSpeed(10, tabId)); // 10 -> 1.0x
        btnSpeedFast.addEventListener('click', () => updateSpeed(20, tabId)); // 20 -> 2.0x
    });
});
