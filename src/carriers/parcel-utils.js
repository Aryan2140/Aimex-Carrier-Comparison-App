/**
 * Shared HTTP fetch, rounding, encoding, validation, and parcel-expansion utilities.
 */

import { REQUEST_TIMEOUT_MS } from '../shared/constants.js';
import { CarrierError } from '../shared/errors.js';

/**
 * Round a currency number half-up to 2 decimal places.
 * @param {number|string} value
 * @returns {number}
 */
export function round2(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * Encode credentials safely into Base64 (supports UTF-8 characters).
 * @param {string} text
 * @returns {string}
 */
export function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Execute fetch with an AbortController timeout guard.
 * @param {string} url
 * @param {RequestInit} options
 * @param {typeof fetch} [fetchImpl]
 * @param {number} [timeoutMs]
 */
export async function fetchWithTimeout(url, options = {}, fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Safely parse a fetch Response body as JSON (falling back to raw text snippet if HTML/text).
 * @param {Response} response
 * @returns {Promise<any>}
 */
export async function readJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240) };
  }
}

/**
 * Assert destination is a valid domestic Australian shipping address.
 * @param {object} destination
 * @param {string} carrierId
 */
export function assertDomesticAuDestination(destination, carrierId) {
  const country = String(destination?.country || 'AU').trim().toUpperCase();
  if (country && country !== 'AU' && country !== 'AUSTRALIA') {
    throw new CarrierError({
      code: 'INTERNATIONAL_UNSUPPORTED',
      carrierId,
      title: 'Domestic Australian orders only',
      message: `This order ships to "${country}". Domestic carrier quotes only support Australian destinations (AU).`,
      suggestion: 'Check international shipping options directly in your carrier portal.'
    });
  }

  const postcode = String(destination?.postcode || '').trim();
  if (!/^\d{4}$/.test(postcode)) {
    throw new CarrierError({
      code: 'INVALID_POSTCODE',
      carrierId,
      title: 'Invalid destination postcode',
      message: `Destination postcode "${postcode || 'blank'}" is not a valid 4-digit Australian postcode.`,
      suggestion: 'Confirm the # Shipping postcode on the order page before comparing rates.'
    });
  }
}

/**
 * Resolve effective parcel groups from extracted order items, optional combined or dimension
 * overrides, and packaging preferences.
 * @param {object} order
 * @param {object} settings
 * @returns {{ parcels: Array<{ label: string, weightKg: number, quantity: number, lengthCm: number, widthCm: number, heightCm: number }>, totalWeightKg: number, totalParcelCount: number }}
 */
export function buildOrderParcels(order, settings) {
  const dimsOverride = order?.dimensionOverride || null;
  const combinedOverride = order?.combinedOverride || null;
  const fallbackDims = settings?.defaultDimensions || { lengthCm: 20, widthCm: 15, heightCm: 10 };
  const useDims = (item) => ({
    lengthCm: Number(dimsOverride?.lengthCm || item?.lengthCm || fallbackDims.lengthCm),
    widthCm: Number(dimsOverride?.widthCm || item?.widthCm || fallbackDims.widthCm),
    heightCm: Number(dimsOverride?.heightCm || item?.heightCm || fallbackDims.heightCm)
  });

  const rawItems = Array.isArray(order?.items) ? order.items : [];
  const packagingMode = order?.packagingModeOverride
    || (settings?.packagingMode === 'combined' ? 'combined' : 'per_unit');

  if (packagingMode === 'combined') {
    let summedWeightKg = 0;
    let maxL = 0;
    let maxW = 0;
    let totalH = 0;
    let hasExplicitDims = false;

    for (const item of rawItems) {
      const qty = Math.max(1, Number.parseInt(String(item.quantity || 1), 10) || 1);
      const w = Number(item.weightKg || 0);
      summedWeightKg += w * qty;
      const d = useDims(item);
      if (dimsOverride || (item.lengthCm && item.widthCm && item.heightCm)) {
        hasExplicitDims = true;
        maxL = Math.max(maxL, d.lengthCm);
        maxW = Math.max(maxW, d.widthCm);
        totalH += d.heightCm * qty;
      }
    }

    const customWeight = Number(combinedOverride?.weightKg);
    const finalWeight = Number.isFinite(customWeight) && customWeight > 0
      ? Math.round(customWeight * 10000) / 10000
      : Math.round(summedWeightKg * 10000) / 10000;

    const dims = (combinedOverride?.lengthCm && combinedOverride?.widthCm && combinedOverride?.heightCm)
      ? {
          lengthCm: Number(combinedOverride.lengthCm),
          widthCm: Number(combinedOverride.widthCm),
          heightCm: Number(combinedOverride.heightCm)
        }
      : hasExplicitDims
        ? { lengthCm: maxL, widthCm: maxW, heightCm: totalH }
        : {
            lengthCm: Number(fallbackDims.lengthCm),
            widthCm: Number(fallbackDims.widthCm),
            heightCm: Number(fallbackDims.heightCm)
          };

    return {
      parcels: [{
        label: 'Combined Order',
        weightKg: finalWeight,
        quantity: 1,
        ...dims
      }],
      totalWeightKg: finalWeight,
      totalParcelCount: 1
    };
  }

  // Group identical unit specs in per_unit mode so repeated SKUs stay compact
  const grouped = new Map();
  let totalWeightKg = 0;
  let totalParcelCount = 0;

  for (const item of rawItems) {
    const qty = Math.max(1, Number.parseInt(String(item.quantity || 1), 10) || 1);
    const weightKg = Number(item.weightKg || 0);
    const d = useDims(item);
    totalWeightKg += weightKg * qty;
    totalParcelCount += qty;

    const key = `${weightKg}|${d.lengthCm}|${d.widthCm}|${d.heightCm}`;
    if (grouped.has(key)) {
      grouped.get(key).quantity += qty;
    } else {
      grouped.set(key, {
        label: item.label || 'Parcel',
        weightKg,
        quantity: qty,
        ...d
      });
    }
  }

  return {
    parcels: Array.from(grouped.values()),
    totalWeightKg: Math.round(totalWeightKg * 10000) / 10000,
    totalParcelCount
  };
}
