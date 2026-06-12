/**
 * Background Service Worker
 *
 * Retained responsibility:
 * - Open the in-page panel on supported ChatGPT tabs.
 * - Fall back to the guide page when the current tab is unsupported.
 */

const SUPPORTED_DOMAINS = ['chatgpt.com', 'chat.openai.com'];

function isSupportedSite(url) {
    try {
        const hostname = new URL(url).hostname;
        return SUPPORTED_DOMAINS.some(domain => hostname === domain || hostname.endsWith(`.${domain}`));
    } catch {
        return false;
    }
}

chrome.action.onClicked.addListener(async (tab) => {
    if (tab?.url && isSupportedSite(tab.url)) {
        try {
            await chrome.tabs.sendMessage(tab.id, { type: 'OPEN_PANEL_MODAL' });
            return;
        } catch {}
    }

    chrome.tabs.create({ url: chrome.runtime.getURL('popup/guide.html') });
});
