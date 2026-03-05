let lastBearerToken = null;

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (!details.requestHeaders) return;
    for (const header of details.requestHeaders) {
      if (header.name && header.value && header.name.toLowerCase() === 'authorization') {
        const match = header.value.match(/^Bearer\s+(.+)$/i);
        if (match) {
          lastBearerToken = match[1];
        }
      }
    }
  },
  { urls: ["https://app.turvo.com/*"] },
  ["requestHeaders", "extraHeaders"]
);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'GET_LAST_BEARER') {
    sendResponse({ token: lastBearerToken });
    return true;
  }

  if (message && message.type === 'GET_LAST_SHIPMENT') {
    const { tabId } = message;
    if (!tabId && tabId !== 0) {
      sendResponse({ ok: false, error: 'Missing tabId' });
      return true;
    }
    (async () => {
      try {
        const key = `shipment_${tabId}`;
        const obj = await chrome.storage.session.get(key);
        const cached = obj[key] || null;
        sendResponse({ ok: true, data: cached });
      } catch (error) {
        sendResponse({ ok: false, error: (error && error.message) ? error.message : String(error) });
      }
    })();
    return true;
  }

  if (message && message.type === 'FETCH_SHIPMENT') {
    const { shipmentId, queryTypes, event, tabId, bustTs } = message;
    if (!lastBearerToken || !shipmentId) {
      sendResponse({ ok: false, error: 'Missing token or shipmentId' });
      return true;
    }

    // Build URL: types defaults to ["general","permissions","groups","commissions","bids","topCarriers"]
    const defaultTypes = ["general","permissions","groups","commissions","bids","topCarriers"];
    const types = Array.isArray(queryTypes) && queryTypes.length ? queryTypes : defaultTypes;
    const url = new URL(`https://app.turvo.com/api/shipments/${encodeURIComponent(String(shipmentId))}`);
    url.searchParams.set('types', JSON.stringify(types));
    url.searchParams.set('event', event || 'join');
    if (bustTs) {
      url.searchParams.set('_', String(bustTs));
    }

    (async () => {
      try {
        const resp = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'accept': 'application/json, text/plain, */*',
            'authorization': `Bearer ${lastBearerToken}`,
            'referer': 'https://app.turvo.com/'
          },
          credentials: 'include'
        });

        const contentType = resp.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await resp.json() : await resp.text();
        // Cache per tab in session storage to survive service worker suspension
        try {
          if (tabId || tabId === 0) {
            const key = `shipment_${tabId}`;
            await chrome.storage.session.set({ [key]: { shipmentId, data, ts: Date.now() } });
          }
        } catch (_) {}
        sendResponse({ ok: resp.ok, status: resp.status, data });
      } catch (error) {
        sendResponse({ ok: false, error: (error && error.message) ? error.message : String(error) });
      }
    })();

    return true; // keep message channel open for async sendResponse
  }
});

// Clear cached shipment when the tab navigates (new page load)
try {
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') {
      const key = `shipment_${tabId}`;
      chrome.storage.session.remove(key);
    }
  });
} catch (_) {}


