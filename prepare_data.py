import os
import sys
import traceback
import pandas as pd
from datasets import load_dataset


def load_dataset_with_fallback():
    """
    Load 'yelp_review_full' with datasets library.
    If loading fails, print exact error and fallback to mirror 'KushT/yelp_review_full_train_val_test'.
    """
    dataset = None
    try:
        print("Loading Hugging Face dataset 'yelp_review_full'...")
        dataset = load_dataset("yelp_review_full")
        print("Successfully loaded 'yelp_review_full'.")
    except Exception as e:
        print(f"FAILED to load 'yelp_review_full'. Exact error:\n{e}\n{traceback.format_exc()}")
        print("\nAttempting parquet-based mirror 'KushT/yelp_review_full_train_val_test'...")
        try:
            dataset = load_dataset("KushT/yelp_review_full_train_val_test")
            print("Successfully loaded mirror 'KushT/yelp_review_full_train_val_test'.")
        except Exception as e_mirror:
            print(f"FAILED to load mirror 'KushT/yelp_review_full_train_val_test'. Exact error:\n{e_mirror}\n{traceback.format_exc()}")
            raise RuntimeError(f"Both primary and mirror datasets failed to load.\nPrimary: {e}\nMirror: {e_mirror}")

    # Inspect columns across splits
    print("\nDataset split structure and columns:")
    for split_name in dataset.keys():
        print(f"  Split '{split_name}': columns = {dataset[split_name].column_names}, rows = {len(dataset[split_name])}")

    return dataset


def standardize_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Standardize column names to 'text' and 'label'."""
    col_map = {}
    for col in df.columns:
        c_lower = col.lower().strip()
        if c_lower in ("text", "review", "review_text", "content"):
            col_map[col] = "text"
        elif c_lower in ("label", "stars", "rating", "sentiment"):
            col_map[col] = "label"

    df = df.rename(columns=col_map)
    if "text" not in df.columns or "label" not in df.columns:
        raise ValueError(f"Expected 'text' and 'label' columns, but found: {list(df.columns)}")
    return df[["text", "label"]]


def map_sentiment_label(val):
    """
    Map labels:
    0, 1 -> 'negative'
    2    -> 'neutral'
    3, 4 -> 'positive'
    Also support 1-5 stars if mirror uses 1-indexed ratings:
    1, 2 -> 'negative', 3 -> 'neutral', 4, 5 -> 'positive'
    """
    if isinstance(val, str) and val in ("negative", "neutral", "positive"):
        return val
    try:
        val = int(val)
    except (ValueError, TypeError):
        raise ValueError(f"Cannot parse label value: {val}")

    if val in (0, 1):
        return "negative"
    elif val == 2:
        return "neutral"
    elif val in (3, 4):
        return "positive"
    elif val == 5:
        # 1-indexed 5 stars
        return "positive"
    else:
        raise ValueError(f"Unexpected label value: {val}")


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean dataframe:
    - normalize the escaped '\\n' sequences to spaces
    - strip whitespace
    - drop empty texts
    - drop exact duplicates
    """
    initial_len = len(df)
    # Ensure text is string and drop NaNs
    df = df.dropna(subset=["text", "label"]).copy()

    # Normalize escaped \n sequences and actual newlines to spaces
    df["text"] = (
        df["text"]
        .astype(str)
        .str.replace(r"\r", " ", regex=False)
        .str.replace("\r", " ", regex=False)
        .str.replace(r"\n", " ", regex=False)
        .str.replace("\n", " ", regex=False)
    )

    # Strip whitespace
    df["text"] = df["text"].str.strip()

    # Drop empty texts
    df = df[df["text"] != ""]

    # Drop exact duplicates
    df = df.drop_duplicates(subset=["text"]).copy()

    print(f"Cleaned split: {initial_len:,} -> {len(df):,} rows (removed {initial_len - len(df):,})")
    return df


def main():
    os.makedirs("data", exist_ok=True)

    dataset = load_dataset_with_fallback()

    # Determine train and test splits
    if "train" not in dataset:
        raise KeyError(f"'train' split not found in dataset. Available: {list(dataset.keys())}")
    if "test" not in dataset:
        raise KeyError(f"'test' split not found in dataset. Available: {list(dataset.keys())}")

    print("\nConverting splits to pandas...")
    raw_train_df = standardize_columns(dataset["train"].to_pandas())
    raw_test_df = standardize_columns(dataset["test"].to_pandas())

    print("Mapping labels...")
    raw_train_df["label"] = raw_train_df["label"].apply(map_sentiment_label)
    raw_test_df["label"] = raw_test_df["label"].apply(map_sentiment_label)

    print("\nCleaning train split...")
    train_pool = clean_dataframe(raw_train_df)

    print("\nCleaning test split...")
    test_pool = clean_dataframe(raw_test_df)

    # Subsampling
    # Target:
    # Train: 20,000 per class (60,000 total)
    # Val: 2,500 per class (7,500 total, taken from remaining training data, never overlapping train)
    # Test: 5,000 per class from official test split
    # random_state=42 everywhere
    classes = ["negative", "neutral", "positive"]

    print("\nSampling train set (20,000 per class, random_state=42)...")
    train_parts = []
    for c in classes:
        subset = train_pool[train_pool["label"] == c]
        if len(subset) < 20000:
            raise ValueError(f"Not enough samples for train class '{c}': available {len(subset)}, requested 20,000")
        train_parts.append(subset.sample(n=20000, random_state=42))

    train_df = pd.concat(train_parts, axis=0).sample(frac=1.0, random_state=42).reset_index(drop=True)

    # Remaining training data
    train_texts_set = set(train_df["text"])
    remaining_train = train_pool[~train_pool["text"].isin(train_texts_set)].copy()

    print("Sampling validation set (2,500 per class from remaining train, random_state=42)...")
    val_parts = []
    for c in classes:
        subset = remaining_train[remaining_train["label"] == c]
        if len(subset) < 2500:
            raise ValueError(f"Not enough samples for val class '{c}': available {len(subset)}, requested 2,500")
        val_parts.append(subset.sample(n=2500, random_state=42))

    val_df = pd.concat(val_parts, axis=0).sample(frac=1.0, random_state=42).reset_index(drop=True)

    # Test set: 5,000 per class from official test split
    # Ensure zero overlap with train and val
    val_texts_set = set(val_df["text"])
    excluded_texts = train_texts_set.union(val_texts_set)
    test_pool_filtered = test_pool[~test_pool["text"].isin(excluded_texts)].copy()

    print("Sampling test set (5,000 per class from test split, random_state=42)...")
    test_parts = []
    for c in classes:
        subset = test_pool_filtered[test_pool_filtered["label"] == c]
        if len(subset) < 5000:
            raise ValueError(f"Not enough samples for test class '{c}': available {len(subset)}, requested 5,000")
        test_parts.append(subset.sample(n=5000, random_state=42))

    test_df = pd.concat(test_parts, axis=0).sample(frac=1.0, random_state=42).reset_index(drop=True)

    # Verify zero text overlap
    print("\n--- Verifying zero text overlap between splits ---")
    final_train_texts = set(train_df["text"])
    final_val_texts = set(val_df["text"])
    final_test_texts = set(test_df["text"])

    overlap_train_val = final_train_texts.intersection(final_val_texts)
    overlap_train_test = final_train_texts.intersection(final_test_texts)
    overlap_val_test = final_val_texts.intersection(final_test_texts)

    print(f"Overlap train & val: {len(overlap_train_val)}")
    print(f"Overlap train & test: {len(overlap_train_test)}")
    print(f"Overlap val & test: {len(overlap_val_test)}")

    assert len(overlap_train_val) == 0, f"Found {len(overlap_train_val)} overlapping texts between train and val!"
    assert len(overlap_train_test) == 0, f"Found {len(overlap_train_test)} overlapping texts between train and test!"
    assert len(overlap_val_test) == 0, f"Found {len(overlap_val_test)} overlapping texts between val and test!"
    print("SUCCESS: Verified zero text overlap between all splits.")

    # Print class counts
    print("\n--- Class Counts ---")
    print(f"\nTrain Split (Total: {len(train_df):,}):")
    print(train_df["label"].value_counts().to_string())

    print(f"\nValidation Split (Total: {len(val_df):,}):")
    print(val_df["label"].value_counts().to_string())

    print(f"\nTest Split (Total: {len(test_df):,}):")
    print(test_df["label"].value_counts().to_string())

    # Save to data/train.csv, data/val.csv, data/test.csv
    print("\nSaving splits to data/...")
    train_df[["text", "label"]].to_csv("data/train.csv", index=False)
    val_df[["text", "label"]].to_csv("data/val.csv", index=False)
    test_df[["text", "label"]].to_csv("data/test.csv", index=False)

    print(f"Saved data/train.csv ({os.path.getsize('data/train.csv'):,} bytes)")
    print(f"Saved data/val.csv ({os.path.getsize('data/val.csv'):,} bytes)")
    print(f"Saved data/test.csv ({os.path.getsize('data/test.csv'):,} bytes)")
    print("\nprepare_data.py completed successfully.")


if __name__ == "__main__":
    main()
