import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBulkInput,
  validateBulkRows,
  formatBulkProgress,
  escapeCSVCell,
  generateBulkCSV,
  formatShareText,
} from '../../static/js/lib/bulk.js';
import { chunkArray } from '../../static/js/lib/chunker.js';

describe('Bulk Analysis Helpers (bulk.js)', () => {
  describe('parseBulkInput', () => {
    it('returns empty array for empty, whitespace, or invalid inputs', () => {
      assert.deepEqual(parseBulkInput(''), []);
      assert.deepEqual(parseBulkInput('   \n  \n\t  '), []);
      assert.deepEqual(parseBulkInput(null), []);
      assert.deepEqual(parseBulkInput(undefined), []);
    });

    it('splits multiline text and preserves 1-based line numbers while skipping blank lines', () => {
      const input = 'First valid review\n\nSecond valid review\r\n\r\nThird valid review';
      const rows = parseBulkInput(input);

      assert.equal(rows.length, 3);
      assert.deepEqual(rows[0], { rowNumber: 1, text: 'First valid review' });
      assert.deepEqual(rows[1], { rowNumber: 3, text: 'Second valid review' });
      assert.deepEqual(rows[2], { rowNumber: 5, text: 'Third valid review' });
    });

    it('trims leading and trailing whitespace from lines', () => {
      const input = '   Spaced review content   \n\tAnother review\t';
      const rows = parseBulkInput(input);

      assert.equal(rows.length, 2);
      assert.equal(rows[0].text, 'Spaced review content');
      assert.equal(rows[1].text, 'Another review');
    });
  });

  describe('validateBulkRows', () => {
    it('fails when rows array is empty', () => {
      const res = validateBulkRows([]);
      assert.equal(res.valid, false);
      assert.equal(res.errors.length, 1);
      assert.match(res.errors[0].message, /at least one/i);
    });

    it('passes for 1 to 100 valid rows within 1-2000 character limits', () => {
      const rows = [
        { rowNumber: 1, text: 'Great service and quick delivery!' },
        { rowNumber: 2, text: 'Standard product, met expectations.' },
      ];
      const res = validateBulkRows(rows);
      assert.equal(res.valid, true);
      assert.equal(res.errors.length, 0);
      assert.match(res.summary, /Ready to analyze 2 rows/i);
    });

    it('enforces maximum 100 analysis rows constraint', () => {
      const rows = Array.from({ length: 101 }, (_, i) => ({
        rowNumber: i + 1,
        text: `Customer review line number ${i + 1}`,
      }));

      const res = validateBulkRows(rows, 100);
      assert.equal(res.valid, false);
      assert.match(res.errors[0].message, /Maximum 100 rows allowed/i);
      assert.match(res.errors[0].message, /1 excess row/i);
    });

    it('detects rows exceeding 2,000 characters and reports line numbers and lengths', () => {
      const longText = 'A'.repeat(2005);
      const rows = [
        { rowNumber: 1, text: 'Valid short row' },
        { rowNumber: 2, text: longText },
        { rowNumber: 3, text: 'Another valid row' },
      ];

      const res = validateBulkRows(rows, 100, 1, 2000);
      assert.equal(res.valid, false);
      assert.equal(res.errors.length, 1);
      assert.equal(res.errors[0].rowNumber, 2);
      assert.equal(res.errors[0].length, 2005);
      assert.match(res.errors[0].message, /Line 2 exceeds maximum length/i);
    });
  });

  describe('Batch Chunking Constraints for /predict/batch', () => {
    it('splits exactly 100 rows into 2 chunks of 50 each (maximum allowed by API)', () => {
      const rows = Array.from({ length: 100 }, (_, i) => ({ text: `Review ${i + 1}` }));
      const chunks = chunkArray(rows, 50);

      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].length, 50);
      assert.equal(chunks[1].length, 50);
    });

    it('splits fewer than 50 rows into a single chunk', () => {
      const rows = Array.from({ length: 42 }, (_, i) => ({ text: `Review ${i + 1}` }));
      const chunks = chunkArray(rows, 50);

      assert.equal(chunks.length, 1);
      assert.equal(chunks[0].length, 42);
    });

    it('splits 75 rows into chunks of 50 and 25', () => {
      const rows = Array.from({ length: 75 }, (_, i) => ({ text: `Review ${i + 1}` }));
      const chunks = chunkArray(rows, 50);

      assert.equal(chunks.length, 2);
      assert.equal(chunks[0].length, 50);
      assert.equal(chunks[1].length, 25);
    });
  });

  describe('formatBulkProgress', () => {
    it('calculates percentage and generates formatted progress labels', () => {
      const p1 = formatBulkProgress(42, 100, 1, 2);
      assert.equal(p1.percent, 42);
      assert.equal(p1.label, '42/100 analyzed');
      assert.equal(p1.batchLabel, 'Batch 1 of 2');

      const p2 = formatBulkProgress(100, 100, 2, 2);
      assert.equal(p2.percent, 100);
      assert.equal(p2.label, '100/100 analyzed');
      assert.equal(p2.batchLabel, 'Batch 2 of 2');
    });

    it('safely handles zero total items and clamps completed bounds', () => {
      const p = formatBulkProgress(0, 0);
      assert.equal(p.percent, 0);
      assert.equal(p.label, '0/1 analyzed');
    });
  });

  describe('CSV Escaping and Serialization', () => {
    it('escapes cells containing commas, double quotes, and newlines per RFC 4180', () => {
      assert.equal(escapeCSVCell('normal text'), 'normal text');
      assert.equal(escapeCSVCell('text, with comma'), '"text, with comma"');
      assert.equal(escapeCSVCell('text with "quotes"'), '"text with ""quotes"""');
      assert.equal(escapeCSVCell('multiline\ntext'), '"multiline\ntext"');
      assert.equal(escapeCSVCell(null), '');
      assert.equal(escapeCSVCell(undefined), '');
    });

    it('generates well-formed CSV with headers matching export conventions', () => {
      const results = [
        {
          rowNumber: 1,
          text: 'Great "support", fast & friendly!',
          sentiment: 'positive',
          confidence: 0.954,
          scores: { positive: 0.954, neutral: 0.03, negative: 0.016 },
        },
        {
          rowNumber: 2,
          text: 'Package was late.',
          sentiment: 'negative',
          confidence: 0.88,
          scores: { positive: 0.02, neutral: 0.1, negative: 0.88 },
        },
      ];

      const csv = generateBulkCSV(results);
      assert.match(
        csv,
        /^row,text,sentiment,confidence,positive_score,neutral_score,negative_score\r\n/
      );
      assert.match(
        csv,
        /1,"Great ""support"", fast & friendly!",positive,95.4%,0.9540,0.0300,0.0160/
      );
      assert.match(csv, /2,Package was late.,negative,88.0%,0.0200,0.1000,0.8800/);
    });

    it('handles row error entries gracefully in CSV output', () => {
      const results = [
        {
          rowNumber: 1,
          text: 'Problematic row text',
          error: 'Row analysis timed out',
        },
      ];

      const csv = generateBulkCSV(results);
      assert.match(csv, /1,Problematic row text,error,/);
    });
  });

  describe('formatShareText', () => {
    it('formats readable share text with sentiment, confidence, and quote', () => {
      const text = formatShareText({
        sentiment: 'positive',
        confidence: 0.923,
        text: 'The support agent resolved my ticket in minutes!',
      });

      assert.match(text, /Sentiment Pulse Analysis/);
      assert.match(text, /Result: POSITIVE \(92.3% confidence\)/);
      assert.match(text, /"The support agent resolved my ticket in minutes!"/);
    });

    it('handles empty or missing data safely', () => {
      assert.equal(formatShareText(null), 'Sentiment Pulse Analysis');
      assert.match(formatShareText({}), /Result: UNKNOWN \(N\/A confidence\)/);
    });
  });
});
