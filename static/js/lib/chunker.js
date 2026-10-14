/**
 * Sentiment Pulse - Pure Batch Chunking Helper (chunker.js)
 * Splits an array of items into bounded chunks of at most 50 items for batch prediction.
 */

/**
 * Split an array of items into chunks of at most maxChunkSize (capped at 50).
 * @template T
 * @param {T[]} items - Array of items to partition.
 * @param {number} [maxChunkSize=50] - Maximum elements per chunk (clamped to 1..50).
 * @returns {T[][]} An array of chunks, each containing at most maxChunkSize items.
 */
export function chunkArray(items, maxChunkSize = 50) {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return [];
  }

  // Enforce batch boundary: at least 1, at most 50 per ONNX API requirements
  const numSize = typeof maxChunkSize === 'number' ? maxChunkSize : Number(maxChunkSize);
  const validSize = Number.isFinite(numSize) ? numSize : 50;
  const clampedSize = Math.max(1, Math.min(50, validSize));

  const chunks = [];
  for (let i = 0; i < items.length; i += clampedSize) {
    chunks.push(items.slice(i, i + clampedSize));
  }

  return chunks;
}

// Attach to window for browser script compatibility
if (typeof window !== 'undefined') {
  window.Chunker = {
    chunkArray,
  };
}
