import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS } from '../src/shared/constants.js';
import { mergeSettings, parseEnvText } from '../src/shared/storage.js';
import { checkForUpdates, compareSemver, parseGitHubRepo } from '../src/shared/updates.js';

test('parseEnvText imports keys, warns on apidev portal URL, and preserves leading zeros', () => {
  const env = `
    # Private credentials
    AUSPOST_PAC_API_KEY="pac-123"
    AUSPOST_ACCOUNT_NUMBER=0001234567
    COURIERSPLEASE_ACCOUNT=W12345
    COURIERSPLEASE_API_KEY='cp-xyz'
    COURIERSPLEASE_BASE_URL=https://apidev.couriersplease.com.au
    ORIGIN_POSTCODE=0800
  `;
  const { settingsPatch, warnings, foundKeys } = parseEnvText(env);
  assert.equal(foundKeys.length, 6);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /apidev\.couriersplease\.com\.au/);
  assert.equal(settingsPatch.carriers.couriersPlease.environment, 'production');

  const merged = mergeSettings(DEFAULT_SETTINGS, settingsPatch);
  assert.equal(merged.carriers.auspostEparcel.accountNumber, '0001234567');
  assert.equal(merged.origin.postcode, '0800');
  assert.equal(merged.carriers.auspostPac.apiKey, 'pac-123');
});

test('parseGitHubRepo parses full URLs and shorthands', () => {
  assert.deepEqual(
    parseGitHubRepo('https://github.com/Aryan2140/Aimex-Carrier-Comparison-App.git'),
    { owner: 'Aryan2140', repo: 'Aimex-Carrier-Comparison-App' }
  );
  assert.deepEqual(
    parseGitHubRepo('Aryan2140/Aimex-Carrier-Comparison-App'),
    { owner: 'Aryan2140', repo: 'Aimex-Carrier-Comparison-App' }
  );
  assert.equal(parseGitHubRepo('https://gitlab.com/foo/bar'), null);
});

test('compareSemver orders versions properly', () => {
  assert.equal(compareSemver('1.0.0', '1.1.0'), -1);
  assert.equal(compareSemver('1.0.0', 'v1.0.0'), 0);
  assert.equal(compareSemver('1.2.0', '1.1.9'), 1);
});

test('checkForUpdates detects GitHub releases and falls back to manifest.json on 404', async () => {
  const releaseFetch = async () => new Response(JSON.stringify({
    tag_name: 'v1.2.0',
    html_url: 'https://github.com/Aryan2140/Aimex-Carrier-Comparison-App/releases/tag/v1.2.0',
    body: 'Added parcel presets'
  }), { status: 200 });

  const relRes = await checkForUpdates({ currentVersion: '1.0.0', fetchImpl: releaseFetch });
  assert.equal(relRes.status, 'update_available');
  assert.equal(relRes.latestVersion, '1.2.0');

  const fallbackFetch = async (url) => {
    if (url.includes('/releases/latest')) return new Response('{}', { status: 404 });
    return new Response(JSON.stringify({ version: '1.0.0' }), { status: 200 });
  };

  const upToDate = await checkForUpdates({ currentVersion: '1.0.0', fetchImpl: fallbackFetch });
  assert.equal(upToDate.status, 'up_to_date');
  assert.equal(upToDate.source, 'manifest');

  const notPushedFetch = async () => new Response('{}', { status: 404 });
  const errRes = await checkForUpdates({ currentVersion: '1.0.0', fetchImpl: notPushedFetch });
  assert.equal(errRes.status, 'error');
  assert.match(errRes.error, /not pushed the repository yet/i);
});

test('exportSettingsJson and importSettingsJson round-trip without duplicating presets', async () => {
  const { exportSettingsJson, importSettingsJson, mergeSettings } = await import('../src/shared/storage.js');
  const { DEFAULT_SETTINGS } = await import('../src/shared/constants.js');

  const custom = mergeSettings(DEFAULT_SETTINGS, {
    popupSize: 'wide',
    carriers: { couriersPlease: { account: '113203947', apiKey: 'test-token' } },
    parcelPresets: [
      { id: '1x', name: '1X', weightKg: 0.75, lengthCm: 22, widthCm: 16, heightCm: 11 },
      { id: '1x', name: '1X', weightKg: 0.75, lengthCm: 22, widthCm: 16, heightCm: 11 },
      { id: 'custom-box', name: 'Custom Box', weightKg: 2.5, lengthCm: 30, widthCm: 20, heightCm: 15 }
    ],
    satchelRules: [
      { id: 'r1', name: 'Filter', keywords: 'FILTER', units: 1, fitsSatchel: true },
      { id: 'r1', name: 'Filter', keywords: 'FILTER', units: 1, fitsSatchel: true }
    ]
  });

  const json = exportSettingsJson(custom);
  const imported = importSettingsJson(json);

  assert.equal(imported.popupSize, 'wide');
  assert.equal(imported.carriers.couriersPlease.account, '113203947');
  assert.equal(imported.carriers.couriersPlease.apiKey, 'test-token');
  assert.equal(imported.parcelPresets.length, 2);
  assert.equal(imported.satchelRules.length, 1);
  assert.equal(imported.satchelSizes.length, 4);
  assert.deepEqual(imported.parcelPresets.map((p) => p.name), ['1X', 'Custom Box']);

  assert.throws(() => importSettingsJson('not valid json'), /Invalid JSON/i);
  assert.throws(() => importSettingsJson('{"foo":"bar"}'), /does not contain/i);
});
