/**
 * Sentiment Pulse - Feedback Explorer Controller (explorer.js)
 * Manages paginated feedback table, multi-criteria filtering, search, record inspection,
 * and deletion with confirmation.
 */

const ExplorerController = {
  currentPage: 1,
  pageSize: 15,
  searchDebounceTimer: null,
  activeRecordDetail: null,
  _hasLoadedOnce: false,
  _activeFlipTween: null,
  _activeStaggerTween: null,

  init() {
    this.bindEvents();
    this.loadData();
  },

  cleanup() {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    if (this._activeFlipTween) {
      try {
        if (typeof this._activeFlipTween.kill === 'function') this._activeFlipTween.kill();
      } catch {}
      this._activeFlipTween = null;
    }
    if (this._activeStaggerTween) {
      try {
        if (typeof this._activeStaggerTween.kill === 'function') this._activeStaggerTween.kill();
      } catch {}
      this._activeStaggerTween = null;
    }
    if (window.AnimationManager) {
      window.AnimationManager.killViewAnimations('explorer');
    }
  },

  bindEvents() {
    const searchInput = document.getElementById('explorer-search-input');
    const sentimentFilter = document.getElementById('explorer-filter-sentiment');
    const categoryFilter = document.getElementById('explorer-filter-category');
    const sourceFilter = document.getElementById('explorer-filter-source');
    const sortSelect = document.getElementById('explorer-sort-select');
    const resetBtn = document.getElementById('explorer-reset-filters-btn');
    const exportBtn = document.getElementById('explorer-export-btn');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
          this.currentPage = 1;
          this.loadData();
        }, 300);
      });
    }

    [sentimentFilter, categoryFilter, sourceFilter, sortSelect].forEach((el) => {
      if (el) {
        el.addEventListener('change', () => {
          this.currentPage = 1;
          this.loadData();
        });
      }
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (sentimentFilter) sentimentFilter.value = '';
        if (categoryFilter) categoryFilter.value = '';
        if (sourceFilter) sourceFilter.value = '';
        if (sortSelect) sortSelect.value = 'created_at-desc';
        this.currentPage = 1;
        this.loadData();
      });
    }

    if (exportBtn) {
      exportBtn.addEventListener('click', async () => {
        try {
          window.showToast('Preparing sanitized CSV export...', 'info');
          await window.api.exportCSV();
          window.showToast('CSV export downloaded successfully!', 'success');
        } catch (err) {
          window.showToast(err.message || 'CSV export failed.', 'error');
        }
      });
    }

    // Modal close listeners
    const closeModalBtn = document.getElementById('detail-modal-close');
    const modalBackdrop = document.getElementById('feedback-detail-modal');
    if (closeModalBtn && modalBackdrop) {
      closeModalBtn.addEventListener('click', () => {
        this.closeDetailModal();
      });
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) this.closeDetailModal();
      });
    }

    // Keyboard navigation for table rows and mobile cards (Arrow keys + Enter)
    const handleKeyNav = (e) => {
      const row = e.target.closest('.explorer-row, .explorer-card');
      if (!row) return;

      const items = Array.from(document.querySelectorAll('.explorer-row, .explorer-card')).filter(
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
        // Open modal if user presses Enter on the row/card (not on inner delete button)
        if (e.target.tagName !== 'BUTTON') {
          e.preventDefault();
          const id = row.getAttribute('data-id');
          if (id) {
            this.showDetailModal(parseInt(id, 10), row);
          }
        }
      }
    };

    const handleRowClick = (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
      const row = e.target.closest('.explorer-row, .explorer-card');
      if (!row) return;
      const id = row.getAttribute('data-id');
      if (id) {
        this.showDetailModal(parseInt(id, 10), row);
      }
    };

    const tableBody = document.getElementById('explorer-table-body');
    const mobileContainer = document.getElementById('explorer-mobile-cards');
    if (tableBody) {
      tableBody.addEventListener('keydown', handleKeyNav);
      tableBody.addEventListener('click', handleRowClick);
    }
    if (mobileContainer) {
      mobileContainer.addEventListener('keydown', handleKeyNav);
      mobileContainer.addEventListener('click', handleRowClick);
    }

    // Listen to global feedback creation events
    window.addEventListener('feedback-created', () => {
      this.loadData();
    });
  },

  renderSkeletons() {
    const tableBody = document.getElementById('explorer-table-body');
    const mobileContainer = document.getElementById('explorer-mobile-cards');
    const emptyState = document.getElementById('explorer-empty-state');
    if (emptyState) emptyState.classList.add('hidden');

    if (tableBody) {
      tableBody.innerHTML = Array.from({ length: 5 })
        .map(
          () => `
          <tr class="border-b border-slate-200/80 dark:border-slate-800/80 text-xs">
            <td class="px-4 py-3.5"><div class="h-3.5 w-8 rounded skeleton"></div></td>
            <td class="px-4 py-3.5"><div class="h-3.5 w-64 rounded skeleton"></div></td>
            <td class="px-4 py-3.5"><div class="h-5 w-16 rounded-full skeleton"></div></td>
            <td class="px-4 py-3.5"><div class="h-3.5 w-10 rounded skeleton"></div></td>
            <td class="px-4 py-3.5"><div class="h-3.5 w-16 rounded skeleton"></div></td>
            <td class="px-4 py-3.5"><div class="h-3.5 w-12 rounded skeleton"></div></td>
            <td class="px-4 py-3.5"><div class="h-3.5 w-14 rounded skeleton"></div></td>
            <td class="px-4 py-3.5"><div class="h-3.5 w-20 rounded skeleton"></div></td>
            <td class="px-4 py-3.5 text-right"><div class="h-5 w-20 rounded skeleton ml-auto"></div></td>
          </tr>
        `
        )
        .join('');
    }

    if (mobileContainer) {
      mobileContainer.innerHTML = Array.from({ length: 3 })
        .map(
          () => `
          <div class="p-4 rounded-xl saas-card space-y-2.5 text-xs">
            <div class="flex items-center justify-between">
              <div class="h-4 w-16 rounded skeleton"></div>
              <div class="h-4 w-12 rounded skeleton"></div>
            </div>
            <div class="h-8 w-full rounded skeleton"></div>
            <div class="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
              <div class="h-3 w-20 rounded skeleton"></div>
              <div class="h-3 w-16 rounded skeleton"></div>
            </div>
          </div>
        `
        )
        .join('');
    }
  },

  async loadData() {
    const tableBody = document.getElementById('explorer-table-body');
    const mobileContainer = document.getElementById('explorer-mobile-cards');
    const paginationInfo = document.getElementById('explorer-pagination-info');
    const prevBtn = document.getElementById('explorer-prev-btn');
    const nextBtn = document.getElementById('explorer-next-btn');
    const emptyState = document.getElementById('explorer-empty-state');

    // Rapid filtering safety: kill in-flight tweens before starting a new render
    if (this._activeFlipTween) {
      try {
        if (typeof this._activeFlipTween.kill === 'function') this._activeFlipTween.kill();
      } catch {}
      this._activeFlipTween = null;
    }
    if (this._activeStaggerTween) {
      try {
        if (typeof this._activeStaggerTween.kill === 'function') this._activeStaggerTween.kill();
      } catch {}
      this._activeStaggerTween = null;
    }

    const search = document.getElementById('explorer-search-input')?.value.trim() || undefined;
    const sentiment = document.getElementById('explorer-filter-sentiment')?.value || undefined;
    const category = document.getElementById('explorer-filter-category')?.value || undefined;
    const source = document.getElementById('explorer-filter-source')?.value || undefined;
    const sortVal = document.getElementById('explorer-sort-select')?.value || 'created_at-desc';
    const [sort_by, sort_order] = sortVal.split('-');

    // Render skeleton placeholders only on initial load
    if (!this._hasLoadedOnce) {
      this.renderSkeletons();
    }

    // Capture layout state before fetching & updating DOM if already rendered
    let flipState = null;
    const isReduced = window.AnimationManager && window.AnimationManager.isReducedMotion();
    if (this._hasLoadedOnce && !isReduced && window.AnimationManager) {
      const existingRows = document.querySelectorAll('.explorer-row, .explorer-card');
      if (existingRows.length > 0) {
        flipState = await window.AnimationManager.recordFlipState(existingRows);
      }
    }

    try {
      const response = await window.api.listFeedback({
        page: this.currentPage,
        page_size: this.pageSize,
        search,
        sentiment,
        category,
        source,
        sort_by,
        sort_order,
      });

      const { items, total, page, total_pages } = response;

      if (items.length === 0) {
        if (tableBody) tableBody.innerHTML = '';
        if (mobileContainer) mobileContainer.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        if (paginationInfo) paginationInfo.textContent = 'Showing 0 results';
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        this._hasLoadedOnce = true;
        return;
      }

      if (emptyState) emptyState.classList.add('hidden');

      // Update Pagination Indicators
      const startItem = (page - 1) * this.pageSize + 1;
      const endItem = Math.min(page * this.pageSize, total);
      if (paginationInfo) {
        paginationInfo.textContent = `Showing ${startItem}–${endItem} of ${total} records (Page ${page} of ${total_pages})`;
      }

      if (prevBtn) {
        prevBtn.disabled = page <= 1;
        prevBtn.onclick = () => {
          if (this.currentPage > 1) {
            this.currentPage--;
            this.loadData();
          }
        };
      }

      if (nextBtn) {
        nextBtn.disabled = page >= total_pages;
        nextBtn.onclick = () => {
          if (this.currentPage < total_pages) {
            this.currentPage++;
            this.loadData();
          }
        };
      }

      // Render Desktop Rows
      if (tableBody) {
        tableBody.innerHTML = items.map((item) => this.renderTableRow(item)).join('');
      }

      // Render Mobile Cards
      if (mobileContainer) {
        mobileContainer.innerHTML = items.map((item) => this.renderMobileCard(item)).join('');
      }

      // Apply Flip layout animation or initial row stagger
      if (flipState && !isReduced && window.AnimationManager) {
        this._activeFlipTween = await window.AnimationManager.playFlip(
          flipState,
          {
            duration: 0.3,
            ease: 'power2.out',
            stagger: 0.02,
            targets: '.explorer-row, .explorer-card',
            onComplete: () => {
              this._activeFlipTween = null;
            },
          },
          'explorer'
        );
      } else if (!isReduced) {
        // Explorer Row Stagger (Section 9) with bounded stagger
        const rows = Array.from(document.querySelectorAll('.explorer-row, .explorer-card'));
        const gsap = window.AnimationManager ? await window.AnimationManager.ensureGSAP() : null;
        if (gsap && rows.length > 0) {
          const visibleRows = rows.slice(0, 15);
          this._activeStaggerTween = gsap.fromTo(
            visibleRows,
            { opacity: 0, y: 8 },
            {
              opacity: 1,
              y: 0,
              duration: 0.25,
              stagger: 0.03,
              ease: 'power2.out',
              onComplete: () => {
                this._activeStaggerTween = null;
              },
            }
          );
        }
      }

      this._hasLoadedOnce = true;
    } catch (err) {
      console.error('Failed to load feedback records:', err);
      if (tableBody) tableBody.innerHTML = '';
      if (mobileContainer) mobileContainer.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      window.showToast(err.message || 'Error loading feedback table.', 'error');
    }
  },

  renderTableRow(item) {
    const sentiment = (item.sentiment || 'unknown').toLowerCase();
    const confPct = ((item.confidence || 0) * 100).toFixed(1);
    const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString() : '—';
    const stars = item.rating ? `⭐ ${item.rating}/5` : '—';
    const cat = item.category ? window.escapeHtml(item.category) : '—';
    const src = item.source ? window.escapeHtml(item.source) : 'web';

    let badgeClass = 'badge-unknown';
    if (sentiment === 'positive') badgeClass = 'badge-positive';
    if (sentiment === 'neutral') badgeClass = 'badge-neutral';
    if (sentiment === 'negative') badgeClass = 'badge-negative';

    return `
      <tr 
        class="explorer-row hover:bg-slate-50/80 dark:hover:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800/80 transition-colors text-xs cursor-pointer focus:outline-none" 
        tabindex="0" 
        data-id="${item.id}"
        role="row"
        aria-label="Feedback record #${item.id}, ${sentiment} sentiment, confidence ${confPct}%"
      >
        <td class="px-4 py-3 font-mono text-slate-400 text-[11px]">#${item.id}</td>
        <td class="px-4 py-3 max-w-xs md:max-w-md truncate text-slate-800 dark:text-slate-200 font-medium">
          ${window.escapeHtml(item.text)}
        </td>
        <td class="px-4 py-3">
          <span class="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase ${badgeClass}">
            <span>${sentiment}</span>
          </span>
        </td>
        <td class="px-4 py-3 font-mono text-slate-600 dark:text-slate-400 text-[11px]">
          ${confPct}%
        </td>
        <td class="px-4 py-3 text-slate-600 dark:text-slate-400 text-[11px]">
          ${cat}
        </td>
        <td class="px-4 py-3 text-slate-600 dark:text-slate-400 uppercase text-[11px]">
          ${src}
        </td>
        <td class="px-4 py-3 text-slate-600 dark:text-slate-400 text-[11px]">
          ${stars}
        </td>
        <td class="px-4 py-3 text-slate-400 text-[11px] whitespace-nowrap">
          ${dateStr}
        </td>
        <td class="px-4 py-3 text-right whitespace-nowrap space-x-2">
          <button onclick="event.stopPropagation(); window.viewFeedbackDetail(${item.id}, this)" aria-label="Inspect feedback record #${item.id}" class="px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500">View</button>
          <button onclick="event.stopPropagation(); window.confirmDeleteFeedback(${item.id}, this)" aria-label="Delete feedback record #${item.id}" class="px-2 py-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-medium focus:outline-none focus:ring-1 focus:ring-rose-500">Delete</button>
        </td>
      </tr>
    `;
  },

  renderMobileCard(item) {
    const sentiment = (item.sentiment || 'unknown').toLowerCase();
    const confPct = ((item.confidence || 0) * 100).toFixed(1);
    const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString() : '—';
    const stars = item.rating ? `⭐ ${item.rating}/5` : '';

    let badgeClass = 'badge-unknown';
    if (sentiment === 'positive') badgeClass = 'badge-positive';
    if (sentiment === 'neutral') badgeClass = 'badge-neutral';
    if (sentiment === 'negative') badgeClass = 'badge-negative';

    return `
      <div 
        class="explorer-card p-4 rounded-xl saas-card space-y-2 text-xs cursor-pointer focus:outline-none"
        tabindex="0"
        data-id="${item.id}"
        role="article"
        aria-label="Feedback record #${item.id}, ${sentiment} sentiment, confidence ${confPct}%"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="font-mono text-slate-400 text-[11px]">#${item.id}</span>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${badgeClass}">${sentiment}</span>
          </div>
          <span class="font-mono text-slate-500 text-[11px]">${confPct}%</span>
        </div>
        <p class="text-slate-800 dark:text-slate-200 line-clamp-3 leading-relaxed">${window.escapeHtml(item.text)}</p>
        <div class="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span>${stars} ${item.category ? `• ${window.escapeHtml(item.category)}` : ''}</span>
          <span>${dateStr}</span>
        </div>
        <div class="flex justify-end space-x-3 pt-1">
          <button onclick="event.stopPropagation(); window.viewFeedbackDetail(${item.id}, this)" aria-label="Inspect feedback record #${item.id}" class="text-indigo-600 dark:text-indigo-400 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500">Inspect</button>
          <button onclick="event.stopPropagation(); window.confirmDeleteFeedback(${item.id}, this)" aria-label="Delete feedback record #${item.id}" class="text-rose-600 dark:text-rose-400 font-medium focus:outline-none focus:ring-1 focus:ring-rose-500">Delete</button>
        </div>
      </div>
    `;
  },

  closeDetailModal() {
    const modal = document.getElementById('feedback-detail-modal');
    if (!modal) return;
    const dialog = modal.querySelector('[role="document"], .saas-card');
    const onDone = () => {
      modal.classList.add('hidden');
      if (this.detailModalTrap) {
        this.detailModalTrap.deactivate();
        this.detailModalTrap = null;
      }
    };

    if (window.MicroInteractions && typeof window.MicroInteractions.modalExit === 'function') {
      window.MicroInteractions.modalExit(modal, dialog, onDone);
    } else {
      onDone();
    }
  },

  async showDetailModal(
    feedbackId,
    triggeringElement = typeof document !== 'undefined' ? document.activeElement : null
  ) {
    try {
      const data = await window.api.getFeedback(feedbackId);
      const modal = document.getElementById('feedback-detail-modal');
      if (!modal) return;

      const setText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
      };

      setText('detail-modal-id', `#${data.id}`);
      setText('detail-modal-sentiment', (data.sentiment || 'unknown').toUpperCase());
      setText('detail-modal-confidence', `${((data.confidence || 0) * 100).toFixed(1)}%`);
      setText('detail-modal-text', data.text);
      setText('detail-modal-category', data.category || 'None');
      setText('detail-modal-source', data.source || 'web');
      setText('detail-modal-rating', data.rating ? `${data.rating} / 5 Stars` : 'Unrated');
      setText('detail-modal-version', data.model_version || '3.0.0');
      setText(
        'detail-modal-date',
        data.created_at ? new Date(data.created_at).toLocaleString() : '—'
      );

      const scores = data.scores || {};
      const posPct = ((scores.positive || 0) * 100).toFixed(1);
      const neuPct = ((scores.neutral || 0) * 100).toFixed(1);
      const negPct = ((scores.negative || 0) * 100).toFixed(1);

      document.getElementById('detail-modal-pos-bar').style.width = `${posPct}%`;
      document.getElementById('detail-modal-neu-bar').style.width = `${neuPct}%`;
      document.getElementById('detail-modal-neg-bar').style.width = `${negPct}%`;
      setText('detail-modal-pos-val', `${posPct}%`);
      setText('detail-modal-neu-val', `${neuPct}%`);
      setText('detail-modal-neg-val', `${negPct}%`);

      const closeBtn = document.getElementById('detail-modal-close');
      const deleteBtn = document.getElementById('detail-modal-delete-btn');

      if (deleteBtn) {
        deleteBtn.onclick = () => {
          this.closeDetailModal();
          this.confirmDelete(data.id, triggeringElement);
        };
      }

      const dialog = modal.querySelector('[role="document"], .saas-card');
      if (window.MicroInteractions && typeof window.MicroInteractions.modalEnter === 'function') {
        window.MicroInteractions.modalEnter(modal, dialog);
      } else {
        modal.classList.remove('hidden');
      }

      if (this.detailModalTrap) {
        this.detailModalTrap.deactivate();
        this.detailModalTrap = null;
      }

      if (window.ModalHelper && typeof window.ModalHelper.createFocusTrap === 'function') {
        this.detailModalTrap = window.ModalHelper.createFocusTrap(modal, {
          onEscape: () => this.closeDetailModal(),
          returnFocusEl: triggeringElement,
          initialFocusEl: closeBtn,
        });
        this.detailModalTrap.activate();
      } else if (closeBtn) {
        closeBtn.focus();
      }
    } catch (err) {
      window.showToast(err.message || 'Failed to load feedback details.', 'error');
    }
  },

  confirmDelete(
    feedbackId,
    returnFocusEl = typeof document !== 'undefined' ? document.activeElement : null
  ) {
    window.showConfirm(
      'Delete Customer Feedback',
      `Are you sure you want to permanently delete feedback record #${feedbackId}? This action cannot be undone.`,
      async () => {
        try {
          await window.api.deleteFeedback(feedbackId);
          window.showToast(`Feedback #${feedbackId} deleted.`, 'success');
          this.loadData();
          // Dispatch event so Overview and Analytics refresh
          window.dispatchEvent(new CustomEvent('feedback-deleted', { detail: { id: feedbackId } }));
        } catch (err) {
          window.showToast(err.message || 'Failed to delete record.', 'error');
        }
      },
      returnFocusEl
    );
  },
};

window.ExplorerController = ExplorerController;
window.viewFeedbackDetail = (id, el) => ExplorerController.showDetailModal(id, el);
window.confirmDeleteFeedback = (id, el) => ExplorerController.confirmDelete(id, el);
