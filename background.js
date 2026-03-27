// Clean up storage variables when a tab is actively closed
chrome.tabs.onRemoved.addListener((tabId) => {
    chrome.storage.local.remove([`tab_volume_${tabId}`, `tab_speed_${tabId}`]);
});
