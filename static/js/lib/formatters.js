/**
 * Sentiment Pulse - Pure Formatting Helpers (formatters.js)
 * Utilities for formatting percentages, dates, and text snippets across the application.
 */

/**
 * Format a numeric value as a percentage string.
 * @param {number|string|null|undefined} value - Numeric value or ratio to format.
 * @param {number|Object} [optionsOrDecimals=1] - Decimal places or options object.
 * @param {boolean} [isRatio=true] - If true, multiplies value by 100 (e.g. 0.852 -> 85.2%).
 * @returns {string} Formatted percentage string (e.g. "85.2%").
 */
export function formatPercent(value, optionsOrDecimals = 1, isRatio = true) {
  let decimals = 1;
  let ratio = isRatio;
  let fallback = '0.0%';

  if (typeof optionsOrDecimals === 'object' && optionsOrDecimals !== null) {
    decimals = optionsOrDecimals.decimals !== undefined ? optionsOrDecimals.decimals : 1;
    ratio = optionsOrDecimals.isRatio !== undefined ? optionsOrDecimals.isRatio : true;
    if (optionsOrDecimals.fallback !== undefined) {
      fallback = optionsOrDecimals.fallback;
    }
  } else if (typeof optionsOrDecimals === 'number') {
    decimals = optionsOrDecimals;
  }

  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const num = Number(value);
  if (Number.isNaN(num)) {
    return fallback;
  }

  const percentVal = ratio ? num * 100 : num;
  return `${percentVal.toFixed(decimals)}%`;
}

/**
 * Format a date input into a localized date string.
 * @param {string|number|Date|null|undefined} dateInput - Date to format.
 * @param {string|Object} [fallbackOrOptions='—'] - Fallback string or options object.
 * @returns {string} Formatted date string or fallback.
 */
export function formatDate(dateInput, fallbackOrOptions = '—') {
  let fallback = '—';
  let includeTime = false;
  let locale;

  if (typeof fallbackOrOptions === 'object' && fallbackOrOptions !== null) {
    fallback = fallbackOrOptions.fallback !== undefined ? fallbackOrOptions.fallback : '—';
    includeTime = Boolean(fallbackOrOptions.includeTime);
    locale = fallbackOrOptions.locale;
  } else if (typeof fallbackOrOptions === 'string') {
    fallback = fallbackOrOptions;
  }

  if (!dateInput) {
    return fallback;
  }

  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return fallback;
  }

  if (includeTime) {
    return `${date.toLocaleDateString(locale)} ${date.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }

  return date.toLocaleDateString(locale);
}

/**
 * Format a date into ISO YYYY-MM-DD string.
 * @param {string|number|Date|null|undefined} dateInput - Date to format.
 * @param {string} [fallback=''] - Fallback if invalid.
 * @returns {string} ISO date string (e.g. "2026-10-15").
 */
export function formatISODate(dateInput, fallback = '') {
  if (!dateInput) return fallback;
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toISOString().slice(0, 10);
}

/**
 * Truncate a text string to a maximum length with an ellipsis.
 * @param {string|null|undefined} text - Text to truncate.
 * @param {number|Object} [maxLengthOrOptions=100] - Max length or options object.
 * @param {string} [suffix='…'] - Appended suffix when truncated.
 * @returns {string} Truncated string.
 */
export function truncateSnippet(text, maxLengthOrOptions = 100, suffix = '…') {
  if (text === null || text === undefined) {
    return '';
  }

  const str = String(text).trim();
  let maxLength = 100;
  let suf = suffix;
  let wordBoundary = false;

  if (typeof maxLengthOrOptions === 'object' && maxLengthOrOptions !== null) {
    maxLength = maxLengthOrOptions.maxLength !== undefined ? maxLengthOrOptions.maxLength : 100;
    suf = maxLengthOrOptions.suffix !== undefined ? maxLengthOrOptions.suffix : '…';
    wordBoundary = Boolean(maxLengthOrOptions.wordBoundary);
  } else if (typeof maxLengthOrOptions === 'number') {
    maxLength = maxLengthOrOptions;
  }

  if (maxLength <= 0) {
    return '';
  }

  if (str.length <= maxLength) {
    return str;
  }

  if (wordBoundary) {
    const sub = str.slice(0, maxLength);
    const lastSpace = sub.lastIndexOf(' ');
    if (lastSpace > 0) {
      return `${sub.slice(0, lastSpace)}${suf}`;
    }
  }

  return `${str.slice(0, maxLength)}${suf}`;
}

// Attach to window for non-module script tag compatibility in browser
if (typeof window !== 'undefined') {
  window.Formatters = {
    formatPercent,
    formatDate,
    formatISODate,
    truncateSnippet,
  };
}
