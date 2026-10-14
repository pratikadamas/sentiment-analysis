import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createFocusTrap } from '../../static/js/lib/modal.js';

describe('Modal Focus Trap Helper', () => {
  it('activates and deactivates correctly', () => {
    let returnFocused = false;
    const returnFocusEl = {
      focus: () => {
        returnFocused = true;
      },
    };

    const mockModal = {
      querySelectorAll: () => [],
      focus: () => {},
      hasAttribute: () => false,
      setAttribute: () => {},
    };

    const trap = createFocusTrap(mockModal, { returnFocusEl });
    assert.equal(trap.isActive(), false);

    trap.activate();
    assert.equal(trap.isActive(), true);

    trap.deactivate();
    assert.equal(trap.isActive(), false);
    assert.equal(returnFocused, true);
  });

  it('triggers onEscape handler on Escape keydown', () => {
    let escapeTriggered = false;
    let preventedDefault = false;
    let stoppedPropagation = false;

    const mockModal = {
      querySelectorAll: () => [],
    };

    const trap = createFocusTrap(mockModal, {
      onEscape: () => {
        escapeTriggered = true;
      },
    });

    trap.activate();

    trap.handleKeyDown({
      key: 'Escape',
      preventDefault: () => {
        preventedDefault = true;
      },
      stopPropagation: () => {
        stoppedPropagation = true;
      },
    });

    assert.equal(escapeTriggered, true);
    assert.equal(preventedDefault, true);
    assert.equal(stoppedPropagation, true);
  });

  it('does not trigger onEscape when inactive', () => {
    let escapeTriggered = false;
    const mockModal = {
      querySelectorAll: () => [],
    };

    const trap = createFocusTrap(mockModal, {
      onEscape: () => {
        escapeTriggered = true;
      },
    });

    // Inactive: should ignore keydown
    trap.handleKeyDown({ key: 'Escape' });
    assert.equal(escapeTriggered, false);
  });

  it('wraps Tab forward from last focusable element to first', () => {
    let firstFocused = false;
    let lastFocused = false;
    let preventedDefault = false;

    const el1 = {
      tabIndex: 0,
      focus: () => {
        firstFocused = true;
      },
    };
    const el2 = {
      tabIndex: 0,
      focus: () => {
        lastFocused = true;
      },
    };

    const mockModal = {
      querySelectorAll: () => [el1, el2],
      contains: () => true,
    };

    const trap = createFocusTrap(mockModal);
    trap.activate();

    // Reset flags after activation auto-focus
    firstFocused = false;
    lastFocused = false;

    // Mock document.activeElement as el2 (last element)
    global.document = { activeElement: el2 };

    trap.handleKeyDown({
      key: 'Tab',
      shiftKey: false,
      preventDefault: () => {
        preventedDefault = true;
      },
    });

    assert.equal(firstFocused, true);
    assert.equal(lastFocused, false);
    assert.equal(preventedDefault, true);

    delete global.document;
  });

  it('wraps Shift+Tab backward from first focusable element to last', () => {
    let firstFocused = false;
    let lastFocused = false;
    let preventedDefault = false;

    const el1 = {
      tabIndex: 0,
      focus: () => {
        firstFocused = true;
      },
    };
    const el2 = {
      tabIndex: 0,
      focus: () => {
        lastFocused = true;
      },
    };

    const mockModal = {
      querySelectorAll: () => [el1, el2],
      contains: () => true,
    };

    const trap = createFocusTrap(mockModal);
    trap.activate();

    // Reset flags after activation auto-focus
    firstFocused = false;
    lastFocused = false;

    // Mock document.activeElement as el1 (first element)
    global.document = { activeElement: el1 };

    trap.handleKeyDown({
      key: 'Tab',
      shiftKey: true,
      preventDefault: () => {
        preventedDefault = true;
      },
    });

    assert.equal(lastFocused, true);
    assert.equal(firstFocused, false);
    assert.equal(preventedDefault, true);

    delete global.document;
  });
});
