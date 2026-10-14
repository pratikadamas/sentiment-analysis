/**
 * Sentiment Pulse - Analytics Dashboard Controller (analytics.js)
 * Visualizes customer satisfaction trends, category comparisons, and sentiment distributions
 * using Chart.js with dynamic light/dark theme adaptation.
 */

const AnalyticsController = {
  charts: {},
  currentRange: 'all',

  init() {
    this.bindEvents();
    this.loadAnalytics();
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

        this.currentRange = btn.getAttribute('data-range');
        this.loadAnalytics();
      });
    });

    // Listen to theme changes to dynamically restyle charts
    window.addEventListener('theme-changed', () => {
      this.updateChartThemes();
    });

    // Refresh on feedback modifications
    window.addEventListener('feedback-created', () => this.loadAnalytics());
    window.addEventListener('feedback-deleted', () => this.loadAnalytics());
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

  async loadAnalytics() {
    const emptyState = document.getElementById('analytics-empty-state');
    const skeletonView = document.getElementById('analytics-skeleton-view');
    const content = document.getElementById('analytics-content-view');

    if (emptyState) emptyState.classList.add('hidden');
    if (content) content.classList.add('hidden');
    if (skeletonView) skeletonView.classList.remove('hidden');

    try {
      const filters = this.getDateFilters();
      const data = await window.api.getAnalytics(filters);

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

      // Render Charts
      this.renderDistributionChart(data.sentiment_counts);
      this.renderTrendsChart(data.sentiment_trends);
      this.renderCategoryChart(data.category_breakdown);
      this.renderSourceChart(data.source_breakdown);

      // Render Negative Feedback Deep-Dive
      this.renderNegativeDeepDive(data.recent_negative_feedback);
    } catch (err) {
      console.error('Analytics load error:', err);
      if (skeletonView) skeletonView.classList.add('hidden');
      if (content) content.classList.add('hidden');
      if (emptyState) emptyState.classList.remove('hidden');
      window.showToast(err.message || 'Failed to load analytics.', 'error');
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
