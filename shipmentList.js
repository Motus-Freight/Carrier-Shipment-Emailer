/**
 * Shipment List API Handler
 * Fetches shipment list data from Turvo API using custom_id
 */

/**
 * Fetches shipment list from Turvo API
 * @param {string} bearerToken - The authorization bearer token
 * @param {string} customId - The custom_id to search for
 * @returns {Promise<Object>} The API response data
 */
async function fetchShipmentList(bearerToken, customId) {
  if (!bearerToken || !customId) {
    throw new Error('Missing required parameters: bearerToken or customId');
  }

  // Build the filter object
  const filter = {
    pageSize: 24,
    start: 0,
    criteria: [
      {
        key: "custom_id",
        function: "in",
        values: [customId]
      },
      {
        key: "status.code.id",
        function: "nin",
        values: [100173]
      }
    ],
    sortBy: "lastUpdatedOn",
    sortDirection: "desc"
  };

  // Encode the filter as URL parameter
  const filterParam = encodeURIComponent(JSON.stringify(filter));
  const url = `https://app.turvo.com/api/shipments/list?filter=${filterParam}&extendedAttributes=true&card=allFiltered`;

  // Make the API request
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'accept': 'application/json, text/plain, */*',
      'authorization': `Bearer ${bearerToken}`,
      'referer': 'https://app.turvo.com/'
    },
    credentials: 'include'
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return await response.json();
  } else {
    return await response.text();
  }
}

/**
 * Downloads JSON data as a file
 * @param {Object|string} data - The data to download
 * @param {string} filename - The filename for the download
 */
function downloadJson(data, filename) {
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Main function to fetch and download shipment list
 * @param {string} bearerToken - The authorization bearer token
 * @param {Object} shipmentData - The shipment data containing custom_id
 */
async function fetchAndDownloadShipmentList(bearerToken, shipmentData) {
  try {
    // Extract custom_id from shipment data
    const customId = shipmentData?.details?.custom_id;
    
    if (!customId) {
      throw new Error('custom_id not found in shipment data');
    }

    console.log(`Fetching shipment list for custom_id: ${customId}`);

    // Fetch the shipment list
    const data = await fetchShipmentList(bearerToken, customId);

    // Download the response
    const filename = `shipment-list-${customId}-${Date.now()}.json`;
    downloadJson(data, filename);

    console.log(`Download complete: ${filename}`);
    return { success: true, filename, data };
  } catch (error) {
    console.error('Error fetching shipment list:', error);
    throw error;
  }
}

/**
 * Background script message handler for shipment list fetch
 * Add this to background.js or call from popup.js
 */
function initShipmentListHandler() {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'FETCH_SHIPMENT_LIST') {
      const { bearerToken, customId } = message;
      
      if (!bearerToken || !customId) {
        sendResponse({ ok: false, error: 'Missing bearerToken or customId' });
        return true;
      }

      (async () => {
        try {
          const data = await fetchShipmentList(bearerToken, customId);
          sendResponse({ ok: true, data });
        } catch (error) {
          sendResponse({ 
            ok: false, 
            error: (error && error.message) ? error.message : String(error) 
          });
        }
      })();

      return true; // Keep message channel open for async response
    }
  });
}

// Export functions if using modules, otherwise they're globally available
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    fetchShipmentList,
    downloadJson,
    fetchAndDownloadShipmentList,
    initShipmentListHandler
  };
}

