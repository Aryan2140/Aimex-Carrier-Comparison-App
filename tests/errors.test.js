import test from 'node:test';
import assert from 'node:assert/strict';

import { CARRIER_IDS } from '../src/shared/constants.js';
import { rewriteFieldNames, toHumanError } from '../src/shared/errors.js';

test('rewriteFieldNames translates technical API keys to readable phrases', () => {
  const rewritten = rewriteFieldNames('Please check toPostcode, toSuburb, and physicalWeight.');
  assert.equal(rewritten, 'Please check destination postcode, destination suburb, and parcel weight.');
});

test('toHumanError explains CouriersPlease 401 and portal URL cleanly', () => {
  const authErr = toHumanError(new Error('HTTP 401'), {
    carrierId: CARRIER_IDS.COURIERS_PLEASE,
    status: 401,
    url: 'https://api.couriersplease.com.au/v2/domestic/quote'
  });
  assert.equal(authErr.code, 'AUTH_FAILED');
  assert.equal(authErr.actionType, 'open_settings');
  assert.match(authErr.message, /Account Number/i);

  const portalErr = toHumanError(new Error('HTTP 404'), {
    carrierId: CARRIER_IDS.COURIERS_PLEASE,
    status: 404,
    url: 'https://apidev.couriersplease.com.au/v2/domestic/quote'
  });
  assert.equal(portalErr.code, 'COURIERSPLEASE_PORTAL_URL');
  assert.match(portalErr.message, /documentation website/i);
});

test('toHumanError converts CouriersPlease 400 validation errors to plain English', () => {
  const err = toHumanError(new Error('HTTP 400'), {
    carrierId: CARRIER_IDS.COURIERS_PLEASE,
    status: 400,
    payload: {
      responseCode: 'INVALID_INPUT',
      msg: 'Data Validation Error',
      data: {
        errors: [
          { field: 'toPostcode', description: 'Please select To Postcode.' },
          { field: 'toSuburb', description: 'Please select To Suburb.' }
        ]
      }
    }
  });
  assert.equal(err.code, 'INVALID_REQUEST');
  assert.match(err.message, /destination postcode/i);
  assert.match(err.message, /destination suburb/i);
});

test('toHumanError handles AbortError, TypeError, 429, and 503 cleanly', () => {
  const abort = new Error('The operation was aborted');
  abort.name = 'AbortError';
  assert.equal(toHumanError(abort, { carrierId: CARRIER_IDS.AUSPOST_PAC }).code, 'TIMEOUT');

  const net = new TypeError('Failed to fetch');
  assert.equal(toHumanError(net, { carrierId: CARRIER_IDS.AUSPOST_EPARCEL }).code, 'NETWORK_ERROR');

  assert.equal(toHumanError(new Error('429'), { status: 429 }).code, 'RATE_LIMITED');
  assert.equal(toHumanError(new Error('503'), { status: 503 }).code, 'CARRIER_SERVER_ERROR');
});
