/**
 * Shared constants, defaults, and carrier metadata for Aimex Carrier Rate Comparison.
 */

export const ALLOWED_ORIGIN = 'https://aimexaustralia.logicsync.app';
export const DEFAULT_REPO_URL = 'https://github.com/Aryan2140/Aimex-Carrier-Comparison-App';
export const REQUEST_TIMEOUT_MS = 15000;
export const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'ACT', 'NT'];

export const AUSPOST_BASE_URL = 'https://digitalapi.auspost.com.au';

export const COURIERSPLEASE_URLS = {
  production: 'https://api.couriersplease.com.au',
  sandbox: 'https://api-test.couriersplease.com.au'
};

export const CARRIER_IDS = {
  AUSPOST_PAC: 'auspostPac',
  AUSPOST_EPARCEL: 'auspostEparcel',
  COURIERS_PLEASE: 'couriersPlease'
};

export const CARRIER_META = {
  [CARRIER_IDS.AUSPOST_PAC]: {
    id: CARRIER_IDS.AUSPOST_PAC,
    name: 'Australia Post PAC',
    shortName: 'AusPost PAC',
    subtitle: 'Standard retail postage rates',
    maxWeightKg: 22
  },
  [CARRIER_IDS.AUSPOST_EPARCEL]: {
    id: CARRIER_IDS.AUSPOST_EPARCEL,
    name: 'Australia Post eParcel',
    shortName: 'AusPost eParcel',
    subtitle: 'Aimex contract & business rates',
    maxWeightKg: 22
  },
  [CARRIER_IDS.COURIERS_PLEASE]: {
    id: CARRIER_IDS.COURIERS_PLEASE,
    name: 'CouriersPlease',
    shortName: 'CouriersPlease',
    subtitle: 'Contract rate card quotes',
    maxWeightKg: 32
  }
};

export const DEFAULT_SETTINGS = {
  maxPricesPerCourier: 3,
  includeGst: true,
  packagingMode: 'per_unit',
  theme: 'system',
  origin: {
    suburb: 'GREYSTANES',
    state: 'NSW',
    postcode: '2145'
  },
  defaultDimensions: {
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10
  },
  carriers: {
    auspostPac: {
      enabled: true,
      apiKey: '',
      includeSatchels: true
    },
    auspostEparcel: {
      enabled: true,
      apiKey: '',
      apiPassword: '',
      accountNumber: '',
      includeSurcharges: true
    },
    couriersPlease: {
      enabled: true,
      account: '',
      apiKey: '',
      environment: 'production',
      customBaseUrl: '',
      validateLocation: true
    }
  },
  updates: {
    repoUrl: DEFAULT_REPO_URL,
    githubToken: ''
  }
};
