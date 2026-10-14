import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPercent,
  formatDate,
  formatISODate,
  truncateSnippet,
} from '../../static/js/lib/formatters.js';

describe('formatPercent', () => {
  test('formats ratio decimals to percentage by default', () => {
    assert.equal(formatPercent(0.8524), '85.2%');
    assert.equal(formatPercent(0.999), '99.9%');
    assert.equal(formatPercent(0), '0.0%');
    assert.equal(formatPercent(1), '100.0%');
  });

  test('formats with custom decimal precision', () => {
    assert.equal(formatPercent(0.8524, 2), '85.24%');
    assert.equal(formatPercent(0.8524, 0), '85%');
  });

  test('formats non-ratio numbers when isRatio is false', () => {
    assert.equal(formatPercent(85.2, 1, false), '85.2%');
    assert.equal(formatPercent(100, 0, false), '100%');
  });

  test('handles options object input', () => {
    assert.equal(formatPercent(0.423, { decimals: 2 }), '42.30%');
    assert.equal(formatPercent(42.3, { isRatio: false, decimals: 1 }), '42.3%');
    assert.equal(formatPercent(null, { fallback: 'N/A' }), 'N/A');
  });

  test('handles invalid, empty, or null inputs gracefully', () => {
    assert.equal(formatPercent(null), '0.0%');
    assert.equal(formatPercent(undefined), '0.0%');
    assert.equal(formatPercent(''), '0.0%');
    assert.equal(formatPercent('not-a-number'), '0.0%');
  });
});

describe('formatDate', () => {
  test('formats valid date strings and Date objects', () => {
    const d = new Date(2026, 9, 15);
    const formatted = formatDate(d);
    assert.ok(typeof formatted === 'string' && formatted.length > 0);
  });

  test('returns fallback for null, undefined, and invalid dates', () => {
    assert.equal(formatDate(null), '—');
    assert.equal(formatDate(undefined), '—');
    assert.equal(formatDate('invalid-date'), '—');
    assert.equal(formatDate(null, 'N/A'), 'N/A');
  });

  test('supports options object with fallback and includeTime', () => {
    const d = new Date(2026, 9, 15, 14, 30);
    const withTime = formatDate(d, { includeTime: true });
    assert.ok(withTime.includes(':'));

    const withCustomFallback = formatDate('bad', { fallback: 'Unknown Date' });
    assert.equal(withCustomFallback, 'Unknown Date');
  });
});

describe('formatISODate', () => {
  test('returns YYYY-MM-DD format for valid dates', () => {
    const d = new Date('2026-10-15T12:00:00Z');
    assert.equal(formatISODate(d), '2026-10-15');
    assert.equal(formatISODate('2026-05-01T08:00:00Z'), '2026-05-01');
  });

  test('returns fallback for invalid or empty dates', () => {
    assert.equal(formatISODate(null), '');
    assert.equal(formatISODate(undefined, '—'), '—');
    assert.equal(formatISODate('invalid'), '');
  });
});

describe('truncateSnippet', () => {
  test('returns empty string for null or undefined', () => {
    assert.equal(truncateSnippet(null), '');
    assert.equal(truncateSnippet(undefined), '');
  });

  test('returns short text unchanged', () => {
    const text = 'Quick brown fox';
    assert.equal(truncateSnippet(text, 50), text);
  });

  test('truncates strings longer than maxLength with default ellipsis', () => {
    const text = '12345678901234567890';
    assert.equal(truncateSnippet(text, 10), '1234567890…');
  });

  test('supports custom suffix', () => {
    const text = 'Hello world from Sentiment Pulse';
    assert.equal(truncateSnippet(text, 11, ' [more]'), 'Hello world [more]');
  });

  test('supports wordBoundary option in options object', () => {
    const text = 'The quick brown fox jumps';
    const truncated = truncateSnippet(text, { maxLength: 15, wordBoundary: true });
    assert.equal(truncated, 'The quick…');
  });

  test('handles zero or negative maxLength', () => {
    assert.equal(truncateSnippet('Any text', 0), '');
    assert.equal(truncateSnippet('Any text', -5), '');
  });
});
