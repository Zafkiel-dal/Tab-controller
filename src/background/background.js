// Clean up storage variables when a tab is actively closed
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.remove([
        `tab_volume_${tabId}`,
        `tab_speed_${tabId}`,
        `saved_tab_${tabId}`
    ]);
});

// Handle requests from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'persistState' && sender.tab) {
        const tabId = sender.tab.id;
        let domain = '';
        try {
            if (sender.tab.url) domain = new URL(sender.tab.url).hostname;
        } catch (e) { }

        const data = {};
        if (message.volume !== undefined) data[`tab_volume_${tabId}`] = message.volume;
        if (message.speed !== undefined) data[`tab_speed_${tabId}`] = message.speed;

        const tabKey = `saved_tab_${tabId}`;
        const domainKey = `saved_domain_${domain}`;
        const globalKey = 'saved_global';

        chrome.storage.local.set(data, () => {
            chrome.storage.local.get([tabKey, domainKey, globalKey], (result) => {
                const payload = {
                    volume: message.volume !== undefined ? message.volume : 100,
                    speed: message.speed !== undefined ? message.speed : 100
                };

                if (result[tabKey]) {
                    chrome.storage.local.set({ [tabKey]: payload });
                } else if (domain && result[domainKey]) {
                    chrome.storage.local.set({ [domainKey]: payload });
                } else if (result[globalKey]) {
                    chrome.storage.local.set({ [globalKey]: payload });
                }
                sendResponse({ success: true });
            });
        });
        return true;
    }

    if (message.action === 'requestInitialState' && sender.tab) {
        const tabId = sender.tab.id;
        let domain = message.domain || '';
        try {
            if (!domain && sender.tab.url) domain = new URL(sender.tab.url).hostname;
        } catch (e) { }

        const liveVolKey = `tab_volume_${tabId}`;
        const liveSpeedKey = `tab_speed_${tabId}`;
        const tabKey = `saved_tab_${tabId}`;
        const domainKey = `saved_domain_${domain}`;
        const globalKey = 'saved_global';

        chrome.storage.local.get([liveVolKey, liveSpeedKey, tabKey, domainKey, globalKey], (result) => {
            const hasTabPreset = !!result[tabKey];
            const hasDomainPreset = !!(domain && result[domainKey]);
            const hasGlobalPreset = !!result[globalKey];
            const hasActivePreset = hasTabPreset || hasDomainPreset || hasGlobalPreset;

            if (!hasActivePreset) {
                // Default mode: always reset to baseline and clear per-tab temporary state.
                chrome.storage.local.remove([liveVolKey, liveSpeedKey], () => {
                    sendResponse({ volume: 100, speed: 100 });
                });
            } else if (result[liveVolKey] !== undefined && result[liveSpeedKey] !== undefined) {
                sendResponse({ volume: result[liveVolKey], speed: result[liveSpeedKey] });
            } else if (result[tabKey]) {
                sendResponse(result[tabKey]);
            } else if (domain && result[domainKey]) {
                sendResponse(result[domainKey]);
            } else if (result[globalKey]) {
                sendResponse(result[globalKey]);
            } else {
                // Safety fallback: reset to baseline.
                sendResponse({ volume: 100, speed: 100 });
            }
        });
        return true; // Keep channel open for async response
    }
});
