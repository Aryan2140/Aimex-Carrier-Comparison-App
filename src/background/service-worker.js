/**
 * Manifest V3 stateless service worker orchestrating one-shot order reading,
 * preset matching, parallel carrier quoting, credential testing, and GitHub update checks.
 */

import { ALLOWED_ORIGIN, CARRIER_IDS } from '../shared/constants.js';
import { CarrierError, toHumanError } from '../shared/errors.js';
import { applyPresetsToItems } from '../shared/presets.js';
import { loadSettings, saveLastResult } from '../shared/storage.js';
import { checkForUpdates } from '../shared/updates.js';
import { compareRates } from '../carriers/compare.js';
import { testAusPostPac } from '../carriers/auspost-pac.js';
import { testAusPostEparcel } from '../carriers/auspost-eparcel.js';
import { testCouriersPlease } from '../carriers/couriers-please.js';

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await loadSettings();
  } catch (err) {
    console.error('Failed to bootstrap extension settings on install:', err);
  }
});

function extractionErrorFromCode(errorCode) {
  switch (errorCode) {
    case 'NOT_ALLOWED_ORIGIN':
      return new CarrierError({
        code: 'NOT_ALLOWED_ORIGIN',
        title: 'Unsupported website',
        message: 'Carrier Comparison Companion only runs on aimexaustralia.logicsync.app.',
        suggestion: 'Open an order page on aimexaustralia.logicsync.app and click Compare Rates.'
      });
    case 'NOT_ORDER_PAGE':
      return new CarrierError({
        code: 'NOT_ORDER_PAGE',
        title: 'Not an Order Information page',
        message: 'Could not find a # Shipping address and Items section on this page.',
        suggestion: 'Open a specific Order Information page on aimexaustralia.logicsync.app first.'
      });
    case 'MISSING_SHIPPING_POSTCODE':
      return new CarrierError({
        code: 'MISSING_SHIPPING_POSTCODE',
        title: 'Missing shipping postcode',
        message: 'Found the order page, but could not find a 4-digit postcode under # Shipping.',
        suggestion: 'Confirm the # Shipping address has a valid Australian postcode.'
      });
    case 'MISSING_ITEMS':
      return new CarrierError({
        code: 'MISSING_ITEMS',
        title: 'No order items found',
        message: 'No parcel items were detected in the Items section of this order.',
        suggestion: 'Make sure the order has at least one item listed before comparing rates.'
      });
    case 'MISSING_ITEM_WEIGHT':
      return new CarrierError({
        code: 'MISSING_ITEM_WEIGHT',
        title: 'Missing item weight',
        message: 'One or more order items do not list a weight in kg or grams.',
        suggestion: 'Carriers require parcel weights to calculate shipping rates.'
      });
    default:
      return new CarrierError({
        code: 'EXTRACTION_FAILED',
        title: 'Could not read order details',
        message: 'Unable to extract shipping destination and parcel weights from this tab.',
        suggestion: 'Refresh the order page and click Compare Rates again.'
      });
  }
}

function applyUserOverrides(items, userOverrides, settings) {
  if (!userOverrides) return { items, packagingModeOverride: null, combinedOverride: null, dimensionOverride: null };

  const nextItems = items.map((item, idx) => {
    const itemOverride = Array.isArray(userOverrides.itemsOverride) ? userOverrides.itemsOverride[idx] : null;
    if (itemOverride) {
      return {
        ...item,
        weightKg: Number(itemOverride.weightKg) > 0 ? Number(itemOverride.weightKg) : item.weightKg,
        lengthCm: Number(itemOverride.lengthCm) > 0 ? Number(itemOverride.lengthCm) : item.lengthCm,
        widthCm: Number(itemOverride.widthCm) > 0 ? Number(itemOverride.widthCm) : item.widthCm,
        heightCm: Number(itemOverride.heightCm) > 0 ? Number(itemOverride.heightCm) : item.heightCm
      };
    }

    // Single-product or manual preset override from popup
    if (idx === 0 && items.length === 1 && userOverrides.singleOverride) {
      const ov = userOverrides.singleOverride;
      return {
        ...item,
        weightKg: Number(ov.weightKg) > 0 ? Number(ov.weightKg) : item.weightKg,
        lengthCm: Number(ov.lengthCm) > 0 ? Number(ov.lengthCm) : item.lengthCm,
        widthCm: Number(ov.widthCm) > 0 ? Number(ov.widthCm) : item.widthCm,
        heightCm: Number(ov.heightCm) > 0 ? Number(ov.heightCm) : item.heightCm,
        matchedPresetName: ov.presetName !== undefined ? ov.presetName : item.matchedPresetName
      };
    }
    return item;
  });

  if (userOverrides.satchel) {
    const s = userOverrides.satchel;
    return {
      items: nextItems.map((item, idx) => idx === 0 ? {
        ...item,
        weightKg: Number(s.weightKg) > 0 ? Number(s.weightKg) : item.weightKg,
        lengthCm: Number(s.lengthCm),
        widthCm: Number(s.widthCm),
        heightCm: Number(s.heightCm),
        matchedPresetName: s.name
      } : item),
      packagingModeOverride: 'per_unit',
      combinedOverride: null,
      dimensionOverride: {
        lengthCm: Number(s.lengthCm),
        widthCm: Number(s.widthCm),
        heightCm: Number(s.heightCm)
      }
    };
  }

  if (userOverrides.combine) {
    const c = userOverrides.combined || {};
    const defs = settings.defaultDimensions || { lengthCm: 20, widthCm: 15, heightCm: 10 };
    return {
      items: nextItems,
      packagingModeOverride: 'combined',
      combinedOverride: {
        weightKg: Number(c.weightKg) > 0 ? Number(c.weightKg) : null,
        lengthCm: Number(c.lengthCm) > 0 ? Number(c.lengthCm) : defs.lengthCm,
        widthCm: Number(c.widthCm) > 0 ? Number(c.widthCm) : defs.widthCm,
        heightCm: Number(c.heightCm) > 0 ? Number(c.heightCm) : defs.heightCm
      },
      dimensionOverride: null
    };
  }

  return {
    items: nextItems,
    packagingModeOverride: 'per_unit',
    combinedOverride: null,
    dimensionOverride: null
  };
}

async function handleCompareRates(message) {
  const tabId = Number(message.tabId);
  if (!tabId) {
    throw new CarrierError({
      code: 'NO_ACTIVE_TAB',
      title: 'No active browser tab',
      message: 'Could not identify the active browser tab to inspect.',
      suggestion: 'Focus an aimexaustralia.logicsync.app order tab and try again.'
    });
  }

  const tab = await chrome.tabs.get(tabId);
  let tabOrigin = '';
  try {
    tabOrigin = new URL(tab?.url || '').origin;
  } catch {
    tabOrigin = '';
  }

  if (tabOrigin !== ALLOWED_ORIGIN) {
    throw extractionErrorFromCode('NOT_ALLOWED_ORIGIN');
  }

  let injectionResults;
  try {
    injectionResults = await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/extract-order.js']
    });
  } catch (err) {
    throw new CarrierError({
      code: 'SCRIPT_INJECTION_FAILED',
      title: 'Could not read order tab',
      message: 'Chrome blocked reading this page. Try reloading the order tab first.',
      suggestion: 'Refresh the LogicSync tab and press Compare Rates again.',
      technicalDetail: err instanceof Error ? err.message : String(err)
    });
  }

  const extracted = injectionResults?.[0]?.result;
  if (!extracted?.ok) {
    throw extractionErrorFromCode(extracted?.errorCode);
  }

  const settings = await loadSettings();
  const matchedItems = applyPresetsToItems(extracted.items, settings.parcelPresets);
  const resolved = applyUserOverrides(matchedItems, message.userOverrides, settings);

  const order = {
    destination: extracted.destination,
    items: resolved.items,
    packagingModeOverride: resolved.packagingModeOverride,
    combinedOverride: resolved.combinedOverride,
    dimensionOverride: resolved.dimensionOverride
  };

  const result = await compareRates(order, settings);
  result.extractionWarnings = extracted.warnings || [];
  await saveLastResult(tab.url, result);
  return { ok: true, result };
}

async function handleTestCarrier(message) {
  const settings = message.settingsOverride || (await loadSettings());
  const carrierId = message.carrierId;
  if (carrierId === CARRIER_IDS.AUSPOST_PAC) {
    return await testAusPostPac(settings);
  }
  if (carrierId === CARRIER_IDS.AUSPOST_EPARCEL) {
    return await testAusPostEparcel(settings);
  }
  if (carrierId === CARRIER_IDS.COURIERS_PLEASE) {
    return await testCouriersPlease(settings);
  }
  throw new Error(`Unknown carrier: ${carrierId}`);
}

async function handleCheckUpdates(message) {
  const settings = await loadSettings();
  const manifest = chrome.runtime.getManifest();
  return await checkForUpdates({
    currentVersion: manifest.version,
    repoUrl: message.repoUrl || settings.updates.repoUrl,
    githubToken: message.githubToken ?? settings.updates.githubToken
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.type) {
        case 'BOOTSTRAP_SETTINGS': {
          const settings = await loadSettings();
          sendResponse({ ok: true, settings });
          break;
        }
        case 'COMPARE_RATES': {
          const data = await handleCompareRates(message);
          sendResponse(data);
          break;
        }
        case 'TEST_CARRIER': {
          const data = await handleTestCarrier(message);
          sendResponse(data);
          break;
        }
        case 'CHECK_UPDATES': {
          const update = await handleCheckUpdates(message);
          sendResponse({ ok: true, update });
          break;
        }
        default:
          sendResponse({ ok: false, error: toHumanError(new Error('Unknown message type')) });
      }
    } catch (err) {
      sendResponse({ ok: false, error: toHumanError(err, { carrierId: message?.carrierId }) });
    }
  })();

  return true; // Keeps message channel open for async sendResponse
});
