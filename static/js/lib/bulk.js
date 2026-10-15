/**
 * Sentiment Pulse - Pure Bulk Analysis Helpers (bulk.js)
 * Utilities for parsing multiline feedback, validating 1-100 row constraints,
 * formatting progress, client-side RFC 4180 CSV serialization, and Web Share.
 */

/**
 * Parse multiline raw text into structured non-empty rows with original line numbers.
 * @param {string} rawText - Multiline pasted string.
 * @returns {Array<{ rowNumber: number, text: string }>} Parsed rows.
 */
export function parseBulkInput(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return [];
  }

  const lines = rawText.split(/\r?\n/);
  const rows = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.length > 0) {
      rows.push({
        rowNumber: i + 1,
        text: trimmed,
      });
    }
  }

  return rows;
}

/**
 * Validate parsed bulk rows against 1-100 row count and 1-2000 character length constraints.
 * @param {Array<{ rowNumber: number, text: string }>} rows - Rows from parseBulkInput.
 * @param {number} [maxRows=100] - Maximum allowed rows.
 * @param {number} [minChars=1] - Minimum characters per row.
 * @param {number} [maxChars=2000] - Maximum characters per row.
 * @returns {{ valid: boolean, errors: Array<{ rowNumber?: number, length?: number, message: string }>, summary: string }}
 */
export function validateBulkRows(rows, maxRows = 100, minChars = 1, maxChars = 2000) {
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return {
      valid: false,
      errors: [{ message: 'Please enter at least one non-empty customer feedback line.' }],
      summary: 'No valid feedback lines detected.',
    };
  }

  const errors = [];

  if (rows.length > maxRows) {
    errors.push({
      message: `Maximum ${maxRows} rows allowed. You provided ${rows.length} rows (${rows.length - maxRows} excess rows).`,
    });
  }

  for (const row of rows) {
    const len = row.text ? row.text.length : 0;
    if (len < minChars) {
      errors.push({
        rowNumber: row.rowNumber,
        length: len,
        message: `Line ${row.rowNumber} is too short (${len} chars). Minimum is ${minChars} character.`,
      });
    } else if (len > maxChars) {
      errors.push({
        rowNumber: row.rowNumber,
        length: len,
        message: `Line ${row.rowNumber} exceeds maximum length of ${maxChars.toLocaleString()} characters (currently ${len.toLocaleString()} chars).`,
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    summary:
      errors.length === 0
        ? `Ready to analyze ${rows.length} row${rows.length === 1 ? '' : 's'}.`
        : `Found ${errors.length} validation issue${errors.length === 1 ? '' : 's'}.`,
  };
}

/**
 * Calculate progress percentage and human-readable status labels.
 * @param {number} completed - Number of items completed so far.
 * @param {number} total - Total items to process.
 * @param {number} currentBatch - Current active batch index (1-based).
 * @param {number} totalBatches - Total batches.
 * @returns {{ percent: number, label: string, batchLabel: string }}
 */
export function formatBulkProgress(completed, total, currentBatch = 1, totalBatches = 1) {
  const safeTotal = total > 0 ? total : 1;
  const safeCompleted = Math.min(Math.max(0, completed), safeTotal);
  const percent = Math.round((safeCompleted / safeTotal) * 100);

  return {
    percent,
    label: `${safeCompleted}/${safeTotal} analyzed`,
    batchLabel: `Batch ${currentBatch} of ${totalBatches}`,
  };
}

/**
 * Escape a single CSV cell value according to RFC 4180 standards.
 * @param {any} value - Cell value to escape.
 * @returns {string} Safely escaped cell value.
 */
export function escapeCSVCell(value) {
  if (value === null || value === undefined) {
    return '';
  }
  const str = String(value);
  // If string contains comma, quote, or newline, escape quotes and wrap in quotes
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Serialize bulk analysis results to RFC 4180 compliant CSV string.
 * @param {Array<Object>} results - Array of analyzed row results.
 * @returns {string} Serialized CSV text.
 */
export function generateBulkCSV(results) {
  if (!results || !Array.isArray(results) || results.length === 0) {
    return 'row,text,sentiment,confidence,positive_score,neutral_score,negative_score\r\n';
  }

  const headers = [
    'row',
    'text',
    'sentiment',
    'confidence',
    'positive_score',
    'neutral_score',
    'negative_score',
  ];

  const rows = results.map((item, idx) => {
    const rowNum = item.rowNumber || idx + 1;
    const text = item.text || '';
    const sentiment = item.sentiment || (item.error ? 'error' : 'unknown');
    const confidence =
      typeof item.confidence === 'number' ? (item.confidence * 100).toFixed(1) + '%' : '';
    const scores = item.scores || {};
    const pos = typeof scores.positive === 'number' ? scores.positive.toFixed(4) : '';
    const neu = typeof scores.neutral === 'number' ? scores.neutral.toFixed(4) : '';
    const neg = typeof scores.negative === 'number' ? scores.negative.toFixed(4) : '';

    return [
      escapeCSVCell(rowNum),
      escapeCSVCell(text),
      escapeCSVCell(sentiment),
      escapeCSVCell(confidence),
      escapeCSVCell(pos),
      escapeCSVCell(neu),
      escapeCSVCell(neg),
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n') + '\r\n';
}

/**
 * Format a human-readable text summary of a single analysis result for sharing.
 * @param {Object} data - Analysis result data.
 * @returns {string} Formatted share text.
 */
export function formatShareText(data) {
  if (!data || typeof data !== 'object') {
    return 'Sentiment Pulse Analysis';
  }
  const sentiment = (data.sentiment || 'unknown').toUpperCase();
  const conf =
    typeof data.confidence === 'number' ? `${(data.confidence * 100).toFixed(1)}%` : 'N/A';
  const text = data.text ? `\n\n"${data.text}"` : '';

  return `Sentiment Pulse Analysis\nResult: ${sentiment} (${conf} confidence)${text}`;
}

// Attach to window for browser script compatibility
if (typeof window !== 'undefined') {
  window.BulkHelper = {
    parseBulkInput,
    validateBulkRows,
    formatBulkProgress,
    escapeCSVCell,
    generateBulkCSV,
    formatShareText,
  };
}
