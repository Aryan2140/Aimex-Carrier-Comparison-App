/**
 * CouriersPlease Domestic Quote v2 & Locations v1 API client.
 */

import { CARRIER_IDS, COURIERSPLEASE_URLS } from '../shared/constants.js';
import { CarrierError, asCarrierError } from '../shared/errors.js';
import {
  assertDomesticAuDestination,
  buildOrderParcels,
  fetchWithTimeout,
  readJsonSafe,
  round2,
  toBase64Utf8
} from './parcel-utils.js';

const MAX_WEIGHT_KG = 32;
const MAX_DIM_CM = 180;
const MAX_QTY = 99;

/**
 * Resolve the CouriersPlease API base URL from carrier settings.
 * Rejects the developer portal host (apidev.couriersplease.com.au) with an actionable error.
 * @param {object} cfg
 * @returns {string}
 */
export function resolveCouriersPleaseBaseUrl(cfg = {}) {
  const env = cfg.environment || 'production';
  let baseUrl = COURIERSPLEASE_URLS.production;
  if (env === 'sandbox') {
    baseUrl = COURIERSPLEASE_URLS.sandbox;
  } else if (env === 'custom') {
    baseUrl = String(cfg.customBaseUrl || '').trim().replace(/\/+$/, '') || COURIERSPLEASE_URLS.production;
  }

  if (/^https?:\/\/apidev\.couriersplease\.com\.au/i.test(baseUrl)) {
    throw new CarrierError({
      code: 'COURIERSPLEASE_PORTAL_URL',
      carrierId: CARRIER_IDS.COURIERS_PLEASE,
      title: 'CouriersPlease URL points to developer portal',
      message:
        'apidev.couriersplease.com.au is the CouriersPlease documentation portal, not the API server.',
      suggestion:
        'In Settings, switch CouriersPlease Environment to Production (api.couriersplease.com.au) or Sandbox (api-test.couriersplease.com.au).',
      actionType: 'open_settings'
    });
  }

  return baseUrl;
}

function buildCouriersPleaseHeaders(account, apiKey) {
  return {
    Authorization: `Basic ${toBase64Utf8(`${account}:${apiKey}`)}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
}

async function lookupSuburbForPostcode(baseUrl, headers, postcode, rawSuburb, fetchImpl) {
  const url = `${baseUrl}/v1/locations?suburbOrPostcode=${encodeURIComponent(postcode)}`;
  let response;
  try {
    response = await fetchWithTimeout(url, { method: 'GET', headers }, fetchImpl);
  } catch (err) {
    if (err?.name === 'AbortError') return rawSuburb;
    return rawSuburb;
  }

  const payload = await readJsonSafe(response);
  if (response.status === 401 || response.status === 403) {
    throw asCarrierError(new Error(`HTTP ${response.status}`), {
      carrierId: CARRIER_IDS.COURIERS_PLEASE,
      status: response.status,
      payload,
      url
    });
  }

  if (!response.ok || payload?.responseCode !== 'SUCCESS' || !Array.isArray(payload?.data)) {
    return rawSuburb;
  }

  const target = String(rawSuburb || '').trim().toLowerCase();
  if (target) {
    const exact = payload.data.find((loc) => String(loc?.Suburb || '').trim().toLowerCase() === target);
    if (exact?.Suburb) return String(exact.Suburb).trim();

    const partial = payload.data.find((loc) =>
      String(loc?.Suburb || '').trim().toLowerCase().includes(target)
    );
    if (partial?.Suburb) return String(partial.Suburb).trim();
  } else if (payload.data.length === 1 && payload.data[0]?.Suburb) {
    return String(payload.data[0].Suburb).trim();
  }

  return rawSuburb;
}

/**
 * Fetch CouriersPlease domestic contract quote rates for an order.
 * @param {object} order
 * @param {object} settings
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchCouriersPleaseRates(order, settings, fetchImpl = fetch) {
  const carrierId = CARRIER_IDS.COURIERS_PLEASE;
  const cfg = settings?.carriers?.couriersPlease || {};
  const account = String(cfg.account || '').trim();
  const apiKey = String(cfg.apiKey || '').trim();

  if (!account || !apiKey) {
    const missing = [!account ? 'Account Number' : '', !apiKey ? 'API Token' : ''].filter(Boolean);
    throw new CarrierError({
      code: 'MISSING_CREDENTIALS',
      carrierId,
      title: 'CouriersPlease credentials missing',
      message: `Missing CouriersPlease ${missing.join(' and ')}.`,
      suggestion: 'Enter your CouriersPlease Account Number and API Token in Settings.',
      actionType: 'open_settings'
    });
  }

  const baseUrl = resolveCouriersPleaseBaseUrl(cfg);
  assertDomesticAuDestination(order?.destination, carrierId);

  const origin = settings?.origin || {};
  const fromSuburb = String(origin.suburb || '').trim();
  const fromPostcode = String(origin.postcode || '').trim();
  if (!fromSuburb || !/^\d{4}$/.test(fromPostcode)) {
    throw new CarrierError({
      code: 'INVALID_ORIGIN',
      carrierId,
      title: 'Origin suburb and postcode required',
      message: 'CouriersPlease requires both a valid origin suburb and 4-digit origin postcode.',
      suggestion: 'Fill in Dispatch Origin Suburb and Postcode in Settings.',
      actionType: 'open_settings'
    });
  }

  const { parcels } = buildOrderParcels(order, settings);
  const cpItems = parcels.map((parcel) => {
    const length = Math.max(1, Math.round(parcel.lengthCm));
    const width = Math.max(1, Math.round(parcel.widthCm));
    const height = Math.max(1, Math.round(parcel.heightCm));
    const physicalWeight = Math.round(parcel.weightKg * 100) / 100;
    const quantity = Number.parseInt(String(parcel.quantity), 10) || 1;

    if (physicalWeight < 0.01) {
      throw new CarrierError({
        code: 'UNDERWEIGHT',
        carrierId,
        title: 'Parcel weight below CouriersPlease minimum',
        message: 'CouriersPlease requires each item to weigh at least 0.01 kg.',
        suggestion: 'Verify item weights on the order page.'
      });
    }
    if (physicalWeight > MAX_WEIGHT_KG) {
      throw new CarrierError({
        code: 'OVERWEIGHT',
        carrierId,
        title: 'Parcel exceeds CouriersPlease 32 kg limit',
        message: `Parcel weight (${physicalWeight} kg) exceeds CouriersPlease's ${MAX_WEIGHT_KG} kg per-item limit.`,
        suggestion:
          settings?.packagingMode === 'combined'
            ? 'Switch Packaging Mode to "Each unit as its own parcel" in Settings.'
            : 'Items over 32 kg cannot be quoted via standard CouriersPlease parcels.'
      });
    }
    if (length > MAX_DIM_CM || width > MAX_DIM_CM || height > MAX_DIM_CM) {
      throw new CarrierError({
        code: 'OVERSIZE',
        carrierId,
        title: 'Parcel exceeds CouriersPlease 180 cm limit',
        message: `Parcel dimensions (${length}×${width}×${height} cm) exceed CouriersPlease's ${MAX_DIM_CM} cm maximum side length.`,
        suggestion: 'Adjust parcel dimensions before quoting.'
      });
    }
    if (quantity > MAX_QTY) {
      throw new CarrierError({
        code: 'TOO_MANY_ITEMS',
        carrierId,
        title: 'Quantity exceeds CouriersPlease 99-item limit',
        message: `Quantity (${quantity}) exceeds CouriersPlease's maximum of ${MAX_QTY} per line item.`,
        suggestion: 'Split the shipment or use Combined Parcel mode.'
      });
    }

    return { quantity, length, width, height, physicalWeight };
  });

  const headers = buildCouriersPleaseHeaders(account, apiKey);
  let toSuburb = String(order.destination.suburb || '').trim();
  const toPostcode = String(order.destination.postcode).trim();

  if (cfg.validateLocation !== false) {
    toSuburb = await lookupSuburbForPostcode(baseUrl, headers, toPostcode, toSuburb, fetchImpl);
  }

  if (!toSuburb) {
    throw new CarrierError({
      code: 'MISSING_SUBURB',
      carrierId,
      title: 'Destination suburb required',
      message: 'CouriersPlease requires a valid destination suburb alongside the postcode.',
      suggestion: 'Check that the order # Shipping section includes a Suburb.'
    });
  }

  const quoteUrl = `${baseUrl}/v2/domestic/quote`;
  let response;
  try {
    response = await fetchWithTimeout(
      quoteUrl,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          fromSuburb,
          fromPostcode,
          toSuburb,
          toPostcode,
          items: cpItems
        })
      },
      fetchImpl
    );
  } catch (err) {
    throw asCarrierError(err, { carrierId, url: quoteUrl });
  }

  const payload = await readJsonSafe(response);
  if (!response.ok || (payload?.responseCode && payload.responseCode !== 'SUCCESS')) {
    throw asCarrierError(new Error(payload?.msg || `HTTP ${response.status}`), {
      carrierId,
      status: response.status || 400,
      payload,
      url: quoteUrl
    });
  }

  if (!payload || !Array.isArray(payload.data)) {
    throw new CarrierError({
      code: 'EMPTY_RESPONSE',
      carrierId,
      title: 'CouriersPlease returned no quote data',
      message: 'CouriersPlease returned an empty or unreadable response for this quote request.',
      suggestion: 'Reload the extension in chrome://extensions and click Compare Rates again.',
      technicalDetail: payload?.message || `HTTP ${response.status} with empty body`
    });
  }

  const rateList = payload.data;
  return rateList.map((entry) => {
    const freightExGst = Number.parseFloat(entry.CalculatedFreightCharge || 0);
    const fuelExGst = Number.parseFloat(entry.CalculatedFuelCharge || 0);
    const insuranceExGst = Number.parseFloat(entry.InsuranceAmt || 0);
    const priceExGst = round2(freightExGst + fuelExGst + insuranceExGst);
    const gst = round2(priceExGst * 0.1);
    const priceIncGst = round2(priceExGst + gst);

    const noteParts = [];
    if (fuelExGst > 0) noteParts.push(`Fuel $${fuelExGst.toFixed(2)} (ex GST)`);
    if (entry.Weight) noteParts.push(`${entry.Weight} kg chargeable`);
    if (entry.PickupCutOffTime) noteParts.push(`Cutoff ${entry.PickupCutOffTime}`);

    return {
      carrierId,
      carrierName: 'CouriersPlease',
      serviceCode: String(entry.RateCardCode || '').trim(),
      serviceName: String(entry.RateCardDescription || entry.RateCardCode || 'CouriersPlease Service').trim(),
      priceIncGst,
      priceExGst,
      gst,
      eta: String(entry.ETA || '').trim(),
      notes: noteParts.join(' · ')
    };
  });
}

/**
 * Test CouriersPlease credentials against /v1/locations.
 * @param {object} settings
 * @param {typeof fetch} [fetchImpl]
 */
export async function testCouriersPlease(settings, fetchImpl = fetch) {
  const cfg = settings?.carriers?.couriersPlease || {};
  const account = String(cfg.account || '').trim();
  const apiKey = String(cfg.apiKey || '').trim();
  if (!account || !apiKey) {
    throw new CarrierError({
      code: 'MISSING_CREDENTIALS',
      carrierId: CARRIER_IDS.COURIERS_PLEASE,
      title: 'CouriersPlease credentials incomplete',
      message: 'Both Account Number and API Token are required.'
    });
  }

  const baseUrl = resolveCouriersPleaseBaseUrl(cfg);
  const url = `${baseUrl}/v1/locations?suburbOrPostcode=2000`;
  let response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: buildCouriersPleaseHeaders(account, apiKey)
      },
      fetchImpl
    );
  } catch (err) {
    throw asCarrierError(err, { carrierId: CARRIER_IDS.COURIERS_PLEASE, url });
  }

  const payload = await readJsonSafe(response);
  if (!response.ok || (payload?.responseCode && payload.responseCode !== 'SUCCESS')) {
    throw asCarrierError(new Error(payload?.msg || `HTTP ${response.status}`), {
      carrierId: CARRIER_IDS.COURIERS_PLEASE,
      status: response.status,
      payload,
      url
    });
  }

  const count = Array.isArray(payload?.data) ? payload.data.length : 0;
  return {
    ok: true,
    summary: `Connected to ${baseUrl} — verified ${count} Sydney (2000) pickup locations.`
  };
}
