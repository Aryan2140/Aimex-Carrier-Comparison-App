import test from 'node:test';
import assert from 'node:assert/strict';

import { CARRIER_IDS, DEFAULT_PARCEL_PRESETS, DEFAULT_SETTINGS, SATCHEL_PRESETS } from '../src/shared/constants.js';
import { applyPresetsToItems, determineBestSatchel, extractItemPackCount, formatShortServiceLabel, matchProductPreset } from '../src/shared/presets.js';
import { buildOrderParcels } from '../src/carriers/parcel-utils.js';

test('matchProductPreset matches all 12 favourite parcel items and real LogicSync labels', () => {
  const screenshotMatch = matchProductPreset({ label: '8 Stage Filter X 6', sku: 'AIM8STG6' });
  assert.equal(screenshotMatch?.name, '6X');
  assert.equal(screenshotMatch?.weightKg, 4.5);
  assert.deepEqual(
    [screenshotMatch?.lengthCm, screenshotMatch?.widthCm, screenshotMatch?.heightCm],
    [41, 33, 11]
  );

  const cases = [
    [{ label: 'Under Sink Filter 1X' }, '1X', 0.75, [22, 16, 11]],
    [{ label: 'Twin Filter 2X' }, '2X', 1.5, [25, 22, 11]],
    [{ label: '3 Pack Filter 3X' }, '3X', 2.3, [34, 20, 11]],
    [{ label: 'Quad Filter 4X' }, '4X', 3, [32, 33, 11]],
    [{ label: 'Five Pack 5X' }, '5X', 3.75, [41, 22, 11]],
    [{ label: 'A20/G12 1X Cartridge' }, 'A20/G12 1X', 4, [30, 30, 33]],
    [{ label: 'G12 With 1 AA Stage', sku: 'AIMGAAFILTER' }, 'A20/G12 1X', 4, [30, 30, 33]],
    [{ label: 'G12 with 1 filter' }, 'A20/G12 1X', 4, [30, 30, 33]],
    [{ label: 'G12 with 1 AA filter' }, 'A20/G12 1X', 4, [30, 30, 33]],
    [{ label: 'G12 with 1 8 stage filter' }, 'A20/G12 1X', 4, [30, 30, 33]],
    [{ label: 'A20 with 1 filter' }, 'A20/G12 1X', 4, [30, 30, 33]],
    [{ label: 'G12 Replacement Pack 3X' }, 'A20/G12 3X', 5, [33, 33, 40]],
    [{ label: 'G12 with 3 filters' }, 'A20/G12 3X', 5, [33, 33, 40]],
    [{ label: 'A20 with 3 AA filters' }, 'A20/G12 3X', 5, [33, 33, 40]],
    [{ label: 'G12 with 3 8 stage filters' }, 'A20/G12 3X', 5, [33, 33, 40]],
    [{ label: 'E20 System' }, 'E20', 3, [33, 33, 30]],
    [{ label: 'Model P12C2D2 Filter' }, 'P12C2D2', 6, [26, 26, 37]],
    [{ label: 'Model P17C2D2 Filter' }, 'P17C2D2', 4.86, [26.5, 26.5, 39]],
    [{ label: 'Model P24C2D2 Filter' }, 'P24C2D2', 5.75, [30, 30, 47]],
    [{ label: 'Phoenix Gravity 8L', sku: 'P17C2F2SSD2' }, 'P17C2F2SSD2', 6.11, [26.5, 26.5, 39]],
    [{ label: 'Rama Inline Filter', sku: 'RIFSC9' }, 'RIFSC9', 1.6, [30.5, 5.9, 5.9]],
    [{ label: 'Phoenix Tap', sku: 'PSSP17' }, 'PSSP17', 0.15, [6.4, 4, 10.5]]
  ];

  for (const [item, expectedName, expectedWt, expectedDims] of cases) {
    const matched = matchProductPreset(item, DEFAULT_PARCEL_PRESETS);
    assert.equal(matched?.name, expectedName);
    assert.equal(matched?.weightKg, expectedWt);
    assert.deepEqual([matched?.lengthCm, matched?.widthCm, matched?.heightCm], expectedDims);
  }

  assert.equal(matchProductPreset({ label: 'Unlisted Valve Kit', sku: 'VALVE01' }), null);
});

test('applyPresetsToItems overrides page weight/size on match and combines weights when requested', () => {
  const extracted = [
    { label: '8 Stage Filter X 6', sku: 'AIM8STG6', weightKg: 3.7, quantity: 1 },
    { label: 'E20 System', sku: 'E20', weightKg: 2.8, quantity: 1 }
  ];
  const enriched = applyPresetsToItems(extracted, DEFAULT_PARCEL_PRESETS);
  assert.equal(enriched[0].matchedPresetName, '6X');
  assert.equal(enriched[0].weightKg, 4.5);
  assert.equal(enriched[1].matchedPresetName, 'E20');
  assert.equal(enriched[1].weightKg, 3);

  const combinedAuto = buildOrderParcels(
    {
      items: enriched,
      packagingModeOverride: 'combined',
      combinedOverride: { lengthCm: 50, widthCm: 40, heightCm: 35 }
    },
    DEFAULT_SETTINGS
  );
  assert.equal(combinedAuto.totalParcelCount, 1);
  assert.equal(combinedAuto.totalWeightKg, 7.5);
  assert.equal(combinedAuto.parcels[0].lengthCm, 50);

  const combinedCustomWeight = buildOrderParcels(
    {
      items: enriched,
      packagingModeOverride: 'combined',
      combinedOverride: { lengthCm: 50, widthCm: 40, heightCm: 35, weightKg: 8.2 }
    },
    DEFAULT_SETTINGS
  );
  assert.equal(combinedCustomWeight.totalWeightKg, 8.2);
});

test('SATCHEL_PRESETS supports 5kg flat-rate buckets and determineBestSatchel auto-fits multi-product orders', () => {
  assert.equal(SATCHEL_PRESETS.length, 4);
  const [s, m, l, xl] = SATCHEL_PRESETS;
  assert.equal(s.maxWeightKg, 5);
  assert.equal(m.maxWeightKg, 5);
  assert.equal(l.maxWeightKg, 5);
  assert.equal(xl.maxWeightKg, 5);
  assert.deepEqual([s.lengthCm, s.widthCm, s.heightCm], [33, 22, 2]);

  // 1 filter -> Small
  assert.equal(
    determineBestSatchel([{ label: 'Aimex Water 1 x 8 Stage Filter', sku: '8KDFCHF1WEB', weightKg: 0.75, quantity: 1 }], DEFAULT_SETTINGS).satchel?.id,
    'satchel-s'
  );

  // 1 filter + Maifan stone -> Large
  assert.equal(
    determineBestSatchel([
      { label: 'Aimex Water 1 x 8 Stage Filter', sku: '8KDFCHF1WEB', weightKg: 0.75, quantity: 1 },
      { label: 'Aimex Water Maifan Stone Cartridge', sku: 'MAIFANA20', weightKg: 0.5, quantity: 1 }
    ], DEFAULT_SETTINGS).satchel?.id,
    'satchel-l'
  );

  // 2 filters + Maifan stone -> Large
  assert.equal(
    determineBestSatchel([
      { label: 'Aimex Water 2 x 8 Stage water Filter', sku: '8KDFCHF2WEB', weightKg: 1.5, quantity: 1 },
      { label: 'Aimex Water Maifan Stone Cartridge', sku: 'MAIFANA20', weightKg: 0.5, quantity: 1 }
    ], DEFAULT_SETTINGS).satchel?.id,
    'satchel-l'
  );

  // 3 filters + Maifan stone -> Extra Large
  assert.equal(
    determineBestSatchel([
      { label: 'White Filter X 3', sku: 'AIMWHT3', weightKg: 1.82, quantity: 1 },
      { label: 'Aimex Water Maifan Stone Cartridge', sku: 'MAIFANA20', weightKg: 0.5, quantity: 1 }
    ], DEFAULT_SETTINGS).satchel?.id,
    'satchel-xl'
  );

  // 4-6 filters -> Extra Large
  assert.equal(
    determineBestSatchel([{ label: '8 Stage Filter X 6', sku: 'AIM8STG6', weightKg: 4.5, quantity: 1 }], DEFAULT_SETTINGS).satchel?.id,
    'satchel-xl'
  );

  // Benchtop purifier / tank / bulky item -> does not fit satchel
  assert.equal(
    determineBestSatchel([{ label: 'G12 With 1 AA Stage', sku: 'AIMGAAFILTER', weightKg: 5, quantity: 1 }], DEFAULT_SETTINGS).fits,
    false
  );
  assert.equal(
    determineBestSatchel([{ label: '20L Purifier Bottle with Maifan Stone', sku: 'MAIFANE20', weightKg: 3, quantity: 1 }], DEFAULT_SETTINGS).fits,
    false
  );

  // Over 5kg -> does not fit satchel
  assert.equal(
    determineBestSatchel([{ label: '8 Stage Filter X 6', sku: 'AIM8STG6', weightKg: 5.4, quantity: 1 }], DEFAULT_SETTINGS).fits,
    false
  );

  assert.equal(extractItemPackCount({ label: 'Aimex Water 15 Stage Shower Cartridge', sku: 'AIMSHRCART3' }), 3);
});

test('formatShortServiceLabel shortens courier service names cleanly', () => {
  assert.deepEqual(
    formatShortServiceLabel(CARRIER_IDS.AUSPOST_PAC, 'AUS_PARCEL_REGULAR_PACKAGE_SMALL', 'Parcel Post — Small'),
    { shortInColumn: 'Small', shortWithCarrier: 'MyPost: Small' }
  );
  assert.deepEqual(
    formatShortServiceLabel(CARRIER_IDS.AUSPOST_PAC, 'AUS_PARCEL_EXPRESS', 'Express Post (Own Packaging)'),
    { shortInColumn: 'Express', shortWithCarrier: 'MyPost: Express' }
  );
  assert.deepEqual(
    formatShortServiceLabel(CARRIER_IDS.AUSPOST_EPARCEL, '3D55', 'Parcel Post + Signature'),
    { shortInColumn: 'Parcel Post', shortWithCarrier: 'eParcel: Parcel Post' }
  );
  assert.deepEqual(
    formatShortServiceLabel(CARRIER_IDS.COURIERS_PLEASE, 'REC', 'Domestic Saver - Authority To Leave'),
    { shortInColumn: 'Saver ATL', shortWithCarrier: 'CP: Saver ATL' }
  );
});
