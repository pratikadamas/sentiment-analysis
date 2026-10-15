import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONFIDENCE_BUCKET_LABELS,
  getConfidenceBucket,
  aggregateConfidence,
  getConfidenceCacheKey,
} from '../../static/js/lib/confidence.js';

describe('CONFIDENCE_BUCKET_LABELS', () => {
  test('contains exactly the 4 required buckets in order', () => {
    assert.deepEqual(CONFIDENCE_BUCKET_LABELS, ['0–50%', '50–70%', '70–90%', '90–100%']);
  });
});

describe('getConfidenceBucket - Boundary and Value Classification', () => {
  test('places standard ratio values into correct buckets', () => {
    assert.equal(getConfidenceBucket(0.25), '0–50%');
    assert.equal(getConfidenceBucket(0.6), '50–70%');
    assert.equal(getConfidenceBucket(0.85), '70–90%');
    assert.equal(getConfidenceBucket(0.95), '90–100%');
  });

  test('places percentage values (0-100) into correct buckets', () => {
    assert.equal(getConfidenceBucket(25), '0–50%');
    assert.equal(getConfidenceBucket(60), '50–70%');
    assert.equal(getConfidenceBucket(85), '70–90%');
    assert.equal(getConfidenceBucket(95), '90–100%');
  });

  test('handles exact boundary values deterministically', () => {
    // 0 is placed in 0–50%
    assert.equal(getConfidenceBucket(0), '0–50%');
    assert.equal(getConfidenceBucket(0.0), '0–50%');

    // 50 is boundary between 0–50% and 50–70% -> [50, 70) => '50–70%'
    assert.equal(getConfidenceBucket(0.5), '50–70%');
    assert.equal(getConfidenceBucket(50), '50–70%');
    assert.equal(getConfidenceBucket(49.999), '0–50%');
    assert.equal(getConfidenceBucket(0.49999), '0–50%');

    // 70 is boundary between 50–70% and 70–90% -> [70, 90) => '70–90%'
    assert.equal(getConfidenceBucket(0.7), '70–90%');
    assert.equal(getConfidenceBucket(70), '70–90%');
    assert.equal(getConfidenceBucket(69.999), '50–70%');
    assert.equal(getConfidenceBucket(0.69999), '50–70%');

    // 90 is boundary between 70–90% and 90–100% -> [90, 100] => '90–100%'
    assert.equal(getConfidenceBucket(0.9), '90–100%');
    assert.equal(getConfidenceBucket(90), '90–100%');
    assert.equal(getConfidenceBucket(89.999), '70–90%');
    assert.equal(getConfidenceBucket(0.89999), '70–90%');

    // 100 is the upper boundary of 90–100% -> [90, 100] => '90–100%'
    assert.equal(getConfidenceBucket(1.0), '90–100%');
    assert.equal(getConfidenceBucket(100), '90–100%');
  });

  test('handles string numeric values and percentage sign gracefully', () => {
    assert.equal(getConfidenceBucket('0.85'), '70–90%');
    assert.equal(getConfidenceBucket('85%'), '70–90%');
    assert.equal(getConfidenceBucket(' 95 % '), '90–100%');
    assert.equal(getConfidenceBucket('50'), '50–70%');
    assert.equal(getConfidenceBucket('0'), '0–50%');
    assert.equal(getConfidenceBucket('100%'), '90–100%');
  });

  test('handles null, undefined, and empty string confidence gracefully', () => {
    assert.equal(getConfidenceBucket(null), null);
    assert.equal(getConfidenceBucket(undefined), null);
    assert.equal(getConfidenceBucket(''), null);
  });

  test('handles malformed, invalid, and out-of-range confidence values', () => {
    assert.equal(getConfidenceBucket('not-a-number'), null);
    assert.equal(getConfidenceBucket(NaN), null);
    assert.equal(getConfidenceBucket(Infinity), null);
    assert.equal(getConfidenceBucket(-Infinity), null);
    assert.equal(getConfidenceBucket(-0.1), null);
    assert.equal(getConfidenceBucket(-10), null);
    assert.equal(getConfidenceBucket(100.01), null);
    assert.equal(getConfidenceBucket(150), null);
  });
});

describe('aggregateConfidence - Record Aggregation', () => {
  test('returns empty bucket counts and hasData=false for empty or invalid datasets', () => {
    const emptyResult = aggregateConfidence([]);
    assert.deepEqual(emptyResult.counts, [0, 0, 0, 0]);
    assert.equal(emptyResult.totalValid, 0);
    assert.equal(emptyResult.hasData, false);

    const nullResult = aggregateConfidence(null);
    assert.deepEqual(nullResult.counts, [0, 0, 0, 0]);
    assert.equal(nullResult.hasData, false);

    const nonArrayResult = aggregateConfidence('not-an-array');
    assert.deepEqual(nonArrayResult.counts, [0, 0, 0, 0]);
    assert.equal(nonArrayResult.hasData, false);
  });

  test('aggregates multiple records across all four buckets', () => {
    const records = [
      { id: 1, confidence: 0.35, sentiment: 'negative' }, // 0–50%
      { id: 2, confidence: 0.49, sentiment: 'neutral' }, // 0–50%
      { id: 3, confidence: 0.5, sentiment: 'positive' }, // 50–70%
      { id: 4, confidence: 0.65, sentiment: 'neutral' }, // 50–70%
      { id: 5, confidence: 0.7, sentiment: 'positive' }, // 70–90%
      { id: 6, confidence: 0.88, sentiment: 'positive' }, // 70–90%
      { id: 7, confidence: 0.9, sentiment: 'positive' }, // 90–100%
      { id: 8, confidence: 0.99, sentiment: 'positive' }, // 90–100%
      { id: 9, confidence: 1.0, sentiment: 'positive' }, // 90–100%
    ];

    const result = aggregateConfidence(records);
    assert.equal(result.hasData, true);
    assert.equal(result.totalValid, 9);
    assert.equal(result.totalSkipped, 0);
    assert.deepEqual(result.counts, [2, 2, 2, 3]);
    assert.equal(result.buckets['0–50%'], 2);
    assert.equal(result.buckets['50–70%'], 2);
    assert.equal(result.buckets['70–90%'], 2);
    assert.equal(result.buckets['90–100%'], 3);
  });

  test('gracefully ignores records with missing, null, or malformed confidence', () => {
    const mixedRecords = [
      { id: 1, confidence: 0.85 }, // valid: 70–90%
      { id: 2, confidence: null }, // invalid: null
      { id: 3, confidence: undefined }, // invalid: undefined
      { id: 4 }, // missing field
      { id: 5, confidence: 'bad_val' }, // malformed string
      { id: 6, confidence: -0.5 }, // negative
      { id: 7, confidence: 120 }, // > 100
      null, // null item
      'invalid-object', // string item
      { id: 8, confidence: 0.95 }, // valid: 90–100%
    ];

    const result = aggregateConfidence(mixedRecords);
    assert.equal(result.totalValid, 2);
    assert.equal(result.totalSkipped, 8);
    assert.equal(result.hasData, true);
    assert.deepEqual(result.counts, [0, 0, 1, 1]);
  });

  test('handles dataset where all records have invalid confidence (empty state)', () => {
    const invalidRecords = [
      { id: 1, confidence: null },
      { id: 2, confidence: 'invalid' },
      { id: 3, confidence: -1 },
    ];

    const result = aggregateConfidence(invalidRecords);
    assert.equal(result.totalValid, 0);
    assert.equal(result.totalSkipped, 3);
    assert.equal(result.hasData, false);
    assert.deepEqual(result.counts, [0, 0, 0, 0]);
  });

  test('applies sentiment filtering when specified', () => {
    const records = [
      { id: 1, confidence: 0.95, sentiment: 'positive' },
      { id: 2, confidence: 0.85, sentiment: 'negative' },
      { id: 3, confidence: 0.6, sentiment: 'positive' },
      { id: 4, confidence: 0.4, sentiment: 'neutral' },
    ];

    const positiveResult = aggregateConfidence(records, { sentiment: 'positive' });
    assert.equal(positiveResult.totalValid, 2);
    assert.deepEqual(positiveResult.counts, [0, 1, 0, 1]);

    const negativeResult = aggregateConfidence(records, { sentiment: 'negative' });
    assert.equal(negativeResult.totalValid, 1);
    assert.deepEqual(negativeResult.counts, [0, 0, 1, 0]);

    const allResult = aggregateConfidence(records, { sentiment: 'all' });
    assert.equal(allResult.totalValid, 4);
    assert.deepEqual(allResult.counts, [1, 1, 1, 1]);
  });

  test('applies client-side date filtering when startDate is provided', () => {
    const threeDaysAgo = new Date('2026-10-12T12:00:00Z').toISOString();
    const tenDaysAgo = new Date('2026-10-05T12:00:00Z').toISOString();
    const fortyDaysAgo = new Date('2026-09-05T12:00:00Z').toISOString();

    const records = [
      { id: 1, confidence: 0.95, created_at: threeDaysAgo },
      { id: 2, confidence: 0.85, created_at: tenDaysAgo },
      { id: 3, confidence: 0.6, created_at: fortyDaysAgo },
    ];

    // Filter to last 7 days (earliest: 2026-10-08)
    const sevenDaysAgo = new Date('2026-10-08T12:00:00Z');
    const res7d = aggregateConfidence(records, { startDate: sevenDaysAgo });
    assert.equal(res7d.totalValid, 1);
    assert.deepEqual(res7d.counts, [0, 0, 0, 1]);

    // Filter to last 30 days (earliest: 2026-09-15)
    const thirtyDaysAgo = new Date('2026-09-15T12:00:00Z');
    const res30d = aggregateConfidence(records, { startDate: thirtyDaysAgo });
    assert.equal(res30d.totalValid, 2);
    assert.deepEqual(res30d.counts, [0, 0, 1, 1]);

    // All (no startDate filter)
    const resAll = aggregateConfidence(records);
    assert.equal(resAll.totalValid, 3);
    assert.deepEqual(resAll.counts, [0, 1, 1, 1]);
  });
});

describe('getConfidenceCacheKey - Cache Separation', () => {
  test('separates cache keys across different date ranges', () => {
    const key7d = getConfidenceCacheKey('7d', 'all');
    const key30d = getConfidenceCacheKey('30d', 'all');
    const keyAll = getConfidenceCacheKey('all', 'all');

    assert.notEqual(key7d, key30d);
    assert.notEqual(key7d, keyAll);
    assert.notEqual(key30d, keyAll);
    assert.equal(key7d, '7d_all');
    assert.equal(key30d, '30d_all');
    assert.equal(keyAll, 'all_all');
  });

  test('separates cache keys when sentiment filters differ', () => {
    const keyPos = getConfidenceCacheKey('7d', 'positive');
    const keyNeu = getConfidenceCacheKey('7d', 'neutral');
    const keyNeg = getConfidenceCacheKey('7d', 'negative');
    const keyAll = getConfidenceCacheKey('7d', 'all');

    assert.notEqual(keyPos, keyNeu);
    assert.notEqual(keyPos, keyNeg);
    assert.notEqual(keyPos, keyAll);
    assert.equal(keyPos, '7d_positive');
    assert.equal(keyNeu, '7d_neutral');
    assert.equal(keyNeg, '7d_negative');
  });

  test('handles case insensitivity and defaults', () => {
    assert.equal(getConfidenceCacheKey('7D', 'POSITIVE'), '7d_positive');
    assert.equal(getConfidenceCacheKey(null, null), 'all_all');
    assert.equal(getConfidenceCacheKey(undefined, undefined), 'all_all');
  });
});
