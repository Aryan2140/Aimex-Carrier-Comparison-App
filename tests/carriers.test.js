import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS } from '../src/shared/constants.js';
import { mergeSettings } from '../src/shared/storage.js';
import { fetchAusPostPacRates } from '../src/carriers/auspost-pac.js';
import { fetchAusPostEparcelRates } from '../src/carriers/auspost-eparcel.js';
import { fetchCouriersPleaseRates } from '../src/carriers/couriers-please.js';
import { compareRates } from '../src/carriers/compare.js';

const SAMPLE_ORDER = {
  destination: {
    suburb: 'Bellbowrie',
    state: 'QLD',
    postcode: '4070',
    country: 'AU',
    addressType: 'RESIDENTIAL'
  },
  items: [
    { label: '8 Stage Filter X 6', weightKg: 3.7, quantity: 1, lengthCm: null, widthCm: null, heightCm: null }
  ]
};

function makeJsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function buildTestSettings(overrides = {}) {
  const baseWithKeys = mergeSettings(DEFAULT_SETTINGS, {
    carriers: {
      auspostPac: { enabled: true, apiKey: 'pac-test-key', includeSatchels: true },
      auspostEparcel: {
        enabled: true,
        apiKey: 'ep-key',
        apiPassword: 'ep-secret',
        accountNumber: '0001234567',
        includeSurcharges: true
      },
      couriersPlease: {
        enabled: true,
        account: 'W99999',
        apiKey: 'cp-token',
        environment: 'production',
        validateLocation: true
      }
    }
  });
  return mergeSettings(baseWithKeys, overrides);
}

test('AusPost PAC normalizes single object, prefixes satchel/box labels, and sums multi-parcel qty', async () => {
  const settings = buildTestSettings({ carriers: { auspostPac: { includeSatchels: false } } });
  const order = {
    ...SAMPLE_ORDER,
    items: [{ label: 'Filter', weightKg: 3.7, quantity: 2 }]
  };

  let requestedUrl = '';
  let requestedKey = '';
  const mockFetch = async (url, init) => {
    requestedUrl = url;
    requestedKey = init.headers['AUTH-KEY'];
    return makeJsonResponse({
      services: {
        service: {
          code: 'AUS_PARCEL_REGULAR',
          name: 'Parcel Post',
          price: '24.45',
          delivery_time: '2 to 5 business days'
        }
      }
    });
  };

  const rates = await fetchAusPostPacRates(order, settings, mockFetch);
  assert.match(requestedUrl, /from_postcode=2164/);
  assert.match(requestedUrl, /to_postcode=4070/);
  assert.equal(requestedKey, 'pac-test-key');
  assert.equal(rates.length, 1);
  assert.equal(rates[0].serviceName, 'Parcel Post (Own Packaging)');
  assert.equal(rates[0].priceIncGst, 48.9);
  assert.equal(rates[0].notes, '2 parcels');
});

test('AusPost eParcel queries /prices/items and /prices/shipments for surcharges', async () => {
  const settings = buildTestSettings();
  const calls = [];

  const mockFetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    if (url.endsWith('/shipping/v1/prices/items')) {
      return makeJsonResponse({
        items: [{
          prices: [
            { product_id: '3D55', product_type: 'PARCEL POST + SIGNATURE', calculated_price: 13.35, calculated_price_ex_gst: 12.14, calculated_gst: 1.21 },
            { product_id: '3J55', product_type: 'EXPRESS POST + SIGNATURE', calculated_price: 18.06, calculated_price_ex_gst: 16.42, calculated_gst: 1.64 }
          ]
        }]
      });
    }
    return makeJsonResponse({
      shipments: [
        {
          items: [{ product_id: '3D55' }],
          shipment_summary: { total_cost: 14.87, total_cost_ex_gst: 13.52, shipping_cost: 11.91, fuel_surcharge: 1.61, total_gst: 1.35 }
        },
        {
          items: [{ product_id: '3J55' }],
          shipment_summary: { total_cost: 20.99, total_cost_ex_gst: 19.08, shipping_cost: 16.19, fuel_surcharge: 2.19, security_surcharge: 0.70, total_gst: 1.91 }
        }
      ]
    });
  };

  const rates = await fetchAusPostEparcelRates(SAMPLE_ORDER, settings, mockFetch);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers['Account-Number'], '0001234567');
  assert.equal(rates.length, 2);
  assert.equal(rates[0].priceIncGst, 14.87);
  assert.equal(rates[0].priceExGst, 13.52);
  assert.match(rates[0].notes, /Fuel \$1\.61/);
  assert.equal(rates[1].priceIncGst, 20.99);
  assert.match(rates[1].notes, /Security \$0\.70/);
});

test('AusPost eParcel falls back cleanly to /prices/items when /prices/shipments fails', async () => {
  const settings = buildTestSettings();
  const mockFetch = async (url) => {
    if (url.endsWith('/shipping/v1/prices/items')) {
      return makeJsonResponse({
        items: [{
          prices: [
            { product_id: '3D55', product_type: 'PARCEL POST + SIGNATURE', calculated_price: 13.35, calculated_price_ex_gst: 12.14, calculated_gst: 1.21 }
          ]
        }]
      });
    }
    return makeJsonResponse({ errors: [{ message: 'Temporary error' }] }, 500);
  };

  const rates = await fetchAusPostEparcelRates(SAMPLE_ORDER, settings, mockFetch);
  assert.equal(rates.length, 1);
  assert.equal(rates[0].priceIncGst, 13.35);
  assert.match(rates[0].notes, /excl\. fuel surcharge/i);
});

test('CouriersPlease normalizes suburb via Locations and applies exact 10% GST formula from PDF', async () => {
  const settings = buildTestSettings();
  const calls = [];

  const mockFetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null });
    if (url.includes('/v1/locations')) {
      return makeJsonResponse({
        responseCode: 'SUCCESS',
        data: [{ Postcode: '4070', State: 'QLD', Suburb: 'BELLBOWRIE', PickUpFlag: 'N' }]
      });
    }
    return makeJsonResponse({
      responseCode: 'SUCCESS',
      msg: '',
      data: [
        {
          CalculatedFreightCharge: '19.00',
          CalculatedFuelCharge: '1.81',
          ETA: '2 Business Days',
          PickupCutOffTime: '15:00',
          RateCardCode: 'REC',
          RateCardDescription: 'Domestic Saver - Authority To Leave',
          Weight: '3.70',
          InsuranceAmt: '0.00'
        },
        {
          CalculatedFreightCharge: '70.55',
          CalculatedFuelCharge: '6.70',
          ETA: '1 Business Days',
          PickupCutOffTime: '15:00',
          RateCardCode: 'DSL',
          RateCardDescription: 'Domestic Priority - Signature Required',
          Weight: '30.83',
          InsuranceCategory: 'INS2',
          InsuranceAmt: '2.00'
        }
      ]
    });
  };

  const rates = await fetchCouriersPleaseRates(SAMPLE_ORDER, settings, mockFetch);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.toSuburb, 'BELLBOWRIE');
  assert.equal(calls[1].body.items[0].physicalWeight, 3.7);
  // Official PDF example: ($19.00 + $1.81) * 1.10 = $22.89
  assert.equal(rates[0].priceExGst, 20.81);
  assert.equal(rates[0].gst, 2.08);
  assert.equal(rates[0].priceIncGst, 22.89);
  // With InsuranceAmt $2.00: ($70.55 + $6.70 + $2.00) * 1.10 = $87.175 -> $87.18
  assert.equal(rates[1].priceExGst, 79.25);
  assert.equal(rates[1].priceIncGst, 87.18);
});

test('compareRates marks cheapest globally, slices per courier, handles ties, and isolates partial errors', async () => {
  const settings = buildTestSettings({ maxPricesPerCourier: 2, includeGst: true });

  const mockFetch = async (url) => {
    if (url.includes('postage/parcel/domestic')) {
      return makeJsonResponse({
        services: {
          service: [
            { code: 'AUS_PARCEL_REGULAR_PACKAGE_LARGE', name: 'Large', price: '20.25' },
            { code: 'AUS_PARCEL_REGULAR', name: 'Parcel Post', price: '24.45' },
            { code: 'AUS_PARCEL_EXPRESS', name: 'Express Post', price: '32.95' }
          ]
        }
      });
    }
    if (url.includes('/shipping/v1/prices/items')) {
      return makeJsonResponse({
        items: [{
          prices: [
            { product_id: '3D55', product_type: 'PARCEL POST + SIGNATURE', calculated_price: 13.35, calculated_price_ex_gst: 12.14, calculated_gst: 1.21 }
          ]
        }]
      });
    }
    if (url.includes('/shipping/v1/prices/shipments')) {
      return makeJsonResponse({
        shipments: [{
          items: [{ product_id: '3D55' }],
          shipment_summary: { total_cost: 14.87, total_cost_ex_gst: 13.52, shipping_cost: 11.91, fuel_surcharge: 1.61, total_gst: 1.35 }
        }]
      });
    }
    // Simulate CouriersPlease 401 failure while AusPost succeeds
    return makeJsonResponse({ responseCode: 'UNAUTHORIZED', msg: 'Not a valid token.' }, 401);
  };

  const result = await compareRates(SAMPLE_ORDER, settings, mockFetch);
  assert.equal(result.cheapest.price, 14.87);
  assert.equal(result.cheapest.winners[0].carrierId, 'auspostEparcel');
  assert.equal(result.cheapest.winners[0].shortWithCarrier, 'eParcel: Parcel Post');

  const pacGroup = result.carriers.find((c) => c.carrierId === 'auspostPac');
  assert.equal(pacGroup.rates.length, 2);
  assert.equal(pacGroup.rates[0].shortInColumn, 'Large');
  assert.equal(pacGroup.totalAvailableCount, 3);
  assert.equal(pacGroup.orderUrl, 'https://auspost.com.au/parcel-send/shipments');

  const cpGroup = result.carriers.find((c) => c.carrierId === 'couriersPlease');
  assert.equal(cpGroup.status, 'error');
  assert.equal(cpGroup.error.code, 'AUTH_FAILED');
  assert.match(cpGroup.error.message, /Account Number/i);
});

test('CouriersPlease surfaces clear error when quote returns HTTP 200 with empty body', async () => {
  const settings = buildTestSettings({ carriers: { couriersPlease: { validateLocation: false } } });
  const mockFetch = async () => new Response('', { status: 200 });

  await assert.rejects(
    () => fetchCouriersPleaseRates(SAMPLE_ORDER, settings, mockFetch),
    (err) => err?.code === 'EMPTY_RESPONSE' && /empty or unreadable response/i.test(err.message)
  );
});
