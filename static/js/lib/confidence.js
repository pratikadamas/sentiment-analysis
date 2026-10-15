/**
 * Sentiment Pulse - Confidence Distribution Helpers (confidence.js)
 * Pure utilities for classifying confidence values into strict buckets,
 * client-side date/sentiment aggregation, and cache-key management.
 */

export const CONFIDENCE_BUCKET_LABELS = ['0–50%', '50–70%', '70–90%', '90–100%'];

/**
 * Classify a raw confidence score into one of four deterministic buckets:
 * - 0–50%:  [0, 50)
 * - 50–70%: [50, 70)
 * - 70–90%: [70, 90)
 * - 90–100%: [90, 100]
 *
 * @param {number|string|null|undefined} rawConfidence - Confidence value (0.0–1.0 or 0–100).
 * @returns {string|null} The matching bucket label or null if invalid/unusable.
 */
export function getConfidenceBucket(rawConfidence) {
  if (rawConfidence === null || rawConfidence === undefined || rawConfidence === '') {
    return null;
  }

  let val = rawConfidence;
  if (typeof val === 'string') {
    val = val.trim();
    if (val.endsWith('%')) {
      val = val.slice(0, -1).trim();
    }
  }

  const num = Number(val);
  if (Number.isNaN(num) || !Number.isFinite(num) || num < 0) {
    return null;
  }

  // Normalize ratio (0.0–1.0) to percentage (0–100)
  const pct = num <= 1.0 ? num * 100 : num;

  if (pct > 100) {
    return null; // Malformed value exceeding 100%
  }

  if (pct >= 0 && pct < 50) {
    return '0–50%';
  }
  if (pct >= 50 && pct < 70) {
    return '50–70%';
  }
  if (pct >= 70 && pct < 90) {
    return '70–90%';
  }
  if (pct >= 90 && pct <= 100) {
    return '90–100%';
  }

  return null;
}

/**
 * Aggregate a collection of feedback records into confidence distribution buckets
 * with client-side date and sentiment filtering safeguards.
 *
 * @param {Array<Object>} items - Array of feedback records.
 * @param {Object} [options={}] - Filtering options.
 * @param {string|Date} [options.startDate] - Earliest permitted created_at timestamp.
 * @param {string} [options.sentiment] - Filter by sentiment ('positive', 'neutral', 'negative', 'all').
 * @returns {{ buckets: Object<string, number>, counts: number[], totalValid: number, totalSkipped: number, hasData: boolean }}
 */
export function aggregateConfidence(items, options = {}) {
  const { startDate, sentiment } = options;

  const buckets = {
    '0–50%': 0,
    '50–70%': 0,
    '70–90%': 0,
    '90–100%': 0,
  };

  let totalValid = 0;
  let totalSkipped = 0;

  if (!items || !Array.isArray(items) || items.length === 0) {
    return {
      buckets,
      counts: [0, 0, 0, 0],
      totalValid: 0,
      totalSkipped: 0,
      hasData: false,
    };
  }

  const minTime = startDate ? new Date(startDate).getTime() : null;
  const targetSentiment = sentiment && sentiment !== 'all' ? sentiment.toLowerCase() : null;

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      totalSkipped++;
      continue;
    }

    // Client-side sentiment filter
    if (targetSentiment && item.sentiment && item.sentiment.toLowerCase() !== targetSentiment) {
      continue;
    }

    // Client-side date filter
    if (minTime !== null && item.created_at) {
      const itemTime = new Date(item.created_at).getTime();
      if (!Number.isNaN(itemTime) && itemTime < minTime) {
        continue;
      }
    }

    // Confidence bucket resolution
    const bucket = getConfidenceBucket(item.confidence);
    if (bucket && Object.prototype.hasOwnProperty.call(buckets, bucket)) {
      buckets[bucket]++;
      totalValid++;
    } else {
      totalSkipped++;
    }
  }

  const counts = CONFIDENCE_BUCKET_LABELS.map((label) => buckets[label]);
  const hasData = totalValid > 0;

  return {
    buckets,
    counts,
    totalValid,
    totalSkipped,
    hasData,
  };
}

/**
 * Generate a deterministic cache key for confidence aggregations.
 *
 * @param {string} [dateRange='all'] - Date range ('all', '30d', '7d').
 * @param {string} [sentiment='all'] - Selected sentiment filter.
 * @returns {string} Unique cache key.
 */
export function getConfidenceCacheKey(dateRange = 'all', sentiment = 'all') {
  const r = String(dateRange || 'all').toLowerCase();
  const s = String(sentiment || 'all').toLowerCase();
  return `${r}_${s}`;
}

// Attach to window for browser script compatibility
if (typeof window !== 'undefined') {
  window.ConfidenceHelper = {
    CONFIDENCE_BUCKET_LABELS,
    getConfidenceBucket,
    aggregateConfidence,
    getConfidenceCacheKey,
  };
}
