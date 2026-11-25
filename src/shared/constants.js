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
    name: 'MyPost',
    shortName: 'MyPost',
    prefix: 'MyPost',
    logo: '../assets/logos/auspost-pac.jpg',
    maxWeightKg: 22
  },
  [CARRIER_IDS.AUSPOST_EPARCEL]: {
    id: CARRIER_IDS.AUSPOST_EPARCEL,
    name: 'eParcel',
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

export const SATCHEL_PRESETS = [
  {
    id: 'satchel-s',
    name: 'Small',
    tierKey: 'SMALL',
    maxWeightKg: 5,
    maxUnits: 1,
    autoMatch: true,
    lengthCm: 33,
    widthCm: 22,
    heightCm: 2,
    displayDims: '35.5 × 22 cm'
  },
  {
    id: 'satchel-m',
    name: 'Medium',
    tierKey: 'MEDIUM',
    maxWeightKg: 5,
    maxUnits: 1.5,
    autoMatch: false,
    lengthCm: 35,
    widthCm: 22,
    heightCm: 2,
    displayDims: '39 × 27 cm'
  },
  {
    id: 'satchel-l',
    name: 'Large',
    tierKey: 'LARGE',
    maxWeightKg: 5,
    maxUnits: 3,
    autoMatch: true,
    lengthCm: 35,
    widthCm: 25,
    heightCm: 5,
    displayDims: '40.5 × 31.5 cm'
  },
  {
    id: 'satchel-xl',
    name: 'Extra Large',
    tierKey: 'EXTRA_LARGE',
    maxWeightKg: 5,
    maxUnits: 6,
    autoMatch: true,
    lengthCm: 40.5,
    widthCm: 31,
    heightCm: 5,
    displayDims: '51 × 44 cm'
  }
];

export const DEFAULT_SATCHEL_RULES = [
  {
    id: 'non-satchel-purifier',
    name: 'Benchtop Purifier / Cooler / Tank / Stand',
    keywords: 'A20, G12, G16, E20, P12, P17, P24, MAIFANE20, PURIFIER, BENCHTOP, COOLER, UPPER TANK, LOWER TANK, HOT WATER TANK, SUPPORT RING, STAND, PGSS, PGNTWS',
    units: 0,
    fitsSatchel: false
  },
  {
    id: 'filter-cartridge',
    name: 'Filter Cartridge (8/7-Stage, AA, Fluoride, Algae, Carbon)',
    keywords: 'FILTER, CARTRIDGE, 8 STAGE, 7 STAGE, ALGAE, FLUORIDE, SMART CARBON, POSTREAT, AA STAGE, 8KDF, 7KDF, 8WHITE, AIMWHT, AIM8STG, AIMEXACB, PP5UM',
    units: 1,
    fitsSatchel: true
  },
  {
    id: 'maifan-stone',
    name: 'Maifan / Mineral Stone',
    keywords: 'MAIFAN, MINERAL STONE',
    units: 0.5,
    fitsSatchel: true
  },
  {
    id: 'dome',
    name: 'Plastic / Ceramic Dome',
    keywords: 'DOME, CERAMIC DOME, PLASTIC DOME',
    units: 0.5,
    fitsSatchel: true
  },
  {
    id: 'shower-filter',
    name: 'Shower Filter / Shower Cartridge',
    keywords: 'SHOWER, PURERAIN, AIMSHRCART, AW-SF',
    units: 0.5,
    fitsSatchel: true
  },
  {
    id: 'small-accessory',
    name: 'Tap / Spigot / Valve / Adaptor / Bottle / Straw / Sponge',
    keywords: 'TAP, SPIGOT, FLOAT, VALVE, ADAPTOR, ADAPTER, STRAW, MINIWELL, SPONGE, SHAMPOO, WASH, RINSE, SHIELD',
    units: 0.5,
    fitsSatchel: true
  },
  {
    id: 'tiny-part',
    name: 'Felt Pads / Plugs / Knob / Wingnuts / Clip / Seal',
    keywords: 'FELT, PLUG, KNOB, WINGNUT, WASHER, CLIP, SEAL',
    units: 0.25,
    fitsSatchel: true
  },
  {
    id: 'food-jar-refill',
    name: 'Food Jar / FluoRid Refill Media',
    keywords: 'MARI, FOOD JAR, REFILL MEDIA, PTSFRRL',
    units: 1,
    fitsSatchel: true
  }
];

export const POPUP_SIZES = {
  standard: { label: 'Standard', widthPx: 484, heightPx: 590 },
  medium: { label: 'Medium', widthPx: 620, heightPx: 595 },
  wide: { label: 'Wide', widthPx: 760, heightPx: 600 }
};

export const DEFAULT_SETTINGS = {
  maxPricesPerCourier: 3,
  includeGst: true,
  packagingMode: 'per_unit',
  theme: 'system',
  popupSize: 'standard',
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
  satchelSizes: SATCHEL_PRESETS,
  satchelRules: DEFAULT_SATCHEL_RULES,
  carriers: {
    auspostPac: {
      enabled: true,
      apiKey: '',
      includeSatchels: true,
      orderUrl: 'https://auspost.com.au/parcel-send/shipments'
    },
    auspostEparcel: {
      enabled: true,
      apiKey: '',
      apiPassword: '',
      accountNumber: '',
      includeSurcharges: true,
      orderUrl: 'https://auspost.com.au/mypost-business/orders/'
    },
    couriersPlease: {
      enabled: true,
      account: '',
      apiKey: '',
      environment: 'production',
      customBaseUrl: '',
      validateLocation: true,
      orderUrl: 'https://edi.couriersplease.com.au/index.php'
    }
  },
  updates: {
    repoUrl: DEFAULT_REPO_URL,
    githubToken: ''
  }
};
