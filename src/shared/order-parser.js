/**
 * Pure order-page parsing logic mirroring the one-shot LogicSync DOM extractor.
 * Strictly extracts ONLY destination (suburb, state, postcode, country, addressType)
 * and item parcel attributes (weightKg, quantity, optional dimensions). Never reads PII.
 */

const WEIGHT_RE = /(\d+(?:\.\d+)?)\s*(kgs?|grams?|gms?|g)\b/i;
const DIMS_RE = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(cm|mm)?\b/i;

/**
 * Normalize a weight measurement into kilograms.
 * @param {number|string} value
 * @param {string} unit
 * @returns {number}
 */
export function normalizeWeightToKg(value, unit) {
  const num = Number.parseFloat(String(value));
  if (!Number.isFinite(num) || num <= 0) return 0;
  const u = String(unit || 'kg').trim().toLowerCase();
  const kg = u.startsWith('g') ? num / 1000 : num;
  return Math.round(kg * 10000) / 10000;
}

function cleanValue(val) {
  return String(val || '').replace(/\s+/g, ' ').trim();
}

function extractLabeledField(lines, labelName) {
  const labelRe = new RegExp(`^${labelName}\\s*:?\\s*(.*)$`, 'i');
  for (let i = 0; i < lines.length; i += 1) {
    const match = lines[i].match(labelRe);
    if (!match) continue;
    const inline = cleanValue(match[1]);
    if (inline && !/^(phone|street|suburb|state|postcode|country|update)$/i.test(inline)) {
      return inline;
    }
    const next = cleanValue(lines[i + 1]);
    if (next && !/^[A-Za-z]+\s*:/.test(next)) {
      return next;
    }
  }
  return '';
}

/**
 * Parse ONLY the # Shipping section text (bounded before # Billing).
 * @param {string} shippingText
 */
export function parseShippingBlock(shippingText) {
  const lines = String(shippingText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const headerLine = lines.find((l) => /shipping/i.test(l)) || '';
  let addressType = 'RESIDENTIAL';
  if (/business|commercial/i.test(headerLine)) addressType = 'BUSINESS';

  const suburb = extractLabeledField(lines, 'Suburb');
  const state = extractLabeledField(lines, 'State').toUpperCase();
  const rawPostcode = extractLabeledField(lines, 'Postcode');
  const postcodeMatch = rawPostcode.match(/\b(\d{4})\b/);
  const postcode = postcodeMatch ? postcodeMatch[1] : rawPostcode;
  const country = (extractLabeledField(lines, 'Country') || 'AU').toUpperCase();

  return { suburb, state, postcode, country, addressType };
}

/**
 * Parse ONLY the Items section text (bounded before Tracking / Note / Information).
 * @param {string} itemsText
 */
export function parseItemsBlock(itemsText) {
  const lines = String(itemsText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  let i = 0;
  while (i < lines.length) {
    const weightMatch = lines[i].match(WEIGHT_RE);
    if (!weightMatch) {
      i += 1;
      continue;
    }

    const weightKg = normalizeWeightToKg(weightMatch[1], weightMatch[2]);
    let quantity = 1;
    let lengthCm = null;
    let widthCm = null;
    let heightCm = null;

    // Look back 1 line for product title/SKU label and ahead up to 5 lines for Qty / dims
    const prevLine = i > 0 ? lines[i - 1] : '';
    const windowLines = lines.slice(i, Math.min(lines.length, i + 6));
    const windowJoined = windowLines.join(' ');

    const qtyMatch = windowJoined.match(/Qty\s*:?\s*(\d+)/i);
    if (qtyMatch) {
      const parsedQty = Number.parseInt(qtyMatch[1], 10);
      if (Number.isFinite(parsedQty) && parsedQty > 0) quantity = parsedQty;
    }

    const dimsMatch = `${prevLine} ${windowJoined}`.match(DIMS_RE);
    if (dimsMatch) {
      const factor = (dimsMatch[4] || 'cm').toLowerCase() === 'mm' ? 0.1 : 1;
      lengthCm = Math.round(Number.parseFloat(dimsMatch[1]) * factor * 10) / 10;
      widthCm = Math.round(Number.parseFloat(dimsMatch[2]) * factor * 10) / 10;
      heightCm = Math.round(Number.parseFloat(dimsMatch[3]) * factor * 10) / 10;
    }

    const skuPart = lines[i].split('|')[0]?.trim();
    const rawLabel = prevLine && !/^(items?|price|qty|amount)$/i.test(prevLine)
      ? prevLine
      : (skuPart || `Item ${items.length + 1}`);

    items.push({
      label: rawLabel.slice(0, 60),
      weightKg,
      quantity,
      lengthCm,
      widthCm,
      heightCm
    });

    // Advance past this item's price/qty lines to avoid double-matching
    i += 1;
  }

  return items;
}

/**
 * Parse full LogicSync Order Information text into non-PII carrier quote parameters.
 * @param {string} fullText
 */
export function parseOrderPageText(fullText) {
  const text = String(fullText || '');
  if (!text.trim()) {
    return { ok: false, errorCode: 'NOT_ORDER_PAGE', destination: null, items: [], warnings: [] };
  }

  // Slice strictly between # Shipping (or Shipping:) and # Billing / Tracking / Note
  const shippingMatch = text.match(/(?:#\s*)?Shipping\b[\s\S]*?(?=(?:#\s*)?Billing\b|\bTracking\b|\bInformation\b|$)/i);
  const itemsMatch = text.match(/\bItems\b[\s\S]*?(?=\bTracking\b|\bNote\b|\bInformation\b|$)/i);

  if (!shippingMatch && !itemsMatch) {
    return { ok: false, errorCode: 'NOT_ORDER_PAGE', destination: null, items: [], warnings: [] };
  }

  const destination = shippingMatch
    ? parseShippingBlock(shippingMatch[0])
    : { suburb: '', state: '', postcode: '', country: 'AU', addressType: 'RESIDENTIAL' };

  const items = itemsMatch ? parseItemsBlock(itemsMatch[0]) : [];
  const warnings = [];

  if (!destination.postcode) {
    return {
      ok: false,
      errorCode: 'MISSING_SHIPPING_POSTCODE',
      destination,
      items,
      warnings
    };
  }

  if (!items.length) {
    return {
      ok: false,
      errorCode: 'MISSING_ITEMS',
      destination,
      items,
      warnings
    };
  }

  if (items.some((item) => !item.weightKg || item.weightKg <= 0)) {
    return {
      ok: false,
      errorCode: 'MISSING_ITEM_WEIGHT',
      destination,
      items,
      warnings
    };
  }

  if (!destination.suburb) {
    warnings.push('Shipping suburb was blank on the page; CouriersPlease may need suburb verification.');
  }

  return { ok: true, errorCode: '', destination, items, warnings };
}
