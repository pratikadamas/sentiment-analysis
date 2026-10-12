"""
Sanity check and stress-test evaluation script.
Evaluates the trained model on:
1. The original 84 hand-written sanity samples (reporting accuracy and per-class breakdown).
2. Challenging linguistic stress-test samples (negations, mixed sentiment, sarcasm, emojis).
Note: Purely diagnostic/reporting. The model is NOT tuned on these samples.
"""

import os
import sys
from collections import defaultdict

# Ensure UTF-8 output encoding for emoji support on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

# Add current workspace directory to sys.path to ensure imports work from any cwd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from model import SentimentAnalyzer
from tests.handwritten_samples import HANDWRITTEN_SAMPLES, STRESS_TEST_SAMPLES


def evaluate_handwritten_samples(analyzer: SentimentAnalyzer):
    """Evaluates and reports accuracy on the 84 hand-written sanity check samples."""
    print("=" * 75)
    print("1. EVALUATING 84 HAND-WRITTEN SANITY SAMPLES")
    print("=" * 75)

    total = len(HANDWRITTEN_SAMPLES)
    correct = 0
    class_stats = defaultdict(lambda: {"total": 0, "correct": 0})
    misclassifications = []

    for text, expected in HANDWRITTEN_SAMPLES:
        result = analyzer.predict(text)
        predicted = result["sentiment"]
        confidence = result["confidence"]
        scores = result["scores"]

        class_stats[expected]["total"] += 1
        if predicted == expected:
            correct += 1
            class_stats[expected]["correct"] += 1
        else:
            misclassifications.append({
                "text": text,
                "expected": expected,
                "predicted": predicted,
                "confidence": confidence,
                "scores": scores
            })

    overall_accuracy = (correct / total) * 100

    print(f"Total Samples: {total}")
    print(f"Correct:       {correct}/{total}")
    print(f"Accuracy:      {overall_accuracy:.2f}%\n")

    print(f"{'Class':<12} | {'Correct':<10} | {'Total':<10} | {'Accuracy':<10}")
    print("-" * 50)
    for cls in ["positive", "neutral", "negative"]:
        stats = class_stats[cls]
        cls_acc = (stats["correct"] / stats["total"]) * 100 if stats["total"] > 0 else 0.0
        print(f"{cls:<12} | {stats['correct']:<10} | {stats['total']:<10} | {cls_acc:<9.2f}%")
    print("-" * 50)

    if misclassifications:
        print(f"\nMisclassified Samples ({len(misclassifications)} total):")
        for i, m in enumerate(misclassifications, 1):
            print(f"  {i}. \"{m['text']}\"")
            print(f"     Expected:  {m['expected']}")
            print(f"     Predicted: {m['predicted']} (Confidence: {m['confidence']*100:.1f}%)")
            print(f"     Scores:    {m['scores']}")
    else:
        print("\nAll 84 sanity samples were classified correctly!")

    return overall_accuracy, class_stats, misclassifications


def run_stress_tests(analyzer: SentimentAnalyzer):
    """Evaluates linguistic edge cases and prints predictions and confidences."""
    print("\n" + "=" * 75)
    print("2. STRESS TEST EVALUATION (Edge Cases, Sarcasm, Negation, Emojis)")
    print("=" * 75)

    print(f"{'#':<3} | {'Stress Test Input':<42} | {'Predicted':<10} | {'Confidence':<10}")
    print("-" * 75)

    for i, item in enumerate(STRESS_TEST_SAMPLES, 1):
        text = item["text"]
        result = analyzer.predict(text)
        predicted = result["sentiment"].upper()
        confidence = result["confidence"] * 100
        category = item.get("category", "")

        print(f"{i:<3} | {text:<42} | {predicted:<10} | {confidence:>6.1f}%")
        # Print breakdown details
        scores = result["scores"]
        scores_str = f"neg: {scores['negative']*100:4.1f}% | neu: {scores['neutral']*100:4.1f}% | pos: {scores['positive']*100:4.1f}%"
        print(f"    --> [{category}] ({scores_str})")

    print("-" * 75)


def main():
    print("Initializing SentimentAnalyzer (loading sentiment_model.joblib)...")
    analyzer = SentimentAnalyzer()
    print("Model loaded successfully.\n")

    evaluate_handwritten_samples(analyzer)
    run_stress_tests(analyzer)


if __name__ == "__main__":
    main()
