import { CARRIER_IDS } from '../src/shared/constants.js';
import { createToastManager, initFormValidation } from '../src/shared/form-a11y.js';
import {
  loadSettings,
  mergeSettings,
  parseEnvText,
  resetSettings,
  saveSettings
} from '../src/shared/storage.js';

const form = document.getElementById('settings-form');
const toastRegion = document.getElementById('toast-region');
const toast = createToastManager(toastRegion);

const extVersionEl = document.getElementById('ext-version');
const maxPricesInput = document.getElementById('max-prices');
const includeGstInput = document.getElementById('include-gst');
const originSuburbInput = document.getElementById('origin-suburb');
const originStateSelect = document.getElementById('origin-state');
const originPostcodeInput = document.getElementById('origin-postcode');
const lengthInput = document.getElementById('default-length');
const widthInput = document.getElementById('default-width');
const heightInput = document.getElementById('default-height');

const pacEnabledInput = document.getElementById('pac-enabled');
const pacApiKeyInput = document.getElementById('pac-api-key');
const pacSatchelsInput = document.getElementById('pac-satchels');

const eparcelEnabledInput = document.getElementById('eparcel-enabled');
const eparcelApiKeyInput = document.getElementById('eparcel-api-key');
const eparcelApiPasswordInput = document.getElementById('eparcel-api-password');
const eparcelAccountInput = document.getElementById('eparcel-account');
const eparcelSurchargesInput = document.getElementById('eparcel-surcharges');

const cpEnabledInput = document.getElementById('cp-enabled');
const cpAccountInput = document.getElementById('cp-account');
const cpApiKeyInput = document.getElementById('cp-api-key');
const cpCustomUrlWrap = document.getElementById('cp-custom-url-wrap');
const cpCustomUrlInput = document.getElementById('cp-custom-url');
const cpPortalWarningEl = document.getElementById('cp-portal-warning');
const cpValidateLocationInput = document.getElementById('cp-validate-location');

const repoUrlInput = document.getElementById('repo-url');
const githubTokenInput = document.getElementById('github-token');

const envFileInput = document.getElementById('env-file-input');
const envPasteText = document.getElementById('env-paste-text');
const applyEnvTextBtn = document.getElementById('apply-env-text-btn');
const envImportStatus = document.getElementById('env-import-status');

const testPacBtn = document.getElementById('test-pac-btn');
const testPacResult = document.getElementById('test-pac-result');
const testEparcelBtn = document.getElementById('test-eparcel-btn');
const testEparcelResult = document.getElementById('test-eparcel-result');
const testCpBtn = document.getElementById('test-cp-btn');
const testCpResult = document.getElementById('test-cp-result');
const checkUpdatesBtn = document.getElementById('check-updates-btn');
const updateCheckResult = document.getElementById('update-check-result');

const resetDialog = document.getElementById('reset-dialog');
const openResetDialogBtn = document.getElementById('open-reset-dialog-btn');

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function setRadioValue(name, value) {
  const radio = form.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
  if (radio) radio.checked = true;
}

function getRadioValue(name, fallback) {
  const checked = form.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : fallback;
}

function updateCouriersPleaseCustomUrlVisibility() {
  const env = getRadioValue('cpEnvironment', 'production');
  cpCustomUrlWrap.hidden = env !== 'custom';
  const customVal = cpCustomUrlInput.value.trim();
  cpPortalWarningEl.hidden = !/apidev\.couriersplease\.com\.au/i.test(customVal);
}

function populateForm(settings) {
  maxPricesInput.value = String(settings.maxPricesPerCourier);
  includeGstInput.checked = Boolean(settings.includeGst);
  setRadioValue('packagingMode', settings.packagingMode);
  setRadioValue('theme', settings.theme);
  applyTheme(settings.theme);

  originSuburbInput.value = settings.origin.suburb;
  originStateSelect.value = settings.origin.state;
  originPostcodeInput.value = settings.origin.postcode;

  lengthInput.value = String(settings.defaultDimensions.lengthCm);
  widthInput.value = String(settings.defaultDimensions.widthCm);
  heightInput.value = String(settings.defaultDimensions.heightCm);

  pacEnabledInput.checked = Boolean(settings.carriers.auspostPac.enabled);
  pacApiKeyInput.value = settings.carriers.auspostPac.apiKey;
  pacSatchelsInput.checked = Boolean(settings.carriers.auspostPac.includeSatchels);

  eparcelEnabledInput.checked = Boolean(settings.carriers.auspostEparcel.enabled);
  eparcelApiKeyInput.value = settings.carriers.auspostEparcel.apiKey;
  eparcelApiPasswordInput.value = settings.carriers.auspostEparcel.apiPassword;
  eparcelAccountInput.value = settings.carriers.auspostEparcel.accountNumber;
  eparcelSurchargesInput.checked = Boolean(settings.carriers.auspostEparcel.includeSurcharges);

  cpEnabledInput.checked = Boolean(settings.carriers.couriersPlease.enabled);
  cpAccountInput.value = settings.carriers.couriersPlease.account;
  cpApiKeyInput.value = settings.carriers.couriersPlease.apiKey;
  setRadioValue('cpEnvironment', settings.carriers.couriersPlease.environment);
  cpCustomUrlInput.value = settings.carriers.couriersPlease.customBaseUrl;
  cpValidateLocationInput.checked = Boolean(settings.carriers.couriersPlease.validateLocation);
  updateCouriersPleaseCustomUrlVisibility();

  repoUrlInput.value = settings.updates.repoUrl;
  githubTokenInput.value = settings.updates.githubToken;
}

function collectFormSettings() {
  return {
    maxPricesPerCourier: Number.parseInt(maxPricesInput.value.trim(), 10),
    includeGst: includeGstInput.checked,
    packagingMode: getRadioValue('packagingMode', 'per_unit'),
    theme: getRadioValue('theme', 'system'),
    origin: {
      suburb: originSuburbInput.value.trim().toUpperCase(),
      state: originStateSelect.value,
      postcode: originPostcodeInput.value.trim()
    },
    defaultDimensions: {
      lengthCm: Number.parseFloat(lengthInput.value.trim()),
      widthCm: Number.parseFloat(widthInput.value.trim()),
      heightCm: Number.parseFloat(heightInput.value.trim())
    },
    carriers: {
      auspostPac: {
        enabled: pacEnabledInput.checked,
        apiKey: pacApiKeyInput.value.trim(),
        includeSatchels: pacSatchelsInput.checked
      },
      auspostEparcel: {
        enabled: eparcelEnabledInput.checked,
        apiKey: eparcelApiKeyInput.value.trim(),
        apiPassword: eparcelApiPasswordInput.value.trim(),
        accountNumber: eparcelAccountInput.value.trim(),
        includeSurcharges: eparcelSurchargesInput.checked
      },
      couriersPlease: {
        enabled: cpEnabledInput.checked,
        account: cpAccountInput.value.trim(),
        apiKey: cpApiKeyInput.value.trim(),
        environment: getRadioValue('cpEnvironment', 'production'),
        customBaseUrl: cpCustomUrlInput.value.trim(),
        validateLocation: cpValidateLocationInput.checked
      }
    },
    updates: {
      repoUrl: repoUrlInput.value.trim(),
      githubToken: githubTokenInput.value.trim()
    }
  };
}

function wirePasswordToggles() {
  for (const btn of document.querySelectorAll('.toggle-secret-btn')) {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      const showing = target.type === 'text';
      target.type = showing ? 'password' : 'text';
      btn.setAttribute('aria-pressed', showing ? 'false' : 'true');
      btn.textContent = showing ? 'Show' : 'Hide';
    });
  }
}

async function runCarrierTest(carrierId, button, statusEl) {
  button.disabled = true;
  statusEl.dataset.tone = '';
  statusEl.textContent = 'Testing connection...';

  try {
    const currentSettings = mergeSettings(await loadSettings(), collectFormSettings());
    const response = await chrome.runtime.sendMessage({
      type: 'TEST_CARRIER',
      carrierId,
      settingsOverride: currentSettings
    });
    if (response?.ok) {
      statusEl.dataset.tone = 'success';
      statusEl.textContent = response.summary || 'Connection succeeded.';
    } else {
      statusEl.dataset.tone = 'error';
      const err = response?.error;
      statusEl.textContent = err ? `${err.title}: ${err.message}` : 'Connection test failed.';
    }
  } catch {
    statusEl.dataset.tone = 'error';
    statusEl.textContent = 'Could not communicate with the background service worker.';
  } finally {
    button.disabled = false;
  }
}

async function applyEnvImport(rawText) {
  const { settingsPatch, warnings, foundKeys } = parseEnvText(rawText);
  if (!foundKeys.length) {
    envImportStatus.dataset.tone = 'error';
    envImportStatus.textContent = 'No recognized Aimex carrier variables were found in that .env text.';
    return;
  }

  const current = mergeSettings(await loadSettings(), collectFormSettings());
  const next = mergeSettings(current, settingsPatch);
  const saved = await saveSettings(next);
  populateForm(saved);

  envImportStatus.dataset.tone = 'success';
  const warnText = warnings.length ? ` Note: ${warnings.join(' ')}` : '';
  envImportStatus.textContent = `Imported ${foundKeys.length} setting${foundKeys.length === 1 ? '' : 's'} from .env.${warnText}`;
  toast.show('Imported credentials from .env and saved locally.', { tone: 'success' });
}

async function handleCheckUpdates() {
  checkUpdatesBtn.disabled = true;
  updateCheckResult.dataset.tone = '';
  updateCheckResult.textContent = 'Checking GitHub...';
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_UPDATES',
      repoUrl: repoUrlInput.value.trim(),
      githubToken: githubTokenInput.value.trim()
    });
    const update = response?.update;
    if (!update) {
      updateCheckResult.dataset.tone = 'error';
      updateCheckResult.textContent = 'Update check failed.';
      return;
    }

    updateCheckResult.replaceChildren();
    if (update.status === 'update_available') {
      updateCheckResult.dataset.tone = 'success';
      updateCheckResult.append(
        document.createTextNode(`New version v${update.latestVersion} available (installed v${update.currentVersion}). `)
      );
      const link = document.createElement('a');
      link.href = update.releaseUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Open GitHub';
      updateCheckResult.append(link);
    } else if (update.status === 'up_to_date') {
      updateCheckResult.dataset.tone = 'success';
      updateCheckResult.textContent = `Up to date (v${update.currentVersion}).`;
    } else {
      updateCheckResult.dataset.tone = 'error';
      updateCheckResult.textContent = update.error || 'Could not reach GitHub.';
    }
  } catch {
    updateCheckResult.dataset.tone = 'error';
    updateCheckResult.textContent = 'Could not communicate with the background service worker.';
  } finally {
    checkUpdatesBtn.disabled = false;
  }
}

async function initOptionsPage() {
  extVersionEl.textContent = `v${chrome.runtime.getManifest().version}`;
  const settings = await loadSettings();
  populateForm(settings);
  initFormValidation(form);
  wirePasswordToggles();

  for (const radio of form.querySelectorAll('input[name="theme"]')) {
    radio.addEventListener('change', () => applyTheme(getRadioValue('theme', 'system')));
  }

  for (const radio of form.querySelectorAll('input[name="cpEnvironment"]')) {
    radio.addEventListener('change', updateCouriersPleaseCustomUrlVisibility);
  }
  cpCustomUrlInput.addEventListener('input', updateCouriersPleaseCustomUrlVisibility);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      const firstInvalid = form.querySelector(':invalid');
      if (firstInvalid instanceof HTMLElement) firstInvalid.focus();
      toast.show('Please correct the highlighted fields before saving.', { tone: 'error' });
      return;
    }

    const saved = await saveSettings(collectFormSettings());
    populateForm(saved);
    toast.show('Settings saved locally.', { tone: 'success' });
  });

  testPacBtn.addEventListener('click', () => runCarrierTest(CARRIER_IDS.AUSPOST_PAC, testPacBtn, testPacResult));
  testEparcelBtn.addEventListener('click', () => runCarrierTest(CARRIER_IDS.AUSPOST_EPARCEL, testEparcelBtn, testEparcelResult));
  testCpBtn.addEventListener('click', () => runCarrierTest(CARRIER_IDS.COURIERS_PLEASE, testCpBtn, testCpResult));

  envFileInput.addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await applyEnvImport(text);
    envFileInput.value = '';
  });

  applyEnvTextBtn.addEventListener('click', async () => {
    await applyEnvImport(envPasteText.value);
  });

  checkUpdatesBtn.addEventListener('click', handleCheckUpdates);

  openResetDialogBtn.addEventListener('click', () => {
    resetDialog.showModal();
  });

  resetDialog.addEventListener('close', async () => {
    if (resetDialog.returnValue === 'reset-local') {
      const next = await resetSettings({ useLocalConfig: true });
      populateForm(next);
      toast.show('Restored defaults and reloaded local configuration.', { tone: 'success' });
    } else if (resetDialog.returnValue === 'reset-blank') {
      const next = await resetSettings({ useLocalConfig: false });
      populateForm(next);
      toast.show('All settings and saved keys cleared.', { tone: 'info' });
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initOptionsPage().catch((err) => {
    toast.show(`Failed to load settings: ${err?.message || err}`, { tone: 'error' });
  });
});
