/**
 * Sentiment Pulse - Lightweight IndexedDB Promise Wrapper (idb.js)
 * Zero-build, standard ES module promise wrapper for browser IndexedDB.
 * Complies with the Jake Archibald idb API convention.
 */

/**
 * Open an IndexedDB database with promise wrappers.
 * @param {string} name - Database name.
 * @param {number} version - Database schema version.
 * @param {Object} [callbacks={}] - Lifecycle hooks.
 * @param {Function} [callbacks.upgrade] - Invoked on upgradeneeded.
 * @param {Function} [callbacks.blocked] - Invoked if opening is blocked.
 * @returns {Promise<Object>} Promisified database interface.
 */
export function openDB(name, version, { upgrade, blocked } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this runtime environment'));
    }

    const request = indexedDB.open(name, version);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (typeof upgrade === 'function') {
        upgrade(db, event.oldVersion, event.newVersion, request.transaction);
      }
    };

    request.onsuccess = () => {
      resolve(wrapDB(request.result));
    };

    request.onerror = () => {
      reject(request.error);
    };

    request.onblocked = (event) => {
      if (typeof blocked === 'function') blocked(event);
    };
  });
}

/**
 * Delete an entire IndexedDB database.
 * @param {string} name - Database name.
 * @returns {Promise<void>}
 */
export function deleteDB(name) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return resolve();
    }
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

function wrapDB(db) {
  return {
    get raw() {
      return db;
    },

    close() {
      db.close();
    },

    async get(storeName, key) {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return promisifyRequest(store.get(key));
    },

    async getAll(storeName) {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return promisifyRequest(store.getAll());
    },

    async put(storeName, value) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const res = await promisifyRequest(store.put(value));
      await txComplete(tx);
      return res;
    },

    async delete(storeName, key) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const res = await promisifyRequest(store.delete(key));
      await txComplete(tx);
      return res;
    },

    async clear(storeName) {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const res = await promisifyRequest(store.clear());
      await txComplete(tx);
      return res;
    },

    async count(storeName) {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      return promisifyRequest(store.count());
    },
  };
}

function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txComplete(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

// Global exposure for non-module script tag environments
if (typeof window !== 'undefined') {
  window.idb = { openDB, deleteDB };
}
