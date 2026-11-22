import { ALLOWED_ORIGIN } from '../src/shared/constants.js';
import { clearLastResult, loadLastResult, loadSettings } from '../src/shared/storage.js';

const siteStatusEl = document.getElementById('site-status');
const siteStatusTextEl = document.getElementById('site-status-text');
const updateBannerEl = document.getElementById('update-banner');
const checkUpdatesBtn = document.getElementById('check-updates-btn');
const openSettingsBtn = document.getElementById('open-settings-btn');
const compareBtn = document.getElementById('compare-btn');
const compareProgress = document.getElementById('compare-progress');
const emptyStateEl = document.getElementById('empty-state');
const globalErrorEl = document.getElementById('global-error');
const shipmentSummaryEl = document.getElementById('shipment-summary');
const cheapestBannerEl = document.getElementById('cheapest-banner');
const carrierListEl = document.getElementById('carrier-list');
const clearBtn = document.getElementById('clear-btn');
const versionBadgeEl = document.getElementById('version-badge');

const lenInput = document.getElementById('override-length');
const widthInput = document.getElementById('override-width');
const heightInput = document.getElementById('override-height');

let activeTab = null;
let isComparing = false;

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

function buildErrorCardContent(container, errorObj) {
  container.replaceChildren();

  const title = document.createElement('div');
  title.className = 'error-title';
  const badge = document.createElement('span');
  badge.setAttribute('role', 'img');
  badge.setAttribute('aria-label', 'Error');
  badge.textContent = '⚠';
  const titleText = document.createElement('span');
  titleText.textContent = errorObj.title || 'Unable to load rates';
  title.append(badge, titleText);

  const msg = document.createElement('p');
  msg.className = 'error-msg';
  msg.textContent = errorObj.message || 'An unexpected issue occurred.';

  container.append(title, msg);

  if (errorObj.suggestion) {
    const sug = document.createElement('p');
    sug.className = 'error-suggestion';
    sug.textContent = errorObj.suggestion;
    container.append(sug);
  }

  if (errorObj.actionType === 'open_settings') {
    const actions = document.createElement('div');
    actions.className = 'error-actions';
    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'btn-secondary';
    settingsBtn.textContent = 'Open Settings';
    settingsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });
    actions.append(settingsBtn);
    container.append(actions);
  }

  if (errorObj.technicalDetail) {
    const details = document.createElement('details');
    details.className = 'error-tech';
    const summary = document.createElement('summary');
    summary.textContent = 'Technical details';
    const code = document.createElement('code');
    code.textContent = errorObj.technicalDetail;
    details.append(summary, code);
    container.append(details);
  }
}

function renderSummaryChips(summary, warnings = []) {
  shipmentSummaryEl.replaceChildren();
  const dest = summary?.destination;
  const chips = [
    dest ? `To: ${[dest.suburb, dest.state, dest.postcode].filter(Boolean).join(' ')}` : '',
    dest?.addressType ? dest.addressType : '',
    summary ? `${summary.totalParcelCount} parcel${summary.totalParcelCount === 1 ? '' : 's'}` : '',
    summary ? `${summary.totalWeightKg} kg total` : '',
    summary?.dimensions
      ? `${summary.dimensions.lengthCm}×${summary.dimensions.widthCm}×${summary.dimensions.heightCm} cm`
      : ''
  ].filter(Boolean);

  for (const label of chips) {
    const chip = document.createElement('span');
    chip.className = 'summary-chip tabular-nums';
    chip.textContent = label;
    shipmentSummaryEl.append(chip);
  }

  for (const warningText of warnings) {
    const warn = document.createElement('span');
    warn.className = 'summary-chip';
    warn.textContent = `Note: ${warningText}`;
    shipmentSummaryEl.append(warn);
  }

  shipmentSummaryEl.hidden = false;
}

function renderCheapestBanner(cheapest) {
  cheapestBannerEl.replaceChildren();
  if (!cheapest || !cheapest.winners?.length) {
    cheapestBannerEl.hidden = true;
    return;
  }

  const left = document.createElement('div');
  const kicker = document.createElement('div');
  kicker.className = 'cheapest-kicker';
  kicker.textContent = cheapest.winnerCount > 1 ? '★ Tied Cheapest Rate' : '★ Cheapest Rate';

  const service = document.createElement('div');
  service.className = 'cheapest-service';
  const primary = cheapest.winners[0];
  service.textContent = cheapest.winnerCount > 1
    ? `${cheapest.winners.map((w) => `${w.carrierName} (${w.serviceName})`).join(' & ')}`
    : `${primary.carrierName} — ${primary.serviceName}`;

  left.append(kicker, service);

  if (cheapest.savingsAmount !== null && cheapest.savingsAmount > 0) {
    const savings = document.createElement('div');
    savings.className = 'cheapest-savings tabular-nums';
    savings.textContent = `Saves ${formatMoney(cheapest.savingsAmount)} vs next option (${formatMoney(cheapest.nextHighestPrice)})`;
    left.append(savings);
  }

  const right = document.createElement('div');
  right.className = 'cheapest-price-col';
  const price = document.createElement('div');
  price.className = 'cheapest-price tabular-nums';
  price.textContent = `${formatMoney(cheapest.price)} AUD`;
  const gst = document.createElement('div');
  gst.className = 'cheapest-gst';
  gst.textContent = cheapest.includesGst ? 'Incl. GST' : 'Excl. GST';
  right.append(price, gst);

  cheapestBannerEl.append(left, right);
  cheapestBannerEl.hidden = false;
}

function renderCarrierCard(group) {
  const card = document.createElement('article');
  const hasWinner = group.rates?.some((r) => r.isCheapest);
  card.className = `carrier-card${hasWinner ? ' carrier-card--cheapest' : ''}`;

  const head = document.createElement('div');
  head.className = 'carrier-card__head';

  const title = document.createElement('h2');
  title.className = 'carrier-card__title';
  title.textContent = group.carrierName;

  const meta = document.createElement('span');
  meta.className = 'carrier-card__meta tabular-nums';
  if (group.status === 'ok') {
    meta.textContent = group.totalAvailableCount > group.rates.length
      ? `Showing ${group.rates.length} of ${group.totalAvailableCount}`
      : `${group.rates.length} rate${group.rates.length === 1 ? '' : 's'}`;
  } else if (group.status === 'disabled') {
    meta.textContent = 'Disabled';
  } else if (group.status === 'error') {
    meta.textContent = 'Unavailable';
  } else {
    meta.textContent = 'No rates';
  }

  head.append(title, meta);
  card.append(head);

  if (group.status === 'error' && group.error) {
    const errBox = document.createElement('div');
    errBox.className = 'carrier-card__error';
    buildErrorCardContent(errBox, group.error);
    card.append(errBox);
    return card;
  }

  if (group.status === 'disabled') {
    const empty = document.createElement('p');
    empty.className = 'carrier-empty';
    empty.textContent = 'Turned off in Settings.';
    card.append(empty);
    return card;
  }

  if (!group.rates?.length) {
    const empty = document.createElement('p');
    empty.className = 'carrier-empty';
    empty.textContent = 'No eligible services returned for this parcel and destination.';
    card.append(empty);
    return card;
  }

  const list = document.createElement('ul');
  list.className = 'rate-list';

  for (const rate of group.rates) {
    const row = document.createElement('li');
    row.className = `rate-row${rate.isCheapest ? ' rate-row--cheapest' : ''}`;

    const info = document.createElement('div');
    info.className = 'rate-info';

    const titleLine = document.createElement('div');
    titleLine.className = 'rate-title-line';
    const nameEl = document.createElement('span');
    nameEl.className = 'rate-name';
    nameEl.textContent = rate.serviceName;
    titleLine.append(nameEl);

    if (rate.isCheapest) {
      const badge = document.createElement('span');
      badge.className = 'cheapest-pill';
      badge.textContent = '★ Cheapest';
      titleLine.append(badge);
    }

    info.append(titleLine);

    const subText = [rate.eta, rate.notes].filter(Boolean).join(' · ');
    if (subText) {
      const sub = document.createElement('div');
      sub.className = 'rate-sub';
      sub.textContent = subText;
      info.append(sub);
    }

    const priceCol = document.createElement('div');
    priceCol.className = 'rate-price-col';
    const priceEl = document.createElement('div');
    priceEl.className = 'rate-price tabular-nums';
    priceEl.textContent = formatMoney(rate.displayPrice);
    const gstEl = document.createElement('div');
    gstEl.className = 'rate-gst';
    gstEl.textContent = rate.includesGst ? 'inc GST' : 'ex GST';
    priceCol.append(priceEl, gstEl);

    row.append(info, priceCol);
    list.append(row);
  }

  card.append(list);
  return card;
}

function renderComparisonResult(result) {
  emptyStateEl.hidden = true;
  globalErrorEl.hidden = true;
  renderSummaryChips(result.shipmentSummary, result.extractionWarnings);
  renderCheapestBanner(result.cheapest);

  carrierListEl.replaceChildren();
  for (const group of result.carriers || []) {
    carrierListEl.append(renderCarrierCard(group));
  }
  clearBtn.hidden = false;
}

function showGlobalError(errorObj) {
  emptyStateEl.hidden = true;
  shipmentSummaryEl.hidden = true;
  cheapestBannerEl.hidden = true;
  carrierListEl.replaceChildren();
  buildErrorCardContent(globalErrorEl, errorObj);
  globalErrorEl.hidden = false;
  clearBtn.hidden = false;
}

function readDimensionOverride() {
  const rawL = lenInput.value.trim();
  const rawW = widthInput.value.trim();
  const rawH = heightInput.value.trim();
  if (!rawL && !rawW && !rawH) return null;

  const lengthCm = Number.parseFloat(rawL || lenInput.placeholder);
  const widthCm = Number.parseFloat(rawW || widthInput.placeholder);
  const heightCm = Number.parseFloat(rawH || heightInput.placeholder);

  if (
    !Number.isFinite(lengthCm) || lengthCm <= 0 ||
    !Number.isFinite(widthCm) || widthCm <= 0 ||
    !Number.isFinite(heightCm) || heightCm <= 0
  ) {
    return { invalid: true };
  }
  return { lengthCm, widthCm, heightCm };
}

function resetCompareButton() {
  isComparing = false;
  compareBtn.disabled = !isAllowedTab();
  compareBtn.textContent = 'Compare Rates';
  compareProgress.hidden = true;
}

function isAllowedTab() {
  if (!activeTab?.url) return false;
  try {
    return new URL(activeTab.url).origin === ALLOWED_ORIGIN;
  } catch {
    return false;
  }
}

function updateSiteBanner() {
  if (isAllowedTab()) {
    siteStatusEl.dataset.ready = 'true';
    siteStatusTextEl.textContent = 'Ready on aimexaustralia.logicsync.app';
    compareBtn.disabled = false;
  } else {
    siteStatusEl.dataset.ready = 'false';
    siteStatusTextEl.textContent = 'Open an order on aimexaustralia.logicsync.app to compare';
    compareBtn.disabled = true;
  }
}

async function handleCompareClick() {
  if (isComparing || !activeTab?.id || !isAllowedTab()) return;

  const dimensionOverride = readDimensionOverride();
  if (dimensionOverride?.invalid) {
    showGlobalError({
      title: 'Invalid parcel dimensions',
      message: 'Length, width, and height must be positive numbers in centimetres.',
      suggestion: 'Enter valid numbers (e.g. 20, 15, 10) or leave the dimension fields blank to use defaults.'
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
      dimensionOverride
    });

    if (!response?.ok) {
      showGlobalError(response?.error || {
        title: 'Comparison failed',
        message: 'Could not retrieve shipping rates for this order.',
        suggestion: 'Verify the order page is loaded and try again.'
      });
      return;
    }

    renderComparisonResult(response.result);
  } catch (err) {
    showGlobalError({
      title: 'Extension communication error',
      message: 'Could not reach the extension background worker.',
      suggestion: 'Try reloading the extension or reopening the popup.',
      technicalDetail: err instanceof Error ? err.message : String(err)
    });
  } finally {
    // Immediately stop reading state and reset button back to Compare Rates
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
    text.textContent = `You are on the latest version (v${update.currentVersion}).`;
  } else {
    text.textContent = update.error || 'Could not check GitHub for updates right now.';
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
  const manifest = chrome.runtime.getManifest();
  versionBadgeEl.textContent = `v${manifest.version}`;

  const settings = await loadSettings();
  applyTheme(settings.theme);

  if (settings.defaultDimensions) {
    lenInput.placeholder = String(settings.defaultDimensions.lengthCm);
    widthInput.placeholder = String(settings.defaultDimensions.widthCm);
    heightInput.placeholder = String(settings.defaultDimensions.heightCm);
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeTab = tab || null;
  updateSiteBanner();

  if (isAllowedTab() && activeTab?.url) {
    const cached = await loadLastResult(activeTab.url);
    if (cached?.result) {
      renderComparisonResult(cached.result);
    }
  }
}

openSettingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
checkUpdatesBtn.addEventListener('click', handleCheckUpdates);
compareBtn.addEventListener('click', handleCompareClick);
clearBtn.addEventListener('click', async () => {
  await clearLastResult();
  globalErrorEl.hidden = true;
  shipmentSummaryEl.hidden = true;
  cheapestBannerEl.hidden = true;
  carrierListEl.replaceChildren();
  emptyStateEl.hidden = false;
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
