"""
Offline Training and ONNX Export Pipeline for 3-Class Sentiment Analysis.

Workflow:
1. Detects compute hardware (CPU vs Google Colab T4 CUDA GPU).
   - On CUDA: Automatically enables full 60,000 train rows, max_length=256, batch_size=32, epochs=2, and FP16 AMP.
   - On CPU: Safe defaults for lightweight verification.
2. Fine-tunes a lightweight Transformer (DistilBERT or MiniLM) for sequence classification.
3. Evaluates performance (Accuracy, Macro-F1) on validation set.
4. Exports the PyTorch model to ONNX format with dynamic batch and sequence axes.
5. Applies dynamic INT8 quantization via onnxruntime.quantization to reduce file size (<100MB GitHub limit).
6. Saves the production artifact 'sentiment_model.onnx' and tokenizer configuration files.
7. Evaluates the quantized ONNX model on all rows of data/test.csv (15,000 samples) and updates model_metrics.json (v3.0.0).
8. Performs a verification smoke test using onnxruntime.InferenceSession.
"""

import os
import sys
import json
import argparse
import logging
from datetime import datetime, timezone
from typing import Dict, List, Tuple, Optional, Any

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    get_linear_schedule_with_warmup,
)
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
    classification_report,
)
import onnxruntime as ort
from onnxruntime.quantization import quantize_dynamic, QuantType

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Standard 3-class label mapping
LABEL2ID = {"negative": 0, "neutral": 1, "positive": 2}
ID2LABEL = {0: "negative", 1: "neutral", 2: "positive"}


class SentimentDataset(Dataset):
    """PyTorch Dataset for text classification."""

    def __init__(self, texts: List[str], labels: List[int], tokenizer, max_length: int = 256):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self) -> int:
        return len(self.texts)

    def __getitem__(self, idx: int) -> Dict[str, torch.Tensor]:
        text = str(self.texts[idx])
        label = self.labels[idx]

        encoding = self.tokenizer(
            text,
            truncation=True,
            padding="max_length",
            max_length=self.max_length,
            return_tensors="pt",
        )

        item = {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
            "labels": torch.tensor(label, dtype=torch.long),
        }
        if "token_type_ids" in encoding:
            item["token_type_ids"] = encoding["token_type_ids"].squeeze(0)

        return item


def load_and_validate_data(
    data_dir: str = "data",
    train_file: str = "train.csv",
    val_file: str = "val.csv",
    max_train_samples: Optional[int] = None,
    max_val_samples: Optional[int] = None,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """Loads CSV splits and validates schema."""
    train_path = os.path.join(data_dir, train_file)
    val_path = os.path.join(data_dir, val_file)

    for path in (train_path, val_path):
        if not os.path.exists(path):
            raise FileNotFoundError(
                f"Missing required data file: {path}. Run prepare_data.py first."
            )

    logger.info(f"Loading datasets from {data_dir}...")
    train_df = pd.read_csv(train_path).dropna(subset=["text", "label"])
    val_df = pd.read_csv(val_path).dropna(subset=["text", "label"])

    # Ensure labels are mapped to integer ids
    for df in (train_df, val_df):
        if df["label"].dtype == object:
            df["label_id"] = df["label"].map(LABEL2ID)
        else:
            df["label_id"] = df["label"].astype(int)

    if max_train_samples and max_train_samples < len(train_df):
        logger.info(f"Subsampling training set to {max_train_samples:,} samples.")
        train_df = train_df.sample(n=max_train_samples, random_state=42).reset_index(drop=True)

    if max_val_samples and max_val_samples < len(val_df):
        logger.info(f"Subsampling validation set to {max_val_samples:,} samples.")
        val_df = val_df.sample(n=max_val_samples, random_state=42).reset_index(drop=True)

    logger.info(f"Training samples:   {len(train_df):,}")
    logger.info(f"Validation samples: {len(val_df):,}")
    return train_df, val_df


def train_model(
    model,
    train_loader: DataLoader,
    val_loader: DataLoader,
    device: torch.device,
    epochs: int = 2,
    lr: float = 2e-5,
    use_fp16: bool = False,
) -> float:
    """Fine-tunes the transformer model with optional FP16 mixed precision."""
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    total_steps = len(train_loader) * epochs
    warmup_steps = int(0.1 * total_steps)
    scheduler = get_linear_schedule_with_warmup(
        optimizer, num_warmup_steps=warmup_steps, num_training_steps=total_steps
    )
    scaler = torch.cuda.amp.GradScaler(enabled=(use_fp16 and device.type == "cuda"))

    best_macro_f1 = 0.0

    for epoch in range(1, epochs + 1):
        model.train()
        total_train_loss = 0.0

        logger.info(f"--- Epoch {epoch}/{epochs} (FP16: {use_fp16 and device.type == 'cuda'}) ---")
        for step, batch in enumerate(train_loader):
            optimizer.zero_grad()
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            model_inputs = {"input_ids": input_ids, "attention_mask": attention_mask, "labels": labels}
            if "token_type_ids" in batch:
                model_inputs["token_type_ids"] = batch["token_type_ids"].to(device)

            with torch.cuda.amp.autocast(enabled=(use_fp16 and device.type == "cuda")):
                outputs = model(**model_inputs)
                loss = outputs.loss

            if use_fp16 and device.type == "cuda":
                scaler.scale(loss).backward()
                scaler.unscale_(optimizer)
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                scaler.step(optimizer)
                scaler.update()
            else:
                loss.backward()
                torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
                optimizer.step()

            scheduler.step()

            total_train_loss += loss.item()
            if (step + 1) % max(1, len(train_loader) // 10) == 0 or (step + 1) == len(train_loader):
                logger.info(
                    f"  Step {step + 1}/{len(train_loader)} | Batch Loss: {loss.item():.4f} | "
                    f"Avg Loss: {total_train_loss / (step + 1):.4f}"
                )

        # Validation phase
        val_acc, val_f1, report = evaluate_model(model, val_loader, device, use_fp16=use_fp16)
        logger.info(f"Epoch {epoch} Validation - Accuracy: {val_acc:.4f} | Macro-F1: {val_f1:.4f}")
        logger.info(f"\n{report}")

        if val_f1 > best_macro_f1:
            best_macro_f1 = val_f1

    return best_macro_f1


def evaluate_model(
    model, val_loader: DataLoader, device: torch.device, use_fp16: bool = False
) -> Tuple[float, float, str]:
    """Evaluates model predictions against ground truth labels."""
    model.eval()
    all_preds: List[int] = []
    all_labels: List[int] = []

    with torch.no_grad():
        for batch in val_loader:
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            model_inputs = {"input_ids": input_ids, "attention_mask": attention_mask}
            if "token_type_ids" in batch:
                model_inputs["token_type_ids"] = batch["token_type_ids"].to(device)

            with torch.cuda.amp.autocast(enabled=(use_fp16 and device.type == "cuda")):
                outputs = model(**model_inputs)
                preds = torch.argmax(outputs.logits, dim=-1)

            all_preds.extend(preds.cpu().tolist())
            all_labels.extend(labels.cpu().tolist())

    acc = accuracy_score(all_labels, all_preds)
    macro_f1 = f1_score(all_labels, all_preds, average="macro")
    target_names = [ID2LABEL[i] for i in sorted(ID2LABEL.keys())]
    report = classification_report(all_labels, all_preds, target_names=target_names, digits=4)
    return acc, macro_f1, report


def export_model_to_onnx(
    model,
    tokenizer,
    fp32_onnx_path: str = "sentiment_model_fp32.onnx",
    max_length: int = 256,
) -> str:
    """Exports PyTorch model to ONNX format with dynamic batch and sequence axes."""
    logger.info("Exporting PyTorch model to standard FP32 ONNX graph...")
    model.eval()
    model.to("cpu")

    dummy_text = "This restaurant had incredible food and exceptional service."
    encoding = tokenizer(
        dummy_text,
        max_length=max_length,
        padding="max_length",
        truncation=True,
        return_tensors="pt",
    )

    input_names = ["input_ids", "attention_mask"]
    dummy_inputs = (encoding["input_ids"], encoding["attention_mask"])
    dynamic_axes = {
        "input_ids": {0: "batch_size", 1: "sequence_length"},
        "attention_mask": {0: "batch_size", 1: "sequence_length"},
        "logits": {0: "batch_size"},
    }

    if "token_type_ids" in encoding and hasattr(model, "bert"):
        input_names.append("token_type_ids")
        dummy_inputs = (encoding["input_ids"], encoding["attention_mask"], encoding["token_type_ids"])
        dynamic_axes["token_type_ids"] = {0: "batch_size", 1: "sequence_length"}

    torch.onnx.export(
        model,
        dummy_inputs,
        fp32_onnx_path,
        input_names=input_names,
        output_names=["logits"],
        dynamic_axes=dynamic_axes,
        opset_version=14,
        do_constant_folding=True,
        dynamo=False,
    )

    fp32_size_mb = os.path.getsize(fp32_onnx_path) / (1024 * 1024)
    logger.info(f"Exported FP32 ONNX model successfully: {fp32_onnx_path} ({fp32_size_mb:.2f} MB)")
    return fp32_onnx_path


def quantize_onnx_model(
    fp32_onnx_path: str,
    int8_onnx_path: str = "sentiment_model.onnx",
    keep_fp32: bool = False,
) -> str:
    """Applies dynamic INT8 quantization to shrink model below the 100MB limit."""
    logger.info(f"Applying dynamic INT8 quantization to create {int8_onnx_path}...")
    quantize_dynamic(
        model_input=fp32_onnx_path,
        model_output=int8_onnx_path,
        weight_type=QuantType.QInt8,
        extra_options={"EnableShapeInference": False},
    )

    int8_size_mb = os.path.getsize(int8_onnx_path) / (1024 * 1024)
    logger.info(f"INT8 Quantized ONNX Model: {int8_onnx_path} ({int8_size_mb:.2f} MB)")

    if int8_size_mb >= 100.0:
        raise ValueError(
            f"Quantized model size ({int8_size_mb:.2f} MB) exceeds GitHub's 100 MB hard limit!"
        )
    logger.info(
        f"[COMPLIANCE VERIFIED] Model size is {int8_size_mb:.2f} MB, comfortably below GitHub 100MB limit "
        f"({(100.0 - int8_size_mb):.1f} MB headroom)."
    )

    if not keep_fp32 and os.path.exists(fp32_onnx_path):
        os.remove(fp32_onnx_path)
        logger.info(f"Cleaned up intermediate unquantized model: {fp32_onnx_path}")

    return int8_onnx_path


def evaluate_onnx_on_test_set(
    onnx_path: str,
    tokenizer_dir: str,
    test_csv_path: str = "data/test.csv",
    metrics_json_path: str = "model_metrics.json",
    batch_size: int = 128,
    max_length: int = 256,
    model_name: str = "distilbert-base-uncased",
    train_size: int = 60000,
    val_size: int = 7500,
    epochs: int = 2,
    lr: float = 2e-5,
    use_fp16: bool = False,
) -> Dict[str, Any]:
    """
    Evaluates the quantized ONNX model on the test dataset split (all rows of data/test.csv)
    and updates model_metrics.json (version 3.0.0).
    """
    logger.info(f"Loading test dataset from {test_csv_path}...")
    test_df = pd.read_csv(test_csv_path).dropna(subset=["text", "label"])
    logger.info(f"Total test rows to evaluate: {len(test_df):,}")

    if test_df["label"].dtype == object:
        test_df["label_id"] = test_df["label"].map(LABEL2ID)
    else:
        test_df["label_id"] = test_df["label"].astype(int)

    logger.info(f"Initializing ONNX Runtime inference session with {onnx_path}...")
    sess_options = ort.SessionOptions()
    sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    session = ort.InferenceSession(onnx_path, sess_options, providers=["CPUExecutionProvider"])
    tokenizer = AutoTokenizer.from_pretrained(tokenizer_dir)

    texts = test_df["text"].tolist()
    labels = test_df["label_id"].tolist()
    all_preds = []

    session_input_names = [inp.name for inp in session.get_inputs()]
    total_batches = (len(texts) + batch_size - 1) // batch_size
    logger.info(f"Evaluating {len(texts):,} samples across {total_batches} batches (batch size {batch_size})...")

    for b in range(total_batches):
        start_idx = b * batch_size
        end_idx = min(start_idx + batch_size, len(texts))
        batch_texts = texts[start_idx:end_idx]

        enc = tokenizer(
            batch_texts,
            padding=True,
            truncation=True,
            max_length=max_length,
            return_tensors="np",
        )
        ort_inputs = {k: v for k, v in enc.items() if k in session_input_names}
        logits = session.run(None, ort_inputs)[0]
        preds = np.argmax(logits, axis=-1)
        all_preds.extend(preds.tolist())

        if (b + 1) % max(1, total_batches // 5) == 0 or (b + 1) == total_batches:
            logger.info(f"  Evaluated {end_idx:,}/{len(texts):,} test samples ({((b + 1) / total_batches)*100:.1f}%)")

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

    logger.info("\n" + "=" * 65)
    logger.info("TEST EVALUATION REPORT (QUANTIZED INT8 ONNX TRANSFORMER)")
    logger.info("=" * 65)
    logger.info(f"Accuracy: {acc:.4f} ({acc*100:.2f}%)")
    logger.info(f"Macro-F1: {macro_f1:.4f} ({macro_f1*100:.2f}%)")
    logger.info("\nPer-Class Breakdown:")
    for cls in classes:
        logger.info(f"  {cls:<9} | F1: {per_class_f1[cls]:.4f} | Precision: {per_class_precision[cls]:.4f} | Recall: {per_class_recall[cls]:.4f}")
    logger.info("=" * 65)

    metrics_data = {
        "dataset_name": "yelp_review_full",
        "train_size": train_size,
        "val_size": val_size,
        "test_size": len(test_df),
        "dataset_sizes": {
            "train": train_size,
            "val": val_size,
            "test": len(test_df)
        },
        "label_mapping": {
            "0, 1": "negative",
            "2": "neutral",
            "3, 4": "positive"
        },
        "model_architecture": {
            "base_model": model_name,
            "framework": "ONNX Runtime (CPUExecutionProvider)",
            "quantization": "Dynamic INT8 (onnxruntime.quantization.QuantType.QInt8)",
            "tokenizer": "HuggingFace Tokenizers (pure Rust/C++, zero PyTorch runtime)",
            "model_size_mb": round(os.path.getsize(onnx_path) / (1024 * 1024), 2),
            "max_sequence_length": max_length
        },
        "chosen_hyperparameters": {
            "architecture": "DistilBertForSequenceClassification",
            "quantization": "Dynamic INT8",
            "batch_size": batch_size,
            "learning_rate": lr,
            "max_length": max_length,
            "epochs": epochs,
            "fp16": use_fp16
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

    with open(metrics_json_path, "w", encoding="utf-8") as f:
        json.dump(metrics_data, f, indent=2)

    logger.info(f"Updated metrics successfully written to {metrics_json_path} (version '3.0.0')")
    return metrics_data


def smoke_test_onnx(onnx_path: str, tokenizer_dir: str):
    """Smoke tests the exported quantized ONNX model using onnxruntime."""
    logger.info(f"\n--- Smoke Testing {onnx_path} with ONNX Runtime ---")
    session = ort.InferenceSession(onnx_path, providers=["CPUExecutionProvider"])
    tokenizer = AutoTokenizer.from_pretrained(tokenizer_dir)

    test_reviews = [
        "The food was cold, tasteless, and the server was downright rude. Never returning.",
        "Average diner. The fries were decent, burger was okay, nothing special.",
        "Absolutely fabulous dining experience! Best lasagna I've had in years, 10/10!",
    ]

    session_input_names = [inp.name for inp in session.get_inputs()]

    for review in test_reviews:
        encoded = tokenizer(review, return_tensors="np", truncation=True, max_length=128)
        ort_inputs = {k: v for k, v in encoded.items() if k in session_input_names}

        logits = session.run(None, ort_inputs)[0]
        exp_logits = np.exp(logits - np.max(logits, axis=-1, keepdims=True))
        probs = exp_logits / np.sum(exp_logits, axis=-1, keepdims=True)

        pred_id = int(np.argmax(probs[0]))
        pred_label = ID2LABEL[pred_id]
        confidence = float(probs[0][pred_id])

        scores = {ID2LABEL[i]: round(float(probs[0][i]), 4) for i in range(len(ID2LABEL))}
        logger.info(f"Review: \"{review[:60]}...\"")
        logger.info(f"  -> Predicted: {pred_label.upper()} | Confidence: {confidence:.4f} | Scores: {scores}")

    logger.info("Smoke test passed successfully!")


def main():
    parser = argparse.ArgumentParser(description="Fine-tune and export INT8 ONNX sentiment model.")
    parser.add_argument("--model-name", type=str, default="distilbert-base-uncased",
                        help="HuggingFace model identifier (e.g. distilbert-base-uncased, nreimers/MiniLM-L6-H384-uncased)")
    parser.add_argument("--data-dir", type=str, default="data", help="Directory containing train.csv, val.csv, and test.csv")
    parser.add_argument("--train-file", type=str, default="train.csv", help="Training CSV filename")
    parser.add_argument("--val-file", type=str, default="val.csv", help="Validation CSV filename")
    parser.add_argument("--test-file", type=str, default="test.csv", help="Test CSV filename")
    parser.add_argument("--metrics-file", type=str, default="model_metrics.json", help="Path to write model metrics JSON")
    parser.add_argument("--output-onnx", type=str, default="sentiment_model.onnx", help="Target ONNX filename")
    parser.add_argument("--tokenizer-dir", type=str, default="tokenizer", help="Directory to save tokenizer artifacts")
    parser.add_argument("--epochs", type=int, default=None, help="Number of training epochs (default: 2)")
    parser.add_argument("--batch-size", type=int, default=None, help="Training batch size (default: 32 on CUDA, 16 on CPU)")
    parser.add_argument("--lr", type=float, default=2e-5, help="Learning rate (default: 2e-5)")
    parser.add_argument("--max-length", type=int, default=None, help="Max sequence length (default: 256 on CUDA, 128 on CPU)")
    parser.add_argument("--fp16", action="store_true", default=None, help="Force enable FP16 mixed precision")
    parser.add_argument("--no-fp16", action="store_false", dest="fp16", help="Disable FP16 mixed precision")
    parser.add_argument("--max-train-samples", type=int, default=None,
                        help="Subsample training data for fast test runs (default: None for full 60,000 rows)")
    parser.add_argument("--max-val-samples", type=int, default=None,
                        help="Subsample validation data for fast test runs (default: None for full 7,500 rows)")
    parser.add_argument("--keep-fp32", action="store_true", help="Keep unquantized FP32 ONNX file")
    args = parser.parse_args()

    is_cuda = torch.cuda.is_available()
    device = torch.device("cuda" if is_cuda else "cpu")

    # Adapt parameters automatically based on CUDA hardware detection
    if is_cuda:
        epochs = args.epochs if args.epochs is not None else 2
        batch_size = args.batch_size if args.batch_size is not None else 32
        max_length = args.max_length if args.max_length is not None else 256
        use_fp16 = True if args.fp16 is None else args.fp16
        # When CUDA is detected, use the full 60,000 training rows unless explicitly overridden
        max_train_samples = args.max_train_samples
        max_val_samples = args.max_val_samples
        device_name = torch.cuda.get_device_name(0) if torch.cuda.device_count() > 0 else "CUDA"
        logger.info("=" * 70)
        logger.info(f"CUDA GPU DETECTED: {device_name}")
        logger.info("Enabling Google Colab GPU profile:")
        logger.info(f"  - Dataset: Full training set ({'all 60,000 rows' if not max_train_samples else max_train_samples})")
        logger.info(f"  - Max Sequence Length: {max_length}")
        logger.info(f"  - Batch Size: {batch_size}")
        logger.info(f"  - Epochs: {epochs}")
        logger.info(f"  - Mixed Precision (FP16): {use_fp16}")
        logger.info("=" * 70)
    else:
        epochs = args.epochs if args.epochs is not None else 2
        batch_size = args.batch_size if args.batch_size is not None else 16
        max_length = args.max_length if args.max_length is not None else 128
        use_fp16 = False if args.fp16 is None else args.fp16
        max_train_samples = args.max_train_samples
        max_val_samples = args.max_val_samples
        logger.info(f"Using compute device: {device} (max_length={max_length}, batch_size={batch_size}, fp16=False)")

    # 1. Load data
    train_df, val_df = load_and_validate_data(
        data_dir=args.data_dir,
        train_file=args.train_file,
        val_file=args.val_file,
        max_train_samples=max_train_samples,
        max_val_samples=max_val_samples,
    )

    # 2. Initialize Tokenizer & Model
    logger.info(f"Loading pretrained tokenizer and model: {args.model_name}")
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name,
        num_labels=3,
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    )
    model.to(device)

    # 3. Create Datasets & DataLoaders
    train_dataset = SentimentDataset(
        texts=train_df["text"].tolist(),
        labels=train_df["label_id"].tolist(),
        tokenizer=tokenizer,
        max_length=max_length,
    )
    val_dataset = SentimentDataset(
        texts=val_df["text"].tolist(),
        labels=val_df["label_id"].tolist(),
        tokenizer=tokenizer,
        max_length=max_length,
    )

    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=batch_size, shuffle=False)

    # 4. Train
    logger.info(f"Starting fine-tuning for {epochs} epoch(s)...")
    train_model(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        device=device,
        epochs=epochs,
        lr=args.lr,
        use_fp16=use_fp16,
    )

    # 5. Save Tokenizer files
    os.makedirs(args.tokenizer_dir, exist_ok=True)
    logger.info(f"Saving tokenizer configuration and vocab to {args.tokenizer_dir}...")
    tokenizer.save_pretrained(args.tokenizer_dir)

    # 6. Export to ONNX
    fp32_path = "sentiment_model_fp32.onnx"
    export_model_to_onnx(model, tokenizer, fp32_onnx_path=fp32_path, max_length=max_length)

    # 7. Apply Dynamic INT8 Quantization
    quantize_onnx_model(
        fp32_onnx_path=fp32_path,
        int8_onnx_path=args.output_onnx,
        keep_fp32=args.keep_fp32,
    )

    # 8. Smoke test with ONNX Runtime
    smoke_test_onnx(onnx_path=args.output_onnx, tokenizer_dir=args.tokenizer_dir)

    # 9. Evaluate quantized ONNX model on all rows of test.csv and update model_metrics.json (v3.0.0)
    test_path = os.path.join(args.data_dir, args.test_file)
    if os.path.exists(test_path):
        logger.info(f"\n--- Evaluating Quantized ONNX Model on Full Test Set ({test_path}) ---")
        evaluate_onnx_on_test_set(
            onnx_path=args.output_onnx,
            tokenizer_dir=args.tokenizer_dir,
            test_csv_path=test_path,
            metrics_json_path=args.metrics_file,
            batch_size=128 if is_cuda else 64,
            max_length=max_length,
            model_name=args.model_name,
            train_size=len(train_df),
            val_size=len(val_df),
            epochs=epochs,
            lr=args.lr,
            use_fp16=use_fp16,
        )
    else:
        logger.warning(f"Test split file not found at {test_path}. Skipping test evaluation.")

    logger.info("Pipeline completed successfully!")


if __name__ == "__main__":
    main()
