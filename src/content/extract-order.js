/**
 * One-shot DOM extraction script injected programmatically ONLY on user click.
 * Strictly reads destination (suburb, state, postcode, country, addressType) and
 * item weights, quantities, and optional dimensions. Never reads or returns customer PII.
 */
(() => {
  const ALLOWED_ORIGIN = 'https://aimexaustralia.logicsync.app';
  const WEIGHT_RE = /(\d+(?:\.\d+)?)\s*(kgs?|grams?|gms?|g)\b/i;
  const DIMS_RE = /(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(cm|mm)?\b/i;

  if (window.location.origin !== ALLOWED_ORIGIN) {
    return {
      ok: false,
      errorCode: 'NOT_ALLOWED_ORIGIN',
      destination: null,
      items: [],
      warnings: []
    };
  }

  function clean(str) {
    return String(str || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeWeightToKg(value, unit) {
    const num = Number.parseFloat(String(value));
    if (!Number.isFinite(num) || num <= 0) return 0;
    const u = String(unit || 'kg').trim().toLowerCase();
    const kg = u.startsWith('g') ? num / 1000 : num;
    return Math.round(kg * 10000) / 10000;
  }

  /**
   * Read text representation of a container where form controls emit their current .value
   * without mutating the live page DOM.
   */
  function extractCleanLines(root) {
    if (!root) return [];
    const tokens = [];

    function walk(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        const t = node.nodeValue;
        if (t && t.trim()) tokens.push(t);
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = (node.tagName || '').toUpperCase();
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        const val = clean(node.value);
        if (val) tokens.push(val);
        tokens.push('\n');
        return;
      }
      const isBlock = /^(DIV|P|LI|TR|TD|TH|SECTION|ARTICLE|HEADER|H[1-6]|BR|HR|DT|DD)$/.test(tag);
      for (const child of node.childNodes || []) {
        walk(child);
      }
      if (isBlock) tokens.push('\n');
    }

    walk(root);
    return tokens
      .join(' ')
      .split(/\r?\n/)
      .map((line) => clean(line))
      .filter(Boolean);
  }

  function extractLabeledField(lines, labelName) {
    const labelRe = new RegExp(`^${labelName}\\s*:?\\s*(.*)$`, 'i');
    for (let i = 0; i < lines.length; i += 1) {
      const match = lines[i].match(labelRe);
      if (!match) continue;
      const inline = clean(match[1]);
      if (inline && !/^(phone|street|suburb|state|postcode|country|update)$/i.test(inline)) {
        return inline;
      }
      const next = clean(lines[i + 1]);
      if (next && !/^[A-Za-z]+\s*:/.test(next)) {
        return next;
      }
    }
    return '';
  }

  function parseShippingLines(lines) {
    const headerLine = lines.find((l) => /shipping/i.test(l)) || '';
    const addressType = /business|commercial/i.test(headerLine) ? 'BUSINESS' : 'RESIDENTIAL';
    const suburb = extractLabeledField(lines, 'Suburb');
    const state = extractLabeledField(lines, 'State').toUpperCase();
    const rawPostcode = extractLabeledField(lines, 'Postcode');
    const postcodeMatch = rawPostcode.match(/\b(\d{4})\b/);
    const postcode = postcodeMatch ? postcodeMatch[1] : rawPostcode;
    const country = (extractLabeledField(lines, 'Country') || 'AU').toUpperCase();
    return { suburb, state, postcode, country, addressType };
  }

  function parseItemsLines(lines) {
    const items = [];
    for (let i = 0; i < lines.length; i += 1) {
      const weightMatch = lines[i].match(WEIGHT_RE);
      if (!weightMatch) continue;

      const weightKg = normalizeWeightToKg(weightMatch[1], weightMatch[2]);
      let quantity = 1;
      let lengthCm = null;
      let widthCm = null;
      let heightCm = null;

      const prevLine = i > 0 ? lines[i - 1] : '';
      const windowLines = lines.slice(i, Math.min(lines.length, i + 6));
      const windowJoined = windowLines.join(' ');

      const qtyMatch = windowJoined.match(/Qty\s*:?\s*(\d+)/i);
      if (qtyMatch) {
        const q = Number.parseInt(qtyMatch[1], 10);
        if (Number.isFinite(q) && q > 0) quantity = q;
      }

      const dimsMatch = `${prevLine} ${windowJoined}`.match(DIMS_RE);
      if (dimsMatch) {
        const factor = (dimsMatch[4] || 'cm').toLowerCase() === 'mm' ? 0.1 : 1;
        lengthCm = Math.round(Number.parseFloat(dimsMatch[1]) * factor * 10) / 10;
        widthCm = Math.round(Number.parseFloat(dimsMatch[2]) * factor * 10) / 10;
        heightCm = Math.round(Number.parseFloat(dimsMatch[3]) * factor * 10) / 10;
      }

      const skuPart = clean(lines[i].split('|')[0]);
      const rawLabel = prevLine && !/^(items?|price|qty|amount)$/i.test(prevLine)
        ? prevLine
        : (skuPart || `Item ${items.length + 1}`);

      items.push({
        label: rawLabel.slice(0, 60),
        weightKg,
        quantity,
        lengthCm,
        widthCm,
        heightCm
      });
    }
    return items;
  }

  function findHeadingElement(pattern) {
    const candidates = Array.from(
      document.querySelectorAll('h1, h2, h3, h4, h5, h6, strong, b, p, div, span, label')
    );
    for (const el of candidates) {
      if (el.children.length > 2) continue;
      const t = clean(el.textContent);
      if (t && t.length < 64 && pattern.test(t)) return el;
    }
    return null;
  }

  function findScopedContainer(headingEl, stopPattern) {
    let curr = headingEl;
    while (curr && curr.parentElement && curr.parentElement !== document.body) {
      const parent = curr.parentElement;
      const parentText = clean(parent.textContent);
      if (stopPattern.test(parentText)) {
        return curr;
      }
      curr = parent;
    }
    return curr;
  }

  // Strategy 1: DOM-scoped extraction bounded strictly before # Billing and Tracking/Note
  let destination = null;
  let items = [];

  const shippingHeading = findHeadingElement(/^(?:#\s*)?Shipping\b/i);
  if (shippingHeading) {
    const container = findScopedContainer(shippingHeading, /(?:#\s*)?Billing\b/i);
    const lines = extractCleanLines(container || shippingHeading.parentElement);
    const stopIdx = lines.findIndex((l) => /^(?:#\s*)?Billing\b/i.test(l));
    const bounded = stopIdx !== -1 ? lines.slice(0, stopIdx) : lines;
    const parsed = parseShippingLines(bounded);
    if (parsed.postcode) destination = parsed;
  }

  const itemsHeading = findHeadingElement(/^Items$/i);
  if (itemsHeading) {
    const container = findScopedContainer(itemsHeading, /\b(Tracking|Information)\b/i);
    const lines = extractCleanLines(container || itemsHeading.parentElement);
    const stopIdx = lines.findIndex((l) => /^(Tracking|Note|Information)\b/i.test(l));
    const bounded = stopIdx !== -1 ? lines.slice(0, stopIdx) : lines;
    items = parseItemsLines(bounded);
  }

  // Strategy 2: Bounded text-slice fallback if DOM wrappers share containers
  if (!destination?.postcode || items.length === 0) {
    const fullText = document.body?.innerText || '';
    if (!destination?.postcode) {
      const shipSlice = fullText.match(
        /(?:#\s*)?Shipping\b[\s\S]*?(?=(?:#\s*)?Billing\b|\bTracking\b|\bInformation\b|$)/i
      );
      if (shipSlice) {
        const lines = shipSlice[0].split(/\r?\n/).map(clean).filter(Boolean);
        destination = parseShippingLines(lines);
      }
    }
    if (items.length === 0) {
      const itemSlice = fullText.match(
        /\bItems\b[\s\S]*?(?=\bTracking\b|\bNote\b|\bInformation\b|$)/i
      );
      if (itemSlice) {
        const lines = itemSlice[0].split(/\r?\n/).map(clean).filter(Boolean);
        items = parseItemsLines(lines);
      }
    }
  }

  const hasOrderStructure = Boolean(shippingHeading || itemsHeading || destination?.postcode || items.length);
  if (!hasOrderStructure) {
    return {
      ok: false,
      errorCode: 'NOT_ORDER_PAGE',
      destination: null,
      items: [],
      warnings: []
    };
  }

  if (!destination?.postcode) {
    return {
      ok: false,
      errorCode: 'MISSING_SHIPPING_POSTCODE',
      destination,
      items,
      warnings: []
    };
  }

  if (!items.length) {
    return {
      ok: false,
      errorCode: 'MISSING_ITEMS',
      destination,
      items: [],
      warnings: []
    };
  }

  if (items.some((item) => !item.weightKg || item.weightKg <= 0)) {
    return {
      ok: false,
      errorCode: 'MISSING_ITEM_WEIGHT',
      destination,
      items,
      warnings: []
    };
  }

  const warnings = [];
  if (!destination.suburb) {
    warnings.push('Shipping suburb was blank on the page; CouriersPlease may need suburb verification.');
  }

  return {
    ok: true,
    errorCode: '',
    destination: {
      suburb: destination.suburb,
      state: destination.state,
      postcode: destination.postcode,
      country: destination.country || 'AU',
      addressType: destination.addressType || 'RESIDENTIAL'
    },
    items,
    warnings
  };
})();
