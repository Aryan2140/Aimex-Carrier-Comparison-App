# Carrier Comparison Companion (Chrome Extension)

A minimalist Manifest V3 Chrome Extension for Aimex Australia that reads **only** carrier-required shipment fields from `https://aimexaustralia.logicsync.app/` order pages—**only when you press Compare Rates**—and compares rates across **Australia Post PAC**, **Australia Post eParcel**, and **CouriersPlease**.

## Features

- **On-Click Reading**: No passive background scraping (`content_scripts` omitted). Reads destination (`suburb`, `state`, `postcode`, `country`, `RESIDENTIAL`/`BUSINESS`) and parcel items once per **Compare Rates** click, then resets the button immediately. No customer PII (name, email, phone, street, billing, invoice) is ever sent.
- **Favourite Parcel Presets**: Pre-loaded with Aimex's standard box sizes and weights (`1X`–`6X`, `A20/G12 1X`, `A20/G12 3X`, `E20`, `P12C2D2`, `P17C2D2`, `P24C2D2`) in Settings. Matched products automatically populate the always-visible Parcel Size editor.
- **Multi-Product Combine Toggle**: Toggle **Combine** to consolidate multiple items into one custom box size with an editable summed total weight before comparing.
- **Clean Comparison Table**: Displays collected Address / Weight / Size, a single-row **Cheapest** summary (`PAC: Small`, `eParcel: Parcel Post`, `CP: Saver ATL`), a scrollable 3-column carrier comparison table with courier logos, and a **Create Order ↗** button opening each carrier's configurable portal URL.
- **Origin Address**: Defaults to `26/191 McCredie Rd, Smithfield NSW 2164` (configurable in Settings).
- **GitHub Update Check**: Checks `https://github.com/Aryan2140/Aimex-Carrier-Comparison-App` Releases and `manifest.json`.

## Loading Unpacked in Chrome

1. Ensure your local credentials are present in gitignored `config.local.json` (copy `config.local.example.json` if starting fresh) or import `.env` in Settings.
2. Open `chrome://extensions`, enable **Developer mode**, and click **Load unpacked** on this folder.
3. Open an order on `https://aimexaustralia.logicsync.app/`, open **Carrier Comparison Companion**, and click **Compare Rates**.

## CouriersPlease Note

- `https://apidev.couriersplease.com.au` is the CouriersPlease documentation website (returns 404 on API paths). Select **Production** (`https://api.couriersplease.com.au`) or **Sandbox** (`https://api-test.couriersplease.com.au`) in Settings, paired with your CouriersPlease **Account Number** and API Token.

## Running Tests

```sh
node --test tests/*.test.js
```
