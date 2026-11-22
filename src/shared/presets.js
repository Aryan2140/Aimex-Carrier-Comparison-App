/**
 * Favourite parcel preset matching and shorthand carrier service label formatters.
 */

import { CARRIER_IDS, CARRIER_META, DEFAULT_PARCEL_PRESETS } from './constants.js';

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
    return hasMultiplierToken(haystack, num);
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
