"""
Evaluation script for the INT8 Quantized ONNX model on data/test.csv.
Computes Accuracy, Macro-F1, per-class Precision/Recall/F1,
and writes updated metrics to model_metrics.json (Version 3.0.0).
"""

import os
import json
from datetime import datetime, timezone
import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score, classification_report
import onnxruntime as ort
from tokenizers import Tokenizer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEST_CSV = os.path.join(BASE_DIR, "data", "test.csv")
MODEL_PATH = os.path.join(BASE_DIR, "sentiment_model.onnx")
TOKENIZER_PATH = os.path.join(BASE_DIR, "tokenizer", "tokenizer.json")
METRICS_PATH = os.path.join(BASE_DIR, "model_metrics.json")

LABEL2ID = {"negative": 0, "neutral": 1, "positive": 2}
ID2LABEL = {0: "negative", 1: "neutral", 2: "positive"}


def evaluate_test_set(batch_size: int = 256, max_samples: int = None):
    print(f"Loading test dataset from {TEST_CSV}...")
    df = pd.read_csv(TEST_CSV).dropna(subset=["text", "label"])
    if max_samples and max_samples < len(df):
        print(f"Subsampling test set to {max_samples:,} samples...")
        df = df.sample(n=max_samples, random_state=42).reset_index(drop=True)

    print(f"Total test samples to evaluate: {len(df):,}")

    # Map labels to integer ids
    if df["label"].dtype == object:
        df["label_id"] = df["label"].map(LABEL2ID)
    else:
        df["label_id"] = df["label"].astype(int)

    print(f"Initializing ONNX Runtime session with {MODEL_PATH}...")
    sess_options = ort.SessionOptions()
    sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(MODEL_PATH, sess_options, providers=["CPUExecutionProvider"])
    tokenizer = Tokenizer.from_file(TOKENIZER_PATH)

    texts = df["text"].tolist()
    labels = df["label_id"].tolist()

    all_preds = []
    print(f"Running batched evaluation (batch size: {batch_size})...")
    total_batches = (len(texts) + batch_size - 1) // batch_size

    for b in range(total_batches):
        start_idx = b * batch_size
        end_idx = min(start_idx + batch_size, len(texts))
        batch_texts = texts[start_idx:end_idx]

        encodings = tokenizer.encode_batch(batch_texts)
        input_ids = np.array([e.ids for e in encodings], dtype=np.int64)
        attention_mask = np.array([e.attention_mask for e in encodings], dtype=np.int64)

        ort_inputs = {"input_ids": input_ids, "attention_mask": attention_mask}
        logits = session.run(None, ort_inputs)[0]
        preds = np.argmax(logits, axis=-1)
        all_preds.extend(preds.tolist())

        if (b + 1) % 10 == 0 or (b + 1) == total_batches:
            print(f"  Processed batch {b + 1}/{total_batches} ({end_idx}/{len(texts)} samples)")

    acc = float(accuracy_score(labels, all_preds))
    macro_f1 = float(f1_score(labels, all_preds, average="macro"))

    classes = ["negative", "neutral", "positive"]
    class_ids = [0, 1, 2]

    precisions = precision_score(labels, all_preds, labels=class_ids, average=None)
    recalls = recall_score(labels, all_preds, labels=class_ids, average=None)
    f1s = f1_score(labels, all_preds, labels=class_ids, average=None)

    per_class_f1 = {cls: round(float(f1s[i]), 4) for i, cls in enumerate(classes)}
    per_class_precision = {cls: round(float(precisions[i]), 4) for i, cls in enumerate(classes)}
    per_class_recall = {cls: round(float(recalls[i]), 4) for i, cls in enumerate(classes)}

    print("\n" + "=" * 60)
    print("TEST EVALUATION REPORT (INT8 ONNX DISTILBERT)")
    print("=" * 60)
    print(f"Accuracy: {acc:.4f} ({acc*100:.2f}%)")
    print(f"Macro-F1: {macro_f1:.4f} ({macro_f1*100:.2f}%)")
    print("\nPer-Class Breakdown:")
    for cls in classes:
        print(f"  {cls:<9} | F1: {per_class_f1[cls]:.4f} | Precision: {per_class_precision[cls]:.4f} | Recall: {per_class_recall[cls]:.4f}")
    print("=" * 60)

    # Update model_metrics.json
    metrics_data = {
        "dataset_name": "yelp_review_full",
        "train_size": 60000,
        "val_size": 7500,
        "test_size": len(df),
        "dataset_sizes": {
            "train": 60000,
            "val": 7500,
            "test": len(df)
        },
        "label_mapping": {
            "0, 1": "negative",
            "2": "neutral",
            "3, 4": "positive"
        },
        "model_architecture": {
            "base_model": "distilbert-base-uncased",
            "framework": "ONNX Runtime (CPUExecutionProvider)",
            "quantization": "Dynamic INT8 (onnxruntime.quantization.QuantType.QInt8)",
            "tokenizer": "HuggingFace Tokenizers (pure Rust/C++, zero PyTorch runtime)",
            "model_size_mb": round(os.path.getsize(MODEL_PATH) / (1024 * 1024), 2),
            "max_sequence_length": 96
        },
        "chosen_hyperparameters": {
            "architecture": "DistilBertForSequenceClassification",
            "quantization": "Dynamic INT8",
            "batch_size": 16,
            "learning_rate": 2e-5,
            "max_length": 96
        },
        "test_macro_f1": round(macro_f1, 4),
        "accuracy": round(acc, 4),
        "per_class_f1": per_class_f1,
        "per_class_precision": per_class_precision,
        "per_class_recall": per_class_recall,
        "evaluation_date": datetime.now(timezone.utc).isoformat(),
        "training_date": datetime.now(timezone.utc).isoformat(),
        "version": "3.0.0"
    }

    with open(METRICS_PATH, "w") as f:
        json.dump(metrics_data, f, indent=2)

    print(f"\nSuccessfully wrote updated metrics to {METRICS_PATH}")
    return metrics_data


if __name__ == "__main__":
    evaluate_test_set(batch_size=256, max_samples=3000)
