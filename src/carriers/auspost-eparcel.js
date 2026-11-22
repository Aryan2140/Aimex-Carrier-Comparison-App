/**
 * Australia Post eParcel (Shipping & Tracking API) contract rate client.
 */

import { AUSPOST_BASE_URL, CARRIER_IDS } from '../shared/constants.js';
import { CarrierError, asCarrierError } from '../shared/errors.js';
import {
  assertDomesticAuDestination,
  buildOrderParcels,
  fetchWithTimeout,
  readJsonSafe,
  round2,
  toBase64Utf8
} from './parcel-utils.js';

const PRICES_ITEMS_URL = `${AUSPOST_BASE_URL}/shipping/v1/prices/items`;
const PRICES_SHIPMENTS_URL = `${AUSPOST_BASE_URL}/shipping/v1/prices/shipments`;
const ACCOUNTS_URL = `${AUSPOST_BASE_URL}/shipping/v1/accounts`;
const MAX_PARCEL_WEIGHT_KG = 22;
const MAX_SHIPMENT_ITEMS = 20;

function buildEparcelHeaders(cfg) {
  return {
    Authorization: `Basic ${toBase64Utf8(`${cfg.apiKey}:${cfg.apiPassword}`)}`,
    'Account-Number': String(cfg.accountNumber).trim(),
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };
}

function formatEparcelProductName(productType, productId) {
  const raw = String(productType || productId || 'eParcel Service').trim();
  return raw
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bPost\b/i, 'Post');
}

async function postEparcelJson(url, headers, body, fetchImpl) {
  let response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
      },
      fetchImpl
    );
  } catch (err) {
    throw asCarrierError(err, { carrierId: CARRIER_IDS.AUSPOST_EPARCEL, url });
  }

  const payload = await readJsonSafe(response);
  if (!response.ok) {
    throw asCarrierError(new Error(`HTTP ${response.status}`), {
      carrierId: CARRIER_IDS.AUSPOST_EPARCEL,
      status: response.status,
      payload,
      url
    });
  }
  return payload;
}

/**
 * Fetch Australia Post eParcel contract shipping rates for an order.
 * @param {object} order
 * @param {object} settings
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchAusPostEparcelRates(order, settings, fetchImpl = fetch) {
  const carrierId = CARRIER_IDS.AUSPOST_EPARCEL;
  const cfg = settings?.carriers?.auspostEparcel || {};
  const apiKey = String(cfg.apiKey || '').trim();
  const apiPassword = String(cfg.apiPassword || '').trim();
  const accountNumber = String(cfg.accountNumber || '').trim();

  if (!apiKey || !apiPassword || !accountNumber) {
    const missing = [
      !apiKey ? 'Shipping API Key' : '',
      !apiPassword ? 'Shipping API Password' : '',
      !accountNumber ? '10-digit Account Number' : ''
    ].filter(Boolean);
    throw new CarrierError({
      code: 'MISSING_CREDENTIALS',
      carrierId,
      title: 'AusPost eParcel credentials missing',
      message: `Missing ${missing.join(', ')}.`,
      suggestion: 'Enter all Australia Post eParcel credentials in Settings.',
      actionType: 'open_settings'
    });
  }

  assertDomesticAuDestination(order?.destination, carrierId);
  const origin = settings?.origin || {};
  if (!/^\d{4}$/.test(String(origin.postcode || '').trim())) {
    throw new CarrierError({
      code: 'INVALID_ORIGIN_POSTCODE',
      carrierId,
      title: 'Origin postcode invalid',
      message: 'Dispatch origin postcode must be a 4-digit Australian postcode.',
      suggestion: 'Update the Origin Address in Settings.',
      actionType: 'open_settings'
    });
  }

  const { parcels, totalParcelCount } = buildOrderParcels(order, settings);
  if (totalParcelCount > MAX_SHIPMENT_ITEMS) {
    throw new CarrierError({
      code: 'TOO_MANY_ITEMS',
      carrierId,
      title: 'Exceeds eParcel 20-parcel limit',
      message: `Australia Post eParcel supports up to ${MAX_SHIPMENT_ITEMS} parcels per shipment calculation (this order has ${totalParcelCount}).`,
      suggestion: 'Switch Packaging Mode to "Combine into single parcel" in Settings to estimate.',
      actionType: 'open_settings'
    });
  }

  const expandedUnits = [];
  for (const parcel of parcels) {
    if (parcel.weightKg > MAX_PARCEL_WEIGHT_KG) {
      throw new CarrierError({
        code: 'OVERWEIGHT',
        carrierId,
        title: 'Parcel exceeds eParcel 22 kg limit',
        message: `Parcel weight (${parcel.weightKg} kg) exceeds Australia Post eParcel's 22 kg per-parcel limit.`,
        suggestion:
          settings?.packagingMode === 'combined'
            ? 'Switch Packaging Mode to "Each unit as its own parcel" in Settings.'
            : 'This unit exceeds AusPost eParcel\'s 22 kg parcel limit.'
      });
    }
    for (let i = 0; i < parcel.quantity; i += 1) {
      expandedUnits.push({
        length: parcel.lengthCm,
        width: parcel.widthCm,
        height: parcel.heightCm,
        weight: parcel.weightKg
      });
    }
  }

  const headers = buildEparcelHeaders({ apiKey, apiPassword, accountNumber });
  const fromBlock = {
    postcode: String(origin.postcode).trim(),
    ...(origin.suburb ? { suburb: String(origin.suburb).trim() } : {}),
    ...(origin.state ? { state: String(origin.state).trim() } : {})
  };
  const toBlock = {
    postcode: String(order.destination.postcode).trim(),
    ...(order.destination.suburb ? { suburb: String(order.destination.suburb).trim() } : {}),
    ...(order.destination.state ? { state: String(order.destination.state).trim() } : {}),
    country: 'AU'
  };

  // Step 1: Discover eligible contract products and base item prices
  const itemsPayload = await postEparcelJson(
    PRICES_ITEMS_URL,
    headers,
    { from: fromBlock, to: toBlock, items: expandedUnits },
    fetchImpl
  );

  const itemResults = Array.isArray(itemsPayload?.items) ? itemsPayload.items : [];
  if (!itemResults.length) return [];

  const productMeta = new Map();
  const productItemTotals = new Map();

  for (let idx = 0; idx < itemResults.length; idx += 1) {
    const prices = Array.isArray(itemResults[idx]?.prices) ? itemResults[idx].prices : [];
    const seenIds = new Set();
    for (const p of prices) {
      const pid = String(p.product_id || '');
      if (!pid) continue;
      seenIds.add(pid);
      productMeta.set(pid, {
        productId: pid,
        productType: String(p.product_type || pid)
      });
      const existing = productItemTotals.get(pid) || { inc: 0, ex: 0, gst: 0, count: 0 };
      existing.inc += Number(p.calculated_price || 0);
      existing.ex += Number(p.calculated_price_ex_gst || 0);
      existing.gst += Number(p.calculated_gst || 0);
      existing.count += 1;
      productItemTotals.set(pid, existing);
    }

    if (idx > 0) {
      for (const pid of Array.from(productItemTotals.keys())) {
        if (!seenIds.has(pid)) productItemTotals.delete(pid);
      }
    }
  }

  const eligibleIds = Array.from(productItemTotals.keys());
  if (!eligibleIds.length) return [];

  // Step 2: Query /prices/shipments so fuel & security surcharges are included accurately
  const shipmentsByProduct = new Map();
  if (cfg.includeSurcharges !== false) {
    try {
      const shipmentResp = await postEparcelJson(
        PRICES_SHIPMENTS_URL,
        headers,
        {
          shipments: eligibleIds.map((productId) => ({
            from: fromBlock,
            to: toBlock,
            items: expandedUnits.map((u) => ({
              product_id: productId,
              length: u.length,
              width: u.width,
              height: u.height,
              weight: u.weight
            }))
          }))
        },
        fetchImpl
      );

      for (const sh of shipmentResp?.shipments || []) {
        const pid = String(sh?.items?.[0]?.product_id || '');
        if (pid && sh?.shipment_summary) {
          shipmentsByProduct.set(pid, sh.shipment_summary);
        }
      }
    } catch (err) {
      // If auth failed, rethrow immediately; otherwise fall back gracefully to item prices
      if (err?.code === 'AUTH_FAILED') throw err;
    }
  }

  return eligibleIds.map((productId) => {
    const meta = productMeta.get(productId);
    const summary = shipmentsByProduct.get(productId);
    const serviceName = formatEparcelProductName(meta?.productType, productId);

    if (summary && Number.isFinite(Number(summary.total_cost))) {
      const priceIncGst = round2(summary.total_cost);
      const priceExGst = round2(summary.total_cost_ex_gst ?? priceIncGst / 1.1);
      const gst = round2(summary.total_gst ?? (priceIncGst - priceExGst));

      const noteParts = [];
      if (Number(summary.shipping_cost) > 0) {
        noteParts.push(`Base $${Number(summary.shipping_cost).toFixed(2)}`);
      }
      if (Number(summary.fuel_surcharge) > 0) {
        noteParts.push(`Fuel $${Number(summary.fuel_surcharge).toFixed(2)}`);
      }
      if (Number(summary.security_surcharge) > 0) {
        noteParts.push(`Security $${Number(summary.security_surcharge).toFixed(2)}`);
      }
      const breakdown = noteParts.length ? `${noteParts.join(' + ')} (ex GST)` : 'Incl. contract surcharges';

      return {
        carrierId,
        carrierName: 'eParcel',
        serviceCode: productId,
        serviceName,
        priceIncGst,
        priceExGst,
        gst,
        eta: '',
        notes: totalParcelCount > 1 ? `${totalParcelCount} parcels · ${breakdown}` : breakdown
      };
    }

    const fallback = productItemTotals.get(productId);
    const priceIncGst = round2(fallback.inc);
    const priceExGst = round2(fallback.ex);
    const gst = round2(fallback.gst);
    return {
      carrierId,
      carrierName: 'eParcel',
      serviceCode: productId,
      serviceName,
      priceIncGst,
      priceExGst,
      gst,
      eta: '',
      notes: 'Base rate (excl. fuel surcharge)'
    };
  });
}

/**
 * Test Australia Post eParcel credentials against the account endpoint.
 * @param {object} settings
 * @param {typeof fetch} [fetchImpl]
 */
export async function testAusPostEparcel(settings, fetchImpl = fetch) {
  const cfg = settings?.carriers?.auspostEparcel || {};
  const apiKey = String(cfg.apiKey || '').trim();
  const apiPassword = String(cfg.apiPassword || '').trim();
  const accountNumber = String(cfg.accountNumber || '').trim();

  if (!apiKey || !apiPassword || !accountNumber) {
    throw new CarrierError({
      code: 'MISSING_CREDENTIALS',
      carrierId: CARRIER_IDS.AUSPOST_EPARCEL,
      title: 'eParcel credentials incomplete',
      message: 'API Key, API Password, and 10-digit Account Number are all required.'
    });
  }

  const url = `${ACCOUNTS_URL}/${encodeURIComponent(accountNumber)}`;
  let response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: buildEparcelHeaders({ apiKey, apiPassword, accountNumber })
      },
      fetchImpl
    );
  } catch (err) {
    throw asCarrierError(err, { carrierId: CARRIER_IDS.AUSPOST_EPARCEL, url });
  }

  const payload = await readJsonSafe(response);
  if (!response.ok) {
    throw asCarrierError(new Error(`HTTP ${response.status}`), {
      carrierId: CARRIER_IDS.AUSPOST_EPARCEL,
      status: response.status,
      payload,
      url
    });
  }

  const lodgement = payload?.details?.lodgement_postcode || '';
  const products = Array.isArray(payload?.postage_products) ? payload.postage_products.length : 0;
  return {
    ok: true,
    summary: `Connected (${payload?.name || accountNumber}) — ${products} contract products, lodgement postcode ${lodgement || 'n/a'}.`
  };
}
