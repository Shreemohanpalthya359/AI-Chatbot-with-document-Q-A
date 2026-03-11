"""
trainer.py — ML Training Module for AI Document Q&A
=====================================================
Trains the two best-performing classifiers for text embeddings:
  1. Support Vector Machine (SVM)  — best for high-dim text data
  2. XGBoost                        — highest accuracy ensemble

Uses local HuggingFace sentence embeddings to vectorize document chunks,
then trains and evaluates on an 80/20 train/test split.

All output is printed to the terminal.
"""

import os
import sys
import numpy as np

from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_huggingface import HuggingFaceEmbeddings

from sklearn.svm import SVC
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    classification_report, confusion_matrix,
)
from sklearn.preprocessing import LabelEncoder

try:
    from xgboost import XGBClassifier
    XGBOOST_AVAILABLE = True
except ImportError:
    XGBOOST_AVAILABLE = False


DIVIDER = "=" * 65


# ─── Data Loading ─────────────────────────────────────────────────────────────

def load_and_embed(upload_folder: str, embeddings: HuggingFaceEmbeddings):
    splitter = RecursiveCharacterTextSplitter(chunk_size=600, chunk_overlap=100)
    X, y = [], []

    pdf_files = [f for f in os.listdir(upload_folder) if f.endswith(".pdf")]
    if not pdf_files:
        return None, None, []

    print(f"\n📂 Documents found: {len(pdf_files)}")
    for pdf_file in pdf_files:
        filepath = os.path.join(upload_folder, pdf_file)
        try:
            docs = PyPDFLoader(filepath).load()
            chunks = splitter.split_documents(docs)
            texts = [c.page_content.strip() for c in chunks if c.page_content.strip()]
            if not texts:
                print(f"  ⚠  {pdf_file}: no text extracted, skipping.")
                continue
            vecs = embeddings.embed_documents(texts)
            label = os.path.splitext(pdf_file)[0]
            X.extend(vecs)
            y.extend([label] * len(vecs))
            print(f"  ✅ {pdf_file}: {len(texts)} chunks → label '{label}'")
        except Exception as exc:
            print(f"  ❌ {pdf_file}: {exc}")

    return np.array(X) if X else None, np.array(y) if y else None, pdf_files


# ─── Model Definitions ────────────────────────────────────────────────────────

def get_svm():
    return SVC(
        kernel="rbf", C=10.0, gamma="scale",
        class_weight="balanced", probability=True, random_state=42,
    )


def get_xgboost(n_classes: int):
    if not XGBOOST_AVAILABLE:
        return None
    objective = "multi:softprob" if n_classes > 2 else "binary:logistic"
    return XGBClassifier(
        n_estimators=300, max_depth=6, learning_rate=0.1,
        subsample=0.8, colsample_bytree=0.8,
        objective=objective, eval_metric="mlogloss",
        random_state=42, n_jobs=-1,
    )


# ─── Training & Evaluation ────────────────────────────────────────────────────

def evaluate(name: str, model, X_train, X_test, y_train, y_test, X_all, y_enc, le):
    print(f"\n▶  Training {name}...")
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    acc  = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, average="weighted", zero_division=0)
    rec  = recall_score(y_test, y_pred,    average="weighted", zero_division=0)
    f1   = f1_score(y_test, y_pred,        average="weighted", zero_division=0)

    cv_n   = min(5, len(np.unique(y_enc)) * 2)
    cv_scores = cross_val_score(model, X_all, y_enc, cv=cv_n, scoring="accuracy")

    print(f"\n   {DIVIDER}")
    print(f"   📊 {name} — Results")
    print(f"   {DIVIDER}")
    print(f"   Accuracy          : {acc*100:.2f}%")
    print(f"   Precision         : {prec*100:.2f}%")
    print(f"   Recall            : {rec*100:.2f}%")
    print(f"   F1-Score          : {f1*100:.2f}%")
    print(f"   Cross-Val Accuracy: {cv_scores.mean()*100:.2f}% ± {cv_scores.std()*100:.2f}%")

    # Per-class classification report
    y_test_lbl = le.inverse_transform(y_test)
    y_pred_lbl = le.inverse_transform(y_pred)
    print(f"\n   Classification Report:\n")
    print(classification_report(y_test_lbl, y_pred_lbl, zero_division=0))

    # Confusion matrix
    cm = confusion_matrix(y_test_lbl, y_pred_lbl, labels=le.classes_)
    col_w = max(len(c) for c in le.classes_) + 2
    print(f"   Confusion Matrix:")
    print("   " + " " * col_w + "".join(f"{c:>{col_w}}" for c in le.classes_))
    for i, lbl in enumerate(le.classes_):
        row_str = "   " + f"{lbl:>{col_w}}" + "".join(f"{cm[i][j]:>{col_w}}" for j in range(len(le.classes_)))
        print(row_str)

    return {"model": name, "accuracy": acc, "f1": f1,
            "cv_mean": cv_scores.mean(), "cv_std": cv_scores.std()}


# ─── Main Entry ───────────────────────────────────────────────────────────────

def run_training(upload_folder: str = "uploads"):
    print("\n" + DIVIDER)
    print("   🚀  AI Document Q&A — Model Training")
    print(DIVIDER)

    # Load embeddings
    print("\n📡 Loading local embeddings model...")
    embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    print("   Ready.")

    # Embed documents
    print("\n📄 Embedding document chunks...")
    X, y, pdf_files = load_and_embed(upload_folder, embeddings)

    if X is None or len(X) == 0:
        msg = "No documents found. Upload at least 2 PDFs first."
        print(f"\n❌ {msg}")
        return {"error": msg}

    n_classes = len(np.unique(y))
    print(f"\n📊 Dataset — {len(X)} samples | {X.shape[1]} features | {n_classes} classes")

    if n_classes < 2:
        msg = "Upload at least 2 different PDF documents to enable classification training."
        print(f"\n⚠  {msg}")
        return {"error": msg}

    # Encode labels
    le = LabelEncoder()
    y_enc = le.fit_transform(y)

    # 80 / 20 split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y_enc, test_size=0.2, random_state=42, stratify=y_enc
    )
    print(f"\n🔀 Split → Train: {len(X_train)}  |  Test: {len(X_test)}")

    results = []

    # ── SVM ──────────────────────────────────────────────────────────────────
    svm_result = evaluate("Support Vector Machine (SVM)", get_svm(),
                          X_train, X_test, y_train, y_test, X, y_enc, le)
    results.append(svm_result)

    # ── XGBoost ──────────────────────────────────────────────────────────────
    xgb = get_xgboost(n_classes)
    if xgb is not None:
        xgb_result = evaluate("XGBoost", xgb,
                              X_train, X_test, y_train, y_test, X, y_enc, le)
        results.append(xgb_result)
    else:
        print("\n⚠  XGBoost not installed — run: pip install xgboost")

    # ── Best Model Summary ────────────────────────────────────────────────────
    best = max(results, key=lambda r: r["f1"])
    print("\n" + DIVIDER)
    print(f"   🏆  BEST MODEL: {best['model']}")
    print(f"   ✅  Accuracy   : {best['accuracy']*100:.2f}%")
    print(f"   ✅  F1-Score   : {best['f1']*100:.2f}%")
    print(f"   ✅  CV Accuracy: {best['cv_mean']*100:.2f}% ± {best['cv_std']*100:.2f}%")
    print(DIVIDER + "\n")

    return {
        "best_model": best["model"],
        "best_accuracy": round(best["accuracy"], 4),
        "best_f1": round(best["f1"], 4),
        "models": results,
        "num_samples": len(X),
        "num_classes": n_classes,
    }


if __name__ == "__main__":
    folder = sys.argv[1] if len(sys.argv) > 1 else "uploads"
    run_training(upload_folder=folder)
