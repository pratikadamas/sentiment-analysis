/**
 * Sentiment Pulse - Explainability Module (explain.js)
 * Implements client-side, approximate word influence attribution via token perturbation (leave-one-out masking)
 * using the existing /predict/batch endpoint.
 *
 * Notice: "Approximate word influence — heuristic, not model-true."
 * The model does not natively provide token attributions. This heuristic evaluates prediction sensitivity
 * by masking individual tokens with "___" and measuring score deltas.
 */

export const EXPLAIN_TEXT_CAP = 300;
export const MAX_EXPLAIN_TOKENS = 30;
export const MAX_BATCH_SIZE = 50;
export const INFLUENCE_THRESHOLD = 0.01; // 1.0% score shift threshold

export const STOPWORDS = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'am',
  'an',
  'and',
  'any',
  'are',
  "aren't",
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  "can't",
  'cannot',
  'could',
  "couldn't",
  'did',
  "didn't",
  'do',
  'does',
  "doesn't",
  'doing',
  "don't",
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  "hadn't",
  'has',
  "hasn't",
  'have',
  "haven't",
  'having',
  'he',
  "he'd",
  "he'll",
  "he's",
  'her',
  'here',
  "here's",
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  "how's",
  'i',
  "i'd",
  "i'll",
  "i'm",
  "i've",
  'if',
  'in',
  'into',
  'is',
  "isn't",
  'it',
  "it's",
  'its',
  'itself',
  "let's",
  'me',
  'more',
  'most',
  "mustn't",
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'ought',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  "shan't",
  'she',
  "she'd",
  "she'll",
  "she's",
  'should',
  "shouldn't",
  'so',
  'some',
  'such',
  'than',
  'that',
  "that's",
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  "there's",
  'these',
  'they',
  "they'd",
  "they'll",
  "they're",
  "they've",
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  "wasn't",
  'we',
  "we'd",
  "we'll",
  "we're",
  "we've",
  'were',
  "weren't",
  'what',
  "what's",
  'when',
  "when's",
  'where',
  "where's",
  'which',
  'while',
  'who',
  "who's",
  'whom',
  'why',
  "why's",
  'with',
  "won't",
  'would',
  "wouldn't",
  'you',
  "you'd",
  "you'll",
  "you're",
  "you've",
  'your',
  'yours',
  'yourself',
  'yourselves',
]);

/**
 * Pure Function: Extract meaningful candidate tokens from text.
 * Excludes stopwords, punctuation, and single characters.
 * Caps output at maxTokens (default 30).
 *
 * @param {string} text - Raw input review text.
 * @param {Object} [options={}] - Configurable options.
 * @param {number} [options.maxTokens=30] - Maximum tokens to extract.
 * @param {number} [options.maxChars=300] - Text length cap.
 * @returns {{ tokens: Array<{word: string, rawWord: string, start: number, end: number, index: number}>, isOverCap: boolean }}
 */
export function extractExplainTokens(text, options = {}) {
  const maxTokens = options.maxTokens || MAX_EXPLAIN_TOKENS;
  const maxChars = options.maxChars || EXPLAIN_TEXT_CAP;

  if (typeof text !== 'string' || !text.trim()) {
    return { tokens: [], isOverCap: false };
  }

  if (text.length > maxChars) {
    return { tokens: [], isOverCap: true };
  }

  const tokens = [];
  // Match word characters, including contractions with apostrophes
  const wordRegex = /[a-zA-Z0-9]+(?:['’][a-zA-Z0-9]+)*/g;
  let match;

  while ((match = wordRegex.exec(text)) !== null) {
    const rawWord = match[0];
    const normalized = rawWord.toLowerCase();

    // Exclude stopwords, single characters, or numeric-only strings
    if (STOPWORDS.has(normalized)) continue;
    if (rawWord.length < 2) continue;
    if (/^\d+$/.test(rawWord)) continue;

    tokens.push({
      word: rawWord,
      normalized,
      start: match.index,
      end: match.index + rawWord.length,
      index: tokens.length,
    });

    if (tokens.length >= maxTokens) {
      break;
    }
  }

  return { tokens, isOverCap: false };
}

/**
 * Pure Function: Generate masked text variants for perturbation analysis.
 * Replaces each selected token in the original text with "___".
 *
 * @param {string} text - The original input text.
 * @param {Array<Object>} tokens - Array of token objects with start and end positions.
 * @param {Object} [options={}] - Options (e.g. mask string).
 * @returns {{ variants: string[], tokens: Array<Object> }}
 */
export function generateMaskedVariants(text, tokens, options = {}) {
  const mask = options.mask || '___';
  const maxBatch = options.maxBatch || MAX_BATCH_SIZE;

  if (typeof text !== 'string' || !Array.isArray(tokens) || tokens.length === 0) {
    return { variants: [], tokens: [] };
  }

  const selectedTokens = tokens.slice(0, maxBatch);
  const variants = selectedTokens.map((token) => {
    return text.slice(0, token.start) + mask + text.slice(token.end);
  });

  return { variants, tokens: selectedTokens };
}

/**
 * Pure Function: Calculate delta between original score and masked score.
 * A positive delta means removing the word decreased the score for the predicted label,
 * indicating the token supported the prediction.
 *
 * @param {number} origScore - Original score for predicted label (0.0 to 1.0).
 * @param {number} maskedScore - Masked score for predicted label (0.0 to 1.0).
 * @returns {number} Score difference.
 */
export function calculateTokenDelta(origScore, maskedScore) {
  const o = typeof origScore === 'number' && Number.isFinite(origScore) ? origScore : 0;
  const m = typeof maskedScore === 'number' && Number.isFinite(maskedScore) ? maskedScore : 0;
  return Number((o - m).toFixed(4));
}

/**
 * Pure Function: Classify influence direction based on score delta.
 *
 * @param {number} delta - Delta from calculateTokenDelta.
 * @param {number} [threshold=0.01] - Minimum change to be considered directional.
 * @returns {'positive'|'negative'|'neutral'}
 */
export function classifyInfluence(delta, threshold = INFLUENCE_THRESHOLD) {
  if (typeof delta !== 'number' || Number.isNaN(delta)) {
    return 'neutral';
  }
  if (delta >= threshold) {
    return 'positive'; // Pushed toward predicted label
  }
  if (delta <= -threshold) {
    return 'negative'; // Pushed against predicted label
  }
  return 'neutral'; // Minimal influence
}

/**
 * Pure Function: Map batch perturbation prediction results back to tokens.
 *
 * @param {Object} origResult - Main analysis result object { sentiment, confidence, scores }.
 * @param {Array<Object>} batchResults - Array of SentimentResponse objects from POST /predict/batch.
 * @param {Array<Object>} tokens - Array of perturbed tokens.
 * @param {Object} [options={}] - Options (e.g. threshold).
 * @returns {Array<Object>} Array of token influence objects.
 */
export function computeExplainability(origResult, batchResults, tokens, options = {}) {
  if (!origResult || !Array.isArray(batchResults) || !Array.isArray(tokens)) {
    return [];
  }

  const targetSentiment = (origResult.sentiment || 'unknown').toLowerCase();
  const origScores = origResult.scores || {};
  const origScore =
    typeof origScores[targetSentiment] === 'number'
      ? origScores[targetSentiment]
      : typeof origResult.confidence === 'number'
        ? origResult.confidence
        : 0;

  const threshold = options.threshold !== undefined ? options.threshold : INFLUENCE_THRESHOLD;

  return tokens.map((token, i) => {
    const maskedRes = batchResults[i];
    let maskedScore = origScore;

    if (maskedRes && typeof maskedRes === 'object') {
      const maskedScores = maskedRes.scores || {};
      if (typeof maskedScores[targetSentiment] === 'number') {
        maskedScore = maskedScores[targetSentiment];
      } else if (typeof maskedRes.confidence === 'number') {
        maskedScore = maskedRes.confidence;
      }
    }

    const delta = calculateTokenDelta(origScore, maskedScore);
    const direction = classifyInfluence(delta, threshold);

    return {
      ...token,
      origScore,
      maskedScore,
      delta,
      deltaPercent: Number((delta * 100).toFixed(1)),
      direction,
      targetSentiment,
    };
  });
}

/**
 * Controller: ExplainabilityController
 * Manages DOM rendering, asynchronous perturbation API calls, user interaction,
 * accessible tooltips, and state transitions.
 */
export const ExplainabilityController = {
  currentText: '',
  currentResult: null,
  isExplaining: false,
  activeInfluences: [],

  init() {
    this.bindEvents();
  },

  bindEvents() {
    // Delegated interaction for token badges inside highlighted container
    const container = document.getElementById('explain-highlighted-text');
    if (container) {
      container.addEventListener('click', (e) => {
        const badge = e.target.closest('[data-token-idx]');
        if (badge) {
          const idx = parseInt(badge.getAttribute('data-token-idx'), 10);
          this.setActiveToken(idx);
        }
      });

      container.addEventListener('focusin', (e) => {
        const badge = e.target.closest('[data-token-idx]');
        if (badge) {
          const idx = parseInt(badge.getAttribute('data-token-idx'), 10);
          this.setActiveToken(idx);
        }
      });
    }
  },

  reset() {
    this.currentText = '';
    this.currentResult = null;
    this.isExplaining = false;
    this.activeInfluences = [];

    const section = document.getElementById('analyze-explainability-section');
    const loading = document.getElementById('explain-loading');
    const capNotice = document.getElementById('explain-cap-notice');
    const emptyNotice = document.getElementById('explain-empty-notice');
    const content = document.getElementById('explain-content');

    if (section) section.classList.remove('hidden');
    if (loading) loading.classList.add('hidden');
    if (capNotice) capNotice.classList.add('hidden');
    if (emptyNotice) emptyNotice.classList.add('hidden');
    if (content) content.classList.add('hidden');
  },

  /**
   * Called when rehydrating a historical record.
   * Explainability is intentionally NOT re-run to avoid redundant inference requests.
   */
  showHistoryState() {
    this.reset();
    const capNotice = document.getElementById('explain-cap-notice');
    const capChars = document.getElementById('explain-cap-chars');
    if (capNotice && capChars) {
      capNotice.classList.remove('hidden');
      capNotice.innerHTML = `
        <span class="font-semibold text-slate-700 dark:text-slate-300 block mb-0.5">ℹ️ Rehydrated From History</span>
        Approximate word influence was computed during the initial live analysis. History views present the stored result without generating new perturbation inference requests.
      `;
    }
  },

  /**
   * Primary entry point called after a single live analysis finishes rendering.
   * Executes perturbation asynchronously without blocking main UI.
   *
   * @param {string} text - Analyzed text review.
   * @param {Object} result - Analysis prediction result.
   */
  async explain(text, result) {
    if (!text || typeof text !== 'string' || !result) {
      this.reset();
      return;
    }

    this.currentText = text;
    this.currentResult = result;
    this.activeInfluences = [];

    const section = document.getElementById('analyze-explainability-section');
    const loading = document.getElementById('explain-loading');
    const capNotice = document.getElementById('explain-cap-notice');
    const emptyNotice = document.getElementById('explain-empty-notice');
    const content = document.getElementById('explain-content');
    const capChars = document.getElementById('explain-cap-chars');

    if (section) section.classList.remove('hidden');
    if (capNotice) capNotice.classList.add('hidden');
    if (emptyNotice) emptyNotice.classList.add('hidden');
    if (content) content.classList.add('hidden');

    // Requirement 3: Text length cap <= 300 characters
    if (text.length > EXPLAIN_TEXT_CAP) {
      if (loading) loading.classList.add('hidden');
      if (capNotice) {
        capNotice.classList.remove('hidden');
        if (capChars) capChars.textContent = text.length;
      }
      return;
    }

    // Phase 6: Offline handling
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      if (loading) loading.classList.add('hidden');
      if (capNotice) {
        capNotice.classList.remove('hidden');
        capNotice.innerHTML = `
          <span class="font-semibold text-slate-700 dark:text-slate-300 block mb-0.5">📡 Explainability Unavailable Offline</span>
          Approximate word attribution requires batch server inference. Reconnect to calculate token sensitivity.
        `;
      }
      return;
    }

    // Step 1: Token extraction
    const { tokens, isOverCap } = extractExplainTokens(text, {
      maxTokens: MAX_EXPLAIN_TOKENS,
      maxChars: EXPLAIN_TEXT_CAP,
    });

    if (isOverCap) {
      if (loading) loading.classList.add('hidden');
      if (capNotice) capNotice.classList.remove('hidden');
      return;
    }

    if (!tokens || tokens.length === 0) {
      if (loading) loading.classList.add('hidden');
      if (emptyNotice) emptyNotice.classList.remove('hidden');
      return;
    }

    // Step 2: Show loading state inside explainability container
    if (loading) loading.classList.remove('hidden');
    this.isExplaining = true;

    try {
      // Step 3: Token perturbation (generate variants with "___")
      const { variants, tokens: maskedTokens } = generateMaskedVariants(text, tokens, {
        mask: '___',
        maxBatch: MAX_BATCH_SIZE,
      });

      if (variants.length === 0) {
        if (loading) loading.classList.add('hidden');
        if (emptyNotice) emptyNotice.classList.remove('hidden');
        return;
      }

      // Step 4: Batch inference request (CRITICAL: Exactly ONE POST /predict/batch request)
      const batchRes = await window.api.predictBatch(variants);
      const results = batchRes && Array.isArray(batchRes.results) ? batchRes.results : [];

      if (results.length === 0) {
        throw new Error('Batch inference returned no results');
      }

      // Step 5: Delta calculation & classification
      const influences = computeExplainability(result, results, maskedTokens);
      this.activeInfluences = influences;

      if (loading) loading.classList.add('hidden');
      if (content) content.classList.remove('hidden');

      // Step 6: Render highlighted text overlay & inspector
      this.renderHighlights(text, influences, result.sentiment);
      if (influences.length > 0) {
        this.setActiveToken(0);
      }
    } catch (err) {
      console.warn('Explainability perturbation analysis degraded gracefully:', err);
      if (loading) loading.classList.add('hidden');
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (capNotice) {
          capNotice.classList.remove('hidden');
          capNotice.innerHTML = `
            <span class="font-semibold text-slate-700 dark:text-slate-300 block mb-0.5">📡 Explainability Unavailable Offline</span>
            Approximate word attribution requires batch server inference. Reconnect to calculate token sensitivity.
          `;
        }
      } else if (emptyNotice) {
        emptyNotice.classList.remove('hidden');
        emptyNotice.textContent =
          'Word influence currently unavailable (prediction sensitivity calculation timed out).';
      }
    } finally {
      this.isExplaining = false;
    }
  },

  /**
   * Render original text with highlighted tokens mapped precisely by character indices.
   *
   * @param {string} fullText - Original untouched review text.
   * @param {Array<Object>} influences - Tokens with deltas and influence classifications.
   * @param {string} sentiment - Predicted sentiment label.
   */
  renderHighlights(fullText, influences, sentiment) {
    const container = document.getElementById('explain-highlighted-text');
    if (!container) return;

    if (!influences || influences.length === 0) {
      container.textContent = fullText;
      return;
    }

    // Build segment HTML preserving all original characters and whitespace
    let html = '';
    let cursor = 0;

    influences.forEach((item, idx) => {
      // Append preceding unhighlighted segment
      if (item.start > cursor) {
        html += window.escapeHtml(fullText.slice(cursor, item.start));
      }

      const escapedWord = window.escapeHtml(item.word);
      const sign = item.delta >= 0 ? '+' : '';
      const deltaStr = `${sign}${item.deltaPercent}%`;
      const directionLabel =
        item.direction === 'positive'
          ? `Supported ${sentiment}`
          : item.direction === 'negative'
            ? `Opposed ${sentiment}`
            : 'Minimal impact';

      let colorClasses =
        'bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700';
      if (item.direction === 'positive') {
        colorClasses =
          'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 font-semibold';
      } else if (item.direction === 'negative') {
        colorClasses =
          'bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-700/60 font-semibold';
      }

      html += `<span 
        data-token-idx="${idx}"
        tabindex="0"
        role="button"
        aria-label="${escapedWord}: ${deltaStr} influence (${directionLabel})"
        title="${escapedWord}: ${deltaStr} (${directionLabel})"
        class="explain-token inline-block px-1.5 py-0.5 my-0.5 rounded transition-transform cursor-pointer hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${colorClasses}"
      >${escapedWord}</span>`;

      cursor = item.end;
    });

    // Append any trailing characters
    if (cursor < fullText.length) {
      html += window.escapeHtml(fullText.slice(cursor));
    }

    container.innerHTML = html;

    // Phase 4: Sequential token influence bars / badges animation with bounded stagger
    const isReduced = window.AnimationManager && window.AnimationManager.isReducedMotion();
    if (!isReduced) {
      const badges = container.querySelectorAll('.explain-token');
      if (badges.length > 0) {
        badges.forEach((b, i) => {
          b.style.opacity = '0';
          b.style.transform = 'scale(0.95) translateY(2px)';
          const delay = Math.min(i * 35, 450);
          setTimeout(() => {
            b.style.transition = 'opacity 180ms ease-out, transform 180ms cubic-bezier(0.2, 0.8, 0.4, 1)';
            b.style.opacity = '1';
            b.style.transform = 'none';
          }, delay);
        });
      }
    }
  },

  /**
   * Set active token in the inspector bar.
   *
   * @param {number} idx - Token index in activeInfluences.
   */
  setActiveToken(idx) {
    const item = this.activeInfluences[idx];
    if (!item) return;

    const wordEl = document.getElementById('explain-active-word');
    const dirEl = document.getElementById('explain-active-direction');
    const deltaEl = document.getElementById('explain-active-delta');

    if (wordEl) wordEl.textContent = `"${item.word}"`;

    const sign = item.delta >= 0 ? '+' : '';
    const deltaStr = `${sign}${item.deltaPercent}%`;

    if (deltaEl) {
      deltaEl.textContent = deltaStr;
      if (item.direction === 'positive') {
        deltaEl.className = 'font-mono font-bold text-xs text-emerald-600 dark:text-emerald-400';
      } else if (item.direction === 'negative') {
        deltaEl.className = 'font-mono font-bold text-xs text-rose-600 dark:text-rose-400';
      } else {
        deltaEl.className = 'font-mono font-bold text-xs text-slate-500 dark:text-slate-400';
      }
    }

    if (dirEl) {
      if (item.direction === 'positive') {
        dirEl.textContent = `Supported ${item.targetSentiment} prediction`;
        dirEl.className =
          'font-medium text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20';
      } else if (item.direction === 'negative') {
        dirEl.textContent = `Opposed ${item.targetSentiment} prediction`;
        dirEl.className =
          'font-medium text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20';
      } else {
        dirEl.textContent = 'Neutral / minimal impact (<1%)';
        dirEl.className =
          'font-medium text-[10px] px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-600';
      }

      if (window.MicroInteractions && typeof window.MicroInteractions.badgePop === 'function') {
        window.MicroInteractions.badgePop(dirEl);
      }
    }
  },
};

// Global attachment for script tag and inline handlers
if (typeof window !== 'undefined') {
  window.ExplainHelper = {
    EXPLAIN_TEXT_CAP,
    MAX_EXPLAIN_TOKENS,
    MAX_BATCH_SIZE,
    INFLUENCE_THRESHOLD,
    STOPWORDS,
    extractExplainTokens,
    generateMaskedVariants,
    calculateTokenDelta,
    classifyInfluence,
    computeExplainability,
  };
  window.ExplainabilityController = ExplainabilityController;
}
