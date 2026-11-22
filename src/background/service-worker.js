/**
 * Manifest V3 stateless service worker orchestrating one-shot order reading,
 * parallel carrier quoting, credential testing, and GitHub update checks.
 */

import { ALLOWED_ORIGIN, CARRIER_IDS } from '../shared/constants.js';
import { CarrierError, toHumanError } from '../shared/errors.js';
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
        message: 'Aimex Carrier Rate Comparison only works on aimexaustralia.logicsync.app.',
        suggestion: 'Switch to your Aimex LogicSync order tab and click Compare Rates.'
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
  const order = {
    destination: extracted.destination,
    items: extracted.items,
    dimensionOverride: message.dimensionOverride || null
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
