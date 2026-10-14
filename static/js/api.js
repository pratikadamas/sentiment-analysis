/**
 * Sentiment Pulse - API Client Service (api.js)
 * Centralized API client service for sentiment analysis and customer feedback intelligence.
 */

const API = {
  /**
   * Core request dispatcher with automatic error parsing and 401 redirect handling
   */
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    const config = {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {})
      }
    };

    // If body is an object and not FormData, serialize to JSON
    if (config.body && !(config.body instanceof FormData) && typeof config.body === 'object') {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);
      const requestId = response.headers.get('X-Request-ID');
      const processTime = response.headers.get('X-Process-Time');


      // Handle raw non-JSON responses (e.g. CSV exports, HTML fallbacks)
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/csv') || contentType.includes('application/octet-stream')) {
        if (!response.ok) {
          throw new Error(`Export failed with status ${response.status}`);
        }
        return await response.blob();
      }

      const isJson = contentType.includes('application/json');
      const data = isJson ? await response.json() : await response.text();

      if (!response.ok) {
        let errorMsg = 'An unexpected server error occurred.';
        if (data && typeof data === 'object') {
          if (data.detail) {
            errorMsg = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
          } else if (data.message) {
            errorMsg = data.message;
          }
        } else if (typeof data === 'string' && data.trim()) {
          errorMsg = data;
        }
        
        const error = new Error(errorMsg);
        error.status = response.status;
        error.requestId = requestId;
        error.processTime = processTime;
        throw error;
      }

      return data;
    } catch (err) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('Network error: Unable to connect to server. Please check your internet connection.');
      }
      throw err;
    }
  },


  // Prediction Endpoints
  async predict(text) {
    return this.request('/predict', {
      method: 'POST',
      body: { text }
    });
  },

  async predictBatch(texts) {
    return this.request('/predict/batch', {
      method: 'POST',
      body: { texts }
    });
  },

  // Customer Feedback Management Endpoints
  async createFeedback(payload) {
    return this.request('/feedback', {
      method: 'POST',
      body: payload
    });
  },

  async listFeedback(params = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== null && val !== '') {
        query.append(key, val);
      }
    });
    const queryString = query.toString();
    return this.request(`/feedback${queryString ? `?${queryString}` : ''}`);
  },

  async getFeedback(id) {
    return this.request(`/feedback/${id}`);
  },

  async deleteFeedback(id) {
    return this.request(`/feedback/${id}`, {
      method: 'DELETE'
    });
  },

  async getStats() {
    return this.request('/feedback/stats');
  },

  async getAnalytics(params = {}) {
    const query = new URLSearchParams();
    if (params.start_date) query.append('start_date', params.start_date);
    if (params.end_date) query.append('end_date', params.end_date);
    const qs = query.toString();
    return this.request(`/feedback/analytics${qs ? `?${qs}` : ''}`);
  },

  // Import / Export Endpoints
  async uploadCSV(file) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request('/feedback/import', {
      method: 'POST',
      body: formData
    });
  },

  async getImportJob(jobId) {
    return this.request(`/feedback/import/${jobId}`);
  },

  async exportCSV() {
    const blob = await this.request('/feedback/export');
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentiment_pulse_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  // Health / Probes
  async checkHealth() {
    return this.request('/health');
  },

  async checkReadiness() {
    return this.request('/health/ready');
  }
};

window.api = API;
