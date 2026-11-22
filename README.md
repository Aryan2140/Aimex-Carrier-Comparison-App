# Aimex Carrier Rate Comparison (Chrome Extension)

A Manifest V3 Chrome Extension for Aimex Australia that reads **only** carrier-required shipment fields from `https://aimexaustralia.logicsync.app/` order pages—**only when you press Compare Rates**—and compares shipping rates across:

- **Australia Post PAC** (retail domestic rates)
- **Australia Post eParcel** (Aimex business/contract rates including GST, fuel, and security surcharges)
- **CouriersPlease** (contract rate cards)

## Privacy & On-Click Operation

- **Zero background page scraping**: `manifest.json` registers no passive `content_scripts`.
- **One-shot reading**: Pressing **Compare Rates** runs `src/content/extract-order.js` once against the active `https://aimexaustralia.logicsync.app/` tab, extracts only destination (`suburb`, `state`, `postcode`, `country`, `RESIDENTIAL`/`BUSINESS`) and parcel items (`weightKg`, `quantity`, optional dimensions), stops reading immediately, and resets the button back to **Compare Rates**.
- **No customer PII sent**: Customer names, emails, phone numbers, street addresses, billing addresses, invoice numbers, and order totals are never extracted or transmitted.

## Loading Unpacked in Chrome

1. Ensure your local credentials exist in gitignored `config.local.json` (or import your `.env` in Settings after loading).
   - First-time repo checkouts should copy `config.local.example.json` to `config.local.json` and fill in your credentials, **or** configure keys on the **Settings** tab.
2. Open `chrome://extensions` in Google Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this repository folder.
5. Navigate to an order page on `https://aimexaustralia.logicsync.app/`, click the Aimex extension icon, and press **Compare Rates**.

## Settings Page

Click the gear icon in the extension popup (or right-click the extension icon → **Options**) to open Settings in a full browser tab:

- Configure API credentials and test each courier connection individually.
- Set **Displayed prices per courier** (`1–20`), GST display (`inc GST` / `ex GST`), multi-unit packaging mode, dispatch origin (`GREYSTANES NSW 2145`), default parcel dimensions, and light/dark theme.
- Import credentials directly from a local `.env` file without committing secrets.

### CouriersPlease API Note

- `https://apidev.couriersplease.com.au` is the CouriersPlease **Developer Portal / documentation website** (API calls to it return HTTP 404).
- Select **Production** (`https://api.couriersplease.com.au`) or **Sandbox** (`https://api-test.couriersplease.com.au`) in Settings.
- Basic Auth requires your CouriersPlease **Account Number** (e.g. `W99999`) paired with your generated API Token from the developer portal.

## Secret Hygiene & GitHub Updates

- `.env` and `config.local.json` are excluded via `.gitignore` and must never be committed to GitHub.
- Configured GitHub remote: `https://github.com/Aryan2140/Aimex-Carrier-Comparison-App.git`.
- Click the refresh icon in the popup (or **Check for Updates** in Settings) to compare your installed `manifest.json` version against GitHub Releases (falling back to `main/manifest.json`). When a newer version is available, run `git pull` locally and click **Reload** in `chrome://extensions`.

## Running Tests

```sh
node --test tests/*.test.js
```
