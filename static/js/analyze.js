/**
 * Sentiment Pulse - Analyze Feedback Controller (analyze.js)
 * Executes inference on single customer reviews and bulk paste batches (up to 100 rows),
 * handles rate-limiter spacing, client-side validation, Web Share API, and local history.
 */

const AnalyzeController = {
  activeTab: 'single',
  currentSingleResult: null,
  currentBulkResults: [],
  isAnalyzingBulk: false,

  init() {
    this.bindEvents();
    if (
      window.ExplainabilityController &&
      typeof window.ExplainabilityController.init === 'function'
    ) {
      window.ExplainabilityController.init();
    }
  },

  bindEvents() {
    // Mode Switcher Tabs
    const tabSingle = document.getElementById('analyze-tab-single');
    const tabBulk = document.getElementById('analyze-tab-bulk');

    if (tabSingle) {
      tabSingle.addEventListener('click', () => this.switchTab('single'));
    }
    if (tabBulk) {
      tabBulk.addEventListener('click', () => this.switchTab('bulk'));
    }

    // --- Single Analysis Elements ---
    const textInput = document.getElementById('analyze-text-input');
    const charCounter = document.getElementById('analyze-char-counter');
    const analyzeBtn = document.getElementById('analyze-submit-btn');
    const clearBtn = document.getElementById('analyze-clear-btn');
    const sampleBtns = document.querySelectorAll('.analyze-sample-btn');
    const shareBtn = document.getElementById('analyze-share-btn');

    if (textInput && charCounter) {
      textInput.addEventListener('input', () => {
        charCounter.textContent = `${textInput.value.length} / 2000`;
      });

      textInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          this.executeAnalysis();
        }
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (textInput) {
          textInput.value = '';
          if (charCounter) charCounter.textContent = '0 / 2000';
          textInput.focus();
        }
        this.resetResults();
      });
    }

    sampleBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const sampleText = btn.getAttribute('data-sample');
        if (textInput && sampleText) {
          textInput.value = sampleText;
          if (charCounter) charCounter.textContent = `${sampleText.length} / 2000`;
          this.executeAnalysis();
        }
      });
    });

    if (analyzeBtn) {
      analyzeBtn.addEventListener('click', () => this.executeAnalysis());
    }

    if (shareBtn) {
      shareBtn.addEventListener('click', () => this.handleShare());
    }

    // Toggle developer JSON inspection
    const toggleJsonBtn = document.getElementById('analyze-toggle-json');
    const jsonDrawer = document.getElementById('analyze-json-drawer');
    if (toggleJsonBtn && jsonDrawer) {
      toggleJsonBtn.addEventListener('click', () => {
        jsonDrawer.classList.toggle('hidden');
      });
    }

    // --- Bulk Analysis Elements ---
    const bulkInput = document.getElementById('bulk-text-input');
    const bulkRowCounter = document.getElementById('bulk-row-counter');
    const bulkSampleBtn = document.getElementById('bulk-sample-btn');
    const bulkClearBtn = document.getElementById('bulk-clear-btn');
    const bulkSubmitBtn = document.getElementById('bulk-submit-btn');
    const bulkExportBtn = document.getElementById('bulk-export-btn');

    if (bulkInput && bulkRowCounter) {
      bulkInput.addEventListener('input', () => {
        const rows =
          window.BulkHelper && typeof window.BulkHelper.parseBulkInput === 'function'
            ? window.BulkHelper.parseBulkInput(bulkInput.value)
            : bulkInput.value.split(/\r?\n/).filter((l) => l.trim().length > 0);
        bulkRowCounter.textContent = `${rows.length} / 100 rows`;

        // Hide validation box on typing
        const errBox = document.getElementById('bulk-validation-errors');
        if (errBox) errBox.classList.add('hidden');
      });

      bulkInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          this.executeBulkAnalysis();
        }
      });
    }

    if (bulkSampleBtn && bulkInput) {
      bulkSampleBtn.addEventListener('click', () => {
        const samples = [
          'The customer onboarding experience was genuinely outstanding and seamless!',
          'Standard order arrived within 3 business days via regular ground courier.',
          'Terrible product quality, the plastic hinge cracked on the very first day.',
          'Average performance for the price point, neither impressive nor terrible.',
          'Super fast response from their tier-2 technical support department!',
        ];
        bulkInput.value = samples.join('\n');
        if (bulkRowCounter) {
          bulkRowCounter.textContent = `${samples.length} / 100 rows`;
        }
        const errBox = document.getElementById('bulk-validation-errors');
        if (errBox) errBox.classList.add('hidden');
        bulkInput.focus();
      });
    }

    if (bulkClearBtn) {
      bulkClearBtn.addEventListener('click', () => {
        if (bulkInput) {
          bulkInput.value = '';
          if (bulkRowCounter) bulkRowCounter.textContent = '0 / 100 rows';
          bulkInput.focus();
        }
        this.resetBulkView();
      });
    }

    if (bulkSubmitBtn) {
      bulkSubmitBtn.addEventListener('click', () => this.executeBulkAnalysis());
    }

    if (bulkExportBtn) {
      bulkExportBtn.addEventListener('click', () => this.exportBulkCSV());
    }

    // Delegated expand/collapse full text in bulk results table & mobile cards
    const tableBody = document.getElementById('bulk-results-table-body');
    const mobileCards = document.getElementById('bulk-mobile-cards');

    const handleTextToggle = (e) => {
      const toggleBtn = e.target.closest('.bulk-text-expand-btn');
      if (!toggleBtn) return;
      const targetId = toggleBtn.getAttribute('data-target');
      if (!targetId) return;
      const fullTextEl = document.getElementById(targetId);
      const snippetEl = document.getElementById(`${targetId}-snippet`);

      if (fullTextEl && snippetEl) {
        const isExpanded = !fullTextEl.classList.contains('hidden');
        if (isExpanded) {
          fullTextEl.classList.add('hidden');
          snippetEl.classList.remove('hidden');
          toggleBtn.textContent = 'Expand';
          toggleBtn.setAttribute('aria-expanded', 'false');
        } else {
          fullTextEl.classList.remove('hidden');
          snippetEl.classList.add('hidden');
          toggleBtn.textContent = 'Collapse';
          toggleBtn.setAttribute('aria-expanded', 'true');
        }
      }
    };

    if (tableBody) tableBody.addEventListener('click', handleTextToggle);
    if (mobileCards) mobileCards.addEventListener('click', handleTextToggle);
  },

  switchTab(tab) {
    this.activeTab = tab;
    const tabSingle = document.getElementById('analyze-tab-single');
    const tabBulk = document.getElementById('analyze-tab-bulk');
    const panelSingle = document.getElementById('analyze-panel-single');
    const panelBulk = document.getElementById('analyze-panel-bulk');

    const activeClasses = [
      'bg-white',
      'dark:bg-slate-700',
      'text-indigo-600',
      'dark:text-indigo-400',
      'shadow-sm',
    ];
    const inactiveClasses = [
      'text-slate-600',
      'dark:text-slate-400',
      'hover:text-slate-900',
      'dark:hover:text-slate-200',
    ];

    if (tab === 'single') {
      if (tabSingle) {
        tabSingle.classList.add(...activeClasses);
        tabSingle.classList.remove(...inactiveClasses);
        tabSingle.setAttribute('aria-selected', 'true');
      }
      if (tabBulk) {
        tabBulk.classList.remove(...activeClasses);
        tabBulk.classList.add(...inactiveClasses);
        tabBulk.setAttribute('aria-selected', 'false');
      }
      if (panelSingle) panelSingle.classList.remove('hidden');
      if (panelBulk) panelBulk.classList.add('hidden');

      const singleInput = document.getElementById('analyze-text-input');
      if (singleInput) singleInput.focus();
    } else {
      if (tabBulk) {
        tabBulk.classList.add(...activeClasses);
        tabBulk.classList.remove(...inactiveClasses);
        tabBulk.setAttribute('aria-selected', 'true');
      }
      if (tabSingle) {
        tabSingle.classList.remove(...activeClasses);
        tabSingle.classList.add(...inactiveClasses);
        tabSingle.setAttribute('aria-selected', 'false');
      }
      if (panelBulk) panelBulk.classList.remove('hidden');
      if (panelSingle) panelSingle.classList.add('hidden');

      const bulkInput = document.getElementById('bulk-text-input');
      if (bulkInput) bulkInput.focus();
    }
  },

  // =========================================================================
  // SINGLE ANALYSIS METHODS
  // =========================================================================

  resetResults() {
    const emptyState = document.getElementById('analyze-empty-state');
    const skeleton = document.getElementById('analyze-skeleton');
    const activeResults = document.getElementById('analyze-active-results');
    if (skeleton) skeleton.classList.add('hidden');
    if (activeResults) activeResults.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
    this.currentSingleResult = null;
    if (
      window.ExplainabilityController &&
      typeof window.ExplainabilityController.reset === 'function'
    ) {
      window.ExplainabilityController.reset();
    }
    if (window.ThreeRuntime && typeof window.ThreeRuntime.resetAnalyze === 'function') {
      window.ThreeRuntime.resetAnalyze();
    }
  },

  async executeAnalysis() {
    const textInput = document.getElementById('analyze-text-input');
    const submitBtn = document.getElementById('analyze-submit-btn');
    const btnText = document.getElementById('analyze-btn-text');
    const btnSpinner = document.getElementById('analyze-btn-spinner');
    const saveCheckbox = document.getElementById('analyze-save-checkbox');
    const categoryInput = document.getElementById('analyze-category-input');
    const sourceInput = document.getElementById('analyze-source-input');
    const ratingInput = document.getElementById('analyze-rating-input');

    if (!textInput) return;
    const text = textInput.value.trim();

    if (!text) {
      window.showToast('Please enter customer feedback or select a sample review.', 'warning');
      textInput.focus();
      return;
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      window.showToast(
        'Offline Mode: ML sentiment analysis requires an active server connection. Your input is preserved.',
        'warning'
      );
      return;
    }

    const shouldSave = saveCheckbox ? saveCheckbox.checked : true;
    const category = categoryInput ? categoryInput.value.trim() : null;
    const source = sourceInput ? sourceInput.value.trim() : 'web';
    let rating = ratingInput && ratingInput.value ? parseInt(ratingInput.value, 10) : null;
    if (rating && (rating < 1 || rating > 5)) rating = null;

    if (submitBtn) submitBtn.disabled = true;
    if (btnSpinner) btnSpinner.classList.remove('hidden');
    if (btnText) btnText.textContent = shouldSave ? 'Analyzing & Saving...' : 'Analyzing...';
    if (window.AnimationManager && !window.AnimationManager.isReducedMotion()) {
      window.AnimationManager.play('press', submitBtn, { duration: 0.15 }, 'analyze');
    }

    const skeleton = document.getElementById('analyze-skeleton');
    const emptyState = document.getElementById('analyze-empty-state');
    const activeResults = document.getElementById('analyze-active-results');
    if (emptyState) emptyState.classList.add('hidden');
    if (activeResults) activeResults.classList.add('hidden');
    if (skeleton) skeleton.classList.remove('hidden');

    if (window.ThreeRuntime && typeof window.ThreeRuntime.setAnalyzing === 'function') {
      window.ThreeRuntime.setAnalyzing();
    }

    const t0 = performance.now();

    try {
      let result;
      let persistenceSucceeded = false;

      if (shouldSave) {
        try {
          result = await window.api.createFeedback({
            text,
            category: category || null,
            source: source || 'web',
            rating: rating || null,
          });
          persistenceSucceeded = true;
          window.showToast(`Feedback saved to database (#${result.id})!`, 'success');
          window.dispatchEvent(new CustomEvent('feedback-created', { detail: result }));
        } catch (saveErr) {
          console.error('[FeedbackPersistenceError]', {
            endpoint: '/feedback',
            status: saveErr.status || 500,
            requestId: saveErr.requestId || null,
            message: saveErr.message || 'Failed to persist feedback record.',
          });
          // Attempt inference fallback so user does not lose the sentiment analysis result
          try {
            result = await window.api.predict(text);
            window.showToast('Failed to save feedback. Please try again.', 'warning');
          } catch {
            throw saveErr;
          }
        }
      } else {
        result = await window.api.predict(text);
        window.showToast('Sentiment predicted successfully!', 'success');
      }

      const elapsed = Math.round(performance.now() - t0);
      this.displayResults(result, elapsed, persistenceSucceeded);

      // Persist to local IndexedDB history (Phase 2)
      if (window.historyStore && typeof window.historyStore.addEntry === 'function') {
        try {
          const scores = result.scores || {
            positive:
              result.sentiment === 'positive' ? result.confidence : (1 - result.confidence) / 2,
            neutral:
              result.sentiment === 'neutral' ? result.confidence : (1 - result.confidence) / 2,
            negative:
              result.sentiment === 'negative' ? result.confidence : (1 - result.confidence) / 2,
          };
          await window.historyStore.addEntry({
            text,
            sentiment: result.sentiment,
            confidence: result.confidence,
            scores,
            source: source || 'web',
            feedbackId: persistenceSucceeded && result.id ? result.id : null,
          });
          window.dispatchEvent(new CustomEvent('history-updated'));
        } catch (storeErr) {
          console.warn('Failed to persist to local history:', storeErr);
        }
      }

      // Phase 5: Approximate Explainability (Asynchronous perturbation heuristic)
      if (
        window.ExplainabilityController &&
        typeof window.ExplainabilityController.explain === 'function'
      ) {
        window.ExplainabilityController.explain(text, result).catch((explainErr) => {
          console.warn('Non-fatal: explainability analysis failed:', explainErr);
        });
      }
    } catch (err) {
      console.error('Inference error:', err);
      if (skeleton) skeleton.classList.add('hidden');
      if (emptyState) emptyState.classList.remove('hidden');
      window.showToast(err.message || 'Sentiment analysis failed.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (btnSpinner) btnSpinner.classList.add('hidden');
      if (btnText) btnText.textContent = 'Analyze Sentiment';
      if (window.AnimationManager) {
        if (window.AnimationManager.isReducedMotion()) {
          submitBtn.style.transform = '';
          submitBtn.style.opacity = '';
        } else {
          window.AnimationManager.play(
            'fadeIn',
            submitBtn,
            { to: { scale: 1, opacity: 1, duration: 0.15 } },
            'analyze'
          );
        }
      }
    }
  },

  rehydrate(entry) {
    if (!entry) return;

    this.switchTab('single');

    const textInput = document.getElementById('analyze-text-input');
    const charCounter = document.getElementById('analyze-char-counter');

    if (textInput) {
      textInput.value = entry.text || '';
      if (charCounter) charCounter.textContent = `${textInput.value.length} / 2000`;
    }

    const data = {
      sentiment: entry.sentiment,
      confidence: entry.confidence,
      scores: entry.scores || {},
      id: entry.feedbackId || null,
      isRehydrated: true,
      timestamp: entry.timestamp,
      text: entry.text,
    };

    this.displayResults(data, 0, Boolean(entry.feedbackId));

    const latencyEl = document.getElementById('analyze-latency-tag');
    if (latencyEl) {
      latencyEl.textContent = 'Loaded from local history';
    }

    // Do NOT re-run inference or perturbation on history rehydration
    if (
      window.ExplainabilityController &&
      typeof window.ExplainabilityController.showHistoryState === 'function'
    ) {
      window.ExplainabilityController.showHistoryState();
    }

    window.showToast('Analysis rehydrated from local history.', 'info');
  },

  displayResults(data, elapsedMs, wasSaved) {
    const emptyState = document.getElementById('analyze-empty-state');
    const skeleton = document.getElementById('analyze-skeleton');
    const activeResults = document.getElementById('analyze-active-results');
    const sentimentHero = document.getElementById('analyze-sentiment-hero');
    const emojiEl = document.getElementById('analyze-sentiment-emoji');
    const labelEl = document.getElementById('analyze-sentiment-label');
    const confEl = document.getElementById('analyze-sentiment-confidence');
    const latencyEl = document.getElementById('analyze-latency-tag');
    const savedTagEl = document.getElementById('analyze-saved-tag');
    const explanationEl = document.getElementById('analyze-explanation-text');
    const rawJsonEl = document.getElementById('analyze-raw-json');

    const barPos = document.getElementById('analyze-bar-pos');
    const barNeu = document.getElementById('analyze-bar-neu');
    const barNeg = document.getElementById('analyze-bar-neg');
    const pctPos = document.getElementById('analyze-pct-pos');
    const pctNeu = document.getElementById('analyze-pct-neu');
    const pctNeg = document.getElementById('analyze-pct-neg');

    // Store active single result for Web Share
    const textInput = document.getElementById('analyze-text-input');
    this.currentSingleResult = {
      ...data,
      text: data.text || (textInput ? textInput.value.trim() : ''),
    };

    if (skeleton) skeleton.classList.add('hidden');
    if (emptyState) emptyState.classList.add('hidden');
    if (activeResults) activeResults.classList.remove('hidden');

    const isReduced = window.AnimationManager && window.AnimationManager.isReducedMotion();
    if (!isReduced && window.AnimationManager && sentimentHero) {
      window.AnimationManager.play('resultCardEnter', sentimentHero, {}, 'analyze');
    }

    if (window.ThreeRuntime && typeof window.ThreeRuntime.setAnalyzeResult === 'function') {
      window.ThreeRuntime.setAnalyzeResult(data);
    }

    if (latencyEl) {
      latencyEl.textContent = data.isRehydrated
        ? 'Loaded from local history'
        : `${elapsedMs}ms latency`;
    }
    if (savedTagEl) {
      if (data.isRehydrated) {
        if (data.id) {
          savedTagEl.textContent = `History Record (DB #${data.id})`;
          savedTagEl.className =
            'text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20';
        } else {
          savedTagEl.textContent = 'History Record (Local)';
          savedTagEl.className =
            'text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 border border-slate-500/20';
        }
      } else if (wasSaved && data.id) {
        savedTagEl.textContent = `Persisted (ID #${data.id})`;
        savedTagEl.className =
          'text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20';
      } else {
        savedTagEl.textContent = 'Ephemeral Prediction (Not Saved)';
        savedTagEl.className =
          'text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 border border-slate-500/20';
      }
    }

    const sentiment = (data.sentiment || 'unknown').toLowerCase();
    const confPct = ((data.confidence || 0) * 100).toFixed(1);

    if (confEl) confEl.textContent = `${confPct}%`;

    if (sentimentHero) {
      sentimentHero.className =
        'p-6 rounded-2xl text-center border transition-all duration-300 flex flex-col items-center justify-center';
    }

    if (sentiment === 'positive') {
      if (emojiEl) emojiEl.textContent = '🌟';
      if (labelEl) {
        labelEl.textContent = 'POSITIVE SENTIMENT';
        labelEl.className =
          'text-xl font-bold font-display uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1';
      }
      if (sentimentHero) {
        sentimentHero.classList.add(
          'bg-emerald-50',
          'dark:bg-emerald-500/10',
          'border-emerald-200',
          'dark:border-emerald-500/30'
        );
      }
      if (explanationEl) {
        explanationEl.textContent = `The model detected strong satisfaction and positive brand affinity with ${confPct}% confidence.`;
      }
    } else if (sentiment === 'neutral') {
      if (emojiEl) emojiEl.textContent = '⚖️';
      if (labelEl) {
        labelEl.textContent = 'NEUTRAL / FACTUAL';
        labelEl.className =
          'text-xl font-bold font-display uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-1';
      }
      if (sentimentHero) {
        sentimentHero.classList.add(
          'bg-blue-50',
          'dark:bg-blue-500/10',
          'border-blue-200',
          'dark:border-blue-500/30'
        );
      }
      if (explanationEl) {
        explanationEl.textContent = `The feedback appears objective, transactional, or balanced without strong emotional polarity.`;
      }
    } else if (sentiment === 'negative') {
      if (emojiEl) emojiEl.textContent = '🚨';
      if (labelEl) {
        labelEl.textContent = 'NEGATIVE SENTIMENT';
        labelEl.className =
          'text-xl font-bold font-display uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-1';
      }
      if (sentimentHero) {
        sentimentHero.classList.add(
          'bg-rose-50',
          'dark:bg-rose-500/10',
          'border-rose-200',
          'dark:border-rose-500/30'
        );
      }
      if (explanationEl) {
        explanationEl.textContent = `High risk of customer dissatisfaction or churn detected with ${confPct}% model confidence. Consider follow-up.`;
      }
    } else {
      if (emojiEl) emojiEl.textContent = '⚠️';
      if (labelEl) {
        labelEl.textContent = 'UNRECOGNIZED / GIBBERISH';
        labelEl.className =
          'text-xl font-bold font-display uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1';
      }
      if (sentimentHero) {
        sentimentHero.classList.add(
          'bg-slate-100',
          'dark:bg-slate-800',
          'border-slate-300',
          'dark:border-slate-700'
        );
      }
      if (explanationEl) {
        explanationEl.textContent = `Text appears fragmented, ambiguous, or gibberish. The heuristic validation caught this pattern.`;
      }
    }

    const scores = data.scores || {};
    const pPos = ((scores.positive || 0) * 100).toFixed(1);
    const pNeu = ((scores.neutral || 0) * 100).toFixed(1);
    const pNeg = ((scores.negative || 0) * 100).toFixed(1);

    if (pctPos) pctPos.textContent = `${pPos}%`;
    if (pctNeu) pctNeu.textContent = `${pNeu}%`;
    if (pctNeg) pctNeg.textContent = `${pNeg}%`;

    if (isReduced) {
      if (barPos) barPos.style.width = `${pPos}%`;
      if (barNeu) barNeu.style.width = `${pNeu}%`;
      if (barNeg) barNeg.style.width = `${pNeg}%`;
    } else {
      if (barPos) {
        barPos.style.transition = 'width 400ms cubic-bezier(0.2, 0.8, 0.4, 1)';
        barPos.style.width = `${pPos}%`;
      }
      if (barNeu) {
        barNeu.style.transition = 'width 400ms cubic-bezier(0.2, 0.8, 0.4, 1)';
        barNeu.style.width = `${pNeu}%`;
      }
      if (barNeg) {
        barNeg.style.transition = 'width 400ms cubic-bezier(0.2, 0.8, 0.4, 1)';
        barNeg.style.width = `${pNeg}%`;
      }
    }

    if (rawJsonEl) {
      rawJsonEl.textContent = JSON.stringify(data, null, 2);
    }
  },

  async handleShare() {
    if (!this.currentSingleResult) {
      window.showToast('Please run an analysis first to share results.', 'warning');
      return;
    }

    const shareText =
      window.BulkHelper && typeof window.BulkHelper.formatShareText === 'function'
        ? window.BulkHelper.formatShareText(this.currentSingleResult)
        : `Sentiment Pulse Analysis\nResult: ${(this.currentSingleResult.sentiment || 'unknown').toUpperCase()}`;

    // Feature-detect Web Share API
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: 'Sentiment Pulse Analysis Result',
          text: shareText,
        });
        window.showToast('Analysis result shared successfully!', 'success');
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          // User dismissed the native share sheet
          return;
        }
        console.warn('navigator.share failed, falling back to clipboard:', err);
      }
    }

    // Fallback: Clipboard API
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      try {
        await navigator.clipboard.writeText(shareText);
        window.showToast('Analysis summary copied to clipboard!', 'success');
        return;
      } catch (clipErr) {
        console.warn('Clipboard writeText failed:', clipErr);
      }
    }

    // Fallback: Temporary input element copy
    try {
      const tempArea = document.createElement('textarea');
      tempArea.value = shareText;
      tempArea.style.position = 'fixed';
      tempArea.style.opacity = '0';
      document.body.appendChild(tempArea);
      tempArea.select();
      document.execCommand('copy');
      document.body.removeChild(tempArea);
      window.showToast('Analysis summary copied to clipboard!', 'success');
    } catch {
      window.showToast('Sharing is not supported on this browser.', 'warning');
    }
  },

  // =========================================================================
  // BULK PASTE ANALYSIS METHODS
  // =========================================================================

  loadSamples() {
    const bulkInput = document.getElementById('bulk-text-input');
    const bulkRowCounter = document.getElementById('bulk-row-counter');
    const samples = [
      'The customer onboarding experience was genuinely outstanding and seamless!',
      'Standard order arrived within 3 business days via regular ground courier.',
      'Terrible product quality, the plastic hinge cracked on the very first day.',
      'Average performance for the price point, neither impressive nor terrible.',
      'Super fast response from their tier-2 technical support department!',
    ];
    if (bulkInput) {
      bulkInput.value = samples.join('\n');
      if (bulkRowCounter) {
        bulkRowCounter.textContent = `${samples.length} / 100 rows`;
      }
      const errBox = document.getElementById('bulk-validation-errors');
      if (errBox) errBox.classList.add('hidden');
      bulkInput.focus();
    }
  },

  resetBulkView() {
    const errBox = document.getElementById('bulk-validation-errors');
    const progressContainer = document.getElementById('bulk-progress-container');
    const resultsCard = document.getElementById('bulk-results-card');
    const emptyState = document.getElementById('bulk-empty-state');

    if (errBox) errBox.classList.add('hidden');
    if (progressContainer) progressContainer.classList.add('hidden');
    if (resultsCard) resultsCard.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');

    this.currentBulkResults = [];
    this.isAnalyzingBulk = false;
  },

  async executeBulkAnalysis() {
    if (this.isAnalyzingBulk) return;

    const bulkInput = document.getElementById('bulk-text-input');
    const errBox = document.getElementById('bulk-validation-errors');
    const errList = document.getElementById('bulk-validation-list');
    const submitBtn = document.getElementById('bulk-submit-btn');
    const btnSpinner = document.getElementById('bulk-btn-spinner');
    const btnText = document.getElementById('bulk-btn-text');
    const clearBtn = document.getElementById('bulk-clear-btn');
    const sampleBtn = document.getElementById('bulk-sample-btn');

    if (!bulkInput) return;
    const rawText = bulkInput.value;

    const rows =
      window.BulkHelper && typeof window.BulkHelper.parseBulkInput === 'function'
        ? window.BulkHelper.parseBulkInput(rawText)
        : rawText
            .split(/\r?\n/)
            .map((t, idx) => ({ rowNumber: idx + 1, text: t.trim() }))
            .filter((r) => r.text.length > 0);

    const validation =
      window.BulkHelper && typeof window.BulkHelper.validateBulkRows === 'function'
        ? window.BulkHelper.validateBulkRows(rows, 100, 1, 2000)
        : { valid: rows.length > 0 && rows.length <= 100, errors: [] };

    if (!validation.valid) {
      if (errBox && errList) {
        errList.innerHTML = validation.errors
          .map((e) => `<li>${window.escapeHtml ? window.escapeHtml(e.message) : e.message}</li>`)
          .join('');
        errBox.classList.remove('hidden');
      }
      window.showToast(validation.summary || 'Please correct validation errors.', 'warning');
      return;
    }

    if (errBox) errBox.classList.add('hidden');

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      window.showToast(
        'Offline Mode: Bulk ML analysis requires an active server connection. Your input is preserved.',
        'warning'
      );
      return;
    }

    // Lock controls during processing
    this.isAnalyzingBulk = true;
    if (submitBtn) submitBtn.disabled = true;
    if (btnSpinner) btnSpinner.classList.remove('hidden');
    if (btnText) btnText.textContent = 'Processing Batches...';
    if (bulkInput) bulkInput.disabled = true;
    if (clearBtn) clearBtn.disabled = true;
    if (sampleBtn) sampleBtn.disabled = true;

    const progressContainer = document.getElementById('bulk-progress-container');
    const resultsCard = document.getElementById('bulk-results-card');
    const emptyState = document.getElementById('bulk-empty-state');
    if (emptyState) emptyState.classList.add('hidden');
    if (resultsCard) resultsCard.classList.add('hidden');
    if (progressContainer) progressContainer.classList.remove('hidden');

    // Batch chunking: maximum 50 items per /predict/batch
    const chunks =
      window.Chunker && typeof window.Chunker.chunkArray === 'function'
        ? window.Chunker.chunkArray(rows, 50)
        : [rows];

    const allResults = [];
    let completed = 0;
    const total = rows.length;
    const totalBatches = chunks.length;

    try {
      for (let b = 0; b < totalBatches; b++) {
        const chunk = chunks[b];
        const currentBatch = b + 1;
        this.updateBulkProgress(
          completed,
          total,
          currentBatch,
          totalBatches,
          `Analyzing batch ${currentBatch} of ${totalBatches}...`
        );

        try {
          const texts = chunk.map((r) => r.text);
          const batchResponse = await window.api.predictBatch(texts);
          const batchResults =
            batchResponse && Array.isArray(batchResponse.results) ? batchResponse.results : [];

          for (let i = 0; i < chunk.length; i++) {
            const res = batchResults[i];
            if (res) {
              allResults.push({
                rowNumber: chunk[i].rowNumber,
                text: chunk[i].text,
                sentiment: res.sentiment,
                confidence: res.confidence,
                scores: res.scores,
                success: true,
              });
            } else {
              allResults.push({
                rowNumber: chunk[i].rowNumber,
                text: chunk[i].text,
                error: 'Missing prediction in batch response',
                success: false,
              });
            }
          }
        } catch (batchErr) {
          console.error(`Batch ${currentBatch} prediction failed:`, batchErr);
          for (let i = 0; i < chunk.length; i++) {
            allResults.push({
              rowNumber: chunk[i].rowNumber,
              text: chunk[i].text,
              error: batchErr.message || 'Batch request failed',
              success: false,
            });
          }
        }

        completed += chunk.length;
        const cooldownText =
          b < totalBatches - 1
            ? 'Rate limit cooldown (500ms)...'
            : 'Finishing results compilation...';
        this.updateBulkProgress(completed, total, currentBatch, totalBatches, cooldownText);

        // Enforce 500ms sequential cooldown between batch requests
        if (b < totalBatches - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      this.currentBulkResults = allResults;
      this.renderBulkResults(allResults);

      if (progressContainer) progressContainer.classList.add('hidden');
      if (resultsCard) resultsCard.classList.remove('hidden');

      window.showToast(
        `Bulk analysis complete (${allResults.length} customer reviews analyzed)!`,
        'success'
      );
    } catch (err) {
      console.error('Fatal bulk analysis error:', err);
      window.showToast(err.message || 'An error occurred during bulk analysis.', 'error');
    } finally {
      this.isAnalyzingBulk = false;
      if (submitBtn) submitBtn.disabled = false;
      if (btnSpinner) btnSpinner.classList.add('hidden');
      if (btnText) btnText.textContent = 'Analyze All Reviews (Ctrl+Enter)';
      if (bulkInput) bulkInput.disabled = false;
      if (clearBtn) clearBtn.disabled = false;
      if (sampleBtn) sampleBtn.disabled = false;
    }
  },

  updateBulkProgress(completed, total, currentBatch, totalBatches, sublabel) {
    const pBar = document.getElementById('bulk-progress-bar');
    const pLabel = document.getElementById('bulk-progress-label');
    const pSubLabel = document.getElementById('bulk-progress-sublabel');

    const progress =
      window.BulkHelper && typeof window.BulkHelper.formatBulkProgress === 'function'
        ? window.BulkHelper.formatBulkProgress(completed, total, currentBatch, totalBatches)
        : {
            percent: Math.round((completed / (total || 1)) * 100),
            label: `${completed}/${total} analyzed`,
          };

    if (pBar) pBar.style.width = `${progress.percent}%`;
    if (pLabel) pLabel.textContent = `Analyzing reviews: ${progress.label}`;
    if (pSubLabel) pSubLabel.textContent = sublabel || `Batch ${currentBatch} of ${totalBatches}`;
  },

  renderBulkResults(results) {
    const tableBody = document.getElementById('bulk-results-table-body');
    const mobileCards = document.getElementById('bulk-mobile-cards');

    const statTotal = document.getElementById('bulk-stat-total');
    const statPos = document.getElementById('bulk-stat-pos');
    const statNeu = document.getElementById('bulk-stat-neu');
    const statNeg = document.getElementById('bulk-stat-neg');
    const statErr = document.getElementById('bulk-stat-err');

    let countPos = 0;
    let countNeu = 0;
    let countNeg = 0;
    let countErr = 0;

    results.forEach((r) => {
      if (!r.success || r.error) {
        countErr++;
      } else if (r.sentiment === 'positive') {
        countPos++;
      } else if (r.sentiment === 'neutral') {
        countNeu++;
      } else if (r.sentiment === 'negative') {
        countNeg++;
      } else {
        countErr++;
      }
    });

    if (statTotal) statTotal.textContent = results.length;
    if (statPos) statPos.textContent = countPos;
    if (statNeu) statNeu.textContent = countNeu;
    if (statNeg) statNeg.textContent = countNeg;
    if (statErr) statErr.textContent = countErr;

    const escape = window.escapeHtml || ((str) => String(str));
    const formatPct =
      window.Formatters && typeof window.Formatters.formatPercent === 'function'
        ? window.Formatters.formatPercent
        : (val) => `${((Number(val) || 0) * 100).toFixed(1)}%`;
    const truncate =
      window.Formatters && typeof window.Formatters.truncateSnippet === 'function'
        ? window.Formatters.truncateSnippet
        : (str, max) => (str.length > max ? `${str.slice(0, max)}…` : str);

    // Desktop Table HTML
    if (tableBody) {
      tableBody.innerHTML = results
        .map((item, idx) => {
          const rowNum = item.rowNumber || idx + 1;
          const text = item.text || '';
          const snippet = truncate(text, 90);
          const needsExpand = text.length > 90;
          const targetId = `bulk-row-text-${idx}`;

          if (!item.success || item.error) {
            return `
            <tr class="hover:bg-rose-50/40 dark:hover:bg-rose-950/20 border-b border-slate-200/80 dark:border-slate-800/80 text-xs transition-colors">
              <td class="px-4 py-3 font-mono text-slate-400 font-bold">${rowNum}</td>
              <td class="px-4 py-3">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 uppercase">
                  ERROR
                </span>
              </td>
              <td class="px-4 py-3 text-slate-400 font-mono text-[11px]">—</td>
              <td class="px-4 py-3 text-slate-700 dark:text-slate-300">
                <span id="${targetId}-snippet">${escape(snippet)}</span>
                <span id="${targetId}" class="hidden">${escape(text)}</span>
                <span class="block text-[11px] text-rose-500 mt-0.5">⚠️ ${escape(item.error || 'Failed to analyze row')}</span>
              </td>
              <td class="px-4 py-3 text-right">
                ${
                  needsExpand
                    ? `<button type="button" class="bulk-text-expand-btn text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium focus:outline-none" data-target="${targetId}">Expand</button>`
                    : ''
                }
              </td>
            </tr>
          `;
          }

          const sentiment = (item.sentiment || 'unknown').toLowerCase();
          let badgeClass = 'badge-unknown';
          if (sentiment === 'positive') badgeClass = 'badge-positive';
          if (sentiment === 'neutral') badgeClass = 'badge-neutral';
          if (sentiment === 'negative') badgeClass = 'badge-negative';

          return `
          <tr class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 border-b border-slate-200/80 dark:border-slate-800/80 text-xs transition-colors">
            <td class="px-4 py-3 font-mono text-slate-400 font-bold">${rowNum}</td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badgeClass}">
                ${sentiment}
              </span>
            </td>
            <td class="px-4 py-3 font-mono text-slate-600 dark:text-slate-400 text-[11px] whitespace-nowrap">
              ${formatPct(item.confidence, 1, true)}
            </td>
            <td class="px-4 py-3 text-slate-800 dark:text-slate-200 leading-relaxed max-w-lg">
              <span id="${targetId}-snippet">${escape(snippet)}</span>
              <span id="${targetId}" class="hidden">${escape(text)}</span>
            </td>
            <td class="px-4 py-3 text-right whitespace-nowrap">
              ${
                needsExpand
                  ? `<button type="button" class="bulk-text-expand-btn text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium focus:outline-none" data-target="${targetId}">Expand</button>`
                  : ''
              }
            </td>
          </tr>
        `;
        })
        .join('');
    }

    // Mobile Cards HTML
    if (mobileCards) {
      mobileCards.innerHTML = results
        .map((item, idx) => {
          const rowNum = item.rowNumber || idx + 1;
          const text = item.text || '';
          const snippet = truncate(text, 100);
          const needsExpand = text.length > 100;
          const targetId = `bulk-card-text-${idx}`;

          if (!item.success || item.error) {
            return `
            <div class="p-4 rounded-xl saas-card border-l-4 border-l-amber-500 space-y-2 text-xs">
              <div class="flex items-center justify-between">
                <span class="font-mono text-slate-400 font-bold">#${rowNum}</span>
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 uppercase">ERROR</span>
              </div>
              <p class="text-slate-700 dark:text-slate-300">
                <span id="${targetId}-snippet">${escape(snippet)}</span>
                <span id="${targetId}" class="hidden">${escape(text)}</span>
              </p>
              <div class="text-[11px] text-rose-500">⚠️ ${escape(item.error || 'Failed')}</div>
              ${
                needsExpand
                  ? `<button type="button" class="bulk-text-expand-btn text-[11px] text-indigo-600 dark:text-indigo-400 font-medium" data-target="${targetId}">Expand Text</button>`
                  : ''
              }
            </div>
          `;
          }

          const sentiment = (item.sentiment || 'unknown').toLowerCase();
          let badgeClass = 'badge-unknown';
          if (sentiment === 'positive') badgeClass = 'badge-positive';
          if (sentiment === 'neutral') badgeClass = 'badge-neutral';
          if (sentiment === 'negative') badgeClass = 'badge-negative';

          return `
          <div class="p-4 rounded-xl saas-card space-y-2 text-xs">
            <div class="flex items-center justify-between">
              <span class="font-mono text-slate-400 font-bold">#${rowNum}</span>
              <div class="flex items-center space-x-2">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${badgeClass}">${sentiment}</span>
                <span class="font-mono text-slate-500 text-[11px]">${formatPct(item.confidence, 1, true)}</span>
              </div>
            </div>
            <p class="text-slate-800 dark:text-slate-200 leading-relaxed">
              <span id="${targetId}-snippet">${escape(snippet)}</span>
              <span id="${targetId}" class="hidden">${escape(text)}</span>
            </p>
            ${
              needsExpand
                ? `<div class="pt-1"><button type="button" class="bulk-text-expand-btn text-[11px] text-indigo-600 dark:text-indigo-400 font-medium" data-target="${targetId}">Expand Full Review</button></div>`
                : ''
            }
          </div>
        `;
        })
        .join('');
    }
  },

  exportBulkCSV() {
    if (!this.currentBulkResults || this.currentBulkResults.length === 0) {
      window.showToast('No bulk analysis results available to export.', 'warning');
      return;
    }

    try {
      const csvString =
        window.BulkHelper && typeof window.BulkHelper.generateBulkCSV === 'function'
          ? window.BulkHelper.generateBulkCSV(this.currentBulkResults)
          : 'row,text,sentiment\r\n';

      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sentiment_pulse_bulk_analysis_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      window.showToast('Bulk analysis results exported to CSV!', 'success');
    } catch (err) {
      console.error('Failed to export bulk CSV:', err);
      window.showToast('Failed to export CSV file.', 'error');
    }
  },
};

window.AnalyzeController = AnalyzeController;
