/**
 * Australia Post Postage Assessment Calculator (PAC) API client.
 */

import { AUSPOST_BASE_URL, CARRIER_IDS } from '../shared/constants.js';
import { CarrierError, asCarrierError } from '../shared/errors.js';
import {
  assertDomesticAuDestination,
  buildOrderParcels,
  fetchWithTimeout,
  readJsonSafe,
  round2
} from './parcel-utils.js';

const PAC_SERVICE_URL = `${AUSPOST_BASE_URL}/postage/parcel/domestic/service.json`;
const MAX_PARCEL_WEIGHT_KG = 22;

function formatPacServiceName(service) {
  const code = String(service?.code || '');
  const rawName = String(service?.name || code || 'Australia Post Service').trim();
  const isExpress = code.includes('_EXPRESS');
  const isRegular = code.includes('_REGULAR');
  const isPackaging = code.includes('_SATCHEL_') || code.includes('_PACKAGE_');

  if (code === 'AUS_PARCEL_REGULAR') return 'Parcel Post (Own Packaging)';
  if (code === 'AUS_PARCEL_EXPRESS') return 'Express Post (Own Packaging)';

  if (isPackaging && isExpress && !/express/i.test(rawName)) {
    return `Express Post — ${rawName}`;
  }
  if (isPackaging && isRegular && !/parcel post|regular/i.test(rawName)) {
    return `Parcel Post — ${rawName}`;
  }
  return rawName;
}

async function queryPacSingleParcel({ apiKey, fromPostcode, toPostcode, parcel, fetchImpl }) {
  const params = new URLSearchParams({
    from_postcode: String(fromPostcode),
    to_postcode: String(toPostcode),
    length: String(parcel.lengthCm),
    width: String(parcel.widthCm),
    height: String(parcel.heightCm),
    weight: String(parcel.weightKg)
  });
  const url = `${PAC_SERVICE_URL}?${params.toString()}`;

  let response;
  try {
    response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          'AUTH-KEY': apiKey,
          Accept: 'application/json'
        }
      },
      fetchImpl
    );
  } catch (err) {
    throw asCarrierError(err, { carrierId: CARRIER_IDS.AUSPOST_PAC, url });
  }

  const payload = await readJsonSafe(response);
  if (!response.ok || payload?.error) {
    throw asCarrierError(new Error(payload?.error?.errorMessage || `HTTP ${response.status}`), {
      carrierId: CARRIER_IDS.AUSPOST_PAC,
      status: response.status || 400,
      payload,
      url
    });
  }

  const rawServices = payload?.services?.service;
  return Array.isArray(rawServices) ? rawServices : (rawServices ? [rawServices] : []);
}

/**
 * Fetch Australia Post PAC retail domestic postage rates for an order.
 * @param {object} order
 * @param {object} settings
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchAusPostPacRates(order, settings, fetchImpl = fetch) {
  const carrierId = CARRIER_IDS.AUSPOST_PAC;
  const cfg = settings?.carriers?.auspostPac || {};
  const apiKey = String(cfg.apiKey || '').trim();
  if (!apiKey) {
    throw new CarrierError({
      code: 'MISSING_CREDENTIALS',
      carrierId,
      title: 'AusPost PAC API key missing',
      message: 'Please enter your Australia Post PAC API Key in Settings to compare PAC rates.',
      suggestion: 'Open Settings and paste your AUSPOST_PAC_API_KEY.',
      actionType: 'open_settings'
    });
  }

  assertDomesticAuDestination(order?.destination, carrierId);
  const fromPostcode = String(settings?.origin?.postcode || '').trim();
  if (!/^\d{4}$/.test(fromPostcode)) {
    throw new CarrierError({
      code: 'INVALID_ORIGIN_POSTCODE',
      carrierId,
      title: 'Origin postcode invalid',
      message: `Origin postcode "${fromPostcode || 'blank'}" must be a 4-digit Australian postcode.`,
      suggestion: 'Set your dispatch origin postcode (e.g. 2145) in Settings.',
      actionType: 'open_settings'
    });
  }

  const satchelMeta = order?.satchelMeta || null;
  const maxAllowedWeight = satchelMeta ? 5 : MAX_PARCEL_WEIGHT_KG;

  const { parcels, totalParcelCount } = buildOrderParcels(order, settings);
  for (const parcel of parcels) {
    if (parcel.weightKg > maxAllowedWeight) {
      throw new CarrierError({
        code: 'OVERWEIGHT',
        carrierId,
        title: satchelMeta ? 'Exceeds AusPost 5 kg satchel limit' : 'Parcel exceeds AusPost 22 kg limit',
        message: satchelMeta
          ? `Total weight (${parcel.weightKg} kg) exceeds Australia Post's 5 kg flat-rate satchel limit.`
          : `Parcel weight (${parcel.weightKg} kg) exceeds Australia Post PAC's 22 kg per-parcel limit.`,
        suggestion: satchelMeta
          ? 'Switch to Parcel Dimensions mode to quote own packaging.'
          : settings?.packagingMode === 'combined'
            ? 'Switch Packaging Mode to "Each unit as its own parcel" in Settings or split the consignment.'
            : 'This single unit exceeds AusPost PAC\'s 22 kg parcel limit.'
      });
    }
  }

  const perGroupResults = await Promise.all(
    parcels.map(async (parcel) => {
      const services = await queryPacSingleParcel({
        apiKey,
        fromPostcode,
        toPostcode: order.destination.postcode,
        parcel,
        fetchImpl
      });
      return { parcel, services };
    })
  );

  // Intersect services available across every parcel group and sum prices across quantities
  const includeSatchels = cfg.includeSatchels !== false || Boolean(satchelMeta);
  const serviceTotals = new Map();

  for (let idx = 0; idx < perGroupResults.length; idx += 1) {
    const { parcel, services } = perGroupResults[idx];
    const hasModernSatchel = services.some((s) => /_SATCHEL_(?:EXTRA_SMALL|MEDIUM|LARGE|EXTRA_LARGE)$/.test(String(s?.code || '')));
    let filtered = services.filter((svc) => {
      const code = String(svc?.code || '');
      if (!includeSatchels && (code.includes('_SATCHEL_') || code.includes('_PACKAGE_'))) {
        return false;
      }
      // Deduplicate legacy weight-named satchel codes when modern size-named equivalents exist
      if (hasModernSatchel && /_SATCHEL_(?:250G|500G|1KG|3KG|5KG)$/.test(code)) {
        return false;
      }
      return true;
    });

    if (satchelMeta?.tierKey) {
      const tierSuffix = `_${satchelMeta.tierKey}`;
      const tierMatches = filtered.filter((svc) => {
        const code = String(svc?.code || '');
        return (code.includes('_SATCHEL_') || code.includes('_PACKAGE_')) && code.endsWith(tierSuffix);
      });
      if (tierMatches.length) {
        filtered = tierMatches;
      }
    }

    const seenInGroup = new Map();
    for (const svc of filtered) {
      const code = String(svc.code || '');
      const price = Number.parseFloat(svc.price);
      if (!code || !Number.isFinite(price)) continue;
      seenInGroup.set(code, { svc, lineTotal: price * parcel.quantity });
    }

    if (idx === 0) {
      for (const [code, entry] of seenInGroup.entries()) {
        serviceTotals.set(code, {
          svc: entry.svc,
          totalIncGst: entry.lineTotal
        });
      }
    } else {
      for (const code of Array.from(serviceTotals.keys())) {
        if (!seenInGroup.has(code)) {
          serviceTotals.delete(code);
        } else {
          serviceTotals.get(code).totalIncGst += seenInGroup.get(code).lineTotal;
        }
      }
    }
  }

  const rates = [];
  for (const { svc, totalIncGst } of serviceTotals.values()) {
    const priceIncGst = round2(totalIncGst);
    const priceExGst = round2(priceIncGst / 1.1);
    const gst = round2(priceIncGst - priceExGst);
    const code = String(svc.code || '');
    const isPackaging = code.includes('_SATCHEL_') || code.includes('_PACKAGE_');
    const noteParts = [];
    if (totalParcelCount > 1) noteParts.push(`${totalParcelCount} parcels`);
    if (isPackaging) noteParts.push('Flat-rate satchel/box');

    rates.push({
      carrierId,
      carrierName: 'MyPost',
      serviceCode: code,
      serviceName: formatPacServiceName(svc),
      priceIncGst,
      priceExGst,
      gst,
      eta: String(svc.delivery_time || '').trim(),
      notes: noteParts.join(' · ')
    });
  }

  return rates;
}

/**
 * Test Australia Post PAC credentials using a lightweight sample quote.
 * @param {object} settings
 * @param {typeof fetch} [fetchImpl]
 */
export async function testAusPostPac(settings, fetchImpl = fetch) {
  const apiKey = String(settings?.carriers?.auspostPac?.apiKey || '').trim();
  if (!apiKey) {
    throw new CarrierError({
      code: 'MISSING_CREDENTIALS',
      carrierId: CARRIER_IDS.AUSPOST_PAC,
      title: 'PAC API key is empty',
      message: 'Enter an AusPost PAC API Key before running the connection test.'
    });
  }

  const fromPostcode = String(settings?.origin?.postcode || '2145').trim();
  const services = await queryPacSingleParcel({
    apiKey,
    fromPostcode,
    toPostcode: '3000',
    parcel: { lengthCm: 20, widthCm: 15, heightCm: 10, weightKg: 1 },
    fetchImpl
  });

  return {
    ok: true,
    summary: `Connected — ${services.length} domestic service${services.length === 1 ? '' : 's'} returned from ${fromPostcode} to 3000.`
  };
}
