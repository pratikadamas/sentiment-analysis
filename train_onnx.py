"""
Offline Training and ONNX Export Pipeline for 3-Class Sentiment Analysis.

Workflow:
1. Loads preprocessed Yelp data from data/train.csv and data/val.csv.
2. Fine-tunes a lightweight Transformer (DistilBERT or MiniLM) for sequence classification.
3. Evaluates performance (Accuracy, Macro-F1) on validation set.
4. Exports the PyTorch model to ONNX format with dynamic batch and sequence axes.
5. Applies dynamic INT8 quantization via onnxruntime.quantization to reduce file size (<100MB GitHub limit).
6. Saves the production artifact 'sentiment_model.onnx' and tokenizer configuration files.
7. Performs a verification smoke test using onnxruntime.InferenceSession.
"""

import os
import sys
import argparse
import logging
from typing import Dict, List, Tuple, Optional

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    get_linear_schedule_with_warmup,
)
from sklearn.metrics import accuracy_score, f1_score, classification_report
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

    def __init__(self, texts: List[str], labels: List[int], tokenizer, max_length: int = 128):
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
        logger.info(f"Subsampling training set to {max_train_samples:,} samples for fast execution.")
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
) -> float:
    """Fine-tunes the transformer model and evaluates on the validation set."""
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    total_steps = len(train_loader) * epochs
    warmup_steps = int(0.1 * total_steps)
    scheduler = get_linear_schedule_with_warmup(
        optimizer, num_warmup_steps=warmup_steps, num_training_steps=total_steps
    )

    best_macro_f1 = 0.0

    for epoch in range(1, epochs + 1):
        model.train()
        total_train_loss = 0.0

        logger.info(f"--- Epoch {epoch}/{epochs} ---")
        for step, batch in enumerate(train_loader):
            optimizer.zero_grad()
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            model_inputs = {"input_ids": input_ids, "attention_mask": attention_mask, "labels": labels}
            if "token_type_ids" in batch:
                model_inputs["token_type_ids"] = batch["token_type_ids"].to(device)

            outputs = model(**model_inputs)
            loss = outputs.loss
            loss.backward()

            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            scheduler.step()

            total_train_loss += loss.item()
            if (step + 1) % max(1, len(train_loader) // 5) == 0 or (step + 1) == len(train_loader):
                logger.info(
                    f"  Step {step + 1}/{len(train_loader)} | Batch Loss: {loss.item():.4f} | "
                    f"Avg Loss: {total_train_loss / (step + 1):.4f}"
                )

        # Validation phase
        val_acc, val_f1, report = evaluate_model(model, val_loader, device)
        logger.info(f"Epoch {epoch} Validation - Accuracy: {val_acc:.4f} | Macro-F1: {val_f1:.4f}")
        logger.info(f"\n{report}")

        if val_f1 > best_macro_f1:
            best_macro_f1 = val_f1

    return best_macro_f1


def evaluate_model(
    model, val_loader: DataLoader, device: torch.device
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
    max_length: int = 128,
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
    parser.add_argument("--data-dir", type=str, default="data", help="Directory containing train.csv and val.csv")
    parser.add_argument("--train-file", type=str, default="train.csv", help="Training CSV filename")
    parser.add_argument("--val-file", type=str, default="val.csv", help="Validation CSV filename")
    parser.add_argument("--output-onnx", type=str, default="sentiment_model.onnx", help="Target ONNX filename")
    parser.add_argument("--tokenizer-dir", type=str, default="tokenizer", help="Directory to save tokenizer artifacts")
    parser.add_argument("--epochs", type=int, default=2, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=32, help="Training batch size")
    parser.add_argument("--lr", type=float, default=2e-5, help="Learning rate")
    parser.add_argument("--max-length", type=int, default=128, help="Max token sequence length")
    parser.add_argument("--max-train-samples", type=int, default=None,
                        help="Subsample training data for fast test runs (e.g. 500)")
    parser.add_argument("--max-val-samples", type=int, default=None,
                        help="Subsample validation data for fast test runs (e.g. 200)")
    parser.add_argument("--keep-fp32", action="store_true", help="Keep unquantized FP32 ONNX file")
    args = parser.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info(f"Using compute device: {device}")

    # 1. Load data
    train_df, val_df = load_and_validate_data(
        data_dir=args.data_dir,
        train_file=args.train_file,
        val_file=args.val_file,
        max_train_samples=args.max_train_samples,
        max_val_samples=args.max_val_samples,
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
        max_length=args.max_length,
    )
    val_dataset = SentimentDataset(
        texts=val_df["text"].tolist(),
        labels=val_df["label_id"].tolist(),
        tokenizer=tokenizer,
        max_length=args.max_length,
    )

    train_loader = DataLoader(train_dataset, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_dataset, batch_size=args.batch_size, shuffle=False)

    # 4. Train
    logger.info(f"Starting fine-tuning for {args.epochs} epoch(s)...")
    train_model(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        device=device,
        epochs=args.epochs,
        lr=args.lr,
    )

    # 5. Save Tokenizer files
    os.makedirs(args.tokenizer_dir, exist_ok=True)
    logger.info(f"Saving tokenizer configuration and vocab to {args.tokenizer_dir}...")
    tokenizer.save_pretrained(args.tokenizer_dir)

    # 6. Export to ONNX
    fp32_path = "sentiment_model_fp32.onnx"
    export_model_to_onnx(model, tokenizer, fp32_onnx_path=fp32_path, max_length=args.max_length)

    # 7. Apply Dynamic INT8 Quantization
    quantize_onnx_model(
        fp32_onnx_path=fp32_path,
        int8_onnx_path=args.output_onnx,
        keep_fp32=args.keep_fp32,
    )

    # 8. Smoke test with ONNX Runtime
    smoke_test_onnx(onnx_path=args.output_onnx, tokenizer_dir=args.tokenizer_dir)
    logger.info("Pipeline completed successfully!")


if __name__ == "__main__":
    main()
