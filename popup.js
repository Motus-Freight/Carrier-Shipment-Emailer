// Query the active tab in the current window and render its URL
async function renderActiveTabUrl() {
  const urlElement = document.getElementById('url');
  const validationElement = document.getElementById('validation');
  if (!urlElement) {
    return;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      urlElement.textContent = tab.url;
      validateShipmentsUrl(tab.url, validationElement);
    } else {
      urlElement.textContent = 'Unable to determine URL.';
      if (validationElement) {
        validationElement.textContent = 'Not a shipments page';
        validationElement.className = 'bad';
      }
    }
  } catch (error) {
    urlElement.textContent = 'Error: ' + (error && error.message ? error.message : String(error));
    if (validationElement) {
      validationElement.textContent = 'Error while checking URL';
      validationElement.className = 'bad';
    }
  }
}

function validateShipmentsUrl(rawUrl, validationElement) {
  if (!validationElement) return;

  let pathToCheck = '';
  try {
    const u = new URL(rawUrl);
    // Prefer hash path if present (e.g., "#/.../shipments/12345/details")
    if (u.hash) {
      pathToCheck = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
    } else {
      pathToCheck = u.pathname;
    }
  } catch (_) {
    // Fallback: try simple parsing if URL constructor fails
    const hashIndex = rawUrl.indexOf('#');
    pathToCheck = hashIndex >= 0 ? rawUrl.slice(hashIndex + 1) : rawUrl;
  }

  // Normalize leading slash for consistency
  if (pathToCheck && pathToCheck[0] !== '/') {
    pathToCheck = '/' + pathToCheck;
  }

  // Match "/shipments/<digits>" anywhere in the path/hash
  const match = pathToCheck.match(/(^|\/)shipments\/(\d+)(\/|$)/);
  if (match) {
    const shipmentId = match[2];
    validationElement.textContent = `Valid shipments URL (ID: ${shipmentId})`;
    validationElement.className = 'ok';
    const urlEl = document.getElementById('url');
    if (urlEl) urlEl.className = 'ok';
    return shipmentId;
  } else {
    validationElement.textContent = 'Not a shipments page';
    validationElement.className = 'bad';
    const urlEl = document.getElementById('url');
    if (urlEl) urlEl.className = 'bad';
  }
}

document.addEventListener('DOMContentLoaded', renderActiveTabUrl);


// --- Bearer token retrieval from background ---
function getLastBearerFromBackground() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'GET_LAST_BEARER' }, (resp) => {
        resolve((resp && resp.token) ? resp.token : null);
      });
    } catch (_) {
      resolve(null);
    }
  });
}

async function renderBearerToken() {
  const tokenSpan = document.getElementById('token-value');
  const copyBtn = document.getElementById('copy-token');
  const generateEmailBtn = document.getElementById('generate-email');
  const emailText = document.getElementById('email-text');
  const downloadBtn = document.getElementById('download-json');
  if (!tokenSpan) return;

  const token = await getLastBearerFromBackground();
  if (token) {
    tokenSpan.textContent = token;
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(token);
          copyBtn.textContent = 'Copied!';
          setTimeout(() => (copyBtn.textContent = 'Copy token'), 1200);
        } catch (_) {}
      };
    }
  } else {
    tokenSpan.textContent = 'Not captured';
    if (copyBtn) copyBtn.onclick = null;
  }

  // If we have both a token and a shipment ID, ask background to fetch JSON
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const shipmentId = validateShipmentsUrl(tab.url, document.getElementById('validation'));
      const downloadShipmentListBtn = document.getElementById('download-shipment-list');
      if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.onclick = null;
      }
      if (downloadShipmentListBtn) {
        downloadShipmentListBtn.disabled = true;
        downloadShipmentListBtn.onclick = null;
      }
      if (shipmentId && token) {
        // Try to use cached data first for this tab
        chrome.runtime.sendMessage({ type: 'GET_LAST_SHIPMENT', tabId: tab.id }, (cached) => {
          if (cached && cached.ok && cached.data && cached.data.data) {
            try { renderSummary(cached.data.data); } catch (_) {}
            if (downloadBtn) {
              try {
                const content = typeof cached.data.data === 'string' ? cached.data.data : JSON.stringify(cached.data.data, null, 2);
                const filename = `${shipmentId}.json`;
                downloadBtn.disabled = false;
                downloadBtn.onclick = () => {
                  try {
                    const blob = new Blob([content], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 2000);
                  } catch (_) {}
                };
              } catch (_) {}
            }
            // Enable shipment list download if we have custom_id
            if (downloadShipmentListBtn && typeof fetchAndDownloadShipmentList === 'function') {
              const customId = cached.data.data?.details?.custom_id;
              if (customId && token) {
                downloadShipmentListBtn.disabled = false;
                downloadShipmentListBtn.onclick = async () => {
                  try {
                    downloadShipmentListBtn.textContent = 'Downloading...';
                    downloadShipmentListBtn.disabled = true;
                    await fetchAndDownloadShipmentList(token, cached.data.data);
                    downloadShipmentListBtn.textContent = 'Downloaded!';
                    setTimeout(() => {
                      downloadShipmentListBtn.textContent = 'Download Shipment List';
                      downloadShipmentListBtn.disabled = false;
                    }, 2000);
                  } catch (error) {
                    console.error('Download shipment list failed:', error);
                    downloadShipmentListBtn.textContent = 'Error!';
                    setTimeout(() => {
                      downloadShipmentListBtn.textContent = 'Download Shipment List';
                      downloadShipmentListBtn.disabled = false;
                    }, 2000);
                  }
                };
              }
            }
          }
        });
        chrome.runtime.sendMessage({
          type: 'FETCH_SHIPMENT',
          shipmentId,
          queryTypes: ["general","permissions","groups","commissions","bids","topCarriers"],
          event: 'join',
          tabId: tab.id
        }, (resp) => {
          if (resp && resp.ok) {
            try {
              renderSummary(resp.data);
            } catch (_) {}
            if (downloadBtn) {
              try {
                const content = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data, null, 2);
                const filename = `${shipmentId}.json`;
                downloadBtn.disabled = false;
                downloadBtn.onclick = () => {
                  try {
                    const blob = new Blob([content], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    setTimeout(() => URL.revokeObjectURL(url), 2000);
                  } catch (_) {}
                };
              } catch (_) {}
            }
            // Enable shipment list download if we have custom_id
            if (downloadShipmentListBtn && typeof fetchAndDownloadShipmentList === 'function') {
              const customId = resp.data?.details?.custom_id;
              if (customId && token) {
                downloadShipmentListBtn.disabled = false;
                downloadShipmentListBtn.onclick = async () => {
                  try {
                    downloadShipmentListBtn.textContent = 'Downloading...';
                    downloadShipmentListBtn.disabled = true;
                    await fetchAndDownloadShipmentList(token, resp.data);
                    downloadShipmentListBtn.textContent = 'Downloaded!';
                    setTimeout(() => {
                      downloadShipmentListBtn.textContent = 'Download Shipment List';
                      downloadShipmentListBtn.disabled = false;
                    }, 2000);
                  } catch (error) {
                    console.error('Download shipment list failed:', error);
                    downloadShipmentListBtn.textContent = 'Error!';
                    setTimeout(() => {
                      downloadShipmentListBtn.textContent = 'Download Shipment List';
                      downloadShipmentListBtn.disabled = false;
                    }, 2000);
                  }
                };
              }
            }
          }
        });
      }
    }
  } catch (_) {
    // ignore
  }
}

document.addEventListener('DOMContentLoaded', renderBearerToken);

// Developer mode toggle: show/hide URL, validation, token, and buttons
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('dev-toggle');
  const panel = document.getElementById('dev-panel');
  if (!toggle || !panel) return;

  // Persist preference in storage
  chrome.storage.local.get({ devMode: false }, (res) => {
    const on = !!res.devMode;
    toggle.checked = on;
    panel.classList.toggle('hidden', !on);
  });

  toggle.addEventListener('change', () => {
    const on = !!toggle.checked;
    panel.classList.toggle('hidden', !on);
    chrome.storage.local.set({ devMode: on });
  });
});

// Generate Email based on populated summary fields
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('generate-email');
  const copyBtn = document.getElementById('copy-email');
  const refreshBtn = document.getElementById('refresh-data');
  const out = document.getElementById('email-text');
  if (!btn || !out) return;
  btn.onclick = () => {
    try { renderEmail(); } catch (_) {}
    out.focus();
    out.select();
  };
  
  if (copyBtn && out) {
    copyBtn.onclick = async () => {
      try {
        if (!out.value) {
          // If email is empty, generate it once automatically
          const gen = document.getElementById('generate-email');
          if (gen) gen.click();
        }
        await navigator.clipboard.writeText(out.value);
        copyBtn.textContent = 'Copied!';
        setTimeout(() => (copyBtn.textContent = 'Copy Email'), 1200);
      } catch (_) {}
    };
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async (e) => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url) return;
        if (e && e.shiftKey) {
          try { chrome.tabs.reload(tab.id, { bypassCache: true }); } catch (_) {}
          return;
        }
        const shipmentId = validateShipmentsUrl(tab.url, document.getElementById('validation'));
        const token = await getLastBearerFromBackground();
        if (shipmentId && token) {
          chrome.runtime.sendMessage({
            type: 'FETCH_SHIPMENT',
            shipmentId,
            queryTypes: ["general","permissions","groups","commissions","bids","topCarriers"],
            event: 'join',
            tabId: tab.id,
            bustTs: Date.now()
          }, (resp) => {
            if (resp && resp.ok) {
              try { renderSummary(resp.data); } catch (_) {}
            }
          });
        }
      } catch (_) {}
    });
  }
});

function getText(id) {
  const el = document.getElementById(id);
  return el ? el.textContent || '' : '';
}

function renderEmail() {
  const out = document.getElementById('email-text');
  if (!out) return;
  const shipLocations = (() => {
    const el = document.getElementById('ship-locations');
    if (!el) return '';
    const lines = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = String(node.textContent || '').trim();
        if (t) lines.push(t);
      }
    }
    return lines.join('\n');
  })();
  const weight = getText('weight');
  const weightUnit = getText('weight-unit');
  const commodity = getText('commodity');
  const temperature = getText('temperature');
  const temperatureUnit = getText('temperature-unit');
  const services = getText('services');
  const rate = getText('rate');
  const chks = {
    shipLocations: document.getElementById('chk-ship-locations'),
    weight: document.getElementById('chk-weight'),
    weightUnit: document.getElementById('chk-weight-unit'),
    commodity: document.getElementById('chk-commodity'),
    temperature: document.getElementById('chk-temperature'),
    temperatureUnit: document.getElementById('chk-temperature-unit'),
    services: document.getElementById('chk-services'),
    rate: document.getElementById('chk-rate')
  };
  const lines = [
    'Shipment details can be found below.',
    '',
    ...(chks.shipLocations && chks.shipLocations.checked && shipLocations ? ['Ship Locations:', shipLocations] : []),
    ...(chks.commodity && chks.commodity.checked && commodity ? [`Commodity: ${commodity}`] : []),
    ...(chks.weight && chks.weight.checked && weight ? [`Weight: ${weight}${(chks.weightUnit && chks.weightUnit.checked && weightUnit) ? ` ${weightUnit}` : ''}`] : []),
    ...(chks.temperature && chks.temperature.checked && temperature ? [`Temperature: ${temperature}${(chks.temperatureUnit && chks.temperatureUnit.checked && temperatureUnit) ? ` ${temperatureUnit}` : ''}`] : []),
    ...(chks.services && chks.services.checked && services ? [`Services: ${services}`] : []),
    ...(chks.rate && chks.rate.checked && rate ? [`Rate: ${rate}`] : [])
  ];
  out.value = lines.join('\n');
}

// ---------- Summary rendering ----------
function renderSummary(raw) {
  const data = typeof raw === 'string' ? safeJsonParse(raw) : raw;
  if (!data || typeof data !== 'object') return;

  const shipLocationsSpan = document.getElementById('ship-locations');
  const weightSpan = document.getElementById('weight');
  const weightUnitSpan = document.getElementById('weight-unit');
  const commoditySpan = document.getElementById('commodity');
  const temperatureSpan = document.getElementById('temperature');
  const temperatureUnitSpan = document.getElementById('temperature-unit');
  const servicesSpan = document.getElementById('services');
  const rateSpan = document.getElementById('rate');
  const chk = {
    shipLocations: document.getElementById('chk-ship-locations'),
    weight: document.getElementById('chk-weight'),
    weightUnit: document.getElementById('chk-weight-unit'),
    commodity: document.getElementById('chk-commodity'),
    temperature: document.getElementById('chk-temperature'),
    temperatureUnit: document.getElementById('chk-temperature-unit'),
    services: document.getElementById('chk-services'),
    rate: document.getElementById('chk-rate')
  };

  const details = data.details || {};
  const globalRoute = details.global_route || details.gloabl_route || {};
  const shipLocations = Array.isArray(globalRoute.ship_locations) ? globalRoute.ship_locations : [];
  
  // Filter out inactive locations
  const activeLocations = shipLocations.filter(loc => loc && loc.active !== false);
  
  // Sort locations chronologically by appointment date or date field
  const sortedLocations = activeLocations.slice().sort((a, b) => {
    const getLocationDate = (loc) => {
      if (!loc) return null;
      // Try appointment.date first
      if (loc.appointment && typeof loc.appointment === 'object') {
        const ad = loc.appointment.date;
        if (typeof ad === 'string') return ad;
        if (ad && typeof ad === 'object') return ad.date ?? ad.value ?? '';
      }
      // Fallback to loc.date
      if (loc.date) {
        const d = loc.date;
        if (typeof d === 'string') return d;
        if (d && typeof d === 'object') return d.date ?? d.value ?? d.start ?? d.end ?? '';
      }
      return null;
    };
    
    const dateA = getLocationDate(a);
    const dateB = getLocationDate(b);
    
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    
    const timeA = new Date(dateA).getTime();
    const timeB = new Date(dateB).getTime();
    
    if (isNaN(timeA) && isNaN(timeB)) return 0;
    if (isNaN(timeA)) return 1;
    if (isNaN(timeB)) return -1;
    
    return timeA - timeB;
  });
  
  const locLines = sortedLocations.map((loc) => {
    const t = (loc && loc.type) ? (loc.type.value ?? loc.type.name ?? loc.type) : '';
    const addr = (loc && loc.address) ? loc.address : {};
    const cityObj = addr.city || '';
    const stateObj = addr.state || '';
    const city = (cityObj && typeof cityObj === 'object') ? (cityObj.name ?? '') : (cityObj || '');
    const state = (stateObj && typeof stateObj === 'object') ? (stateObj.name ?? '') : (stateObj || '');
    const apptType = (loc && loc.schedulingType) ? (loc.schedulingType.shortName ?? loc.schedulingType.name ?? loc.schedulingType.value ?? '') : '';
    // Date/Time from loc.date with common fallbacks, formatted as "Mon DD - (HH:MM)"
    let dtFormatted = '';
    // Prefer appointment.date when available; fallback to previous loc.date extraction
    if (loc) {
      let raw = '';
      let flexSeconds = 0;
      const appt = loc.appointment;
      if (appt && typeof appt === 'object') {
        const ad = appt.date;
        if (typeof ad === 'string') {
          raw = ad;
        } else if (ad && typeof ad === 'object') {
          raw = ad.date ?? ad.value ?? '';
        }
        // Extract flex value (seconds until end of FCFS window)
        if (appt.flex != null) {
          flexSeconds = Number(appt.flex) || 0;
        }
      }
      if (!raw && typeof loc.date !== 'undefined') {
        const d = loc.date;
        if (typeof d === 'string') {
          raw = d;
        } else if (d && typeof d === 'object') {
          raw = d.date ?? d.value ?? d.start ?? d.end ?? '';
        } else if (typeof d !== 'undefined' && d !== null) {
          raw = String(d);
        }
      }
      const tz = extractTimeZoneIdFromLocation(loc);
      
      // Only show flex time range for FCFS appointments, not for "Appt" type
      const isApptType = apptType && String(apptType).toLowerCase().includes('appt');
      
      // If we have a flex value and it's NOT an "Appt" type, show start - end range
      if (raw && flexSeconds > 0 && !isApptType) {
        const endDate = new Date(new Date(raw).getTime() + (flexSeconds * 1000));
        const endDateStr = endDate.toISOString();
        
        // Check if start and end are on the same day
        if (isSameDayInZone(raw, endDateStr, tz)) {
          // Same day: "Nov 12 (09:00 - 17:00)"
          const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: tz || undefined });
          const dateStr = dateFmt.format(new Date(raw));
          const startTime = formatTimeOnlyInZone(raw, tz);
          const endTime = formatTimeOnlyInZone(endDateStr, tz);
          dtFormatted = `${dateStr} (${startTime} - ${endTime})`;
        } else {
          // Different days: "Nov 12 (09:00) to Nov 13 (17:00)"
          const startFormatted = formatDateTimeCompactInZone(raw, tz);
          const endFormatted = formatDateTimeCompactInZone(endDateStr, tz);
          dtFormatted = `${startFormatted} to ${endFormatted}`;
        }
      } else {
        // For Appt type or no flex, just show start time
        dtFormatted = formatDateTimeCompactInZone(raw, tz);
      }
    }
    // Build location string with cleaner formatting
    const locationParts = [];
    
    // Type and location: "Pickup: City, State" or "Delivery: City, State"
    if (t) {
      const cityState = [city, state].filter(Boolean).join(', ');
      locationParts.push(cityState ? `${t}: ${cityState}` : t);
    } else if (city || state) {
      locationParts.push([city, state].filter(Boolean).join(', '));
    }
    
    // DateTime
    if (dtFormatted) {
      locationParts.push(dtFormatted);
    }
    
    // Appointment type: (FCFS) or (appt)
    if (apptType) {
      locationParts.push(`(${apptType})`);
    }
    
    return locationParts.join(' | ');
  });
  setMultiline(shipLocationsSpan, locLines);
  setCheckboxDefault(chk.shipLocations, !!locLines.length);

  // Equipment attributes (take the first equipment entry)
  const equipmentList = Array.isArray(details.equipment) ? details.equipment : [];
  const firstEquipment = equipmentList[0] || {};
  const eqAttrs = firstEquipment.attributes || {};

  // Weight: attributes.weight.weight or similar
  let weightVal = '';
  let weightUnitVal = '';
  if (eqAttrs.weight != null) {
    if (typeof eqAttrs.weight === 'object') {
      weightVal = eqAttrs.weight.weight ?? eqAttrs.weight.value ?? '';
      const wu = eqAttrs.weight.units;
      if (wu != null) {
        if (typeof wu === 'string') {
          weightUnitVal = wu;
        } else if (typeof wu === 'object') {
          weightUnitVal = wu.value ?? wu.Value ?? wu.name ?? wu.label ?? '';
        }
      }
    } else {
      weightVal = eqAttrs.weight;
    }
  }
  setText(weightSpan, weightVal);
  setText(weightUnitSpan, weightUnitVal);
  setCheckboxDefault(chk.weight, !!String(weightVal).trim());
  setCheckboxDefault(chk.weightUnit, !!String(weightUnitVal).trim());

  // Commodity: from customer_orders items names
  const ordersForCommodity = Array.isArray(details.customer_orders) ? details.customer_orders : [];
  const itemNames = [];
  for (const ord of ordersForCommodity) {
    const items = Array.isArray(ord.items) ? ord.items : [];
    for (const it of items) {
      if (it && it.name) itemNames.push(String(it.name));
    }
  }
  const commodityVal = itemNames.length ? Array.from(new Set(itemNames)).join(', ') : '';
  setText(commoditySpan, commodityVal);
  setCheckboxDefault(chk.commodity, !!String(commodityVal).trim());

  // Temperature value
  let tempVal = '';
  let tempUnits = '';
  if (eqAttrs.temp != null) {
    if (typeof eqAttrs.temp === 'object') {
      tempVal = eqAttrs.temp.temp ?? eqAttrs.temp.value ?? '';
      const u = eqAttrs.temp.units;
      if (u != null) {
        if (typeof u === 'string') {
          tempUnits = u;
        } else if (typeof u === 'object') {
          tempUnits = u.Value ?? u.value ?? u.name ?? u.label ?? '';
        }
      }
    } else {
      tempVal = eqAttrs.temp;
    }
  }
  setText(temperatureSpan, tempVal);
  setText(temperatureUnitSpan, tempUnits);
  setCheckboxDefault(chk.temperature, !!String(tempVal).trim());
  setCheckboxDefault(chk.temperatureUnit, !!String(tempUnits).trim());
  wireDependentCheckbox(chk.temperature, chk.temperatureUnit);

  // Services: join details.services[*].value
  const servicesList = Array.isArray(details.services) ? details.services : [];
  const servicesJoined = servicesList
    .map(s => (s && (s.value || s.name || s.key || s.id)) ? String(s.value || s.name || s.key || s.id) : '')
    .filter(Boolean)
    .join(', ');
  setText(servicesSpan, servicesJoined);
  setCheckboxDefault(chk.services, !!String(servicesJoined).trim());

  // Rate: details.margin.minCarrierPay
  const margin = details.margin || {};
  setText(rateSpan, (margin.minCarrierPay != null) ? String(margin.minCarrierPay) : '');
  setCheckboxDefault(chk.rate, margin.minCarrierPay != null && String(margin.minCarrierPay).trim() !== '');
  wireDependentCheckbox(chk.weight, chk.weightUnit);
  try { renderEmail(); } catch (_) {}
}

function setText(el, value) {
  if (!el) return;
  el.textContent = value && String(value).trim().length ? String(value) : '—';
}

function setMultiline(el, lines) {
  if (!el) return;
  const safeLines = Array.isArray(lines) ? lines.filter(Boolean).map(s => String(s)) : [];
  if (!safeLines.length) {
    el.textContent = '—';
    return;
  }
  // Use text nodes and <br> to avoid any HTML injection
  while (el.firstChild) el.removeChild(el.firstChild);
  safeLines.forEach((line, idx) => {
    el.appendChild(document.createTextNode(line));
    if (idx < safeLines.length - 1) el.appendChild(document.createElement('br'));
  });
}

function setCheckboxDefault(checkbox, hasValue) {
  if (!checkbox) return;
  checkbox.checked = !!hasValue;
  checkbox.onchange = () => { try { renderEmail(); } catch (_) {} };
}

function wireDependentCheckbox(parent, child) {
  if (!parent || !child) return;
  // Enforce immediately on wire-up
  if (!parent.checked) child.checked = false;
  parent.onchange = () => {
    if (!parent.checked) child.checked = false;
    try { renderEmail(); } catch (_) {}
  };
}

function formatLocation(value) {
  if (typeof value !== 'string') return value;
  // Remove trailing ", US" or ", USA" (case-insensitive, with optional surrounding spaces)
  return value.replace(/\s*,\s*(US|USA)$/i, '');
}

function formatPhone(value) {
  if (typeof value !== 'string') return value;
  let digits = value.replace(/\D+/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }
  return value;
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function formatDateShort(value) {
  if (!value) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const months = ['Jan.', 'Feb.', 'Mar.', 'Apr.', 'May.', 'Jun.', 'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.'];
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function formatDateTimeCompact(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[d.getMonth()];
  const day = d.getDate();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${mon} ${day} - (${hh}:${mm})`;
}

function formatDateTimeCompactInZone(value, timeZoneId) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  try {
    const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: timeZoneId || undefined });
    const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timeZoneId || undefined });
    const dateStr = dateFmt.format(d);
    const timeStr = timeFmt.format(d);
    return `${dateStr} - (${timeStr})`;
  } catch (_) {
    return formatDateTimeCompact(value);
  }
}

function formatTimeOnlyInZone(value, timeZoneId) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  try {
    const timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timeZoneId || undefined });
    return timeFmt.format(d);
  } catch (_) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
}

function isSameDayInZone(date1, date2, timeZoneId) {
  if (!date1 || !date2) return false;
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return false;
  try {
    const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: timeZoneId || undefined });
    return dateFmt.format(d1) === dateFmt.format(d2);
  } catch (_) {
    return d1.toDateString() === d2.toDateString();
  }
}

function extractTimeZoneIdFromLocation(location) {
  if (!location || typeof location !== 'object') return '';
  const addr = location.address || {};
  const candidates = [
    location.timeZone, location.timezone, location.tz,
    addr.timeZone, addr.timezone, addr.time_zone,
    location.date && typeof location.date === 'object' ? (location.date.timeZone || location.date.timezone) : undefined
  ].filter(Boolean);
  for (const tz of candidates) {
    const z = coerceString(tz).trim();
    if (!z) continue;
    const mapped = mapAbbrevToIana(z);
    if (mapped) return mapped;
    return z; // assume it's already an IANA zone
  }
  // Infer by state if present
  const stateObj = addr.state || {};
  const stateNameLike = coerceString(stateObj.abbrev || stateObj.abbr || stateObj.code || stateObj.value || stateObj.name || stateObj);
  const abbr = normalizeUsStateAbbr(stateNameLike);
  if (abbr) {
    const byState = mapUsStateAbbrToIana(abbr);
    if (byState) return byState;
  }
  return '';
}

function coerceString(v) {
  return (v == null) ? '' : String(v);
}

function mapAbbrevToIana(tz) {
  const m = {
    'ET': 'America/New_York', 'EST': 'America/New_York', 'EDT': 'America/New_York',
    'CT': 'America/Chicago', 'CST': 'America/Chicago', 'CDT': 'America/Chicago',
    'MT': 'America/Denver', 'MST': 'America/Denver', 'MDT': 'America/Denver',
    'PT': 'America/Los_Angeles', 'PST': 'America/Los_Angeles', 'PDT': 'America/Los_Angeles',
    'AKST': 'America/Anchorage', 'AKDT': 'America/Anchorage',
    'HST': 'Pacific/Honolulu', 'HAST': 'Pacific/Honolulu', 'HADT': 'Pacific/Honolulu',
    'PHOENIX': 'America/Phoenix', 'ARIZONA': 'America/Phoenix'
  };
  const key = tz.toUpperCase();
  return m[key] || '';
}

function normalizeUsStateAbbr(stateValue) {
  if (!stateValue) return '';
  const s = String(stateValue).trim();
  const upper = s.toUpperCase();
  const abbrs = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC']);
  if (abbrs.has(upper)) return upper;
  const nameToAbbr = {
    'ALABAMA':'AL','ALASKA':'AK','ARIZONA':'AZ','ARKANSAS':'AR','CALIFORNIA':'CA','COLORADO':'CO','CONNECTICUT':'CT','DELAWARE':'DE','FLORIDA':'FL','GEORGIA':'GA','HAWAII':'HI','IDAHO':'ID','ILLINOIS':'IL','INDIANA':'IN','IOWA':'IA','KANSAS':'KS','KENTUCKY':'KY','LOUISIANA':'LA','MAINE':'ME','MARYLAND':'MD','MASSACHUSETTS':'MA','MICHIGAN':'MI','MINNESOTA':'MN','MISSISSIPPI':'MS','MISSOURI':'MO','MONTANA':'MT','NEBRASKA':'NE','NEVADA':'NV','NEW HAMPSHIRE':'NH','NEW JERSEY':'NJ','NEW MEXICO':'NM','NEW YORK':'NY','NORTH CAROLINA':'NC','NORTH DAKOTA':'ND','OHIO':'OH','OKLAHOMA':'OK','OREGON':'OR','PENNSYLVANIA':'PA','RHODE ISLAND':'RI','SOUTH CAROLINA':'SC','SOUTH DAKOTA':'SD','TENNESSEE':'TN','TEXAS':'TX','UTAH':'UT','VERMONT':'VT','VIRGINIA':'VA','WASHINGTON':'WA','WEST VIRGINIA':'WV','WISCONSIN':'WI','WYOMING':'WY','DISTRICT OF COLUMBIA':'DC'
  };
  return nameToAbbr[upper] || '';
}

function mapUsStateAbbrToIana(abbr) {
  const eastern = new Set(['CT','DE','FL','GA','ME','MD','MA','MI','NH','NJ','NY','NC','OH','PA','RI','SC','VT','VA','WV','DC','IN']);
  const central = new Set(['AL','AR','IL','IA','LA','MN','MS','MO','OK','WI','KS','NE','SD','ND','TN','KY','TX']);
  const mountain = new Set(['AZ','CO','ID','MT','NM','UT','WY']);
  const pacific = new Set(['CA','OR','WA','NV']);
  if (eastern.has(abbr)) return 'America/New_York';
  if (central.has(abbr)) return 'America/Chicago';
  if (mountain.has(abbr)) return abbr === 'AZ' ? 'America/Phoenix' : 'America/Denver';
  if (pacific.has(abbr)) return 'America/Los_Angeles';
  if (abbr === 'AK') return 'America/Anchorage';
  if (abbr === 'HI') return 'Pacific/Honolulu';
  return '';
}
