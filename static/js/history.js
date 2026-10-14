/**
 * Sentiment Pulse - Local Analysis History Controller (history.js)
 * Manages local IndexedDB history list, search/filter/sort, rehydration into Analyze view,
 * and deletion confirmation via the global accessible confirmation modal.
 */

const HistoryController = {
  initialized: false,

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    this.bindEvents();
    await this.loadHistory();
  },

  bindEvents() {
    const searchInput = document.getElementById('history-search-input');
    const sentimentFilter = document.getElementById('history-filter-sentiment');
    const sortSelect = document.getElementById('history-sort-select');
    const resetBtn = document.getElementById('history-reset-filters-btn');
    const clearBtn = document.getElementById('history-clear-btn');
    const tableBody = document.getElementById('history-table-body');
    const mobileContainer = document.getElementById('history-mobile-cards');

    // Debounced search input
    if (searchInput) {
      let debounceTimer = null;
      searchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          this.loadHistory();
        }, 250);
      });
    }

    if (sentimentFilter) {
      sentimentFilter.addEventListener('change', () => this.loadHistory());
    }

    if (sortSelect) {
      sortSelect.addEventListener('change', () => this.loadHistory());
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (sentimentFilter) sentimentFilter.value = 'all';
        if (sortSelect) sortSelect.value = 'date-desc';
        this.loadHistory();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', (e) => {
        this.confirmClearAll(e.currentTarget);
      });
    }

    // Keyboard navigation (Arrow keys + Enter to rehydrate)
    const handleKeyNav = (e) => {
      const row = e.target.closest('.history-row, .history-card');
      if (!row) return;

      const items = Array.from(document.querySelectorAll('.history-row, .history-card')).filter(
        (el) => el.offsetParent !== null
      );
      const currentIndex = items.indexOf(row);
      if (currentIndex === -1) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = items[currentIndex + 1];
        if (next) next.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = items[currentIndex - 1];
        if (prev) prev.focus();
      } else if (e.key === 'Enter') {
        if (e.target.tagName !== 'BUTTON' && !e.target.closest('button')) {
          e.preventDefault();
          const id = row.getAttribute('data-id');
          if (id) {
            this.rehydrateEntry(id, row);
          }
        }
      }
    };

    // Click on row/card to rehydrate (except action buttons)
    const handleRowClick = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      const row = e.target.closest('.history-row, .history-card');
      if (!row) return;
      const id = row.getAttribute('data-id');
      if (id) {
        this.rehydrateEntry(id, row);
      }
    };

    if (tableBody) {
      tableBody.addEventListener('keydown', handleKeyNav);
      tableBody.addEventListener('click', handleRowClick);
    }

    if (mobileContainer) {
      mobileContainer.addEventListener('keydown', handleKeyNav);
      mobileContainer.addEventListener('click', handleRowClick);
    }

    // Auto-refresh when new analyses are added
    window.addEventListener('history-updated', () => {
      this.loadHistory();
    });
  },

  async loadHistory() {
    if (!window.historyStore) return;

    const tableBody = document.getElementById('history-table-body');
    const mobileContainer = document.getElementById('history-mobile-cards');
    const countInfo = document.getElementById('history-count-info');
    const emptyState = document.getElementById('history-empty-state');
    const clearBtn = document.getElementById('history-clear-btn');

    const search = document.getElementById('history-search-input')?.value.trim() || '';
    const sentiment = document.getElementById('history-filter-sentiment')?.value || 'all';
    const sortVal = document.getElementById('history-sort-select')?.value || 'date-desc';
    const [sortBy, sortOrder] = sortVal.split('-');

    try {
      const totalCount = await window.historyStore.count();
      const items = await window.historyStore.getEntries({
        search,
        sentiment,
        sortBy,
        sortOrder,
      });

      if (clearBtn) {
        clearBtn.disabled = totalCount === 0;
        if (totalCount === 0) {
          clearBtn.classList.add('opacity-40', 'cursor-not-allowed');
        } else {
          clearBtn.classList.remove('opacity-40', 'cursor-not-allowed');
        }
      }

      if (items.length === 0) {
        if (tableBody) tableBody.innerHTML = '';
        if (mobileContainer) mobileContainer.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        if (countInfo) {
          countInfo.textContent =
            totalCount === 0
              ? 'No records in local history'
              : `0 matches found (${totalCount} total in history)`;
        }
        return;
      }

      if (emptyState) emptyState.classList.add('hidden');

      if (countInfo) {
        countInfo.textContent =
          search || (sentiment && sentiment !== 'all')
            ? `Showing ${items.length} of ${totalCount} history records`
            : `${totalCount} records in local history (capped at 200)`;
      }

      if (tableBody) {
        tableBody.innerHTML = items.map((item) => this.renderTableRow(item)).join('');
      }

      if (mobileContainer) {
        mobileContainer.innerHTML = items.map((item) => this.renderMobileCard(item)).join('');
      }
    } catch (err) {
      console.error('Error loading history:', err);
      if (countInfo) countInfo.textContent = 'Failed to load local history';
    }
  },

  renderTableRow(item) {
    const sentiment = (item.sentiment || 'unknown').toLowerCase();
    const confPct = ((item.confidence || 0) * 100).toFixed(1);
    const dateStr = item.timestamp
      ? window.Formatters && typeof window.Formatters.formatDate === 'function'
        ? window.Formatters.formatDate(item.timestamp, { includeTime: true })
        : new Date(item.timestamp).toLocaleString()
      : '—';
    const src = item.source ? window.escapeHtml(item.source) : 'web';

    let badgeClass = 'badge-unknown';
    if (sentiment === 'positive') badgeClass = 'badge-positive';
    if (sentiment === 'neutral') badgeClass = 'badge-neutral';
    if (sentiment === 'negative') badgeClass = 'badge-negative';

    return `
      <tr 
        class="history-row hover:bg-slate-50/80 dark:hover:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800/80 transition-colors text-xs cursor-pointer focus:outline-none" 
        tabindex="0" 
        data-id="${item.id}"
        role="row"
        aria-label="History analysis: ${sentiment} sentiment, confidence ${confPct}%, created on ${dateStr}"
      >
        <td class="px-4 py-3 whitespace-nowrap">
          <span class="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase ${badgeClass}">
            <span>${sentiment}</span>
          </span>
        </td>
        <td class="px-4 py-3 max-w-xs md:max-w-md truncate text-slate-800 dark:text-slate-200 font-medium" title="${window.escapeHtml(item.text)}">
          ${window.escapeHtml(item.snippet || item.text)}
        </td>
        <td class="px-4 py-3 font-mono text-slate-600 dark:text-slate-400 text-[11px] whitespace-nowrap">
          ${confPct}%
        </td>
        <td class="px-4 py-3 text-slate-500 uppercase text-[11px] whitespace-nowrap">
          ${src}
        </td>
        <td class="px-4 py-3 text-slate-400 text-[11px] whitespace-nowrap font-mono">
          ${dateStr}
        </td>
        <td class="px-4 py-3 text-right whitespace-nowrap space-x-2">
          <button 
            type="button" 
            onclick="event.stopPropagation(); window.HistoryController.rehydrateEntry('${item.id}', this)" 
            aria-label="Load analysis for '${window.escapeHtml(item.snippet || '')}'" 
            class="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
          >
            Rehydrate
          </button>
          <button 
            type="button" 
            onclick="event.stopPropagation(); window.HistoryController.confirmDelete('${item.id}', this)" 
            aria-label="Delete analysis history entry" 
            class="px-2.5 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-medium focus:outline-none focus:ring-1 focus:ring-rose-500 transition-colors"
          >
            Delete
          </button>
        </td>
      </tr>
    `;
  },

  renderMobileCard(item) {
    const sentiment = (item.sentiment || 'unknown').toLowerCase();
    const confPct = ((item.confidence || 0) * 100).toFixed(1);
    const dateStr = item.timestamp
      ? window.Formatters && typeof window.Formatters.formatDate === 'function'
        ? window.Formatters.formatDate(item.timestamp, { includeTime: true })
        : new Date(item.timestamp).toLocaleString()
      : '—';

    let badgeClass = 'badge-unknown';
    if (sentiment === 'positive') badgeClass = 'badge-positive';
    if (sentiment === 'neutral') badgeClass = 'badge-neutral';
    if (sentiment === 'negative') badgeClass = 'badge-negative';

    return `
      <div 
        class="history-card p-4 rounded-xl saas-card space-y-2 text-xs cursor-pointer focus:outline-none"
        tabindex="0"
        data-id="${item.id}"
        role="article"
        aria-label="History record: ${sentiment} sentiment, confidence ${confPct}%"
      >
        <div class="flex items-center justify-between">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${badgeClass}">${sentiment}</span>
          <span class="font-mono text-slate-500 text-[11px]">${confPct}%</span>
        </div>
        <p class="text-slate-800 dark:text-slate-200 line-clamp-3 leading-relaxed">${window.escapeHtml(item.text)}</p>
        <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span class="uppercase">${window.escapeHtml(item.source || 'web')}</span>
          <span class="font-mono">${dateStr}</span>
        </div>
        <div class="flex justify-end space-x-2 pt-1">
          <button 
            type="button" 
            onclick="event.stopPropagation(); window.HistoryController.rehydrateEntry('${item.id}', this)" 
            class="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-medium"
          >
            Rehydrate
          </button>
          <button 
            type="button" 
            onclick="event.stopPropagation(); window.HistoryController.confirmDelete('${item.id}', this)" 
            class="px-2.5 py-1 rounded-lg text-rose-600 dark:text-rose-400 font-medium"
          >
            Delete
          </button>
        </div>
      </div>
    `;
  },

  async rehydrateEntry(id, _triggeringElement = null) {
    try {
      if (!window.historyStore) return;
      const entry = await window.historyStore.getEntry(id);
      if (!entry) {
        window.showToast('Selected history entry no longer exists.', 'warning');
        return;
      }

      if (window.AnalyzeController && typeof window.AnalyzeController.rehydrate === 'function') {
        window.AnalyzeController.rehydrate(entry);
      }

      if (window.App && typeof window.App.switchView === 'function') {
        window.App.switchView('analyze');
      }
    } catch (err) {
      console.error('Failed to rehydrate history entry:', err);
      window.showToast('Failed to load entry from history.', 'error');
    }
  },

  confirmDelete(id, returnFocusEl = null) {
    window.showConfirm(
      'Delete Analysis History Entry',
      'Are you sure you want to remove this analysis from your local history?',
      async () => {
        try {
          await window.historyStore.deleteEntry(id);
          window.showToast('History entry removed.', 'info');
          await this.loadHistory();
        } catch (err) {
          window.showToast(err.message || 'Failed to delete history record.', 'error');
        }
      },
      returnFocusEl
    );
  },

  confirmClearAll(returnFocusEl = null) {
    window.showConfirm(
      'Clear All Local Analysis History',
      'Are you sure you want to delete all saved analyses from your local IndexedDB? This action cannot be undone.',
      async () => {
        try {
          await window.historyStore.clearEntries();
          window.showToast('All local analysis history cleared.', 'success');
          await this.loadHistory();
        } catch (err) {
          window.showToast(err.message || 'Failed to clear history.', 'error');
        }
      },
      returnFocusEl
    );
  },
};

window.HistoryController = HistoryController;
