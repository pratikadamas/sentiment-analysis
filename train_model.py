"""
Model Training Script for 3-Class Sentiment Analysis (Positive, Neutral, Negative)
Trained on Yelp Review Full dataset with Scikit-Learn.
Pipeline: TfidfVectorizer + LogisticRegression, calibrated using CalibratedClassifierCV(method="sigmoid", cv=3).
Hyperparameter tuning on validation set only. Final evaluation once on test set.
"""

import os
import sys
import json
from datetime import datetime, timezone
import pandas as pd
import joblib

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    classification_report,
    confusion_matrix,
    ConfusionMatrixDisplay
)


def load_dataset_splits(data_dir: str = "data"):
    """
    Loads train, val, and test splits from CSV files.
    Fails with a clear message telling the user to run prepare_data.py if missing.
    """
    train_path = os.path.join(data_dir, "train.csv")
    val_path = os.path.join(data_dir, "val.csv")
    test_path = os.path.join(data_dir, "test.csv")

    missing = [p for p in (train_path, val_path, test_path) if not os.path.exists(p)]
    if missing:
        msg = (
            f"\n[ERROR] Missing required dataset split file(s): {missing}\n"
            "Please run `python prepare_data.py` first to generate and prepare the Yelp dataset splits.\n"
        )
        print(msg, file=sys.stderr)
        raise FileNotFoundError(msg)

    print(f"Loading dataset splits from '{data_dir}/'...")
    train_df = pd.read_csv(train_path).dropna(subset=["text", "label"])
    val_df = pd.read_csv(val_path).dropna(subset=["text", "label"])
    test_df = pd.read_csv(test_path).dropna(subset=["text", "label"])

    print(f"  Train set:      {len(train_df):,} samples")
    print(f"  Validation set: {len(val_df):,} samples")
    print(f"  Test set:       {len(test_df):,} samples")

    return train_df, val_df, test_df


def tune_hyperparameters(X_train, y_train, X_val, y_val):
    """
    Tune C in [0.5, 1, 3, 10] and ngram_range in [(1,1), (1,2)] using the VALIDATION set only.
    Optimizes for validation macro-F1.
    Prints the results table and returns the best hyperparameters.
    """
    C_values = [0.5, 1.0, 3.0, 10.0]
    ngram_ranges = [(1, 1), (1, 2)]

    results = []
    print("\n" + "=" * 66)
    print("HYPERPARAMETER TUNING ON VALIDATION SET (macro-F1)")
    print("=" * 66)

    for ngram in ngram_ranges:
        print(f"\nVectorizing with ngram_range={ngram} (sublinear_tf=True)...", flush=True)
        vec = TfidfVectorizer(ngram_range=ngram, sublinear_tf=True, lowercase=True)
        X_train_vec = vec.fit_transform(X_train)
        X_val_vec = vec.transform(X_val)

        for C in C_values:
            clf = LogisticRegression(C=C, max_iter=1000, random_state=42, solver="lbfgs")
            clf.fit(X_train_vec, y_train)
            val_preds = clf.predict(X_val_vec)
            macro_f1 = f1_score(y_val, val_preds, average="macro")
            acc = accuracy_score(y_val, val_preds)

            results.append({
                "C": C,
                "ngram_range": ngram,
                "val_macro_f1": macro_f1,
                "val_accuracy": acc
            })
            print(f"  C={C:<4} | ngram_range={str(ngram):<6} | Val Macro-F1: {macro_f1:.4f} | Val Acc: {acc:.4f}", flush=True)

    # Print results table
    print("\n" + "-" * 66)
    print(f"{'C':<8} | {'ngram_range':<14} | {'Val Macro-F1':<14} | {'Val Accuracy':<14}")
    print("-" * 66)
    for r in results:
        print(f"{r['C']:<8} | {str(r['ngram_range']):<14} | {r['val_macro_f1']:<14.4f} | {r['val_accuracy']:<14.4f}")
    print("-" * 66)

    best = max(results, key=lambda x: x["val_macro_f1"])
    print(f"\nBest Hyperparameters (selected on Validation Set):")
    print(f"  C:            {best['C']}")
    print(f"  ngram_range:  {best['ngram_range']}")
    print(f"  Val Macro-F1: {best['val_macro_f1']:.4f}")
    print(f"  Val Accuracy: {best['val_accuracy']:.4f}\n")

    return best["C"], best["ngram_range"], results


def build_and_train_model(data_dir: str = "data", output_dir: str = "."):
    """
    Main training workflow:
    1. Reads train/val/test splits.
    2. Tunes C and ngram_range on validation set using macro-F1.
    3. Trains CalibratedClassifierCV(Pipeline, method="sigmoid", cv=3) on training set.
    4. Evaluates once on test set (accuracy, macro-F1, per-class metrics).
    5. Saves confusion matrix to reports/confusion_matrix.png.
    6. Saves sentiment_model.joblib and model_metrics.json.
    """
    train_df, val_df, test_df = load_dataset_splits(data_dir)

    X_train, y_train = train_df["text"], train_df["label"]
    X_val, y_val = val_df["text"], val_df["label"]
    X_test, y_test = test_df["text"], test_df["label"]

    # 1. Tune hyperparameters on validation set only
    best_C, best_ngram, tuning_results = tune_hyperparameters(X_train, y_train, X_val, y_val)

    # 2. Build final calibrated pipeline
    print("Building final pipeline with selected hyperparameters...")
    base_pipeline = Pipeline([
        ("tfidf", TfidfVectorizer(
            ngram_range=best_ngram,
            sublinear_tf=True,
            lowercase=True
        )),
        ("classifier", LogisticRegression(
            C=best_C,
            max_iter=1000,
            solver="lbfgs",
            random_state=42
        ))
    ])

    final_model = CalibratedClassifierCV(
        estimator=base_pipeline,
        method="sigmoid",
        cv=3
    )

    print(f"Training CalibratedClassifierCV(cv=3, method='sigmoid') on full training set ({len(X_train):,} samples)...", flush=True)
    final_model.fit(X_train, y_train)
    print("Training and calibration complete.")

    # 3. Evaluate ONCE on the TEST set (never on train, never used for tuning)
    print("\n" + "=" * 66)
    print("EVALUATION ON TEST SET (Evaluated ONCE, never used for tuning)")
    print("=" * 66)
    test_preds = final_model.predict(X_test)
    test_acc = float(accuracy_score(y_test, test_preds))
    test_macro_f1 = float(f1_score(y_test, test_preds, average="macro"))

    report_dict = classification_report(y_test, test_preds, output_dict=True)
    report_text = classification_report(y_test, test_preds)
    print(report_text)
    print(f"Test Accuracy: {test_acc:.4f}")
    print(f"Test Macro-F1: {test_macro_f1:.4f}")

    classes = sorted(list(final_model.classes_))
    per_class_f1 = {cls: float(report_dict[cls]["f1-score"]) for cls in classes}
    per_class_precision = {cls: float(report_dict[cls]["precision"]) for cls in classes}
    per_class_recall = {cls: float(report_dict[cls]["recall"]) for cls in classes}

    # 4. Save confusion matrix image
    os.makedirs("reports", exist_ok=True)
    cm = confusion_matrix(y_test, test_preds, labels=classes)
    fig, ax = plt.subplots(figsize=(6, 5))
    disp = ConfusionMatrixDisplay(confusion_matrix=cm, display_labels=classes)
    disp.plot(cmap="Blues", ax=ax, values_format="d")
    ax.set_title("Test Confusion Matrix (Yelp 3-Class Sentiment)")
    plt.tight_layout()
    cm_path = os.path.join("reports", "confusion_matrix.png")
    plt.savefig(cm_path, dpi=300)
    plt.close(fig)
    print(f"\nSaved confusion matrix plot to: {cm_path}")

    # 5. Save model artifact
    model_path = os.path.join(output_dir, "sentiment_model.joblib")
    joblib.dump(final_model, model_path)
    print(f"Saved calibrated model to: {model_path}")

    # 6. Save model metrics JSON
    metrics_path = os.path.join(output_dir, "model_metrics.json")
    metrics_data = {
        "dataset_name": "yelp_review_full",
        "train_size": len(X_train),
        "val_size": len(X_val),
        "test_size": len(X_test),
        "dataset_sizes": {
            "train": len(X_train),
            "val": len(X_val),
            "test": len(X_test)
        },
        "label_mapping": {
            "0, 1": "negative",
            "2": "neutral",
            "3, 4": "positive"
        },
        "chosen_hyperparameters": {
            "C": best_C,
            "ngram_range": list(best_ngram),
            "calibration_method": "sigmoid",
            "cv": 3,
            "sublinear_tf": True
        },
        "test_macro_f1": round(test_macro_f1, 4),
        "accuracy": round(test_acc, 4),
        "per_class_f1": {k: round(v, 4) for k, v in per_class_f1.items()},
        "per_class_precision": {k: round(v, 4) for k, v in per_class_precision.items()},
        "per_class_recall": {k: round(v, 4) for k, v in per_class_recall.items()},
        "tuning_results": [
            {
                "C": r["C"],
                "ngram_range": list(r["ngram_range"]),
                "val_macro_f1": round(r["val_macro_f1"], 4),
                "val_accuracy": round(r["val_accuracy"], 4)
            }
            for r in tuning_results
        ],
        "training_date": datetime.now(timezone.utc).isoformat(),
        "version": "2.0.0"
    }

    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_data, f, indent=2)
    print(f"Saved model metrics to: {metrics_path}")

    return model_path, metrics_path


if __name__ == "__main__":
    build_and_train_model()
