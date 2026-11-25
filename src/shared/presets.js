/**
 * Favourite parcel preset matching and shorthand carrier service label formatters.
 */

import {
  CARRIER_IDS,
  CARRIER_META,
  DEFAULT_PARCEL_PRESETS,
  DEFAULT_SATCHEL_RULES,
  SATCHEL_PRESETS
} from './constants.js';

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasToken(haystack, token) {
  const re = new RegExp(`(?:^|[^A-Z0-9])${escapeRegex(token)}(?:[^A-Z0-9]|$)`, 'i');
  return re.test(haystack);
}

function hasMultiplierToken(haystack, numStr) {
  const re = new RegExp(`(?:^|[^A-Z0-9])(?:${numStr}\\s*X|X\\s*${numStr})(?:[^A-Z0-9]|$)`, 'i');
  return re.test(haystack);
}

function presetSpecificity(preset) {
  const name = String(preset?.name || '').trim().toUpperCase();
  if (name.includes('/')) return 300 + name.length;
  if (/^\d+X$/i.test(name)) return 100 + Number.parseInt(name, 10);
  return 200 + name.length;
}

function matchesPresetName(haystack, presetName) {
  const upperName = String(presetName || '').trim().toUpperCase();
  if (!upperName) return false;

  // Handle slash aliases with optional trailing multiplier, e.g. "A20/G12 3X"
  if (upperName.includes('/')) {
    if (haystack.includes(upperName)) return true;
    const parts = upperName.split(/\s+/);
    const slashPart = parts.find((p) => p.includes('/')) || upperName;
    const multPart = parts.find((p) => /^\d+X$/i.test(p));
    const aliases = slashPart.split('/').map((s) => s.trim()).filter(Boolean);

    const baseMatched = aliases.some((alias) => hasToken(haystack, alias));
    if (!baseMatched) return false;
    if (!multPart) return true;

    const num = multPart.slice(0, -1);
    if (hasMultiplierToken(haystack, num)) return true;

    // Match natural phrasing e.g. "G12 With 1 AA Stage", "G12 with 1 filter", "A20 with 3 AA filters", "with 3 8 stage filters"
    const phrasePattern = new RegExp(
      '(?:^|[^A-Z0-9])(?:' +
        num + '\\s*(?:(?:AA|8\\s*STAGE|STAGE)\\s*)?(?:FILTER|CARTRIDGE|PACK|STAGE)S?|' +
        '(?:WITH|INCLUDES?)\\s+' + num + '\\b' +
      ')',
      'i'
    );
    return phrasePattern.test(haystack);
  }

  // Handle standalone pack multipliers like "6X" matching "6X", "6 X", "X 6", "X6"
  const multMatch = upperName.match(/^(\d+)X$/i);
  if (multMatch) {
    return hasMultiplierToken(haystack, multMatch[1]);
  }

  // Exact alphanumeric token boundary match (e.g. P24C2D2, P17C2D2, P12C2D2, E20)
  return hasToken(haystack, upperName);
}

/**
 * Match an extracted order item against stored favourite parcel presets.
 * @param {object} item
 * @param {Array<object>} [presets]
 */
export function matchProductPreset(item, presets = DEFAULT_PARCEL_PRESETS) {
  const haystack = `${item?.label || ''} ${item?.sku || ''}`
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
  if (!haystack) return null;

  const list = Array.isArray(presets) && presets.length ? presets : DEFAULT_PARCEL_PRESETS;
  const sorted = [...list].sort((a, b) => presetSpecificity(b) - presetSpecificity(a));

  for (const preset of sorted) {
    if (matchesPresetName(haystack, preset.name)) {
      return preset;
    }
  }
  return null;
}

/**
 * Apply matching favourite preset dimensions and weights onto extracted items.
 * @param {Array<object>} items
 * @param {Array<object>} [presets]
 */
export function applyPresetsToItems(items, presets = DEFAULT_PARCEL_PRESETS) {
  return (items || []).map((item) => {
    const preset = matchProductPreset(item, presets);
    if (!preset) {
      return {
        ...item,
        pageWeightKg: item.weightKg,
        matchedPresetId: '',
        matchedPresetName: ''
      };
    }
    return {
      ...item,
      pageWeightKg: item.weightKg,
      matchedPresetId: preset.id || '',
      matchedPresetName: preset.name,
      weightKg: Number(preset.weightKg),
      lengthCm: Number(preset.lengthCm),
      widthCm: Number(preset.widthCm),
      heightCm: Number(preset.heightCm)
    };
  });
}

/**
 * Format carrier rate titles into short, readable labels for compact tables.
 * @param {string} carrierId
 * @param {string} serviceCode
 * @param {string} serviceName
 * @returns {{ shortInColumn: string, shortWithCarrier: string }}
 */
export function formatShortServiceLabel(carrierId, serviceCode, serviceName) {
  const prefix = CARRIER_META[carrierId]?.prefix || '';
  const code = String(serviceCode || '').toUpperCase();
  const name = String(serviceName || '').trim();
  let shortInColumn = name;

  if (carrierId === CARRIER_IDS.AUSPOST_PAC) {
    if (code === 'AUS_PARCEL_REGULAR') {
      shortInColumn = 'Parcel Post';
    } else if (code === 'AUS_PARCEL_EXPRESS') {
      shortInColumn = 'Express';
    } else if (code.startsWith('AUS_PARCEL_REGULAR_')) {
      shortInColumn = name.replace(/^Parcel Post\s*[—–-]\s*/i, '').trim() || 'Parcel Post';
    } else if (code.startsWith('AUS_PARCEL_EXPRESS_')) {
      const bare = name.replace(/^Express Post\s*[—–-]\s*/i, '').trim();
      shortInColumn = bare ? `Express ${bare}` : 'Express';
    }
  } else if (carrierId === CARRIER_IDS.AUSPOST_EPARCEL) {
    if (code === '3J55' || /express/i.test(name)) {
      shortInColumn = 'Express';
    } else if (code === '3D55' || /parcel post/i.test(name)) {
      shortInColumn = 'Parcel Post';
    } else {
      shortInColumn = name.replace(/\s*\+\s*signature/i, '').trim();
    }
  } else if (carrierId === CARRIER_IDS.COURIERS_PLEASE) {
    let base = name
      .replace(/^CouriersPlease\s*/i, '')
      .replace(/^Domestic\s+/i, '')
      .replace(/^Australian City Express/i, 'City Exp')
      .replace(/\s*-\s*Authority To Leave/i, ' ATL')
      .replace(/\s*-\s*Signature Required/i, ' Sig')
      .replace(/\s+/g, ' ')
      .trim();
    if (!base) base = code || 'Standard';
    shortInColumn = base;
  }

  const shortWithCarrier = prefix ? `${prefix}: ${shortInColumn}` : shortInColumn;
  return { shortInColumn, shortWithCarrier };
}

/**
 * Extract an embedded pack count (e.g. "Filter X 6", "3 x 8 Stage", "3 pieces", "AIM8STG6")
 * while avoiding stage/volume numbers such as "8 Stage", "15 Stage", "20L", "5 Micron".
 * @param {object} item
 * @returns {number}
 */
export function extractItemPackCount(item) {
  const label = String(item?.label || '').toUpperCase();
  const sku = String(item?.sku || '').toUpperCase().trim();
  const combined = `${label} ${sku}`.replace(/\s+/g, ' ').trim();

  // Check explicit multipliers: "X 6", "6 X", "3 x 8 Stage"
  const preMult = label.match(/(?:^|[^A-Z0-9])(\d+)\s*[×X]\s*(?:$|[A-Z0-9])/);
  if (preMult) {
    const n = Number.parseInt(preMult[1], 10);
    if (n > 0 && n <= 20) return n;
  }

  const postMult = label.match(/(?:^|[^A-Z0-9])[×X]\s*(\d+)(?:[^A-Z0-9]|$)/);
  if (postMult) {
    const n = Number.parseInt(postMult[1], 10);
    if (n > 0 && n <= 20) return n;
  }

  // Check "3 pieces", "2 pcs", "4 pack"
  const unitMatch = combined.match(/(?:^|[^A-Z0-9])(\d+)\s*(?:PIECES?|PCS|PACK)(?:[^A-Z0-9]|$)/);
  if (unitMatch) {
    const n = Number.parseInt(unitMatch[1], 10);
    if (n > 0 && n <= 20) return n;
  }

  // Known filter SKU pack suffixes: AIM8STG6, AIMWHT3, 8KDFAAF4, 8KDFCHF6, 8WHITE3WEB, AIMSHRCART4, 7KDFCHF2
  const skuMatch = sku.match(/(?:AIM8STG|AIMWHT|8KDFAAF|8KDFCHF|7KDFCHF|8WHITE|AIMSHRCART|AIMEXACB)(\d+)/);
  if (skuMatch) {
    const n = Number.parseInt(skuMatch[1], 10);
    if (n > 0 && n <= 20) return n;
  }

  return 1;
}

function matchItemSatchelRule(item, rules) {
  const haystack = `${item?.label || ''} ${item?.sku || ''}`.replace(/\s+/g, ' ').trim().toUpperCase();
  const orderedRules = [
    ...(rules || []).filter((r) => r.fitsSatchel === false),
    ...(rules || []).filter((r) => r.fitsSatchel !== false)
  ];

  for (const rule of orderedRules) {
    const keywords = String(rule.keywords || '')
      .split(',')
      .map((k) => k.trim().toUpperCase())
      .filter(Boolean);
    for (const kw of keywords) {
      if (hasToken(haystack, kw) || (kw.length >= 4 && haystack.includes(kw))) {
        return rule;
      }
    }
  }
  return null;
}

/**
 * Determine the smallest enabled satchel that fits all order items using Aimex volume units + weights.
 * Rule scale: 1 standard filter = 1.0 unit; Maifan stone / small part = 0.5 units;
 * Small <= 1.0 units, Large <= 3.0 units, Extra Large <= 6.0 units (and totalWeightKg <= maxWeightKg).
 * @param {Array<object>} items
 * @param {object} [settings]
 * @returns {{ fits: boolean, satchel: object | null, totalUnits: number, totalWeightKg: number, reason: string }}
 */
export function determineBestSatchel(items, settings = {}) {
  const list = Array.isArray(items) ? items : [];
  const rules = Array.isArray(settings?.satchelRules) && settings.satchelRules.length
    ? settings.satchelRules
    : DEFAULT_SATCHEL_RULES;
  const sizes = (Array.isArray(settings?.satchelSizes) && settings.satchelSizes.length
    ? settings.satchelSizes
    : SATCHEL_PRESETS
  ).filter((s) => s && s.autoMatch !== false);

  let totalWeightKg = 0;
  let totalUnits = 0;

  for (const item of list) {
    const qty = Math.max(1, Number.parseInt(String(item?.quantity || 1), 10) || 1);
    const unitWeightKg = Math.max(0, Number(item?.weightKg || 0));
    totalWeightKg += unitWeightKg * qty;

    const rule = matchItemSatchelRule(item, rules);
    if (rule && rule.fitsSatchel === false) {
      const roundedW = Math.round(totalWeightKg * 1000) / 1000;
      return {
        fits: false,
        satchel: null,
        totalUnits: 0,
        totalWeightKg: roundedW,
        reason: `"${item.label || item.sku || 'Item'}" (${rule.name}) does not fit in a satchel — use Parcel Dimensions.`
      };
    }

    const packCount = extractItemPackCount(item);
    let itemUnits;
    if (rule) {
      itemUnits = Number(rule.units || 0) * packCount * qty;
    } else if (unitWeightKg > 5) {
      const roundedW = Math.round(totalWeightKg * 1000) / 1000;
      return {
        fits: false,
        satchel: null,
        totalUnits: 0,
        totalWeightKg: roundedW,
        reason: `"${item.label || 'Item'}" (${unitWeightKg} kg) exceeds the 5 kg satchel weight limit.`
      };
    } else {
      // Heuristic fallback for unknown accessories: ~0.75 kg per standard filter unit
      const estUnits = unitWeightKg > 0 ? Math.max(0.5, Math.ceil((unitWeightKg / 0.75) * 2) / 2) : 1;
      itemUnits = estUnits * qty;
    }

    totalUnits += itemUnits;
  }

  totalWeightKg = Math.round(totalWeightKg * 1000) / 1000;
  totalUnits = Math.round(totalUnits * 100) / 100;

  if (!sizes.length) {
    return {
      fits: false,
      satchel: null,
      totalUnits,
      totalWeightKg,
      reason: 'No satchel sizes enabled for auto-match in Settings.'
    };
  }

  const maxAllowedWeight = Math.max(...sizes.map((s) => Number(s.maxWeightKg || 5)));
  if (totalWeightKg > maxAllowedWeight) {
    return {
      fits: false,
      satchel: null,
      totalUnits,
      totalWeightKg,
      reason: `Total weight (${totalWeightKg} kg) exceeds the ${maxAllowedWeight} kg satchel limit.`
    };
  }

  const sortedSizes = [...sizes].sort(
    (a, b) => Number(a.maxUnits || 0) - Number(b.maxUnits || 0) || Number(a.maxWeightKg || 0) - Number(b.maxWeightKg || 0)
  );

  for (const satchel of sortedSizes) {
    if (totalUnits <= Number(satchel.maxUnits || 0) && totalWeightKg <= Number(satchel.maxWeightKg || 5)) {
      return {
        fits: true,
        satchel,
        totalUnits,
        totalWeightKg,
        reason: `${satchel.name} (${totalUnits}u · ${totalWeightKg} kg)`
      };
    }
  }

  const largest = sortedSizes[sortedSizes.length - 1];
  return {
    fits: false,
    satchel: null,
    totalUnits,
    totalWeightKg,
    reason: `Combined items (${totalUnits} units) exceed the largest satchel capacity (${largest.maxUnits} units).`
  };
}
