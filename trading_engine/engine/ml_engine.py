"""
ML PROBABILITY ENGINE
---------------------
XGBoost classifier: predict trade success (TP1 hit before stop).
Label: 1 if TP1 hit first, 0 if stop first.
Rules: >0.7 strong, >0.6 tradable, <0.55 ignore.
"""

import pandas as pd
import numpy as np
from typing import Optional, Tuple
import pickle
from pathlib import Path

try:
    import xgboost as xgb
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import accuracy_score, roc_auc_score
except ImportError:
    xgb = None
    train_test_split = None


FEATURE_COLS = [
    "structure_score",
    "liquidity_density_norm",
    "distance_to_liquidity",
    "order_block_strength",
    "fvg_size",
    "volume_spike",
    "trend_strength_norm",
    "volatility_regime",
    "displacement_strength",
    "orderflow_score",
]


def _create_labels(
    df: pd.DataFrame,
    entry_col: str = "entry",
    stop_col: str = "stop",
    tp1_col: str = "tp1",
    rr: float = 2.0,
) -> pd.Series:
    """
    Synthetic labels: 1 if price would hit TP1 before stop, 0 otherwise.
    Uses forward-looking logic for backtest; in production use actual outcomes.
    """
    labels = np.zeros(len(df))
    c = df["close"].values
    h = df["high"].values
    l = df["low"].values
    for i in range(len(df) - 20):
        entry = c[i]
        stop = entry * 0.98
        tp1 = entry * (1 + 0.02 * rr)
        for j in range(1, 21):
            if i + j >= len(df):
                break
            if l[i + j] <= stop:
                labels[i] = 0
                break
            if h[i + j] >= tp1:
                labels[i] = 1
                break
    return pd.Series(labels, index=df.index)


def train_ml_model(
    df: pd.DataFrame,
    test_size: float = 0.2,
    random_state: int = 42,
) -> Tuple[object, float, float]:
    """
    Train XGBoost classifier. Returns (model, train_acc, test_acc).
    """
    if xgb is None:
        raise ImportError("Install xgboost: pip install xgboost")

    df = df.copy()
    df["_label"] = _create_labels(df)

    available = [c for c in FEATURE_COLS if c in df.columns]
    X = df[available].fillna(0)
    y = df["_label"]
    valid = y.notna() & (y >= 0)
    X, y = X[valid], y[valid].astype(int)

    if len(X) < 100:
        raise ValueError("Insufficient data for training (need 100+ rows)")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state
    )
    model = xgb.XGBClassifier(
        n_estimators=100,
        max_depth=5,
        learning_rate=0.1,
        eval_metric="logloss",
    )
    model.fit(X_train, y_train)

    train_acc = accuracy_score(y_train, model.predict(X_train))
    test_acc = accuracy_score(y_test, model.predict(X_test))
    return model, train_acc, test_acc


def predict_probability(
    model: object,
    df: pd.DataFrame,
) -> pd.Series:
    """Predict trade success probability (0-1)."""
    available = [c for c in FEATURE_COLS if c in df.columns]
    X = df[available].fillna(0)
    proba = model.predict_proba(X)[:, 1]
    return pd.Series(proba, index=df.index)


def signal_strength(probability: float) -> str:
    """Convert probability to signal strength."""
    if probability > 0.7:
        return "strong"
    if probability > 0.6:
        return "tradable"
    if probability < 0.55:
        return "ignore"
    return "weak"
