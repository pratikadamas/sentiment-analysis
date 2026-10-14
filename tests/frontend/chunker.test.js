import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chunkArray } from '../../static/js/lib/chunker.js';

describe('chunkArray', () => {
  test('returns empty array when input is null, undefined, or empty', () => {
    assert.deepEqual(chunkArray(null), []);
    assert.deepEqual(chunkArray(undefined), []);
    assert.deepEqual(chunkArray([]), []);
    assert.deepEqual(chunkArray('not-an-array'), []);
  });

  test('chunks array with default chunk size of 50', () => {
    const items = Array.from({ length: 120 }, (_, i) => `item-${i + 1}`);
    const chunks = chunkArray(items);

    assert.equal(chunks.length, 3);
    assert.equal(chunks[0].length, 50);
    assert.equal(chunks[1].length, 50);
    assert.equal(chunks[2].length, 20);
    assert.equal(chunks[0][0], 'item-1');
    assert.equal(chunks[2][19], 'item-120');
  });

  test('chunks array with custom chunk size', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];
    const chunks = chunkArray(items, 3);

    assert.equal(chunks.length, 3);
    assert.deepEqual(chunks[0], [1, 2, 3]);
    assert.deepEqual(chunks[1], [4, 5, 6]);
    assert.deepEqual(chunks[2], [7]);
  });

  test('caps chunk size at 50 even if user requests more', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const chunks = chunkArray(items, 100);

    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].length, 50);
    assert.equal(chunks[1].length, 50);
  });

  test('handles chunk size <= 0 by clamping to 1', () => {
    const items = [1, 2, 3];
    const chunks = chunkArray(items, 0);

    assert.equal(chunks.length, 3);
    assert.deepEqual(chunks, [[1], [2], [3]]);
  });

  test('handles exact multiple of chunk size', () => {
    const items = Array.from({ length: 100 }, (_, i) => i);
    const chunks = chunkArray(items, 50);

    assert.equal(chunks.length, 2);
    assert.equal(chunks[0].length, 50);
    assert.equal(chunks[1].length, 50);
  });
});
