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

    // Save Elements
    const btnSaveTab = document.getElementById('btnSaveTab');
    const btnSaveDomain = document.getElementById('btnSaveDomain');
    const btnSaveGlobal = document.getElementById('btnSaveGlobal');
    const btnClearSave = document.getElementById('btnClearSave');
    const saveStatusBadge = document.getElementById('saveStatusBadge');
    const saveInfo = document.getElementById('saveInfo');

    function getCurrentPreset(tabKey, domainKey, globalKey, callback) {
        chrome.storage.local.get([tabKey, domainKey, globalKey], (result) => {
            if (result[tabKey]) return callback('tab');
            if (result[domainKey]) return callback('domain');
            if (result[globalKey]) return callback('global');
            callback('none');
        });
    }

    function syncActivePreset(mode, tabKey, domainKey, globalKey, volume, speed) {
        if (mode === 'none') return;

        const payload = { volume, speed };
        if (mode === 'tab') {
            chrome.storage.local.set({ [tabKey]: payload });
        } else if (mode === 'domain') {
            chrome.storage.local.set({ [domainKey]: payload });
        } else if (mode === 'global') {
            chrome.storage.local.set({ [globalKey]: payload });
        }
    }

    // Shared communication logic
    function sendToContentScript(action, value, tabId, storageKey, modeKeys) {
        const data = {};
        data[storageKey] = value;
        chrome.storage.local.set(data);

        if (modeKeys) {
            const currentVolume = parseInt(volSlider.value, 10);
            const currentSpeed = parseInt(speedSlider.value, 10);
            getCurrentPreset(modeKeys.tabKey, modeKeys.domainKey, modeKeys.globalKey, (mode) => {
                syncActivePreset(mode, modeKeys.tabKey, modeKeys.domainKey, modeKeys.globalKey, currentVolume, currentSpeed);
            });
        }

        const convertedValue = action === 'setVolume' ? parseInt(value, 10) / 100 : parseFloat(value) / 100;

        chrome.tabs.sendMessage(tabId, {
            action: action,
            value: convertedValue
        }).catch(err => {
            // First time script injection fallback
            chrome.scripting.executeScript({
                target: { tabId: tabId, allFrames: true },
                files: ['src/content/content.js']
            }).then(() => {
                chrome.tabs.sendMessage(tabId, {
                    action: action,
                    value: convertedValue
                });
            }).catch(e => console.error("Could not inject script: ", e));
        });
    }

    // Trigger UI updates
    function updateVolume(vol, tabId, modeKeys) {
        const volInt = parseInt(vol, 10);
        volSlider.value = volInt;
        volValueDisplay.textContent = volInt + '%';

        // Update Mute button UI
        if (volInt === 0) {
            btnVolMute.classList.add('muted');
            btnVolMute.textContent = 'Muted';
        } else {
            btnVolMute.classList.remove('muted');
            btnVolMute.textContent = 'Mute';
        }

        sendToContentScript('setVolume', volInt, tabId, `tab_volume_${tabId}`, modeKeys);
    }

    function updateSpeed(speedScaled, tabId, modeKeys) {
        const speedInt = parseInt(speedScaled, 10);
        speedSlider.value = speedInt;
        const actualSpeed = (speedInt / 100).toFixed(2);
        speedValueDisplay.textContent = actualSpeed + 'x';
        sendToContentScript('setSpeed', speedInt, tabId, `tab_speed_${tabId}`, modeKeys);
    }

    // Apply values to UI
    function applyToUI(vol, speed) {
        const volInt = parseInt(vol, 10);
        volSlider.value = volInt;
        volValueDisplay.textContent = volInt + '%';

        if (volInt === 0) {
            btnVolMute.classList.add('muted');
            btnVolMute.textContent = 'Muted';
        } else {
            btnVolMute.classList.remove('muted');
            btnVolMute.textContent = 'Mute';
        }

        const speedInt = parseInt(speed, 10);
        speedSlider.value = speedInt;
        speedValueDisplay.textContent = (speedInt / 100).toFixed(2) + 'x';
    }

    // Initialize State for current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) return;
        const activeTab = tabs[0];
        const tabId = activeTab.id;

        let domain = '';
        try {
            if (activeTab.url) {
                domain = new URL(activeTab.url).hostname;
            }
        } catch (e) { }

        const tabKey = `saved_tab_${tabId}`;
        const domainKey = `saved_domain_${domain}`;
        const globalKey = 'saved_global';
        const modeKeys = { tabKey, domainKey, globalKey };

        // 1. Load contextually: Check if we have a saved state for this tab/domain/global
        function loadContext() {
            chrome.storage.local.get([tabKey, domainKey, globalKey], (result) => {
                let vol = 100;
                let speed = 100;

                if (result[tabKey]) {
                    vol = result[tabKey].volume;
                    speed = result[tabKey].speed;
                } else if (domain && result[domainKey]) {
                    vol = result[domainKey].volume;
                    speed = result[domainKey].speed;
                } else if (result[globalKey]) {
                    vol = result[globalKey].volume;
                    speed = result[globalKey].speed;
                }

                applyToUI(vol, speed);
                updateSaveUI();
            });
        }

        // Try to get live state from content script first
        chrome.tabs.sendMessage(tabId, { action: 'getState' })
            .then((response) => {
                if (response && response.volume !== undefined) {
                    applyToUI(response.volume, response.speed);
                    updateSaveUI();
                } else {
                    loadContext();
                }
            })
            .catch(() => loadContext());

        // Live sync: Listen for updates from the Overlay
        chrome.runtime.onMessage.addListener((message) => {
            if (message.action === 'persistState') {
                applyToUI(message.volume, message.speed);
            }
        });

        // Event Listeners
        volSlider.addEventListener('input', (e) => updateVolume(e.target.value, tabId, modeKeys));
        btnVolReset.addEventListener('click', () => updateVolume(100, tabId, modeKeys));
        btnVolMute.addEventListener('click', () => {
            const currentVol = parseInt(volSlider.value, 10);
            updateVolume(currentVol === 0 ? 100 : 0, tabId, modeKeys);
        });

        speedSlider.addEventListener('input', (e) => updateSpeed(e.target.value, tabId, modeKeys));
        btnSpeedReset.addEventListener('click', () => updateSpeed(100, tabId, modeKeys));
        btnSpeedFast.addEventListener('click', () => updateSpeed(200, tabId, modeKeys));

        function updateSaveUI() {
            chrome.storage.local.get([tabKey, domainKey, globalKey], (result) => {
                [btnSaveTab, btnSaveDomain, btnSaveGlobal].forEach(btn => btn.classList.remove('active'));

                if (result[tabKey]) {
                    saveStatusBadge.textContent = 'TAB SAVED';
                    saveStatusBadge.className = 'save-badge save-badge--tab';
                    saveInfo.textContent = 'Locked settings to this specific tab.';
                    btnSaveTab.classList.add('active');
                } else if (domain && result[domainKey]) {
                    saveStatusBadge.textContent = 'DOMAIN SAVED';
                    saveStatusBadge.className = 'save-badge save-badge--domain';
                    saveInfo.textContent = `Locked for all ${domain} pages.`;
                    btnSaveDomain.classList.add('active');
                } else {
                    saveStatusBadge.textContent = 'DEFAULT';
                    saveStatusBadge.className = 'save-badge save-badge--global';
                    saveInfo.textContent = 'Settings reset to 1.0x for new videos.';
                    btnSaveGlobal.classList.add('active');
                }
            });
        }

        btnSaveTab.addEventListener('click', () => {
            const payload = { [tabKey]: { volume: parseInt(volSlider.value, 10), speed: parseInt(speedSlider.value, 10) } };
            chrome.storage.local.remove([domainKey, globalKey], () => {
                chrome.storage.local.set(payload, updateSaveUI);
            });
        });

        btnSaveDomain.addEventListener('click', () => {
            if (!domain) return;
            const payload = { [domainKey]: { volume: parseInt(volSlider.value, 10), speed: parseInt(speedSlider.value, 10) } };
            chrome.storage.local.remove([tabKey, globalKey], () => {
                chrome.storage.local.set(payload, updateSaveUI);
            });
        });

        btnSaveGlobal.addEventListener('click', () => {
            chrome.storage.local.remove([tabKey, domainKey, globalKey], updateSaveUI);
        });
    });
});
