/**
 * Sentiment Pulse - Local Analysis History Store (store.js)
 * Manages client-side persistent history in IndexedDB with a hard 200-entry limit,
 * automatic oldest-entry eviction, searching, filtering, and sorting.
 */

import { openDB } from './idb.js';
import { truncateSnippet } from './formatters.js';

export const DB_NAME = 'sentiment_pulse_history_db';
export const DB_VERSION = 1;
export const STORE_NAME = 'history';
export const MAX_HISTORY_ENTRIES = 200;

/**
 * In-memory storage adapter for zero-dependency unit testing and non-IndexedDB environments.
 */
export class MemoryAdapter {
  constructor() {
    this.items = new Map();
  }

  async getAll() {
    return Array.from(this.items.values());
  }

  async get(id) {
    const item = this.items.get(id);
    return item ? { ...item } : null;
  }

  async put(item) {
    this.items.set(item.id, { ...item });
    return item.id;
  }

  async delete(id) {
    return this.items.delete(id);
  }

  async clear() {
    this.items.clear();
  }

  async count() {
    return this.items.size;
  }
}

/**
 * IndexedDB storage adapter using the idb promise wrapper.
 */
export class IndexedDBAdapter {
  constructor(dbName = DB_NAME, version = DB_VERSION) {
    this.dbName = dbName;
    this.version = version;
    this._dbPromise = null;
  }

  async getDB() {
    if (!this._dbPromise) {
      this._dbPromise = openDB(this.dbName, this.version, {
        upgrade(db) {
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp', { unique: false });
            store.createIndex('sentiment', 'sentiment', { unique: false });
            store.createIndex('confidence', 'confidence', { unique: false });
          }
        },
      });
    }
    return this._dbPromise;
  }

  async getAll() {
    const db = await this.getDB();
    return db.getAll(STORE_NAME);
  }

  async get(id) {
    const db = await this.getDB();
    const item = await db.get(STORE_NAME, id);
    return item || null;
  }

  async put(item) {
    const db = await this.getDB();
    return db.put(STORE_NAME, item);
  }

  async delete(id) {
    const db = await this.getDB();
    return db.delete(STORE_NAME, id);
  }

  async clear() {
    const db = await this.getDB();
    return db.clear(STORE_NAME);
  }

  async count() {
    const db = await this.getDB();
    return db.count(STORE_NAME);
  }
}

/**
 * High-level analysis history store enforcing caps, eviction, search, and sorting.
 */
export class HistoryStore {
  constructor(adapter = null, options = {}) {
    this.maxEntries = options.maxEntries || MAX_HISTORY_ENTRIES;
    if (adapter) {
      this.adapter = adapter;
    } else if (typeof indexedDB !== 'undefined') {
      this.adapter = new IndexedDBAdapter();
    } else {
      this.adapter = new MemoryAdapter();
    }
  }

  /**
   * Persist a new analysis result into history.
   * Enforces the 200-entry cap and evicts the oldest entry when exceeded.
   */
  async addEntry(rawEntry) {
    if (!rawEntry || typeof rawEntry !== 'object') {
      throw new Error('Invalid analysis entry provided to history store');
    }

    const text = String(rawEntry.text || '').trim();
    if (!text) {
      throw new Error('History entry requires non-empty text');
    }

    const id = rawEntry.id || `hist_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const timestamp = rawEntry.timestamp || new Date().toISOString();
    const snippet = rawEntry.snippet || truncateSnippet(text, 100);
    const sentiment = String(rawEntry.sentiment || 'unknown').toLowerCase();
    const confidence = typeof rawEntry.confidence === 'number' ? rawEntry.confidence : 0;
    const scores = rawEntry.scores && typeof rawEntry.scores === 'object' ? rawEntry.scores : {};
    const source = rawEntry.source || 'web';
    const feedbackId = rawEntry.feedbackId || null;

    const entry = {
      id,
      timestamp,
      text,
      snippet,
      sentiment,
      confidence,
      scores,
      source,
      feedbackId,
    };

    await this.adapter.put(entry);

    // Enforce 200-entry limit at the storage layer
    await this.enforceCap();

    return entry;
  }

  /**
   * Automatically evict oldest entries if total count exceeds maxEntries.
   */
  async enforceCap() {
    const count = await this.adapter.count();
    if (count <= this.maxEntries) return;

    const all = await this.adapter.getAll();
    // Sort oldest first (ascending timestamp)
    all.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());

    const numToEvict = all.length - this.maxEntries;
    if (numToEvict > 0) {
      const toEvict = all.slice(0, numToEvict);
      for (const item of toEvict) {
        await this.adapter.delete(item.id);
      }
    }
  }

  /**
   * Query history entries with combined search, sentiment filter, and sorting.
   */
  async getEntries(options = {}) {
    const { search = '', sentiment = '', sortBy = 'date', sortOrder = 'desc' } = options;

    let items = await this.adapter.getAll();

    // 1. Filter by sentiment
    if (sentiment && sentiment !== 'all') {
      const targetSentiment = sentiment.toLowerCase();
      items = items.filter(
        (item) => item.sentiment && item.sentiment.toLowerCase() === targetSentiment
      );
    }

    // 2. Filter by search text / snippet
    if (search && search.trim()) {
      const query = search.trim().toLowerCase();
      items = items.filter(
        (item) =>
          (item.text && item.text.toLowerCase().includes(query)) ||
          (item.snippet && item.snippet.toLowerCase().includes(query))
      );
    }

    // 3. Sort entries
    items.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'confidence') {
        const confA = typeof a.confidence === 'number' ? a.confidence : 0;
        const confB = typeof b.confidence === 'number' ? b.confidence : 0;
        comparison = confA - confB;
      } else {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        comparison = timeA - timeB;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return items;
  }

  async getEntry(id) {
    return this.adapter.get(id);
  }

  async deleteEntry(id) {
    return this.adapter.delete(id);
  }

  async clearEntries() {
    return this.adapter.clear();
  }

  async count() {
    return this.adapter.count();
  }
}

// Global singleton instance
export const store = new HistoryStore();

if (typeof window !== 'undefined') {
  window.historyStore = store;
  window.HistoryStore = HistoryStore;
  window.MemoryAdapter = MemoryAdapter;
}
