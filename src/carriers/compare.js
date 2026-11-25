/**
 * Parallel multi-carrier rate comparison aggregator, shorthand labeling, and cheapest-rate marker.
 */

import { CARRIER_IDS, CARRIER_META } from '../shared/constants.js';
import { toHumanError } from '../shared/errors.js';
import { formatShortServiceLabel } from '../shared/presets.js';
import { fetchAusPostPacRates } from './auspost-pac.js';
import { fetchAusPostEparcelRates } from './auspost-eparcel.js';
import { fetchCouriersPleaseRates } from './couriers-please.js';
import { buildOrderParcels, round2 } from './parcel-utils.js';

const CARRIER_FETCHERS = [
  { id: CARRIER_IDS.AUSPOST_PAC, fn: fetchAusPostPacRates },
  { id: CARRIER_IDS.AUSPOST_EPARCEL, fn: fetchAusPostEparcelRates },
  { id: CARRIER_IDS.COURIERS_PLEASE, fn: fetchCouriersPleaseRates }
];

/**
 * Run all enabled carrier rate queries in parallel, sort and slice per courier,
 * format shorthand service titles, and mark the global cheapest rate.
 * @param {object} order
 * @param {object} settings
 * @param {typeof fetch} [fetchImpl]
 */
export async function compareRates(order, settings, fetchImpl = fetch) {
  const maxPerCourier = Math.max(1, Number.parseInt(String(settings?.maxPricesPerCourier || 3), 10) || 3);
  const includeGst = settings?.includeGst !== false;
  const { parcels, totalWeightKg, totalParcelCount } = buildOrderParcels(order, settings);
  const effectivePackagingMode = order?.packagingModeOverride
    || (settings?.packagingMode === 'combined' ? 'combined' : 'per_unit');

  const settled = await Promise.all(
    CARRIER_FETCHERS.map(async ({ id, fn }) => {
      const meta = CARRIER_META[id];
      const carrierCfg = settings?.carriers?.[id] || {};
      const enabled = carrierCfg.enabled !== false;
      const orderUrl = String(carrierCfg.orderUrl || '').trim();

      if (!enabled) {
        return {
          carrierId: id,
          carrierName: meta.name,
          shortName: meta.shortName,
          logo: meta.logo,
          orderUrl,
          status: 'disabled',
          rates: [],
          totalAvailableCount: 0,
          cheapestRatePrice: null,
          error: null
        };
      }

      try {
        const rawRates = await fn(order, settings, fetchImpl);
        const normalized = rawRates
          .map((rate) => {
            const displayPrice = includeGst ? round2(rate.priceIncGst) : round2(rate.priceExGst);
            const labels = formatShortServiceLabel(id, rate.serviceCode, rate.serviceName);
            return {
              ...rate,
              shortInColumn: labels.shortInColumn,
              shortWithCarrier: labels.shortWithCarrier,
              orderUrl,
              displayPrice,
              includesGst: includeGst,
              isCheapest: false
            };
          })
          .sort((a, b) => a.displayPrice - b.displayPrice || a.priceIncGst - b.priceIncGst);

        const displayed = normalized.slice(0, maxPerCourier);
        return {
          carrierId: id,
          carrierName: meta.name,
          shortName: meta.shortName,
          logo: meta.logo,
          orderUrl,
          status: displayed.length ? 'ok' : 'empty',
          rates: displayed,
          totalAvailableCount: normalized.length,
          cheapestRatePrice: displayed.length ? displayed[0].displayPrice : null,
          error: null
        };
      } catch (err) {
        return {
          carrierId: id,
          carrierName: meta.name,
          shortName: meta.shortName,
          logo: meta.logo,
          orderUrl,
          status: 'error',
          rates: [],
          totalAvailableCount: 0,
          cheapestRatePrice: null,
          error: toHumanError(err, { carrierId: id })
        };
      }
    })
  );

  const allDisplayedRates = settled.flatMap((group) => group.rates);
  let cheapestPrice = null;
  const cheapestRates = [];

  if (allDisplayedRates.length > 0) {
    cheapestPrice = Math.min(...allDisplayedRates.map((r) => r.displayPrice));
    for (const rate of allDisplayedRates) {
      if (Math.abs(rate.displayPrice - cheapestPrice) < 0.005) {
        rate.isCheapest = true;
        cheapestRates.push(rate);
      }
    }
  }

  return {
    comparedAt: new Date().toISOString(),
    includeGst,
    maxPricesPerCourier: maxPerCourier,
    shipmentSummary: {
      destination: order.destination,
      origin: settings.origin,
      totalWeightKg,
      totalParcelCount,
      packagingMode: effectivePackagingMode,
      satchel: order?.satchelMeta || null,
      items: order.items || [],
      dimensions: parcels[0]
        ? {
            lengthCm: parcels[0].lengthCm,
            widthCm: parcels[0].widthCm,
            heightCm: parcels[0].heightCm
          }
        : settings.defaultDimensions
    },
    cheapest: cheapestRates.length
      ? {
          price: cheapestPrice,
          includesGst: includeGst,
          winnerCount: cheapestRates.length,
          winners: cheapestRates
        }
      : null,
    carriers: settled
  };
}
