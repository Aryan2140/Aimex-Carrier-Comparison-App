/**
 * Modern accessible form validation (:user-invalid + ARIA sync + polite live announcer)
 * and popover="manual" persistent toast notifications following modern-web-guidance.
 */

const spokenText = (node) => {
  const copy = node.cloneNode(true);
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  copy.querySelectorAll('[role="img"][aria-label]').forEach((n) => {
    n.replaceWith(`${n.getAttribute('aria-label')}: `);
  });
  return copy.textContent.replace(/\s+/g, ' ').trim();
};

const linkError = (el, shown) => {
  const errorId = el.dataset.error;
  if (!errorId) return;
  const ids = (el.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter((id) => id && id !== errorId);
  if (shown) ids.push(errorId);
  if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
  else el.removeAttribute('aria-describedby');
};

/**
 * Wire :user-invalid ARIA synchronization and post-interaction error announcements on a form.
 * @param {HTMLFormElement} form
 */
export function initFormValidation(form) {
  if (!form) return;

  const supportsUserInvalid = typeof CSS !== 'undefined' && CSS.supports?.('selector(:user-invalid)');
  const dirtyState = new WeakMap();
  const flagged = new WeakSet();
  const announced = new WeakSet();

  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.classList.add('visually-hidden');
  document.body.append(announcer);

  let announceTimer;
  let announcedField;

  const announceError = (el) => {
    const errorEl = document.getElementById(el.dataset.error);
    if (!errorEl) return;
    const label = el.labels?.[0] ? `${spokenText(el.labels[0])}: ` : '';
    clearTimeout(announceTimer);
    announcer.textContent = '';
    announcedField = el;
    announceTimer = setTimeout(() => {
      announcer.textContent = label + spokenText(errorEl);
    }, 500);
  };

  const isFieldUserInvalid = (el) => {
    if (supportsUserInvalid) return el.matches(':user-invalid');
    return el.classList.contains('user-invalid-fallback');
  };

  const syncAria = (el, announce = false) => {
    if (!el?.matches?.('input, select, textarea')) return;
    const invalid = isFieldUserInvalid(el);
    if (invalid) {
      if (announce && !announced.has(el)) {
        announceError(el);
        announced.add(el);
      }
      el.setAttribute('aria-invalid', 'true');
      linkError(el, true);
      flagged.add(el);
    } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
      el.setAttribute('aria-invalid', 'false');
      linkError(el, false);
      flagged.delete(el);
      announced.delete(el);
      if (announcedField === el) {
        clearTimeout(announceTimer);
        announcer.textContent = '';
      }
    }
  };

  const updateFallback = (el, announce = false) => {
    const valid = el.validity.valid;
    el.classList.toggle('user-invalid-fallback', !valid);
    el.classList.toggle('user-valid-fallback', valid);
    syncAria(el, announce);
  };

  // Start every field at aria-invalid="false" to prevent premature screen reader error announcements
  form.querySelectorAll('input, select, textarea').forEach((el) => {
    el.setAttribute('aria-invalid', 'false');
    linkError(el, false);
  });

  form.addEventListener('blur', (event) => {
    const el = event.target;
    if (!el?.matches?.('input, select, textarea')) return;
    if (!supportsUserInvalid) {
      const state = dirtyState.get(el) || { hasInteracted: false, hasBlurred: false };
      state.hasBlurred = true;
      dirtyState.set(el, state);
      if (state.hasInteracted) updateFallback(el, true);
      return;
    }
    syncAria(el, true);
  }, true);

  form.addEventListener('input', (event) => {
    const el = event.target;
    if (!el?.matches?.('input, select, textarea')) return;
    if (!supportsUserInvalid) {
      const state = dirtyState.get(el) || { hasInteracted: false, hasBlurred: false };
      state.hasInteracted = true;
      dirtyState.set(el, state);
      if (state.hasBlurred) updateFallback(el, false);
      return;
    }
    if (el.hasAttribute('aria-invalid')) syncAria(el, false);
  });

  form.addEventListener('change', (event) => {
    const el = event.target;
    if (!el?.matches?.('input, select, textarea')) return;
    if (!supportsUserInvalid) {
      const state = dirtyState.get(el) || { hasInteracted: false, hasBlurred: false };
      state.hasInteracted = true;
      dirtyState.set(el, state);
      if (state.hasBlurred) updateFallback(el, true);
      return;
    }
    syncAria(el, true);
  }, true);

  form.addEventListener('invalid', (event) => {
    const el = event.target;
    announced.add(el);
    if (!supportsUserInvalid) {
      dirtyState.set(el, { hasInteracted: true, hasBlurred: true });
      updateFallback(el, false);
      return;
    }
    syncAria(el, false);
  }, true);

  form.addEventListener('reset', () => {
    setTimeout(() => {
      for (const el of form.elements) {
        if (!el.matches?.('input, select, textarea')) continue;
        dirtyState.delete(el);
        el.classList.remove('user-invalid-fallback', 'user-valid-fallback');
        flagged.delete(el);
        announced.delete(el);
        el.setAttribute('aria-invalid', 'false');
        linkError(el, false);
      }
    });
  }, true);
}

/**
 * Create a toast notification controller using popover="manual" inside a role="region" container.
 * @param {HTMLElement} regionEl
 */
export function createToastManager(regionEl) {
  let toastSeq = 0;

  const politeFallback = document.createElement('div');
  politeFallback.setAttribute('aria-live', 'polite');
  politeFallback.className = 'visually-hidden';
  document.body.append(politeFallback);

  const announce = (text) => {
    if (typeof document.ariaNotify === 'function') {
      document.ariaNotify(text);
    } else {
      politeFallback.textContent = '';
      setTimeout(() => {
        politeFallback.textContent = text;
      }, 30);
    }
  };

  /**
   * Show a non-intrusive toast notification.
   * @param {string} message
   * @param {{ tone?: 'info'|'success'|'error', durationMs?: number }} [options]
   */
  const show = (message, options = {}) => {
    if (!regionEl) return;
    const tone = options.tone || 'info';
    const durationMs = options.durationMs ?? 5000;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    toastSeq += 1;
    const toastId = `aimex-toast-${toastSeq}`;
    const toast = document.createElement('div');
    toast.id = toastId;
    toast.className = `toast toast--${tone}`;
    toast.setAttribute('popover', 'manual');

    const textEl = document.createElement('span');
    textEl.className = 'toast__text';
    textEl.textContent = message;

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'toast__close';
    closeBtn.setAttribute('popovertarget', toastId);
    closeBtn.setAttribute('popovertargetaction', 'hide');
    closeBtn.setAttribute('aria-label', 'Close notification');
    closeBtn.textContent = '×';

    toast.append(textEl, closeBtn);
    regionEl.append(toast);

    let hideTimer = null;
    let remainingMs = durationMs;
    let startedAt = Date.now();

    const removeToast = () => {
      clearTimeout(hideTimer);
      toast.remove();
    };

    const dismiss = (restoreFocus = false) => {
      clearTimeout(hideTimer);
      try {
        if (toast.matches(':popover-open')) toast.hidePopover();
      } catch {
        toast.classList.remove(':popover-open');
      }
      if (restoreFocus) {
        const nextToastBtn = regionEl.querySelector('.toast .toast__close');
        if (nextToastBtn instanceof HTMLElement) {
          nextToastBtn.focus();
        } else if (previousFocus?.isConnected) {
          previousFocus.focus();
        }
      }
      setTimeout(removeToast, 250);
    };

    const startTimer = () => {
      if (remainingMs <= 0) return;
      startedAt = Date.now();
      hideTimer = setTimeout(() => dismiss(false), remainingMs);
    };

    const pauseTimer = () => {
      clearTimeout(hideTimer);
      remainingMs = Math.max(800, remainingMs - (Date.now() - startedAt));
    };

    toast.addEventListener('focusin', pauseTimer);
    toast.addEventListener('focusout', () => {
      if (!toast.contains(document.activeElement)) startTimer();
    });
    toast.addEventListener('mouseenter', pauseTimer);
    toast.addEventListener('mouseleave', () => {
      if (!toast.contains(document.activeElement)) startTimer();
    });
    closeBtn.addEventListener('click', () => dismiss(true));

    try {
      toast.showPopover();
    } catch {
      toast.classList.add(':popover-open');
    }

    announce(message);
    startTimer();
  };

  return { show };
}
