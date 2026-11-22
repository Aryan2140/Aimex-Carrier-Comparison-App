/**
 * Shared constants, defaults, favourite parcel presets, and carrier metadata.
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
    shortName: 'PAC',
    prefix: 'PAC',
    logo: '../assets/logos/auspost-pac.jpg',
    maxWeightKg: 22
  },
  [CARRIER_IDS.AUSPOST_EPARCEL]: {
    id: CARRIER_IDS.AUSPOST_EPARCEL,
    name: 'Australia Post eParcel',
    shortName: 'eParcel',
    prefix: 'eParcel',
    logo: '../assets/logos/auspost-eparcel.jpg',
    maxWeightKg: 22
  },
  [CARRIER_IDS.COURIERS_PLEASE]: {
    id: CARRIER_IDS.COURIERS_PLEASE,
    name: 'CouriersPlease',
    shortName: 'CP',
    prefix: 'CP',
    logo: '../assets/logos/couriersplease.jpg',
    maxWeightKg: 32
  }
};

export const DEFAULT_PARCEL_PRESETS = [
  { id: '1x', name: '1X', weightKg: 0.75, lengthCm: 22, widthCm: 16, heightCm: 11 },
  { id: '2x', name: '2X', weightKg: 1.5, lengthCm: 25, widthCm: 22, heightCm: 11 },
  { id: '3x', name: '3X', weightKg: 2.3, lengthCm: 34, widthCm: 20, heightCm: 11 },
  { id: '4x', name: '4X', weightKg: 3, lengthCm: 32, widthCm: 33, heightCm: 11 },
  { id: '5x', name: '5X', weightKg: 3.75, lengthCm: 41, widthCm: 22, heightCm: 11 },
  { id: '6x', name: '6X', weightKg: 4.5, lengthCm: 41, widthCm: 33, heightCm: 11 },
  { id: 'a20-g12-1x', name: 'A20/G12 1X', weightKg: 4, lengthCm: 30, widthCm: 30, heightCm: 33 },
  { id: 'a20-g12-3x', name: 'A20/G12 3X', weightKg: 5, lengthCm: 33, widthCm: 33, heightCm: 40 },
  { id: 'e20', name: 'E20', weightKg: 3, lengthCm: 33, widthCm: 33, heightCm: 30 },
  { id: 'p12c2d2', name: 'P12C2D2', weightKg: 6, lengthCm: 26, widthCm: 26, heightCm: 37 },
  { id: 'p17c2d2', name: 'P17C2D2', weightKg: 6, lengthCm: 27, widthCm: 27, heightCm: 40 },
  { id: 'p24c2d2', name: 'P24C2D2', weightKg: 6.5, lengthCm: 30, widthCm: 30, heightCm: 45 }
];

export const DEFAULT_SETTINGS = {
  maxPricesPerCourier: 3,
  includeGst: true,
  packagingMode: 'per_unit',
  theme: 'system',
  origin: {
    street: '26/191 McCredie Rd',
    suburb: 'Smithfield',
    state: 'NSW',
    postcode: '2164'
  },
  defaultDimensions: {
    lengthCm: 20,
    widthCm: 15,
    heightCm: 10
  },
  parcelPresets: DEFAULT_PARCEL_PRESETS,
  carriers: {
    auspostPac: {
      enabled: true,
      apiKey: '',
      includeSatchels: true,
      orderUrl: 'https://mypost.auspost.com.au/business/'
    },
    auspostEparcel: {
      enabled: true,
      apiKey: '',
      apiPassword: '',
      accountNumber: '',
      includeSurcharges: true,
      orderUrl: 'https://auspost.com.au/business/shipping/parcel-send'
    },
    couriersPlease: {
      enabled: true,
      account: '',
      apiKey: '',
      environment: 'production',
      customBaseUrl: '',
      validateLocation: true,
      orderUrl: 'https://www.couriersplease.com.au/mycp'
    }
  },
  updates: {
    repoUrl: DEFAULT_REPO_URL,
    githubToken: ''
  }
};
