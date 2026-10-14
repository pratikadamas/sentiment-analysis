import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { HistoryStore, MemoryAdapter } from '../../static/js/lib/store.js';

describe('HistoryStore (Local IndexedDB History)', () => {
  let store;

  beforeEach(() => {
    store = new HistoryStore(new MemoryAdapter(), { maxEntries: 200 });
  });

  it('inserts an entry with required fields and auto-generates snippet and id', async () => {
    const entry = await store.addEntry({
      text: 'The customer service experience was completely exceptional and solved my issue!',
      sentiment: 'positive',
      confidence: 0.985,
      scores: { positive: 0.985, neutral: 0.01, negative: 0.005 },
      source: 'web',
    });

    assert.ok(entry.id);
    assert.equal(typeof entry.id, 'string');
    assert.ok(entry.timestamp);
    assert.equal(entry.sentiment, 'positive');
    assert.equal(entry.confidence, 0.985);
    assert.equal(entry.source, 'web');
    assert.ok(entry.snippet);
    assert.equal(entry.snippet.includes('customer service'), true);

    const fetched = await store.getEntry(entry.id);
    assert.deepEqual(fetched, entry);
    assert.equal(await store.count(), 1);
  });

  it('rejects invalid or empty entry text', async () => {
    await assert.rejects(async () => {
      await store.addEntry(null);
    }, /Invalid analysis entry/);

    await assert.rejects(async () => {
      await store.addEntry({ text: '   ' });
    }, /History entry requires non-empty text/);
  });

  it('enforces maximum 200-entry cap and evicts oldest entries', async () => {
    const smallStore = new HistoryStore(new MemoryAdapter(), { maxEntries: 5 });

    // Add 5 items with distinct timestamps
    for (let i = 1; i <= 5; i++) {
      await smallStore.addEntry({
        id: `entry_${i}`,
        text: `Analysis number ${i}`,
        timestamp: new Date(2026, 0, i).toISOString(),
        sentiment: 'positive',
        confidence: 0.8,
      });
    }

    assert.equal(await smallStore.count(), 5);

    // Adding 6th item should evict entry_1 (the oldest, Jan 1)
    await smallStore.addEntry({
      id: 'entry_6',
      text: 'Analysis number 6',
      timestamp: new Date(2026, 0, 6).toISOString(),
      sentiment: 'positive',
      confidence: 0.9,
    });

    assert.equal(await smallStore.count(), 5);
    const oldest = await smallStore.getEntry('entry_1');
    assert.equal(oldest, null); // Evicted!

    const newest = await smallStore.getEntry('entry_6');
    assert.ok(newest);

    // Adding 7th item should evict entry_2 (Jan 2)
    await smallStore.addEntry({
      id: 'entry_7',
      text: 'Analysis number 7',
      timestamp: new Date(2026, 0, 7).toISOString(),
      sentiment: 'neutral',
      confidence: 0.75,
    });

    assert.equal(await smallStore.count(), 5);
    assert.equal(await smallStore.getEntry('entry_2'), null); // Evicted!
  });

  it('filters by sentiment accurately', async () => {
    await store.addEntry({ text: 'Delightful experience', sentiment: 'positive', confidence: 0.9 });
    await store.addEntry({ text: 'Average experience', sentiment: 'neutral', confidence: 0.6 });
    await store.addEntry({ text: 'Horrible experience', sentiment: 'negative', confidence: 0.95 });

    const positives = await store.getEntries({ sentiment: 'positive' });
    assert.equal(positives.length, 1);
    assert.equal(positives[0].sentiment, 'positive');

    const negatives = await store.getEntries({ sentiment: 'negative' });
    assert.equal(negatives.length, 1);
    assert.equal(negatives[0].sentiment, 'negative');

    const neutrals = await store.getEntries({ sentiment: 'neutral' });
    assert.equal(neutrals.length, 1);
    assert.equal(neutrals[0].sentiment, 'neutral');

    const all = await store.getEntries({ sentiment: 'all' });
    assert.equal(all.length, 3);
  });

  it('searches by keyword against text and snippet', async () => {
    await store.addEntry({
      text: 'Billing was confusing and charged twice',
      sentiment: 'negative',
      confidence: 0.9,
    });
    await store.addEntry({
      text: 'Onboarding setup was super quick',
      sentiment: 'positive',
      confidence: 0.85,
    });

    const billingResults = await store.getEntries({ search: 'billing' });
    assert.equal(billingResults.length, 1);
    assert.equal(billingResults[0].text.includes('Billing'), true);

    const setupResults = await store.getEntries({ search: 'quick' });
    assert.equal(setupResults.length, 1);
    assert.equal(setupResults[0].text.includes('quick'), true);

    const noResults = await store.getEntries({ search: 'nonexistentterm' });
    assert.equal(noResults.length, 0);
  });

  it('sorts by date descending and ascending', async () => {
    await store.addEntry({
      id: 'oldest',
      text: 'First review',
      timestamp: '2026-01-01T00:00:00.000Z',
      sentiment: 'positive',
      confidence: 0.8,
    });
    await store.addEntry({
      id: 'middle',
      text: 'Second review',
      timestamp: '2026-01-02T00:00:00.000Z',
      sentiment: 'positive',
      confidence: 0.8,
    });
    await store.addEntry({
      id: 'newest',
      text: 'Third review',
      timestamp: '2026-01-03T00:00:00.000Z',
      sentiment: 'positive',
      confidence: 0.8,
    });

    const desc = await store.getEntries({ sortBy: 'date', sortOrder: 'desc' });
    assert.equal(desc[0].id, 'newest');
    assert.equal(desc[2].id, 'oldest');

    const asc = await store.getEntries({ sortBy: 'date', sortOrder: 'asc' });
    assert.equal(asc[0].id, 'oldest');
    assert.equal(asc[2].id, 'newest');
  });

  it('sorts by confidence descending and ascending', async () => {
    await store.addEntry({ text: 'Low conf', confidence: 0.45, sentiment: 'neutral' });
    await store.addEntry({ text: 'High conf', confidence: 0.99, sentiment: 'positive' });
    await store.addEntry({ text: 'Mid conf', confidence: 0.72, sentiment: 'positive' });

    const highest = await store.getEntries({ sortBy: 'confidence', sortOrder: 'desc' });
    assert.equal(highest[0].confidence, 0.99);
    assert.equal(highest[2].confidence, 0.45);

    const lowest = await store.getEntries({ sortBy: 'confidence', sortOrder: 'asc' });
    assert.equal(lowest[0].confidence, 0.45);
    assert.equal(lowest[2].confidence, 0.99);
  });

  it('deletes single entry and clears all entries', async () => {
    const e1 = await store.addEntry({ text: 'Review 1', sentiment: 'positive', confidence: 0.9 });
    const e2 = await store.addEntry({ text: 'Review 2', sentiment: 'negative', confidence: 0.8 });

    assert.equal(await store.count(), 2);

    await store.deleteEntry(e1.id);
    assert.equal(await store.count(), 1);
    assert.equal(await store.getEntry(e1.id), null);
    assert.ok(await store.getEntry(e2.id));

    await store.clearEntries();
    assert.equal(await store.count(), 0);
    const emptyList = await store.getEntries();
    assert.equal(emptyList.length, 0);
  });
});
