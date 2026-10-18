import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Load API by executing api.js in Node environment
globalThis.window = {
  showToast: () => {},
  URL: {
    createObjectURL: () => 'blob:mock',
    revokeObjectURL: () => {},
  },
};
await import('../../static/js/api.js');
const api = globalThis.api || window.api;

describe('API Cold-Start & Retry Handling', () => {
  const originalFetch = globalThis.fetch;
  let toastMessages = [];

  beforeEach(() => {
    toastMessages = [];
    window.showToast = (msg, type) => {
      toastMessages.push({ msg, type });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('retries on 502 cold-start and succeeds when server wakes up', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 502,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ detail: 'Bad Gateway' }),
        };
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ sentiment: 'positive', confidence: 0.95 }),
      };
    };

    const result = await api.request('/predict', {
      method: 'POST',
      body: { text: 'Great service!' },
      retryDelayMs: 10, // Fast delay for unit tests
      maxRetries: 2,
    });

    assert.equal(callCount, 2);
    assert.equal(result.sentiment, 'positive');
    assert.ok(toastMessages.some((t) => t.msg.includes('Server is waking up (~50s), retrying…')));
  });

  test('retries on 503 Service Unavailable up to maxRetries before failing', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      return {
        ok: false,
        status: 503,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ detail: 'Service Unavailable' }),
      };
    };

    await assert.rejects(
      async () => {
        await api.request('/health', {
          retryDelayMs: 5,
          maxRetries: 2,
        });
      },
      {
        message: 'Service Unavailable',
      }
    );

    // Initial attempt + 2 retries = 3 calls
    assert.equal(callCount, 3);
  });

  test('retries when request times out (AbortError)', async () => {
    let callCount = 0;
    globalThis.fetch = async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      }
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ status: 'ok' }),
      };
    };

    const res = await api.request('/health', {
      retryDelayMs: 10,
      maxRetries: 2,
    });

    assert.equal(callCount, 2);
    assert.equal(res.status, 'ok');
  });

  test('propagates status, requestId and detail on 500 persistence failure', async () => {
    globalThis.fetch = async () => {
      return {
        ok: false,
        status: 500,
        headers: new Headers({
          'content-type': 'application/json',
          'X-Request-ID': 'test-trace-id-12345',
        }),
        json: async () => ({ detail: 'Failed to persist feedback record.' }),
      };
    };

    await assert.rejects(
      async () => {
        await api.createFeedback({
          text: 'she is so good',
          source: 'web',
        });
      },
      (err) => {
        assert.equal(err.message, 'Failed to persist feedback record.');
        assert.equal(err.status, 500);
        assert.equal(err.requestId, 'test-trace-id-12345');
        return true;
      }
    );
  });

  test('creates feedback successfully and parses response', async () => {
    globalThis.fetch = async () => {
      return {
        ok: true,
        status: 201,
        headers: new Headers({
          'content-type': 'application/json',
          'X-Request-ID': 'success-req-123',
        }),
        json: async () => ({
          id: 1099,
          text: 'she is so good',
          sentiment: 'positive',
          confidence: 0.97,
        }),
      };
    };

    const res = await api.createFeedback({
      text: 'she is so good',
      category: null,
      source: 'web',
      rating: null,
    });

    assert.equal(res.id, 1099);
    assert.equal(res.sentiment, 'positive');
  });
});
