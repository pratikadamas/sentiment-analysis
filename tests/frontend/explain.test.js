import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
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
} from '../../static/js/explain.js';

describe('Explainability Constants', () => {
  test('constants have expected values per specification', () => {
    assert.equal(EXPLAIN_TEXT_CAP, 300);
    assert.equal(MAX_EXPLAIN_TOKENS, 30);
    assert.equal(MAX_BATCH_SIZE, 50);
    assert.equal(INFLUENCE_THRESHOLD, 0.01);
    assert.ok(STOPWORDS.has('the'));
    assert.ok(STOPWORDS.has('and'));
    assert.ok(STOPWORDS.has('is'));
  });
});

describe('Token Extraction & Filtering (A, B, C, D, K, L)', () => {
  test('extracts meaningful candidate tokens with start and end indices (A)', () => {
    const text = 'Exceptional battery performance and brilliant display.';
    const { tokens, isOverCap } = extractExplainTokens(text);

    assert.equal(isOverCap, false);
    assert.ok(tokens.length >= 4);

    const first = tokens[0];
    assert.equal(first.word, 'Exceptional');
    assert.equal(first.start, 0);
    assert.equal(first.end, 11);
    assert.equal(text.slice(first.start, first.end), 'Exceptional');
  });

  test('excludes stopwords from candidate tokens (B)', () => {
    const text = 'The service was very good and they were extremely helpful.';
    const { tokens } = extractExplainTokens(text);

    const words = tokens.map((t) => t.normalized);
    // Common stopwords 'the', 'was', 'very', 'and', 'they', 'were' should be filtered
    assert.ok(!words.includes('the'));
    assert.ok(!words.includes('was'));
    assert.ok(!words.includes('and'));
    assert.ok(!words.includes('they'));
    assert.ok(!words.includes('were'));

    // Meaningful words should be retained
    assert.ok(words.includes('service'));
    assert.ok(words.includes('good'));
    assert.ok(words.includes('extremely'));
    assert.ok(words.includes('helpful'));
  });

  test('handles punctuation without corrupting token positions (C)', () => {
    const text = 'Quick, responsive, and polite! Highly recommend (10/10).';
    const { tokens } = extractExplainTokens(text);

    for (const token of tokens) {
      assert.equal(text.slice(token.start, token.end), token.word);
      // Tokens themselves should not contain trailing punctuation like commas or exclamation marks
      assert.ok(!token.word.includes(','));
      assert.ok(!token.word.includes('!'));
      assert.ok(!token.word.includes('('));
      assert.ok(!token.word.includes(')'));
    }
  });

  test('enforces maximum ~30 selected tokens cap (D)', () => {
    // Generate text with 45 unique meaningful words
    const words = [];
    for (let i = 1; i <= 45; i++) {
      words.push(`feature${i}`);
    }
    const longText = words.join(' ');
    // Ensure text under 300 chars
    const sliceText = longText.slice(0, 290);
    const { tokens } = extractExplainTokens(sliceText, { maxTokens: 30 });

    assert.ok(tokens.length <= 30);
  });

  test('handles empty, null, undefined, and non-string inputs safely (K)', () => {
    assert.deepEqual(extractExplainTokens(''), { tokens: [], isOverCap: false });
    assert.deepEqual(extractExplainTokens('   '), { tokens: [], isOverCap: false });
    assert.deepEqual(extractExplainTokens(null), { tokens: [], isOverCap: false });
    assert.deepEqual(extractExplainTokens(undefined), { tokens: [], isOverCap: false });
    assert.deepEqual(extractExplainTokens(12345), { tokens: [], isOverCap: false });
    assert.deepEqual(extractExplainTokens({}), { tokens: [], isOverCap: false });
  });

  test('enforces long-text cap (>300 characters) behavior (L)', () => {
    const longText = 'a'.repeat(301);
    const { tokens, isOverCap } = extractExplainTokens(longText);

    assert.equal(isOverCap, true);
    assert.deepEqual(tokens, []);

    // Text exactly at 300 characters should be allowed
    const valid300 = 'Great customer support team! '.repeat(10) + 'A'.repeat(10);
    assert.equal(valid300.length, 300);
    const res300 = extractExplainTokens(valid300);
    assert.equal(res300.isOverCap, false);
    assert.ok(res300.tokens.length > 0);
  });
});

describe('Masked Variant Generation (E, F, M)', () => {
  test('generates masked variants replacing tokens with "___" (E)', () => {
    const text = 'The service was extremely helpful';
    const { tokens } = extractExplainTokens(text);
    const { variants } = generateMaskedVariants(text, tokens);

    assert.ok(variants.length > 0);
    // Find the variant where 'extremely' is masked
    const extremelyVariant = variants.find((v) => v === 'The service was ___ helpful');
    assert.ok(extremelyVariant, 'Should contain variant with "extremely" masked with "___"');
  });

  test('produces exactly one variant per selected token (F)', () => {
    const text = 'Fast checkout and friendly staff';
    const { tokens } = extractExplainTokens(text);
    const { variants, tokens: selectedTokens } = generateMaskedVariants(text, tokens);

    assert.equal(variants.length, tokens.length);
    assert.equal(selectedTokens.length, tokens.length);

    // Verify each variant masks the exact token position
    selectedTokens.forEach((token, idx) => {
      const variant = variants[idx];
      const expected = text.slice(0, token.start) + '___' + text.slice(token.end);
      assert.equal(variant, expected);
    });
  });

  test('batch size never exceeds 50 variants (M)', () => {
    const text = 'sample text';
    // Create mock array of 60 tokens
    const dummyTokens = Array.from({ length: 60 }, (_, i) => ({
      word: `w${i}`,
      start: 0,
      end: 1,
      index: i,
    }));

    const { variants, tokens: maskedTokens } = generateMaskedVariants(text, dummyTokens);
    assert.ok(variants.length <= 50);
    assert.ok(maskedTokens.length <= 50);
  });

  test('handles empty or invalid inputs gracefully', () => {
    assert.deepEqual(generateMaskedVariants('', []), { variants: [], tokens: [] });
    assert.deepEqual(generateMaskedVariants(null, null), { variants: [], tokens: [] });
    assert.deepEqual(generateMaskedVariants('some text', []), { variants: [], tokens: [] });
  });
});

describe('Delta Calculation and Influence Classification (G, H, I, J)', () => {
  test('calculates token score delta deterministically (G)', () => {
    // Original positive score 0.95, masked positive score 0.70
    const delta1 = calculateTokenDelta(0.95, 0.7);
    assert.equal(delta1, 0.25);

    // Original positive score 0.60, masked positive score 0.85 (negative impact)
    const delta2 = calculateTokenDelta(0.6, 0.85);
    assert.equal(delta2, -0.25);

    // No change
    const delta3 = calculateTokenDelta(0.85, 0.85);
    assert.equal(delta3, 0);

    // Handles null / undefined scores safely
    assert.equal(calculateTokenDelta(null, 0.5), -0.5);
    assert.equal(calculateTokenDelta(0.5, undefined), 0.5);
  });

  test('classifies positive influence (supported prediction) when delta >= threshold (H)', () => {
    assert.equal(classifyInfluence(0.25), 'positive');
    assert.equal(classifyInfluence(0.01), 'positive');
    assert.equal(classifyInfluence(0.05, 0.02), 'positive');
  });

  test('classifies negative influence (opposed prediction) when delta <= -threshold (I)', () => {
    assert.equal(classifyInfluence(-0.25), 'negative');
    assert.equal(classifyInfluence(-0.01), 'negative');
    assert.equal(classifyInfluence(-0.05, 0.02), 'negative');
  });

  test('handles neutral or minimal influence when |delta| < threshold (J)', () => {
    assert.equal(classifyInfluence(0.005), 'neutral');
    assert.equal(classifyInfluence(-0.005), 'neutral');
    assert.equal(classifyInfluence(0), 'neutral');
    assert.equal(classifyInfluence(0.009), 'neutral');
    assert.equal(classifyInfluence(-0.009), 'neutral');
    assert.equal(classifyInfluence(NaN), 'neutral');
  });
});

describe('computeExplainability Integration', () => {
  test('integrates original result and batch results into complete token influence data', () => {
    const origResult = {
      sentiment: 'positive',
      confidence: 0.9,
      scores: { positive: 0.9, neutral: 0.08, negative: 0.02 },
    };

    const tokens = [
      { word: 'brilliant', start: 0, end: 9, index: 0 },
      { word: 'slow', start: 14, end: 18, index: 1 },
      { word: 'device', start: 19, end: 25, index: 2 },
    ];

    // Simulated masked predictions
    const batchResults = [
      // When 'brilliant' is masked, positive score drops to 0.65 (delta = +0.25 -> positive)
      { sentiment: 'positive', scores: { positive: 0.65, neutral: 0.25, negative: 0.1 } },
      // When 'slow' is masked, positive score rises to 0.96 (delta = -0.06 -> negative)
      { sentiment: 'positive', scores: { positive: 0.96, neutral: 0.03, negative: 0.01 } },
      // When 'device' is masked, positive score remains 0.90 (delta = 0.00 -> neutral)
      { sentiment: 'positive', scores: { positive: 0.9, neutral: 0.08, negative: 0.02 } },
    ];

    const influences = computeExplainability(origResult, batchResults, tokens);

    assert.equal(influences.length, 3);

    // Token 0: brilliant
    assert.equal(influences[0].word, 'brilliant');
    assert.equal(influences[0].direction, 'positive');
    assert.equal(influences[0].delta, 0.25);
    assert.equal(influences[0].deltaPercent, 25.0);

    // Token 1: slow
    assert.equal(influences[1].word, 'slow');
    assert.equal(influences[1].direction, 'negative');
    assert.equal(influences[1].delta, -0.06);
    assert.equal(influences[1].deltaPercent, -6.0);

    // Token 2: device
    assert.equal(influences[2].word, 'device');
    assert.equal(influences[2].direction, 'neutral');
    assert.equal(influences[2].delta, 0);
  });

  test('handles empty or malformed inputs cleanly', () => {
    assert.deepEqual(computeExplainability(null, [], []), []);
    assert.deepEqual(computeExplainability({}, null, []), []);
    assert.deepEqual(computeExplainability({}, [], null), []);
  });
});
