// API Vault — Background Service Worker

// Update badge when active tab changes
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await updateBadgeForTab(tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    await updateBadgeForTab(tabId);
  }
});

async function updateBadgeForTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || tab.url.startsWith('chrome://')) return;

    const host = new URL(tab.url).hostname;

    // Ask content script if this host matches a provider
    chrome.tabs.sendMessage(tabId, { type: 'GET_HOST' }, async (response) => {
      if (chrome.runtime.lastError || !response) return;

      // Check if vault has keys for this provider
      const stored = await chrome.storage.local.get('apivault_encrypted');
      if (!stored.apivault_encrypted) {
        clearBadge(tabId);
        return;
      }

      // Get session key to count matching keys
      const session = await chrome.storage.session.get('vault_key');
      if (!session.vault_key) {
        clearBadge(tabId);
        return;
      }

      // Signal popup to refresh when needed (badge only shows dot)
      chrome.action.setBadgeText({ text: '●', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#6366f1', tabId });
    });
  } catch { /* ignore */ }
}

function clearBadge(tabId) {
  chrome.action.setBadgeText({ text: '', tabId });
}

// Message relay between popup and content script
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ ok: true });
    return false;
  }

  // Content script asks for vault data (session not accessible from content scripts)
  if (msg.type === 'GET_VAULT_DATA') {
    chrome.storage.session.get('vault_key', (sessionData) => {
      if (chrome.runtime.lastError || !sessionData || !sessionData.vault_key) {
        sendResponse({ locked: true });
        return;
      }
      chrome.storage.local.get('apivault_encrypted', (localData) => {
        sendResponse({
          locked:    false,
          vault_key: sessionData.vault_key,
          encrypted: localData.apivault_encrypted || null
        });
      });
    });
    return true; // keep channel open for async response
  }
});
