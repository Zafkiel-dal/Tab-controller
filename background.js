// Clean up storage variables when a tab is actively closed
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.remove([`tab_volume_${tabId}`, `tab_speed_${tabId}`]);
});

// Persist overlay state changes to chrome.storage so popup can read live values
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'persistState' && sender.tab) {
        const tabId = sender.tab.id;
        const data = {};
        if (message.volume !== undefined) {
            data[`tab_volume_${tabId}`] = message.volume;
        }
        if (message.speed !== undefined) {
            data[`tab_speed_${tabId}`] = message.speed;
        }
        chrome.storage.local.set(data);
        sendResponse({ success: true });
    }
    return true;
});
