/**
 * Chrome storage persistence, .env parsing, and first-run config.local.json hydration.
 */

import { AU_STATES, COURIERSPLEASE_URLS, DEFAULT_REPO_URL, DEFAULT_SETTINGS } from './constants.js';

const STORAGE_KEYS = {
  SETTINGS: 'settings',
  INITIALIZED: 'settingsInitialized',
  LAST_COMPARISON: 'lastComparison'
};

function clampInt(value, min, max, fallback) {
  const num = Number.parseInt(String(value), 10);
  if (Number.isNaN(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function positiveFloat(value, fallback) {
  const num = Number.parseFloat(String(value));
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return num;
}

function cleanString(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function resolveCouriersPleaseEnvFromUrl(urlString) {
  const raw = cleanString(urlString).replace(/\/+$/, '');
  if (!raw) return { environment: 'production', customBaseUrl: '', warning: '' };

  if (/^https?:\/\/apidev\.couriersplease\.com\.au/i.test(raw)) {
    return {
      environment: 'production',
      customBaseUrl: '',
      warning:
        'COURIERSPLEASE_BASE_URL pointed to apidev.couriersplease.com.au (the documentation portal). Mapped to the production API (https://api.couriersplease.com.au).'
    };
  }
  if (raw.toLowerCase() === COURIERSPLEASE_URLS.production) {
    return { environment: 'production', customBaseUrl: '', warning: '' };
  }
  if (raw.toLowerCase() === COURIERSPLEASE_URLS.sandbox) {
    return { environment: 'sandbox', customBaseUrl: '', warning: '' };
  }
  return { environment: 'custom', customBaseUrl: raw, warning: '' };
}

/**
 * Deep-merge settings overrides onto base settings with schema normalization.
 * Preserves leading zeros on postcodes and account numbers by storing them as strings.
 * @param {object} base
 * @param {object} override
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function mergeSettings(base = DEFAULT_SETTINGS, override = {}) {
  const src = override && typeof override === 'object' ? override : {};
  const baseOrigin = base.origin || DEFAULT_SETTINGS.origin;
  const ovOrigin = src.origin || {};
  const baseDims = base.defaultDimensions || DEFAULT_SETTINGS.defaultDimensions;
  const ovDims = src.defaultDimensions || {};
  const baseCarriers = base.carriers || DEFAULT_SETTINGS.carriers;
  const ovCarriers = src.carriers || {};
  const baseUpdates = base.updates || DEFAULT_SETTINGS.updates;
  const ovUpdates = src.updates || {};

  const stateCandidate = cleanString(ovOrigin.state, baseOrigin.state).toUpperCase();
  const normalizedState = AU_STATES.includes(stateCandidate) ? stateCandidate : baseOrigin.state;

  const cpOverride = { ...(ovCarriers.couriersPlease || {}) };
  if (src.couriersPleaseBaseUrl && !cpOverride.customBaseUrl && !cpOverride.environment) {
    const resolved = resolveCouriersPleaseEnvFromUrl(src.couriersPleaseBaseUrl);
    cpOverride.environment = resolved.environment;
    cpOverride.customBaseUrl = resolved.customBaseUrl;
  }

  const cpEnv = ['production', 'sandbox', 'custom'].includes(cpOverride.environment)
    ? cpOverride.environment
    : (baseCarriers.couriersPlease?.environment || 'production');

  return {
    maxPricesPerCourier: clampInt(
      src.maxPricesPerCourier,
      1,
      20,
      base.maxPricesPerCourier ?? DEFAULT_SETTINGS.maxPricesPerCourier
    ),
    includeGst: typeof src.includeGst === 'boolean'
      ? src.includeGst
      : Boolean(base.includeGst ?? DEFAULT_SETTINGS.includeGst),
    packagingMode: ['per_unit', 'combined'].includes(src.packagingMode)
      ? src.packagingMode
      : (base.packagingMode || DEFAULT_SETTINGS.packagingMode),
    theme: ['system', 'light', 'dark'].includes(src.theme)
      ? src.theme
      : (base.theme || DEFAULT_SETTINGS.theme),
    origin: {
      suburb: cleanString(ovOrigin.suburb, baseOrigin.suburb).toUpperCase(),
      state: normalizedState,
      postcode: cleanString(ovOrigin.postcode, baseOrigin.postcode)
    },
    defaultDimensions: {
      lengthCm: positiveFloat(ovDims.lengthCm, baseDims.lengthCm),
      widthCm: positiveFloat(ovDims.widthCm, baseDims.widthCm),
      heightCm: positiveFloat(ovDims.heightCm, baseDims.heightCm)
    },
    carriers: {
      auspostPac: {
        enabled: typeof ovCarriers.auspostPac?.enabled === 'boolean'
          ? ovCarriers.auspostPac.enabled
          : Boolean(baseCarriers.auspostPac?.enabled ?? true),
        apiKey: cleanString(ovCarriers.auspostPac?.apiKey, baseCarriers.auspostPac?.apiKey || ''),
        includeSatchels: typeof ovCarriers.auspostPac?.includeSatchels === 'boolean'
          ? ovCarriers.auspostPac.includeSatchels
          : Boolean(baseCarriers.auspostPac?.includeSatchels ?? true)
      },
      auspostEparcel: {
        enabled: typeof ovCarriers.auspostEparcel?.enabled === 'boolean'
          ? ovCarriers.auspostEparcel.enabled
          : Boolean(baseCarriers.auspostEparcel?.enabled ?? true),
        apiKey: cleanString(ovCarriers.auspostEparcel?.apiKey, baseCarriers.auspostEparcel?.apiKey || ''),
        apiPassword: cleanString(ovCarriers.auspostEparcel?.apiPassword, baseCarriers.auspostEparcel?.apiPassword || ''),
        accountNumber: cleanString(ovCarriers.auspostEparcel?.accountNumber, baseCarriers.auspostEparcel?.accountNumber || ''),
        includeSurcharges: typeof ovCarriers.auspostEparcel?.includeSurcharges === 'boolean'
          ? ovCarriers.auspostEparcel.includeSurcharges
          : Boolean(baseCarriers.auspostEparcel?.includeSurcharges ?? true)
      },
      couriersPlease: {
        enabled: typeof cpOverride.enabled === 'boolean'
          ? cpOverride.enabled
          : Boolean(baseCarriers.couriersPlease?.enabled ?? true),
        account: cleanString(cpOverride.account, baseCarriers.couriersPlease?.account || ''),
        apiKey: cleanString(cpOverride.apiKey, baseCarriers.couriersPlease?.apiKey || ''),
        environment: cpEnv,
        customBaseUrl: cleanString(cpOverride.customBaseUrl, baseCarriers.couriersPlease?.customBaseUrl || '').replace(/\/+$/, ''),
        validateLocation: typeof cpOverride.validateLocation === 'boolean'
          ? cpOverride.validateLocation
          : Boolean(baseCarriers.couriersPlease?.validateLocation ?? true)
      }
    },
    updates: {
      repoUrl: cleanString(ovUpdates.repoUrl, baseUpdates.repoUrl || DEFAULT_REPO_URL),
      githubToken: cleanString(ovUpdates.githubToken, baseUpdates.githubToken || '')
    }
  };
}

/**
 * Parse .env key/value contents into a partial settings object plus friendly warnings.
 * @param {string} envText
 * @returns {{ settingsPatch: object, warnings: string[], foundKeys: string[] }}
 */
export function parseEnvText(envText) {
  const lines = String(envText || '').split(/\r?\n/);
  const env = {};
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const withoutExport = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
    const eqIdx = withoutExport.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = withoutExport.slice(0, eqIdx).trim();
    let val = withoutExport.slice(eqIdx + 1).trim();

    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      const commentIdx = val.indexOf(' #');
      if (commentIdx !== -1) val = val.slice(0, commentIdx).trim();
    }
    env[key] = val;
  }

  const warnings = [];
  const foundKeys = [];
  const settingsPatch = {
    origin: {},
    carriers: {
      auspostPac: {},
      auspostEparcel: {},
      couriersPlease: {}
    },
    updates: {}
  };

  const record = (envKey, setter) => {
    if (Object.hasOwn(env, envKey) && env[envKey] !== '') {
      foundKeys.push(envKey);
      setter(env[envKey]);
    }
  };

  record('AUSPOST_PAC_API_KEY', (v) => { settingsPatch.carriers.auspostPac.apiKey = v; });
  record('AUSPOST_SHIPPING_API_KEY', (v) => { settingsPatch.carriers.auspostEparcel.apiKey = v; });
  record('AUSPOST_SHIPPING_API_PASSWORD', (v) => { settingsPatch.carriers.auspostEparcel.apiPassword = v; });
  record('AUSPOST_ACCOUNT_NUMBER', (v) => { settingsPatch.carriers.auspostEparcel.accountNumber = v; });
  record('COURIERSPLEASE_API_KEY', (v) => { settingsPatch.carriers.couriersPlease.apiKey = v; });
  record('COURIERSPLEASE_ACCOUNT', (v) => { settingsPatch.carriers.couriersPlease.account = v; });
  record('COURIERSPLEASE_BASE_URL', (v) => {
    const resolved = resolveCouriersPleaseEnvFromUrl(v);
    settingsPatch.carriers.couriersPlease.environment = resolved.environment;
    settingsPatch.carriers.couriersPlease.customBaseUrl = resolved.customBaseUrl;
    if (resolved.warning) warnings.push(resolved.warning);
  });
  record('ORIGIN_SUBURB', (v) => { settingsPatch.origin.suburb = v; });
  record('ORIGIN_STATE', (v) => { settingsPatch.origin.state = v; });
  record('ORIGIN_POSTCODE', (v) => { settingsPatch.origin.postcode = v; });
  record('GITHUB_REPO_URL', (v) => { settingsPatch.updates.repoUrl = v; });
  record('GITHUB_TOKEN', (v) => { settingsPatch.updates.githubToken = v; });

  return { settingsPatch, warnings, foundKeys };
}

/**
 * Load extension settings, hydrating once from gitignored config.local.json if present.
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function loadSettings() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.INITIALIZED]);
  if (stored[STORAGE_KEYS.INITIALIZED] && stored[STORAGE_KEYS.SETTINGS]) {
    return mergeSettings(DEFAULT_SETTINGS, stored[STORAGE_KEYS.SETTINGS]);
  }

  let initial = mergeSettings(DEFAULT_SETTINGS, stored[STORAGE_KEYS.SETTINGS] || {});
  try {
    const localUrl = chrome.runtime.getURL('config.local.json');
    const response = await fetch(localUrl);
    if (response.ok) {
      const localConfig = await response.json();
      initial = mergeSettings(initial, localConfig);
    }
  } catch {
    // config.local.json is optional and absent in clean repository checkouts.
  }

  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: initial,
    [STORAGE_KEYS.INITIALIZED]: true
  });
  return initial;
}

/**
 * Persist normalized settings to chrome.storage.local.
 * @param {object} nextSettings
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function saveSettings(nextSettings) {
  const current = await loadSettings();
  const merged = mergeSettings(current, nextSettings);
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: merged,
    [STORAGE_KEYS.INITIALIZED]: true
  });
  return merged;
}

/**
 * Reset settings to defaults (optionally re-hydrating from config.local.json if present).
 * @param {{ useLocalConfig?: boolean }} [options]
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function resetSettings(options = {}) {
  let resetTarget = mergeSettings(DEFAULT_SETTINGS, {});
  if (options.useLocalConfig) {
    try {
      const response = await fetch(chrome.runtime.getURL('config.local.json'));
      if (response.ok) {
        const localConfig = await response.json();
        resetTarget = mergeSettings(resetTarget, localConfig);
      }
    } catch {
      // No local config available.
    }
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: resetTarget,
    [STORAGE_KEYS.INITIALIZED]: true
  });
  return resetTarget;
}

/**
 * Save last comparison summary in ephemeral session storage (strictly non-PII).
 * @param {string} orderUrl
 * @param {object} result
 */
export async function saveLastResult(orderUrl, result) {
  if (!chrome?.storage?.session) return;
  await chrome.storage.session.set({
    [STORAGE_KEYS.LAST_COMPARISON]: {
      orderUrl,
      savedAt: new Date().toISOString(),
      result
    }
  });
}

/**
 * Load cached comparison summary for the active order URL if present in session storage.
 * @param {string} orderUrl
 * @returns {Promise<{ orderUrl: string, savedAt: string, result: object } | null>}
 */
export async function loadLastResult(orderUrl) {
  if (!chrome?.storage?.session || !orderUrl) return null;
  const data = await chrome.storage.session.get(STORAGE_KEYS.LAST_COMPARISON);
  const entry = data[STORAGE_KEYS.LAST_COMPARISON];
  if (!entry || entry.orderUrl !== orderUrl) return null;
  return entry;
}

/**
 * Clear cached comparison result from session storage.
 */
export async function clearLastResult() {
  if (!chrome?.storage?.session) return;
  await chrome.storage.session.remove(STORAGE_KEYS.LAST_COMPARISON);
}
