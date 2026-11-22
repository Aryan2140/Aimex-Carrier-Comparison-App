/**
 * Parallel multi-carrier rate comparison aggregator, cheapest-rate marker, and sorting engine.
 */

import { CARRIER_IDS, CARRIER_META } from '../shared/constants.js';
import { toHumanError } from '../shared/errors.js';
import { fetchAusPostPacRates } from './auspost-pac.js';
import { fetchAusPostEparcelRates } from './auspost-eparcel.js';
import { fetchCouriersPleaseRates } from './couriers-please.js';
import { buildOrderParcels, round2 } from './parcel-utils.js';

const CARRIER_FETCHERS = [
  { id: CARRIER_IDS.AUSPOST_EPARCEL, fn: fetchAusPostEparcelRates },
  { id: CARRIER_IDS.AUSPOST_PAC, fn: fetchAusPostPacRates },
  { id: CARRIER_IDS.COURIERS_PLEASE, fn: fetchCouriersPleaseRates }
];

/**
 * Run all enabled carrier rate queries in parallel, sort and slice per courier,
 * and mark the global cheapest rate across all carriers.
 * @param {object} order
 * @param {object} settings
 * @param {typeof fetch} [fetchImpl]
 */
export async function compareRates(order, settings, fetchImpl = fetch) {
  const maxPerCourier = Math.max(1, Number.parseInt(String(settings?.maxPricesPerCourier || 3), 10) || 3);
  const includeGst = settings?.includeGst !== false;
  const { parcels, totalWeightKg, totalParcelCount } = buildOrderParcels(order, settings);

  const settled = await Promise.all(
    CARRIER_FETCHERS.map(async ({ id, fn }) => {
      const meta = CARRIER_META[id];
      const enabled = settings?.carriers?.[id]?.enabled !== false;
      if (!enabled) {
        return {
          carrierId: id,
          carrierName: meta.name,
          subtitle: meta.subtitle,
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
            return {
              ...rate,
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
          subtitle: meta.subtitle,
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
          subtitle: meta.subtitle,
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
  let cheapestRates = [];
  let savingsAmount = null;
  let nextHighestPrice = null;

  if (allDisplayedRates.length > 0) {
    cheapestPrice = Math.min(...allDisplayedRates.map((r) => r.displayPrice));
    for (const rate of allDisplayedRates) {
      if (Math.abs(rate.displayPrice - cheapestPrice) < 0.005) {
        rate.isCheapest = true;
        cheapestRates.push(rate);
      }
    }

    const higherPrices = allDisplayedRates
      .map((r) => r.displayPrice)
      .filter((p) => p > cheapestPrice + 0.005);

    if (higherPrices.length > 0) {
      nextHighestPrice = Math.min(...higherPrices);
      savingsAmount = round2(nextHighestPrice - cheapestPrice);
    }
  }

  // Sort carrier cards: cheapest available first, then empty, then errors, then disabled
  const statusRank = { ok: 0, empty: 1, error: 2, disabled: 3 };
  settled.sort((a, b) => {
    const rankDiff = statusRank[a.status] - statusRank[b.status];
    if (rankDiff !== 0) return rankDiff;
    if (a.cheapestRatePrice !== null && b.cheapestRatePrice !== null) {
      return a.cheapestRatePrice - b.cheapestRatePrice;
    }
    return 0;
  });

  return {
    comparedAt: new Date().toISOString(),
    includeGst,
    maxPricesPerCourier: maxPerCourier,
    shipmentSummary: {
      destination: order.destination,
      origin: settings.origin,
      totalWeightKg,
      totalParcelCount,
      packagingMode: settings.packagingMode,
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
          winners: cheapestRates,
          savingsAmount,
          nextHighestPrice
        }
      : null,
    carriers: settled
  };
}
