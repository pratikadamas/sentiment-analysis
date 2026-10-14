/**
 * Sentiment Pulse - Analyze Feedback Controller (analyze.js)
 * Executes inference on single customer reviews and optionally persists them directly
 * to the customer feedback database via POST /feedback.
 */

const AnalyzeController = {
  init() {
    this.bindEvents();
  },

  bindEvents() {
    const textInput = document.getElementById('analyze-text-input');
    const charCounter = document.getElementById('analyze-char-counter');
    const analyzeBtn = document.getElementById('analyze-submit-btn');
    const clearBtn = document.getElementById('analyze-clear-btn');
    const sampleBtns = document.querySelectorAll('.analyze-sample-btn');

    if (textInput && charCounter) {
      textInput.addEventListener('input', () => {
        charCounter.textContent = `${textInput.value.length} / 2000`;
      });

      textInput.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
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

    // Toggle developer JSON inspection
    const toggleJsonBtn = document.getElementById('analyze-toggle-json');
    const jsonDrawer = document.getElementById('analyze-json-drawer');
    if (toggleJsonBtn && jsonDrawer) {
      toggleJsonBtn.addEventListener('click', () => {
        jsonDrawer.classList.toggle('hidden');
      });
    }
  },

  resetResults() {
    const emptyState = document.getElementById('analyze-empty-state');
    const skeleton = document.getElementById('analyze-skeleton');
    const activeResults = document.getElementById('analyze-active-results');
    if (skeleton) skeleton.classList.add('hidden');
    if (activeResults) activeResults.classList.add('hidden');
    if (emptyState) emptyState.classList.remove('hidden');
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

    const shouldSave = saveCheckbox ? saveCheckbox.checked : true;
    const category = categoryInput ? categoryInput.value.trim() : null;
    const source = sourceInput ? sourceInput.value.trim() : 'web';
    let rating = ratingInput && ratingInput.value ? parseInt(ratingInput.value, 10) : null;
    if (rating && (rating < 1 || rating > 5)) rating = null;

    // Set loading state (button spinner for submit feedback + card skeleton for data visualization)
    if (submitBtn) submitBtn.disabled = true;
    if (btnSpinner) btnSpinner.classList.remove('hidden');
    if (btnText) btnText.textContent = shouldSave ? 'Analyzing & Saving...' : 'Analyzing...';

    const skeleton = document.getElementById('analyze-skeleton');
    const emptyState = document.getElementById('analyze-empty-state');
    const activeResults = document.getElementById('analyze-active-results');
    if (emptyState) emptyState.classList.add('hidden');
    if (activeResults) activeResults.classList.add('hidden');
    if (skeleton) skeleton.classList.remove('hidden');

    const t0 = performance.now();

    try {
      let result;
      if (shouldSave) {
        // Calls POST /feedback (infers sentiment AND persists record)
        result = await window.api.createFeedback({
          text,
          category: category || null,
          source: source || 'web',
          rating: rating || null,
        });
        window.showToast(`Feedback saved to database (#${result.id})!`, 'success');
        // Notify other components to refresh their state
        window.dispatchEvent(new CustomEvent('feedback-created', { detail: result }));
      } else {
        // Calls POST /predict (inference only)
        result = await window.api.predict(text);
        window.showToast('Sentiment predicted successfully!', 'success');
      }

      const elapsed = Math.round(performance.now() - t0);
      this.displayResults(result, elapsed, shouldSave);
    } catch (err) {
      console.error('Inference error:', err);
      if (skeleton) skeleton.classList.add('hidden');
      if (emptyState) emptyState.classList.remove('hidden');
      window.showToast(err.message || 'Sentiment analysis failed.', 'error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (btnSpinner) btnSpinner.classList.add('hidden');
      if (btnText) btnText.textContent = 'Analyze Sentiment';
    }
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

    if (skeleton) skeleton.classList.add('hidden');
    if (emptyState) emptyState.classList.add('hidden');
    if (activeResults) activeResults.classList.remove('hidden');

    if (latencyEl) latencyEl.textContent = `${elapsedMs}ms latency`;
    if (savedTagEl) {
      if (wasSaved && data.id) {
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

    // Reset styles
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

    // Probability Bars
    const scores = data.scores || {};
    const pPos = ((scores.positive || 0) * 100).toFixed(1);
    const pNeu = ((scores.neutral || 0) * 100).toFixed(1);
    const pNeg = ((scores.negative || 0) * 100).toFixed(1);

    if (pctPos) pctPos.textContent = `${pPos}%`;
    if (pctNeu) pctNeu.textContent = `${pNeu}%`;
    if (pctNeg) pctNeg.textContent = `${pNeg}%`;

    setTimeout(() => {
      if (barPos) barPos.style.width = `${pPos}%`;
      if (barNeu) barNeu.style.width = `${pNeu}%`;
      if (barNeg) barNeg.style.width = `${pNeg}%`;
    }, 50);

    // Raw JSON viewer
    if (rawJsonEl) {
      rawJsonEl.textContent = JSON.stringify(data, null, 2);
    }
  },
};

window.AnalyzeController = AnalyzeController;
