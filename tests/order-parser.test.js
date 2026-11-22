import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

import { normalizeWeightToKg, parseOrderPageText } from '../src/shared/order-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTRACT_SCRIPT_PATH = path.resolve(__dirname, '../src/content/extract-order.js');

const SCREENSHOT_ORDER_TEXT = `
Order Information
Customer
Name:
Vlad Campanu
Email:
vlad_c@cmpmail.com
Addresses
ADD NEW
# Shipping: RESIDENTIAL
Phone:
+61 421 151 832
Street:
63 Pine County Place
Suburb:
Bellbowrie
State:
QLD
Postcode:
4070
Country: AU
UPDATE
# Billing: RESIDENTIAL
Phone:
+61 499 999 999
Street:
99 Billing Avenue
Suburb:
Sydney
State:
NSW
Postcode:
2000
Country: AU
Invoice
2621 UPDATE
Items
8 Stage Filter X 6
AIM8STG6 | 3.7 KG
Price:
$165.60
Qty:
1
Amount:
$165.60
Tracking
Code
CPCTOZE0000316
Carrier
CP
Cost (in AUD)
11.61
Note
UPDATE
Information
Status:
FULFILLED
Number:
20218
Total:
$165.60
`;

function createMockElement(tagName, textContent, children = []) {
  const el = {
    tagName,
    nodeType: 1,
    textContent,
    children,
    childNodes: children.length ? children : [{ nodeType: 3, nodeValue: textContent }],
    parentElement: null
  };
  for (const child of children) child.parentElement = el;
  return el;
}

function runExtractorInVm({ origin, fullText, shippingBlockText, itemsBlockText }) {
  const code = fs.readFileSync(EXTRACT_SCRIPT_PATH, 'utf8');

  const shipHeading = createMockElement('h3', '# Shipping: RESIDENTIAL');
  const shipSuburb = createMockElement('div', shippingBlockText);
  const shipContainer = createMockElement('div', `# Shipping: RESIDENTIAL\n${shippingBlockText}`, [shipHeading, shipSuburb]);

  const billingContainer = createMockElement('div', '# Billing: RESIDENTIAL\nSuburb: Sydney\nState: NSW\nPostcode: 2000');
  const addressesContainer = createMockElement('section', `${shipContainer.textContent}\n${billingContainer.textContent}`, [shipContainer, billingContainer]);

  const itemsHeading = createMockElement('h2', 'Items');
  const itemsBody = createMockElement('div', itemsBlockText);
  const itemsContainer = createMockElement('section', `Items\n${itemsBlockText}`, [itemsHeading, itemsBody]);

  const trackingHeading = createMockElement('h2', 'Tracking');
  const rootBody = createMockElement('body', fullText, [addressesContainer, itemsContainer, trackingHeading]);
  rootBody.innerText = fullText;

  const sandbox = {
    window: { location: { origin } },
    document: {
      body: rootBody,
      querySelectorAll: () => [shipHeading, billingContainer, itemsHeading, trackingHeading]
    }
  };

  return vm.runInNewContext(code, sandbox);
}

test('normalizeWeightToKg converts g and kg accurately', () => {
  assert.equal(normalizeWeightToKg('3.7', 'KG'), 3.7);
  assert.equal(normalizeWeightToKg('500', 'g'), 0.5);
  assert.equal(normalizeWeightToKg('750', 'grams'), 0.75);
});

test('parseOrderPageText parses screenshot order and ignores Billing PII', () => {
  const result = parseOrderPageText(SCREENSHOT_ORDER_TEXT);
  assert.equal(result.ok, true);
  assert.deepEqual(result.destination, {
    suburb: 'Bellbowrie',
    state: 'QLD',
    postcode: '4070',
    country: 'AU',
    addressType: 'RESIDENTIAL'
  });
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], {
    label: '8 Stage Filter X 6',
    weightKg: 3.7,
    quantity: 1,
    lengthCm: null,
    widthCm: null,
    heightCm: null
  });

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('Vlad'), false);
  assert.equal(serialized.includes('cmpmail'), false);
  assert.equal(serialized.includes('Pine County'), false);
  assert.equal(serialized.includes('421 151'), false);
  assert.equal(serialized.includes('Sydney'), false);
  assert.equal(serialized.includes('2000'), false);
  assert.equal(serialized.includes('CPCTOZE'), false);
});

test('extract-order.js executes in VM against mock LogicSync DOM with zero PII leak', () => {
  const result = runExtractorInVm({
    origin: 'https://aimexaustralia.logicsync.app',
    fullText: SCREENSHOT_ORDER_TEXT,
    shippingBlockText: 'Phone:\n+61 421 151 832\nStreet:\n63 Pine County Place\nSuburb:\nBellbowrie\nState:\nQLD\nPostcode:\n4070\nCountry: AU',
    itemsBlockText: '8 Stage Filter X 6\nAIM8STG6 | 3.7 KG\nPrice:\n$165.60\nQty:\n1\nAmount:\n$165.60'
  });

  assert.equal(result.ok, true);
  assert.equal(result.destination.suburb, 'Bellbowrie');
  assert.equal(result.destination.state, 'QLD');
  assert.equal(result.destination.postcode, '4070');
  assert.equal(result.items[0].weightKg, 3.7);
  assert.equal(result.items[0].quantity, 1);

  const json = JSON.stringify(result);
  assert.equal(json.includes('Vlad'), false);
  assert.equal(json.includes('Pine County'), false);
  assert.equal(json.includes('2000'), false);
});

test('extract-order.js rejects non-aimex origins immediately', () => {
  const result = runExtractorInVm({
    origin: 'https://example.com',
    fullText: SCREENSHOT_ORDER_TEXT,
    shippingBlockText: '',
    itemsBlockText: ''
  });
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'NOT_ALLOWED_ORIGIN');
});

test('parseOrderPageText supports multi-item, grams, quantities, and inline dimensions', () => {
  const multiOrder = `
    # Shipping: BUSINESS
    Suburb: Darwin
    State: NT
    Postcode: 0800
    Country: AU
    # Billing: RESIDENTIAL
    Postcode: 3000
    Items
    Sediment Cartridge 30x20x15 cm
    SKU1 | 500 g
    Price: $25.00
    Qty: 3
    Carbon Block
    SKU2 | 2.25 KG
    Price: $45.00
    Qty: 2
    Tracking
  `;
  const result = parseOrderPageText(multiOrder);
  assert.equal(result.ok, true);
  assert.equal(result.destination.postcode, '0800');
  assert.equal(result.destination.addressType, 'BUSINESS');
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].weightKg, 0.5);
  assert.equal(result.items[0].quantity, 3);
  assert.equal(result.items[0].lengthCm, 30);
  assert.equal(result.items[0].widthCm, 20);
  assert.equal(result.items[0].heightCm, 15);
  assert.equal(result.items[1].weightKg, 2.25);
  assert.equal(result.items[1].quantity, 2);
});

test('parseOrderPageText detects non-order page cleanly', () => {
  const result = parseOrderPageText('Dashboard Orders Customers Products');
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'NOT_ORDER_PAGE');
});
