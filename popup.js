document.addEventListener('DOMContentLoaded', () => {
    // Theme Switch logic
    const themeToggle = document.getElementById('themeToggle');
    const rootElement = document.documentElement;

    // Load Theme preference
    chrome.storage.local.get(['themePref'], (result) => {
        if (result.themePref === 'light') {
            rootElement.setAttribute('data-theme', 'light');
        }
    });

    // Toggle and save theme
    themeToggle.addEventListener('click', () => {
        const currentTheme = rootElement.getAttribute('data-theme');
        let newTheme = 'dark';
        if (!currentTheme || currentTheme === 'dark') {
            newTheme = 'light';
        }
        
        rootElement.setAttribute('data-theme', newTheme);
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

    // Initialize State for current tab
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs.length === 0) return;
        const tabId = tabs[0].id;
        
        chrome.storage.local.get([`tab_volume_${tabId}`, `tab_speed_${tabId}`], (result) => {
            const currentVol = result[`tab_volume_${tabId}`] !== undefined ? result[`tab_volume_${tabId}`] : 100;
            const currentSpeed = result[`tab_speed_${tabId}`] !== undefined ? result[`tab_speed_${tabId}`] : 10;
            
            volSlider.value = currentVol;
            volValueDisplay.textContent = currentVol + '%';
            
            speedSlider.value = currentSpeed;
            speedValueDisplay.textContent = (currentSpeed / 10).toFixed(1) + 'x';
        });

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
