/**
 * Sentiment Pulse - Analytics Dashboard Controller (analytics.js)
 * Visualizes customer satisfaction trends, category comparisons, and sentiment distributions
 * using Chart.js with dynamic light/dark theme adaptation.
 *
 * Phase 4: Adds client-side confidence distribution aggregation and visualization
 * with strict 4-bucket boundaries, multi-page feedback querying, and cache separation.
 */

const AnalyticsController = {
  charts: {},
  currentRange: 'all',
  currentSentiment: 'all',
  confidenceCache: new Map(),
  _chartLoadingPromise: null,

  async ensureChart() {
    if (typeof window !== 'undefined' && window.Chart) {
      return window.Chart;
    }

    if (this._chartLoadingPromise) {
      return this._chartLoadingPromise;
    }

    this._chartLoadingPromise = (async () => {
      // 1. Try native ES module dynamic import
      try {
        const mod = await import('https://cdn.jsdelivr.net/npm/chart.js@4.4.2/auto/+esm');
        const ChartClass = mod.Chart || mod.default;
        if (ChartClass) {
          window.Chart = ChartClass;
          return window.Chart;
        }
      } catch (esmErr) {
        console.warn(
          'Native ESM dynamic import for Chart.js failed, falling back to script loader:',
          esmErr
        );
      }

      // 2. Fallback: dynamic script loader
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js';
        script.async = true;
        script.onload = () => resolve(window.Chart);
        script.onerror = (e) => reject(new Error('Failed to load Chart.js: ' + e));
        document.head.appendChild(script);
      });
    })();

    return this._chartLoadingPromise;
  },

  init() {
    this.bindEvents();
    if (window.location.hash === '#analytics') {
      this.loadAnalytics();
    }
  },

  bindEvents() {
    const rangeBtns = document.querySelectorAll('.analytics-range-btn');
    rangeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        rangeBtns.forEach((b) => b.classList.remove('bg-indigo-600', 'text-white'));
        rangeBtns.forEach((b) =>
          b.classList.add(
            'bg-slate-100',
            'dark:bg-slate-800',
            'text-slate-600',
            'dark:text-slate-300'
          )
        );
        btn.classList.add('bg-indigo-600', 'text-white');
        btn.classList.remove(
          'bg-slate-100',
          'dark:bg-slate-800',
          'text-slate-600',
          'dark:text-slate-300'
        );

        this.currentRange = btn.getAttribute('data-range') || 'all';
        this.loadAnalytics();
      });
    });

    // Confidence sentiment filter
    const sentimentSelect = document.getElementById('analytics-confidence-sentiment');
    if (sentimentSelect) {
      sentimentSelect.addEventListener('change', (e) => {
        this.currentSentiment = e.target.value || 'all';
        this.updateConfidenceDistribution();
      });
    }

    // Listen to theme changes to dynamically restyle charts
    window.addEventListener('theme-changed', () => {
      this.updateChartThemes();
    });

    // Invalidate caches and refresh on feedback modifications
    window.addEventListener('feedback-created', () => {
      this.confidenceCache.clear();
      this.loadAnalytics();
    });
    window.addEventListener('feedback-deleted', () => {
      this.confidenceCache.clear();
      this.loadAnalytics();
    });
  },

  getDateFilters() {
    if (this.currentRange === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return { start_date: d.toISOString() };
    }
    if (this.currentRange === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return { start_date: d.toISOString() };
    }
    return {};
  },

  /**
   * Fetch feedback records client-side across up to 5 pages (100 items/page, max 500 records)
   * and aggregate into confidence distribution buckets. Results are cached per range + sentiment.
   */
  async fetchConfidenceData(range, sentiment) {
    const helper = window.ConfidenceHelper;
    const cacheKey = helper
      ? helper.getConfidenceCacheKey(range, sentiment)
      : `${range}_${sentiment}`;

    if (this.confidenceCache.has(cacheKey)) {
      return this.confidenceCache.get(cacheKey);
    }

    const MAX_PAGES = 5;
    const PAGE_SIZE = 100;
    const allItems = [];

    let startDate = null;
    if (range === '7d') {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 7);
    } else if (range === '30d') {
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30);
    }

    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = {
        page,
        page_size: PAGE_SIZE,
      };

      if (sentiment && sentiment !== 'all') {
        params.sentiment = sentiment;
      }
      if (startDate) {
        params.start_date = startDate.toISOString();
      }

      const res = await window.api.listFeedback(params);
      const items = res && Array.isArray(res.items) ? res.items : [];
      allItems.push(...items);

      // Stop condition 1: Page returned fewer than PAGE_SIZE items (end of dataset)
      if (items.length < PAGE_SIZE) {
        break;
      }

      // Stop condition 2: Reached total_pages reported by backend
      if (res && typeof res.total_pages === 'number' && page >= res.total_pages) {
        break;
      }
    }

    const aggregation = helper
      ? helper.aggregateConfidence(allItems, { startDate, sentiment })
      : {
          buckets: { '0–50%': 0, '50–70%': 0, '70–90%': 0, '90–100%': 0 },
          counts: [0, 0, 0, 0],
          totalValid: 0,
          totalSkipped: 0,
          hasData: false,
        };

    this.confidenceCache.set(cacheKey, aggregation);
    return aggregation;
  },

  /**
   * Dedicated update method for the confidence distribution chart
   * allowing fast re-filtering by sentiment without refetching the entire dashboard.
   */
  async updateConfidenceDistribution() {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.renderConfidenceChart(null);
      return;
    }

    try {
      await this.ensureChart();
      const aggregation = await this.fetchConfidenceData(this.currentRange, this.currentSentiment);
      this.renderConfidenceChart(aggregation);
    } catch (err) {
      console.error('Confidence distribution update error:', err);
      this.renderConfidenceChart(null);
    }
  },

  async loadAnalytics() {
    const emptyState = document.getElementById('analytics-empty-state');
    const skeletonView = document.getElementById('analytics-skeleton-view');
    const content = document.getElementById('analytics-content-view');
    const offlineState = document.getElementById('analytics-offline-state');

    if (offlineState) offlineState.classList.add('hidden');
    if (emptyState) emptyState.classList.add('hidden');
    if (content) content.classList.add('hidden');

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (skeletonView) skeletonView.classList.add('hidden');
      if (offlineState) offlineState.classList.remove('hidden');
      return;
    }

    if (skeletonView) skeletonView.classList.remove('hidden');

    try {
      const filters = this.getDateFilters();

      // Fetch main analytics and confidence data concurrently
      const [data, confidenceAggregation] = await Promise.all([
        window.api.getAnalytics(filters),
        this.fetchConfidenceData(this.currentRange, this.currentSentiment).catch((err) => {
          console.warn('Non-fatal: confidence aggregation fetch failed:', err);
          return null;
        }),
      ]);

      if (skeletonView) skeletonView.classList.add('hidden');

      if (!data || data.total_feedback === 0) {
        if (emptyState) emptyState.classList.remove('hidden');
        if (content) content.classList.add('hidden');
        return;
      }

      if (emptyState) emptyState.classList.add('hidden');
      if (content) content.classList.remove('hidden');

      // Update KPI highlights
      this.updateSummaryPills(data);

      // Lazy-load Chart.js dynamically only when Analytics view requires it
      await this.ensureChart();

      // Render Standard Charts
      this.renderDistributionChart(data.sentiment_counts);
      this.renderTrendsChart(data.sentiment_trends);
      this.renderCategoryChart(data.category_breakdown);
      this.renderSourceChart(data.source_breakdown);

      // Render Phase 4 Confidence Distribution Chart
      this.renderConfidenceChart(confidenceAggregation);

      // Render Negative Feedback Deep-Dive
      this.renderNegativeDeepDive(data.recent_negative_feedback);
    } catch (err) {
      console.error('Analytics load error:', err);
      if (skeletonView) skeletonView.classList.add('hidden');
      if (content) content.classList.add('hidden');

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (emptyState) emptyState.classList.add('hidden');
        if (offlineState) offlineState.classList.remove('hidden');
      } else {
        if (emptyState) emptyState.classList.remove('hidden');
        window.showToast(err.message || 'Failed to load analytics.', 'error');
      }
    }
  },

  updateSummaryPills(data) {
    const setText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setText('analytics-summary-total', data.total_feedback.toLocaleString());
    setText('analytics-summary-pos-pct', `${data.sentiment_percentages.positive || 0}%`);
    setText('analytics-summary-neu-pct', `${data.sentiment_percentages.neutral || 0}%`);
    setText('analytics-summary-neg-pct', `${data.sentiment_percentages.negative || 0}%`);
    setText('analytics-summary-conf', `${((data.average_confidence || 0) * 100).toFixed(1)}%`);
  },

  getThemeColors() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
      textColor: isDark ? '#94a3b8' : '#64748b',
      gridColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
      tooltipBg: isDark ? '#1e293b' : '#ffffff',
      tooltipText: isDark ? '#f8fafc' : '#0f172a',
    };
  },

  renderDistributionChart(counts) {
    const canvas = document.getElementById('chart-distribution');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.charts.distribution) {
      this.charts.distribution.destroy();
    }

    const { textColor } = this.getThemeColors();

    this.charts.distribution = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Positive', 'Neutral', 'Negative', 'Unknown'],
        datasets: [
          {
            data: [
              counts.positive || 0,
              counts.neutral || 0,
              counts.negative || 0,
              counts.unknown || 0,
            ],
            backgroundColor: ['#10b981', '#3b82f6', '#f43f5e', '#94a3b8'],
            borderWidth: 2,
            borderColor: document.documentElement.classList.contains('dark')
              ? '#111827'
              : '#ffffff',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: textColor, font: { family: 'Inter', size: 11 } },
          },
        },
        cutout: '68%',
      },
    });
  },

  renderTrendsChart(trends) {
    const canvas = document.getElementById('chart-trends');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.charts.trends) {
      this.charts.trends.destroy();
    }

    const { textColor, gridColor } = this.getThemeColors();

    const labels = (trends || []).map((t) => t.date);
    const posData = (trends || []).map((t) => t.positive);
    const neuData = (trends || []).map((t) => t.neutral);
    const negData = (trends || []).map((t) => t.negative);

    this.charts.trends = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Positive', data: posData, backgroundColor: '#10b981', stack: 'stack1' },
          { label: 'Neutral', data: neuData, backgroundColor: '#3b82f6', stack: 'stack1' },
          { label: 'Negative', data: negData, backgroundColor: '#f43f5e', stack: 'stack1' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } },
            grid: { display: false },
          },
          y: {
            stacked: true,
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } },
            grid: { color: gridColor },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor, font: { family: 'Inter', size: 11 } },
          },
        },
      },
    });
  },

  renderCategoryChart(categories) {
    const canvas = document.getElementById('chart-categories');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.charts.categories) {
      this.charts.categories.destroy();
    }

    const { textColor, gridColor } = this.getThemeColors();

    const topCats = (categories || []).slice(0, 6);
    const labels = topCats.map((c) => c.category);
    const posData = topCats.map((c) => c.positive);
    const negData = topCats.map((c) => c.negative);

    this.charts.categories = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Positive', data: posData, backgroundColor: '#10b981' },
          { label: 'Negative', data: negData, backgroundColor: '#f43f5e' },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } },
            grid: { color: gridColor },
          },
          y: {
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } },
            grid: { display: false },
          },
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { color: textColor, font: { family: 'Inter', size: 11 } },
          },
        },
      },
    });
  },

  renderSourceChart(sources) {
    const canvas = document.getElementById('chart-sources');
    if (!canvas || typeof Chart === 'undefined') return;

    if (this.charts.sources) {
      this.charts.sources.destroy();
    }

    const { textColor, gridColor } = this.getThemeColors();

    const topSources = (sources || []).slice(0, 5);
    const labels = topSources.map((s) => s.source.toUpperCase());
    const data = topSources.map((s) => s.total);

    this.charts.sources = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Total Reviews',
            data,
            backgroundColor: '#6366f1',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } },
            grid: { display: false },
          },
          y: {
            ticks: { color: textColor, font: { family: 'Inter', size: 10 } },
            grid: { color: gridColor },
          },
        },
        plugins: {
          legend: { display: false },
        },
      },
    });
  },

  /**
   * Render Phase 4 Confidence Distribution Bar Chart
   * Displays counts across 4 deterministic buckets: 0–50%, 50–70%, 70–90%, 90–100%.
   * Handles empty or missing data cleanly with an empty state element.
   */
  renderConfidenceChart(aggregation) {
    const canvas = document.getElementById('chart-confidence');
    const emptyEl = document.getElementById('chart-confidence-empty');
    const wrapperEl = document.getElementById('chart-confidence-wrapper');
    if (!canvas || typeof Chart === 'undefined') return;

    // Chart.js instance lifecycle: destroy existing instance to prevent duplicates or memory leaks
    if (this.charts.confidence) {
      this.charts.confidence.destroy();
      this.charts.confidence = null;
    }

    // Empty state condition: no aggregation or no usable confidence values
    if (!aggregation || !aggregation.hasData || aggregation.totalValid === 0) {
      if (wrapperEl) wrapperEl.classList.add('hidden');
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    if (wrapperEl) wrapperEl.classList.remove('hidden');

    const { textColor, gridColor, tooltipBg, tooltipText } = this.getThemeColors();
    const helper = window.ConfidenceHelper;
    const labels = helper
      ? helper.CONFIDENCE_BUCKET_LABELS
      : ['0–50%', '50–70%', '70–90%', '90–100%'];
    const data = aggregation.counts;

    this.charts.confidence = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Feedback Records',
            data,
            backgroundColor: [
              '#f43f5e', // 0–50% (lower certainty / potential risk)
              '#f59e0b', // 50–70% (moderate certainty)
              '#3b82f6', // 70–90% (good certainty)
              '#10b981', // 90–100% (high certainty)
            ],
            borderRadius: 6,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            ticks: {
              color: textColor,
              font: { family: 'Inter', size: 10, weight: '500' },
            },
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            ticks: {
              color: textColor,
              font: { family: 'Inter', size: 10 },
              precision: 0,
            },
            grid: { color: gridColor },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: tooltipBg,
            titleColor: tooltipText,
            bodyColor: tooltipText,
            borderColor: gridColor,
            borderWidth: 1,
            padding: 10,
            displayColors: true,
            callbacks: {
              label(context) {
                const count = context.parsed.y || 0;
                const total = aggregation.totalValid || 1;
                const pct = ((count / total) * 100).toFixed(1);
                return ` ${count} records (${pct}%)`;
              },
            },
          },
        },
      },
    });
  },

  updateChartThemes() {
    const { textColor, gridColor } = this.getThemeColors();
    Object.values(this.charts).forEach((chart) => {
      if (!chart) return;
      if (chart.options.scales) {
        if (chart.options.scales.x && chart.options.scales.x.ticks)
          chart.options.scales.x.ticks.color = textColor;
        if (chart.options.scales.y && chart.options.scales.y.ticks)
          chart.options.scales.y.ticks.color = textColor;
        if (chart.options.scales.y && chart.options.scales.y.grid)
          chart.options.scales.y.grid.color = gridColor;
      }
      if (
        chart.options.plugins &&
        chart.options.plugins.legend &&
        chart.options.plugins.legend.labels
      ) {
        chart.options.plugins.legend.labels.color = textColor;
      }
      chart.update();
    });
  },

  renderNegativeDeepDive(items) {
    const container = document.getElementById('analytics-negative-items');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `<p class="text-slate-400 text-xs italic py-4 text-center">No high-risk negative reviews identified.</p>`;
      return;
    }

    container.innerHTML = items
      .slice(0, 6)
      .map((item) => {
        const confPct = ((item.confidence || 0) * 100).toFixed(1);
        const cat = item.category
          ? `<span class="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">${window.escapeHtml(item.category)}</span>`
          : '';
        const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString() : '';

        return `
        <div class="p-3.5 rounded-xl saas-card hover:border-rose-300 dark:hover:border-rose-900/50 transition-colors space-y-1.5 text-xs">
          <div class="flex items-center justify-between text-[11px] text-slate-400">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full badge-negative font-semibold text-[10px]">
              Critical (${confPct}%)
            </span>
            <span>${dateStr}</span>
          </div>
          <p class="text-slate-800 dark:text-slate-200 line-clamp-2 leading-relaxed">${window.escapeHtml(item.text)}</p>
          <div class="flex justify-between items-center pt-1 text-[11px]">
            <div>${cat}</div>
            <button onclick="window.viewFeedbackDetail(${item.id})" class="text-indigo-600 dark:text-indigo-400 font-medium hover:underline">Inspect Details →</button>
          </div>
        </div>
      `;
      })
      .join('');
  },
};

window.AnalyticsController = AnalyticsController;
