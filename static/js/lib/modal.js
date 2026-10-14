/**
 * Sentiment Pulse - Modal Accessibility & Focus Trap Helper (modal.js)
 * Complies with WAI-ARIA Dialog (Modal) Pattern:
 * - Traps Tab / Shift+Tab cycling inside the dialog
 * - Escape key closes the active modal
 * - Restores focus to the element that triggered the modal upon closure
 * - Prevents keyboard navigation escaping into background content
 */

/**
 * Creates and binds a focus trap for a modal element.
 * @param {HTMLElement} modalElement - The modal DOM element.
 * @param {Object} [options={}] - Configuration options.
 * @param {Function} [options.onEscape] - Callback invoked when Escape key is pressed.
 * @param {HTMLElement} [options.initialFocusEl] - Explicit element to receive focus on activation.
 * @param {HTMLElement} [options.returnFocusEl] - Element to restore focus to on deactivation.
 * @returns {Object} Trap controller { activate, deactivate, getFocusableElements, handleKeyDown, isActive }
 */
export function createFocusTrap(modalElement, options = {}) {
  const {
    onEscape,
    initialFocusEl,
    returnFocusEl = typeof document !== 'undefined' ? document.activeElement : null,
  } = options;

  const focusableSelector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  let active = false;

  function getFocusableElements() {
    if (!modalElement || typeof modalElement.querySelectorAll !== 'function') return [];
    return Array.from(modalElement.querySelectorAll(focusableSelector)).filter((el) => {
      if (typeof window !== 'undefined' && window.getComputedStyle) {
        try {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return false;
        } catch {
          // In test environments where getComputedStyle may fail on mock elements
        }
      }
      return (
        el.offsetParent !== null ||
        (typeof document !== 'undefined' && el === document.activeElement) ||
        el.tabIndex >= 0
      );
    });
  }

  function handleKeyDown(e) {
    if (!active) return;

    if (e.key === 'Escape') {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof onEscape === 'function') {
        onEscape();
      }
      return;
    }

    if (e.key === 'Tab') {
      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        return;
      }

      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      const activeEl = typeof document !== 'undefined' ? document.activeElement : null;

      if (e.shiftKey) {
        if (activeEl === firstEl || (modalElement.contains && !modalElement.contains(activeEl))) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof lastEl.focus === 'function') lastEl.focus();
        }
      } else {
        if (activeEl === lastEl || (modalElement.contains && !modalElement.contains(activeEl))) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          if (typeof firstEl.focus === 'function') firstEl.focus();
        }
      }
    }
  }

  function activate() {
    active = true;
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('keydown', handleKeyDown, true);
    }

    const focusable = getFocusableElements();
    if (initialFocusEl && typeof initialFocusEl.focus === 'function') {
      initialFocusEl.focus();
    } else if (focusable.length > 0 && typeof focusable[0].focus === 'function') {
      focusable[0].focus();
    } else if (modalElement && typeof modalElement.focus === 'function') {
      if (!modalElement.hasAttribute('tabindex')) {
        modalElement.setAttribute('tabindex', '-1');
      }
      modalElement.focus();
    }
  }

  function deactivate() {
    if (!active) return;
    active = false;
    if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
      document.removeEventListener('keydown', handleKeyDown, true);
    }

    if (returnFocusEl && typeof returnFocusEl.focus === 'function') {
      try {
        returnFocusEl.focus();
      } catch {
        // Element may no longer be attached to DOM
      }
    }
  }

  return {
    activate,
    deactivate,
    getFocusableElements,
    handleKeyDown,
    isActive: () => active,
  };
}

// Attach to window for global access across vanilla ES6 modules
if (typeof window !== 'undefined') {
  window.ModalHelper = { createFocusTrap };
}
