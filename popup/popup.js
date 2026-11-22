import { ALLOWED_ORIGIN, CARRIER_IDS } from '../src/shared/constants.js';
import { clearLastResult, loadLastResult, loadSettings } from '../src/shared/storage.js';

const helpBtn = document.getElementById('help-btn');
const helpPopover = document.getElementById('help-popover');
const checkUpdatesBtn = document.getElementById('check-updates-btn');
const openSettingsBtn = document.getElementById('open-settings-btn');
const updateBannerEl = document.getElementById('update-banner');

const presetSelect = document.getElementById('preset-select');
const matchedPresetTag = document.getElementById('matched-preset-tag');
const combineToggle = document.getElementById('combine-toggle');
const singleSizeRow = document.getElementById('single-size-row');
const multiItemsList = document.getElementById('multi-items-list');
const combineSection = document.getElementById('combine-section');

const dimLengthInput = document.getElementById('dim-length');
const dimWidthInput = document.getElementById('dim-width');
const dimHeightInput = document.getElementById('dim-height');
const dimWeightInput = document.getElementById('dim-weight');

const combineLengthInput = document.getElementById('combine-length');
const combineWidthInput = document.getElementById('combine-width');
const combineHeightInput = document.getElementById('combine-height');
const combineWeightInput = document.getElementById('combine-weight');

const compareBtn = document.getElementById('compare-btn');
const offsiteNoteEl = document.getElementById('offsite-note');
const compareProgress = document.getElementById('compare-progress');

const resultsRegion = document.getElementById('results-region');
const globalErrorEl = document.getElementById('global-error');
const collectedSummaryEl = document.getElementById('collected-summary');
const collectedAddressEl = document.getElementById('collected-address');
const collectedWeightEl = document.getElementById('collected-weight');
const collectedSizeEl = document.getElementById('collected-size');

const cheapestTableEl = document.getElementById('cheapest-table');
const cheapestServiceEl = document.getElementById('cheapest-service-title');
const cheapestPriceEl = document.getElementById('cheapest-price-value');
const cheapestGstEl = document.getElementById('cheapest-gst-label');

const rateTableWrapEl = document.getElementById('rate-table-wrap');
const rateTableBodyEl = document.getElementById('rate-table-body');
const resultsActionsEl = document.getElementById('results-actions');
const createOrderBtn = document.getElementById('create-order-btn');

const clearBtn = document.getElementById('clear-btn');
const versionBadgeEl = document.getElementById('version-badge');

const CARRIER_COLUMN_ORDER = [
  CARRIER_IDS.AUSPOST_PAC,
  CARRIER_IDS.AUSPOST_EPARCEL,
  CARRIER_IDS.COURIERS_PLEASE
];

let currentSettings = null;
let activeTab = null;
let isComparing = false;
let currentItems = [];
let singleSizeEdited = false;
let combinedWeightEdited = false;
let selectedCarrierId = CARRIER_IDS.AUSPOST_PAC;
let carrierOrderUrls = {};

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function isAllowedTab() {
  if (!activeTab?.url) return false;
  try {
    return new URL(activeTab.url).origin === ALLOWED_ORIGIN;
  } catch {
    return false;
  }
}

function populatePresetSelect(presets) {
  presetSelect.replaceChildren();
  const autoOpt = document.createElement('option');
  autoOpt.value = 'auto';
  autoOpt.textContent = 'Auto match';
  presetSelect.append(autoOpt);

  for (const preset of presets || []) {
    const opt = document.createElement('option');
    opt.value = preset.id;
    opt.textContent = `${preset.name} (${preset.weightKg}kg)`;
    presetSelect.append(opt);
  }
}

function setDefaultSizingInputs() {
  const defs = currentSettings?.defaultDimensions || { lengthCm: 20, widthCm: 15, heightCm: 10 };
  dimLengthInput.value = String(defs.lengthCm);
  dimWidthInput.value = String(defs.widthCm);
  dimHeightInput.value = String(defs.heightCm);
  dimWeightInput.value = '';
  combineLengthInput.value = String(defs.lengthCm);
  combineWidthInput.value = String(defs.widthCm);
  combineHeightInput.value = String(defs.heightCm);
  combineWeightInput.value = '';
  matchedPresetTag.hidden = true;
  presetSelect.value = 'auto';
  singleSizeEdited = false;
  combinedWeightEdited = false;
}

function sumCurrentItemWeights() {
  if (!currentItems.length) return null;
  let total = 0;
  for (const item of currentItems) {
    const qty = Math.max(1, Number.parseInt(String(item.quantity || 1), 10) || 1);
    total += Number(item.weightKg || 0) * qty;
  }
  return Math.round(total * 1000) / 1000;
}

function renderMultiItemRows(items) {
  multiItemsList.replaceChildren();
  const defs = currentSettings?.defaultDimensions || { lengthCm: 20, widthCm: 15, heightCm: 10 };

  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'multi-item-row';
    row.dataset.index = String(index);

    const head = document.createElement('div');
    head.className = 'multi-item-head';
    const nameEl = document.createElement('span');
    nameEl.className = 'multi-item-name';
    const qtySuffix = item.quantity > 1 ? ` ×${item.quantity}` : '';
    nameEl.textContent = `${item.label || `Item ${index + 1}`}${qtySuffix}`;
    head.append(nameEl);

    if (item.matchedPresetName) {
      const tag = document.createElement('span');
      tag.className = 'preset-tag';
      tag.textContent = item.matchedPresetName;
      head.append(tag);
    }

    const grid = document.createElement('div');
    grid.className = 'size-grid-4';

    const fields = [
      { key: 'lengthCm', label: 'L (cm)', val: item.lengthCm || defs.lengthCm },
      { key: 'widthCm', label: 'W (cm)', val: item.widthCm || defs.widthCm },
      { key: 'heightCm', label: 'H (cm)', val: item.heightCm || defs.heightCm },
      { key: 'weightKg', label: 'Wt (kg)', val: item.weightKg }
    ];

    for (const f of fields) {
      const wrap = document.createElement('div');
      wrap.className = 'mini-field';
      const lbl = document.createElement('label');
      const inputId = `item-${index}-${f.key}`;
      lbl.htmlFor = inputId;
      lbl.textContent = f.label;
      const inp = document.createElement('input');
      inp.id = inputId;
      inp.type = 'text';
      inp.inputMode = 'decimal';
      inp.autocomplete = 'off';
      inp.dataset.field = f.key;
      inp.value = String(f.val ?? '');
      wrap.append(lbl, inp);
      grid.append(wrap);
    }

    row.append(head, grid);
    multiItemsList.append(row);
  });
}

function updateSizingLayout() {
  const isCombined = combineToggle.checked;
  const hasMultiple = currentItems.length > 1;

  combineSection.hidden = !isCombined;
  if (isCombined) {
    singleSizeRow.hidden = true;
    multiItemsList.hidden = true;
    if (!combinedWeightEdited) {
      const summed = sumCurrentItemWeights();
      if (summed && summed > 0) combineWeightInput.value = String(summed);
    }
    return;
  }

  if (hasMultiple) {
    singleSizeRow.hidden = true;
    multiItemsList.hidden = false;
  } else {
    singleSizeRow.hidden = false;
    multiItemsList.hidden = true;
  }
}

function syncSizingFromResult(summary) {
  const items = Array.isArray(summary?.items) ? summary.items : [];
  currentItems = items;
  const defs = currentSettings?.defaultDimensions || { lengthCm: 20, widthCm: 15, heightCm: 10 };

  if (summary?.packagingMode === 'combined') {
    combineToggle.checked = true;
    combineLengthInput.value = String(summary.dimensions?.lengthCm || defs.lengthCm);
    combineWidthInput.value = String(summary.dimensions?.widthCm || defs.widthCm);
    combineHeightInput.value = String(summary.dimensions?.heightCm || defs.heightCm);
    combineWeightInput.value = String(summary.totalWeightKg || '');
  } else if (items.length > 1) {
    combineToggle.checked = false;
    renderMultiItemRows(items);
    matchedPresetTag.hidden = true;
  } else if (items.length === 1) {
    combineToggle.checked = false;
    const item = items[0];
    dimLengthInput.value = String(item.lengthCm || defs.lengthCm);
    dimWidthInput.value = String(item.widthCm || defs.widthCm);
    dimHeightInput.value = String(item.heightCm || defs.heightCm);
    dimWeightInput.value = String(item.weightKg || '');
    if (item.matchedPresetName) {
      matchedPresetTag.textContent = `Preset: ${item.matchedPresetName}`;
      matchedPresetTag.hidden = false;
      const matchingPreset = currentSettings?.parcelPresets?.find((p) => p.name === item.matchedPresetName);
      if (matchingPreset && presetSelect.value === 'auto') {
        presetSelect.value = matchingPreset.id;
      }
    } else {
      matchedPresetTag.hidden = true;
    }
    singleSizeEdited = true;
  }

  updateSizingLayout();
}

function positiveNum(input) {
  const n = Number.parseFloat(String(input?.value || '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function collectUserOverrides() {
  if (combineToggle.checked) {
    const weightKg = positiveNum(combineWeightInput);
    const lengthCm = positiveNum(combineLengthInput);
    const widthCm = positiveNum(combineWidthInput);
    const heightCm = positiveNum(combineHeightInput);

    if (
      (combineLengthInput.value.trim() && !lengthCm) ||
      (combineWidthInput.value.trim() && !widthCm) ||
      (combineHeightInput.value.trim() && !heightCm) ||
      (combineWeightInput.value.trim() && !weightKg)
    ) {
      return { invalid: true };
    }

    return {
      combine: true,
      combined: {
        lengthCm,
        widthCm,
        heightCm,
        weightKg: combinedWeightEdited ? weightKg : null
      }
    };
  }

  if (currentItems.length > 1 && !multiItemsList.hidden) {
    const rows = Array.from(multiItemsList.querySelectorAll('.multi-item-row'));
    const itemsOverride = rows.map((row) => ({
      lengthCm: positiveNum(row.querySelector('[data-field="lengthCm"]')),
      widthCm: positiveNum(row.querySelector('[data-field="widthCm"]')),
      heightCm: positiveNum(row.querySelector('[data-field="heightCm"]')),
      weightKg: positiveNum(row.querySelector('[data-field="weightKg"]'))
    }));
    return { combine: false, itemsOverride };
  }

  if (singleSizeEdited || presetSelect.value !== 'auto') {
    const lengthCm = positiveNum(dimLengthInput);
    const widthCm = positiveNum(dimWidthInput);
    const heightCm = positiveNum(dimHeightInput);
    const weightKg = positiveNum(dimWeightInput);
    if (
      (dimLengthInput.value.trim() && !lengthCm) ||
      (dimWidthInput.value.trim() && !widthCm) ||
      (dimHeightInput.value.trim() && !heightCm) ||
      (dimWeightInput.value.trim() && !weightKg)
    ) {
      return { invalid: true };
    }
    const chosenPreset = currentSettings?.parcelPresets?.find((p) => p.id === presetSelect.value);
    return {
      combine: false,
      singleOverride: {
        lengthCm,
        widthCm,
        heightCm,
        weightKg,
        presetName: chosenPreset ? chosenPreset.name : undefined
      }
    };
  }

  return null;
}

function buildErrorBox(container, err) {
  container.replaceChildren();
  const title = document.createElement('div');
  title.className = 'error-box__title';
  title.textContent = err.title || 'Unable to fetch rates';

  const msg = document.createElement('div');
  msg.className = 'error-box__msg';
  msg.textContent = err.message || 'An unexpected error occurred.';
  container.append(title, msg);

  if (err.suggestion) {
    const sug = document.createElement('div');
    sug.className = 'error-box__sug';
    sug.textContent = err.suggestion;
    container.append(sug);
  }

  if (err.actionType === 'open_settings') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-secondary cell-error__action';
    btn.textContent = 'Open Settings';
    btn.addEventListener('click', () => chrome.runtime.openOptionsPage());
    container.append(btn);
  }

  if (err.technicalDetail) {
    const details = document.createElement('details');
    details.className = 'error-box__tech';
    const summary = document.createElement('summary');
    summary.textContent = 'Technical details';
    const code = document.createElement('code');
    code.textContent = err.technicalDetail;
    details.append(summary, code);
    container.append(details);
  }
}

function updateCreateOrderButton() {
  const shortNames = {
    [CARRIER_IDS.AUSPOST_PAC]: 'PAC',
    [CARRIER_IDS.AUSPOST_EPARCEL]: 'eParcel',
    [CARRIER_IDS.COURIERS_PLEASE]: 'CP'
  };
  const label = shortNames[selectedCarrierId] || 'Courier';
  createOrderBtn.textContent = `Create Order (${label}) ↗`;
  createOrderBtn.disabled = !carrierOrderUrls[selectedCarrierId];
}

function renderCollectedSummary(summary) {
  const dest = summary?.destination;
  const addrType = dest?.addressType === 'BUSINESS' ? 'Bus' : 'Res';
  collectedAddressEl.textContent = dest
    ? `${[dest.suburb, dest.state, dest.postcode].filter(Boolean).join(' ')} (${addrType})`
    : '—';

  const qtyNote = summary?.totalParcelCount > 1 ? ` (${summary.totalParcelCount}x)` : '';
  collectedWeightEl.textContent = summary ? `${summary.totalWeightKg} kg${qtyNote}` : '—';

  const items = summary?.items || [];
  if (summary?.packagingMode !== 'combined' && items.length > 1) {
    collectedSizeEl.textContent = `${items.length} products`;
  } else if (summary?.dimensions) {
    const d = summary.dimensions;
    collectedSizeEl.textContent = `${d.lengthCm}×${d.widthCm}×${d.heightCm} cm`;
  } else {
    collectedSizeEl.textContent = '—';
  }
  collectedSummaryEl.hidden = false;
}

function renderCheapestTable(cheapest) {
  if (!cheapest?.winners?.length) {
    cheapestTableEl.hidden = true;
    return;
  }

  const primary = cheapest.winners[0];
  cheapestServiceEl.textContent = cheapest.winnerCount > 1
    ? cheapest.winners.map((w) => w.shortWithCarrier || w.serviceName).join(' / ')
    : (primary.shortWithCarrier || primary.serviceName);
  cheapestPriceEl.textContent = `${formatMoney(cheapest.price)} AUD`;
  cheapestGstEl.textContent = cheapest.includesGst ? 'incl. GST' : 'excl. GST';
  cheapestTableEl.hidden = false;
}

function renderThreeColumnTable(carriers, maxPrices) {
  rateTableBodyEl.replaceChildren();
  const groupById = new Map((carriers || []).map((c) => [c.carrierId, c]));

  let maxRows = 1;
  for (const id of CARRIER_COLUMN_ORDER) {
    const group = groupById.get(id);
    if (group?.rates?.length) {
      maxRows = Math.max(maxRows, group.rates.length);
    }
  }
  maxRows = Math.min(maxRows, Math.max(1, maxPrices || 3));

  const spannedDone = new Set();

  for (let rowIdx = 0; rowIdx < maxRows; rowIdx += 1) {
    const tr = document.createElement('tr');

    for (const carrierId of CARRIER_COLUMN_ORDER) {
      if (spannedDone.has(carrierId)) continue;
      const group = groupById.get(carrierId);
      const td = document.createElement('td');

      if (!group || group.status === 'disabled') {
        td.rowSpan = maxRows;
        spannedDone.add(carrierId);
        const empty = document.createElement('div');
        empty.className = 'cell-empty';
        empty.textContent = 'Disabled';
        td.append(empty);
        tr.append(td);
        continue;
      }

      if (group.status === 'error' && group.error) {
        td.rowSpan = maxRows;
        spannedDone.add(carrierId);
        const errBox = document.createElement('div');
        errBox.className = 'cell-error';
        const title = document.createElement('div');
        title.className = 'cell-error__title';
        title.textContent = group.error.title || 'Unavailable';
        const msg = document.createElement('div');
        msg.className = 'cell-error__msg';
        msg.textContent = group.error.message || 'Could not fetch rates.';
        errBox.append(title, msg);

        if (group.error.actionType === 'open_settings') {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn-secondary cell-error__action';
          btn.textContent = 'Settings';
          btn.addEventListener('click', () => chrome.runtime.openOptionsPage());
          errBox.append(btn);
        }
        td.append(errBox);
        tr.append(td);
        continue;
      }

      const rate = group.rates?.[rowIdx];
      if (!rate) {
        const empty = document.createElement('div');
        empty.className = 'cell-empty';
        empty.textContent = rowIdx === 0 ? 'No rates' : '—';
        td.append(empty);
        tr.append(td);
        continue;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rate-cell-btn';
      btn.setAttribute('aria-pressed', carrierId === selectedCarrierId && rowIdx === 0 ? 'true' : 'false');

      const svc = document.createElement('span');
      svc.className = 'cell-service';
      svc.textContent = rate.shortInColumn || rate.serviceName;

      const price = document.createElement('span');
      price.className = 'cell-price';
      price.textContent = formatMoney(rate.displayPrice);

      btn.append(svc, price);
      btn.addEventListener('click', () => {
        for (const other of rateTableBodyEl.querySelectorAll('.rate-cell-btn')) {
          other.setAttribute('aria-pressed', 'false');
        }
        btn.setAttribute('aria-pressed', 'true');
        selectedCarrierId = carrierId;
        updateCreateOrderButton();
      });

      td.append(btn);
      tr.append(td);
    }

    rateTableBodyEl.append(tr);
  }

  rateTableWrapEl.hidden = false;
}

function renderComparisonResult(result) {
  resultsRegion.hidden = false;
  globalErrorEl.hidden = true;

  carrierOrderUrls = {};
  for (const c of result.carriers || []) {
    if (c.orderUrl) carrierOrderUrls[c.carrierId] = c.orderUrl;
  }

  const winnerCarrierId = result.cheapest?.winners?.[0]?.carrierId;
  selectedCarrierId = winnerCarrierId || CARRIER_COLUMN_ORDER.find((id) => carrierOrderUrls[id]) || CARRIER_IDS.AUSPOST_PAC;

  syncSizingFromResult(result.shipmentSummary);
  renderCollectedSummary(result.shipmentSummary);
  renderCheapestTable(result.cheapest);
  renderThreeColumnTable(result.carriers, result.maxPricesPerCourier);
  updateCreateOrderButton();

  resultsActionsEl.hidden = false;
  clearBtn.hidden = false;
}

function showGlobalError(errObj) {
  resultsRegion.hidden = false;
  collectedSummaryEl.hidden = true;
  cheapestTableEl.hidden = true;
  rateTableWrapEl.hidden = true;
  resultsActionsEl.hidden = true;
  buildErrorBox(globalErrorEl, errObj);
  globalErrorEl.hidden = false;
  clearBtn.hidden = false;
}

function resetCompareButton() {
  isComparing = false;
  const allowed = isAllowedTab();
  compareBtn.disabled = !allowed;
  compareBtn.textContent = 'Compare Rates';
  offsiteNoteEl.hidden = allowed;
  compareProgress.hidden = true;
}

async function handleCompareClick() {
  if (isComparing || !activeTab?.id || !isAllowedTab()) return;

  const userOverrides = collectUserOverrides();
  if (userOverrides?.invalid) {
    showGlobalError({
      title: 'Invalid parcel values',
      message: 'Length, width, height, and weight must be positive numbers.',
      suggestion: 'Correct the Parcel Size fields and click Compare Rates again.'
    });
    return;
  }

  isComparing = true;
  compareBtn.disabled = true;
  compareBtn.textContent = 'Comparing Rates...';
  compareProgress.hidden = false;
  globalErrorEl.hidden = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'COMPARE_RATES',
      tabId: activeTab.id,
      userOverrides
    });

    if (!response?.ok) {
      showGlobalError(response?.error || {
        title: 'Comparison failed',
        message: 'Could not retrieve shipping rates for this order.'
      });
      return;
    }

    renderComparisonResult(response.result);
  } catch (err) {
    showGlobalError({
      title: 'Extension communication error',
      message: 'Could not reach the extension background worker.',
      technicalDetail: err instanceof Error ? err.message : String(err)
    });
  } finally {
    resetCompareButton();
  }
}

function renderUpdateBanner(update) {
  updateBannerEl.replaceChildren();
  updateBannerEl.dataset.status = update.status;

  const text = document.createElement('p');
  if (update.status === 'update_available') {
    text.textContent = `Update available: v${update.latestVersion} (installed v${update.currentVersion}). `;
    const link = document.createElement('a');
    link.href = update.releaseUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'View on GitHub';
    text.append(link);
  } else if (update.status === 'up_to_date') {
    text.textContent = `Up to date (v${update.currentVersion}).`;
  } else {
    text.textContent = update.error || 'Could not check GitHub for updates.';
  }

  updateBannerEl.append(text);
  updateBannerEl.hidden = false;
}

async function handleCheckUpdates() {
  checkUpdatesBtn.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type: 'CHECK_UPDATES' });
    if (response?.ok && response.update) {
      renderUpdateBanner(response.update);
    } else {
      renderUpdateBanner({ status: 'error', error: response?.error?.message || 'Update check failed.' });
    }
  } catch {
    renderUpdateBanner({ status: 'error', error: 'Unable to check GitHub right now.' });
  } finally {
    checkUpdatesBtn.disabled = false;
  }
}

async function initPopup() {
  versionBadgeEl.textContent = `v${chrome.runtime.getManifest().version}`;
  currentSettings = await loadSettings();
  applyTheme(currentSettings.theme);
  populatePresetSelect(currentSettings.parcelPresets);
  setDefaultSizingInputs();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  resetCompareButton();

  if (isAllowedTab() && activeTab?.url) {
    const cached = await loadLastResult(activeTab.url);
    if (cached?.result) {
      renderComparisonResult(cached.result);
    }
  }
}

// Fallback for browsers lacking Invoker Commands API (Chrome < 135)
if (!Object.hasOwn(HTMLButtonElement.prototype, 'commandForElement')) {
  helpBtn.addEventListener('click', () => {
    try {
      helpPopover.togglePopover();
    } catch {
      helpPopover.hidden = !helpPopover.hidden;
    }
  });
  const closeBtn = helpPopover.querySelector('.help-popover__close');
  closeBtn?.addEventListener('click', () => {
    try {
      helpPopover.hidePopover();
    } catch {
      helpPopover.hidden = true;
    }
  });
}

presetSelect.addEventListener('change', () => {
  const val = presetSelect.value;
  if (val === 'auto') {
    matchedPresetTag.hidden = true;
    singleSizeEdited = false;
    return;
  }
  const preset = currentSettings?.parcelPresets?.find((p) => p.id === val);
  if (!preset) return;

  combineToggle.checked = false;
  currentItems = [];
  updateSizingLayout();
  dimLengthInput.value = String(preset.lengthCm);
  dimWidthInput.value = String(preset.widthCm);
  dimHeightInput.value = String(preset.heightCm);
  dimWeightInput.value = String(preset.weightKg);
  matchedPresetTag.textContent = `Preset: ${preset.name}`;
  matchedPresetTag.hidden = false;
  singleSizeEdited = true;
});

for (const input of [dimLengthInput, dimWidthInput, dimHeightInput, dimWeightInput]) {
  input.addEventListener('input', () => {
    singleSizeEdited = true;
  });
}

combineWeightInput.addEventListener('input', () => {
  combinedWeightEdited = true;
});

combineToggle.addEventListener('change', updateSizingLayout);
openSettingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
checkUpdatesBtn.addEventListener('click', handleCheckUpdates);
compareBtn.addEventListener('click', handleCompareClick);

createOrderBtn.addEventListener('click', async () => {
  const url = carrierOrderUrls[selectedCarrierId] || currentSettings?.carriers?.[selectedCarrierId]?.orderUrl;
  if (url) {
    await chrome.tabs.create({ url });
  }
});

clearBtn.addEventListener('click', async () => {
  await clearLastResult();
  currentItems = [];
  combineToggle.checked = false;
  setDefaultSizingInputs();
  updateSizingLayout();
  resultsRegion.hidden = true;
  globalErrorEl.hidden = true;
  collectedSummaryEl.hidden = true;
  cheapestTableEl.hidden = true;
  rateTableWrapEl.hidden = true;
  resultsActionsEl.hidden = true;
  clearBtn.hidden = true;
});

document.addEventListener('DOMContentLoaded', () => {
  initPopup().catch((err) => {
    showGlobalError({
      title: 'Initialization error',
      message: 'Failed to load extension settings.',
      technicalDetail: err instanceof Error ? err.message : String(err)
    });
  });
});
