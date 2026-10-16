/**
 * Sentiment Pulse - Overview Dashboard Controller (overview.js)
 * Loads genuine metrics from /feedback/stats and /feedback/analytics.
 * Renders KPI cards, distribution visualizers, and recent negative alerts.
 */

const OverviewController = {
  distributionChart: null,

  async init() {
    await this.refresh();
  },

  async refresh() {
    const container = document.getElementById('view-overview');
    if (!container) return;

    if (window.AnimationManager) {
      window.AnimationManager.killViewAnimations('overview');
    }

    try {
      this.setLoading(true);
      const [stats, analytics] = await Promise.all([
        window.api.getStats().catch(() => null),
        window.api.getAnalytics().catch(() => null),
      ]);

      this.renderKPIs(stats, analytics);
      this.renderRecentNegatives(analytics ? analytics.recent_negative_feedback : []);
      this.renderCategoryBreakdown(analytics ? analytics.category_breakdown : []);
      this.renderSourceBreakdown(analytics ? analytics.source_breakdown : []);
      this.renderDistribution(stats);
      this.setLoading(false);
    } catch (err) {
      console.error('Error loading overview data:', err);
      this.setLoading(false);
      window.showToast(err.message || 'Failed to load dashboard metrics.', 'error');
    }
  },

  setLoading(isLoading) {
    const kpiElements = document.querySelectorAll('.overview-kpi-val');
    kpiElements.forEach((el) => {
      if (isLoading) {
        el.classList.add('skeleton', 'text-transparent', 'rounded-md');
        el.setAttribute('aria-busy', 'true');
      } else {
        el.classList.remove('skeleton', 'text-transparent', 'rounded-md');
        el.setAttribute('aria-busy', 'false');
      }
    });

    const listContainer = document.getElementById('overview-negatives-list');
    if (listContainer) {
      if (isLoading) {
        listContainer.setAttribute('aria-busy', 'true');
        listContainer.innerHTML = `
          <div class="space-y-3 py-2" aria-busy="true" aria-label="Loading negative feedback alerts">
            <div class="p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
              <div class="h-3.5 w-3/4 rounded skeleton"></div>
              <div class="h-2.5 w-1/3 rounded skeleton"></div>
            </div>
            <div class="p-3 rounded-xl border border-slate-100 dark:border-slate-800 space-y-2">
              <div class="h-3.5 w-2/3 rounded skeleton"></div>
              <div class="h-2.5 w-1/4 rounded skeleton"></div>
            </div>
          </div>
        `;
      } else {
        listContainer.setAttribute('aria-busy', 'false');
      }
    }
  },

  renderKPIs(stats, _analytics) {
    const total = stats ? stats.total_count : 0;
    const pos = stats ? stats.positive_count : 0;
    const neu = stats ? stats.neutral_count : 0;
    const neg = stats ? stats.negative_count : 0;
    const posPct = stats ? stats.positive_pct : 0;
    const neuPct = stats ? stats.neutral_pct : 0;
    const negPct = stats ? stats.negative_pct : 0;
    const avgConf = stats ? (stats.average_confidence * 100).toFixed(1) : '0.0';

    // Show/hide empty state banner
    const emptyBanner = document.getElementById('overview-empty-state');
    const contentGrid = document.getElementById('overview-content-grid');
    if (emptyBanner && contentGrid) {
      if (total === 0) {
        emptyBanner.classList.remove('hidden');
      } else {
        emptyBanner.classList.add('hidden');
      }
    }

    const setElemText = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    if (total === 0) {
      setElemText('kpi-total-val', '0');
      setElemText('kpi-pos-val', '0');
      setElemText('kpi-pos-pct', '0.0%');
      setElemText('kpi-neu-val', '0');
      setElemText('kpi-neu-pct', '0.0%');
      setElemText('kpi-neg-val', '0');
      setElemText('kpi-neg-pct', '0.0%');
      setElemText('kpi-conf-val', '0.0%');
      return;
    }

    // Trigger subtle card stagger reveal if available
    if (window.RevealEngine && typeof window.RevealEngine.revealAll === 'function') {
      const kpiGrid = document.querySelector('#view-overview [data-stagger]');
      if (kpiGrid) window.RevealEngine.revealAll(kpiGrid);
    }

    // Update DOM values via accessible Counters adapter or fallback
    if (window.Counters) {
      window.Counters.animate('kpi-total-val', total);
      window.Counters.animate('kpi-pos-val', pos);
      window.Counters.animate('kpi-pos-pct', `${posPct}%`);
      window.Counters.animate('kpi-neu-val', neu);
      window.Counters.animate('kpi-neu-pct', `${neuPct}%`);
      window.Counters.animate('kpi-neg-val', neg);
      window.Counters.animate('kpi-neg-pct', `${negPct}%`);
      window.Counters.animate('kpi-conf-val', `${avgConf}%`);
    } else {
      setElemText('kpi-total-val', total.toLocaleString());
      setElemText('kpi-pos-val', pos.toLocaleString());
      setElemText('kpi-pos-pct', `${posPct}%`);
      setElemText('kpi-neu-val', neu.toLocaleString());
      setElemText('kpi-neu-pct', `${neuPct}%`);
      setElemText('kpi-neg-val', neg.toLocaleString());
      setElemText('kpi-neg-pct', `${negPct}%`);
      setElemText('kpi-conf-val', `${avgConf}%`);
    }
  },

  renderDistribution(stats) {
    const posPct = stats ? stats.positive_pct : 0;
    const neuPct = stats ? stats.neutral_pct : 0;
    const negPct = stats ? stats.negative_pct : 0;

    const barPos = document.getElementById('overview-bar-pos');
    const barNeu = document.getElementById('overview-bar-neu');
    const barNeg = document.getElementById('overview-bar-neg');

    const isReduced =
      window.AnimationManager && typeof window.AnimationManager.isReducedMotion === 'function'
        ? window.AnimationManager.isReducedMotion()
        : false;

    const bars = [
      { el: barPos, pct: posPct },
      { el: barNeu, pct: neuPct },
      { el: barNeg, pct: negPct },
    ];

    bars.forEach(({ el, pct }) => {
      if (!el) return;
      el.style.width = `${pct}%`;
      if (!isReduced && pct > 0 && window.AnimationManager) {
        el.style.transformOrigin = 'left center';
        window.AnimationManager.play('barGrow', el, { duration: 0.5 }, 'overview');
      } else {
        el.style.transform = 'none';
      }
    });
  },

  renderRecentNegatives(items) {
    const listContainer = document.getElementById('overview-negatives-list');
    if (!listContainer) return;

    if (!items || items.length === 0) {
      listContainer.innerHTML = `
        <div class="py-6 text-center text-slate-400 dark:text-slate-500 text-xs italic">
          No negative feedback requiring attention. Great job!
        </div>
      `;
      return;
    }

    listContainer.innerHTML = items
      .slice(0, 5)
      .map((item) => {
        const confPct = (item.confidence * 100).toFixed(1);
        const catBadge = item.category
          ? `<span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium border border-slate-200 dark:border-slate-700">${window.escapeHtml(item.category)}</span>`
          : '';
        const ratingStars = item.rating ? `⭐ ${item.rating}/5` : '';
        const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString() : '';

        return `
        <div class="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/90 dark:border-slate-800/80 hover:border-rose-300 dark:hover:border-rose-900/40 transition-colors">
          <div class="flex items-start justify-between gap-3 mb-1.5">
            <span class="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold badge-negative">
              <span>●</span>
              <span>Negative (${confPct}%)</span>
            </span>
            <div class="flex items-center space-x-2 text-[11px] text-slate-400">
              <span>${ratingStars}</span>
              <span>${dateStr}</span>
            </div>
          </div>
          <p class="text-xs text-slate-700 dark:text-slate-200 line-clamp-2 leading-relaxed mb-2">${window.escapeHtml(item.text)}</p>
          <div class="flex items-center justify-between text-[11px]">
            <div>${catBadge}</div>
            <button onclick="window.viewFeedbackDetail(${item.id})" class="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">Inspect Record →</button>
          </div>
        </div>
      `;
      })
      .join('');
  },

  renderCategoryBreakdown(categories) {
    const container = document.getElementById('overview-category-list');
    if (!container) return;

    if (!categories || categories.length === 0) {
      container.innerHTML = `<p class="text-slate-400 text-xs italic py-4 text-center">No categorized feedback recorded yet.</p>`;
      return;
    }

    container.innerHTML = categories
      .slice(0, 5)
      .map((cat) => {
        return `
        <div class="space-y-1.5">
          <div class="flex justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
            <span>${window.escapeHtml(cat.category)}</span>
            <span class="text-slate-400 text-[11px]">${cat.total} reviews (${cat.positive_pct}% pos)</span>
          </div>
          <div class="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
            <div style="width: ${cat.positive_pct}%" class="bg-emerald-500 h-full"></div>
            <div style="width: ${100 - cat.positive_pct - cat.negative_pct}%" class="bg-blue-500 h-full"></div>
            <div style="width: ${cat.negative_pct}%" class="bg-rose-500 h-full"></div>
          </div>
        </div>
      `;
      })
      .join('');
  },

  renderSourceBreakdown(sources) {
    const container = document.getElementById('overview-source-list');
    if (!container) return;

    if (!sources || sources.length === 0) {
      container.innerHTML = `<p class="text-slate-400 text-xs italic py-4 text-center">No source channels recorded yet.</p>`;
      return;
    }

    container.innerHTML = sources
      .slice(0, 5)
      .map((src) => {
        return `
        <div class="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-slate-800 text-xs">
          <div class="flex items-center space-x-2">
            <span class="w-2 h-2 rounded-full bg-indigo-500"></span>
            <span class="font-medium text-slate-700 dark:text-slate-200 uppercase text-[11px]">${window.escapeHtml(src.source)}</span>
          </div>
          <span class="font-mono text-slate-600 dark:text-slate-400 text-[11px] font-semibold">${src.total} items</span>
        </div>
      `;
      })
      .join('');
  },
};

window.OverviewController = OverviewController;
