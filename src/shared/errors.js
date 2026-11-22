/**
 * Human-readable error normalization for carrier APIs, page extraction, and update checks.
 */

import { CARRIER_IDS, CARRIER_META } from './constants.js';

const FIELD_NAME_MAP = {
  toPostcode: 'destination postcode',
  to_postcode: 'destination postcode',
  toSuburb: 'destination suburb',
  to_suburb: 'destination suburb',
  fromPostcode: 'origin postcode',
  from_postcode: 'origin postcode',
  fromSuburb: 'origin suburb',
  from_suburb: 'origin suburb',
  physicalWeight: 'parcel weight',
  weight: 'parcel weight',
  length: 'parcel length',
  width: 'parcel width',
  height: 'parcel height',
  quantity: 'item quantity',
  'account-number': 'Australia Post eParcel account number',
  accountNumber: 'Australia Post eParcel account number',
  product_id: 'Australia Post contract product'
};

/**
 * Custom error carrying structured metadata for clear UI error translation.
 */
export class CarrierError extends Error {
  /**
   * @param {object} options
   * @param {string} options.code
   * @param {string} [options.carrierId]
   * @param {number} [options.status]
   * @param {string} options.title
   * @param {string} options.message
   * @param {string} [options.suggestion]
   * @param {string} [options.actionType]
   * @param {string} [options.technicalDetail]
   * @param {unknown} [options.payload]
   */
  constructor(options) {
    super(options.message);
    this.name = 'CarrierError';
    this.code = options.code;
    this.carrierId = options.carrierId || '';
    this.status = options.status || 0;
    this.title = options.title;
    this.suggestion = options.suggestion || '';
    this.actionType = options.actionType || '';
    this.technicalDetail = options.technicalDetail || '';
    this.payload = options.payload;
  }
}

/**
 * Rewrite technical field identifiers in carrier messages into readable English.
 * @param {string} text
 * @returns {string}
 */
export function rewriteFieldNames(text) {
  let out = String(text || '').trim();
  for (const [raw, friendly] of Object.entries(FIELD_NAME_MAP)) {
    const escaped = raw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`\\b${escaped}\\b`, 'g'), friendly);
  }
  return out;
}

/**
 * Extract readable error strings from carrier JSON error payloads.
 * @param {unknown} payload
 * @returns {string[]}
 */
function extractPayloadMessages(payload) {
  if (!payload) return [];
  if (typeof payload === 'string') return [payload.trim()].filter(Boolean);

  const messages = [];
  if (Array.isArray(payload.errors)) {
    for (const item of payload.errors) {
      if (typeof item === 'string') messages.push(item);
      else if (item?.message || item?.description) {
        const field = item.field ? `${rewriteFieldNames(item.field)}: ` : '';
        messages.push(`${field}${rewriteFieldNames(item.description || item.message)}`);
      }
    }
  }
  if (payload.error) {
    if (typeof payload.error === 'string') messages.push(payload.error);
    else if (payload.error.errorMessage || payload.error.message) {
      messages.push(rewriteFieldNames(payload.error.errorMessage || payload.error.message));
    }
  }
  if (payload.data?.errors && Array.isArray(payload.data.errors)) {
    for (const item of payload.data.errors) {
      const field = item?.field ? `${rewriteFieldNames(item.field)}: ` : '';
      const desc = item?.description || item?.message || item?.type;
      if (desc) messages.push(`${field}${rewriteFieldNames(desc)}`);
    }
  }
  if (payload.msg && typeof payload.msg === 'string' && payload.msg !== 'Data Validation Error') {
    messages.push(rewriteFieldNames(payload.msg));
  }
  if (payload.message && typeof payload.message === 'string') {
    messages.push(rewriteFieldNames(payload.message));
  }
  return [...new Set(messages.filter(Boolean))];
}

function getCarrierLabel(carrierId) {
  return CARRIER_META[carrierId]?.name || 'Shipping carrier';
}

function buildAuthError(carrierId, status, detail) {
  const name = getCarrierLabel(carrierId);
  if (carrierId === CARRIER_IDS.COURIERS_PLEASE) {
    return {
      code: 'AUTH_FAILED',
      title: `${name} authentication failed`,
      message:
        'CouriersPlease rejected the account or API token. Note that CouriersPlease API requests require your CouriersPlease Account Number (for example, W99999) rather than a developer portal login, paired with an active token for the selected environment.',
      suggestion: 'Check Account Number, API Token, and Production vs Sandbox environment in Settings.',
      actionType: 'open_settings',
      technicalDetail: detail
    };
  }
  if (carrierId === CARRIER_IDS.AUSPOST_EPARCEL) {
    return {
      code: 'AUTH_FAILED',
      title: `${name} authentication failed`,
      message:
        'Australia Post eParcel rejected the API key, password, or 10-digit charge account number.',
      suggestion: 'Verify your eParcel API Key, Password, and 10-digit Account Number in Settings.',
      actionType: 'open_settings',
      technicalDetail: detail
    };
  }
  return {
    code: 'AUTH_FAILED',
    title: `${name} API key rejected`,
    message: 'Australia Post PAC rejected the configured API key.',
    suggestion: 'Verify your AusPost PAC API Key in Settings.',
    actionType: 'open_settings',
    technicalDetail: detail
  };
}

/**
 * Convert any thrown error or HTTP failure into a clear, human-readable error object.
 * @param {unknown} err
 * @param {object} [context]
 * @returns {{ code: string, title: string, message: string, suggestion: string, actionType: string, technicalDetail: string }}
 */
export function toHumanError(err, context = {}) {
  if (err instanceof CarrierError) {
    return {
      code: err.code,
      title: err.title,
      message: err.message,
      suggestion: err.suggestion,
      actionType: err.actionType,
      technicalDetail: err.technicalDetail
    };
  }

  const carrierId = context.carrierId || err?.carrierId || '';
  const carrierName = getCarrierLabel(carrierId);
  const status = Number(context.status || err?.status || 0);
  const url = String(context.url || err?.url || '');
  const payload = context.payload ?? err?.payload;
  const rawMessage = err instanceof Error ? err.message : String(err || 'Unknown error');
  const detail = [
    status ? `HTTP ${status}` : '',
    url ? `Endpoint: ${url}` : '',
    rawMessage
  ].filter(Boolean).join(' · ');

  if (url.includes('apidev.couriersplease.com.au')) {
    return {
      code: 'COURIERSPLEASE_PORTAL_URL',
      title: 'CouriersPlease URL points to developer portal',
      message:
        'apidev.couriersplease.com.au is the CouriersPlease documentation website, not the quote API server.',
      suggestion:
        'Switch CouriersPlease to Production (api.couriersplease.com.au) or Sandbox (api-test.couriersplease.com.au) in Settings.',
      actionType: 'open_settings',
      technicalDetail: detail
    };
  }

  if (err?.name === 'AbortError' || /timed? out/i.test(rawMessage)) {
    return {
      code: 'TIMEOUT',
      title: `${carrierName} timed out`,
      message: `${carrierName} took longer than 15 seconds to respond.`,
      suggestion: 'Wait a few seconds and click Compare Rates again.',
      actionType: 'retry',
      technicalDetail: detail
    };
  }

  if (err instanceof TypeError || /failed to fetch|networkerror|network request failed/i.test(rawMessage)) {
    return {
      code: 'NETWORK_ERROR',
      title: `Could not reach ${carrierName}`,
      message: `Unable to connect to ${carrierName} servers from your browser.`,
      suggestion: 'Check your internet connection or VPN, then try again.',
      actionType: 'retry',
      technicalDetail: detail
    };
  }

  if (status === 401 || status === 403) {
    return buildAuthError(carrierId, status, detail);
  }

  if (status === 404) {
    return {
      code: 'ENDPOINT_NOT_FOUND',
      title: `${carrierName} endpoint not found`,
      message: `${carrierName} returned "Not Found" for the configured API URL.`,
      suggestion: 'Check the carrier base URL and endpoint settings.',
      actionType: 'open_settings',
      technicalDetail: detail
    };
  }

  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      title: `${carrierName} rate limit reached`,
      message: `Too many requests were sent to ${carrierName} in a short period.`,
      suggestion: 'Wait 30–60 seconds before running the comparison again.',
      actionType: 'retry',
      technicalDetail: detail
    };
  }

  if (status >= 500) {
    return {
      code: 'CARRIER_SERVER_ERROR',
      title: `${carrierName} temporarily unavailable`,
      message: `${carrierName} experienced an internal server error (HTTP ${status}).`,
      suggestion: 'This is on the courier side. Retry shortly.',
      actionType: 'retry',
      technicalDetail: detail
    };
  }

  if (status === 400 || status === 422) {
    const payloadMsgs = extractPayloadMessages(payload);
    return {
      code: 'INVALID_REQUEST',
      title: `${carrierName} rejected shipment details`,
      message: payloadMsgs.length
        ? payloadMsgs.join(' ')
        : `One or more address, weight, or dimension fields were rejected by ${carrierName}.`,
      suggestion: 'Verify the order suburb/postcode and default parcel dimensions in Settings.',
      actionType: 'open_settings',
      technicalDetail: detail
    };
  }

  return {
    code: 'UNEXPECTED_ERROR',
    title: `${carrierName} quote unavailable`,
    message: `Could not retrieve rates from ${carrierName} right now.`,
    suggestion: 'Review technical details below or verify your settings and retry.',
    actionType: 'retry',
    technicalDetail: detail
  };
}
