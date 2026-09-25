from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.pipeline import Pipeline

from .utils import ENGINE_ROOT, load_config, write_json

try:
    import lightgbm as lgb

    HAS_LGBM = True
except Exception:
    HAS_LGBM = False


META_COLS = {
    "timestamp",
    "gap_flag",
    "swing_high_confirmed",
    "swing_low_confirmed",
    "eqh",
    "eql",
    "ema9",
    "ema20",
    "ema50",
    "ema100",
    "atr7",
    "atr14",
    "atr21",
    "vwap_20",
    "vwap_50",
}


def feature_columns(feat: pd.DataFrame) -> list[str]:
    cols = []
    for c in feat.columns:
        if c in META_COLS:
            continue
        if feat[c].dtype.kind not in "fcib":
            continue
        cols.append(c)
    return cols


def make_xy(feat: pd.DataFrame, labels: pd.DataFrame, target_col: str, idx: np.ndarray, cols: list[str]):
    X = feat.iloc[idx][cols]
    y = labels.iloc[idx][target_col]
    m = y.notna()
    # for clean labels Int64 0/1
    y = y[m].astype(int)
    X = X.loc[m]
    return X, y


def build_model(kind: str = "gbm"):
    cfg = load_config()
    seed = int(cfg["random_seed"])
    if kind == "logreg":
        return Pipeline(
            [
                ("imp", SimpleImputer(strategy="median")),
                (
                    "clf",
                    LogisticRegression(max_iter=400, class_weight="balanced", random_state=seed),
                ),
            ]
        )
    if HAS_LGBM and kind == "gbm":
        return Pipeline(
            [
                ("imp", SimpleImputer(strategy="median")),
                (
                    "clf",
                    lgb.LGBMClassifier(
                        n_estimators=200,
                        learning_rate=0.05,
                        num_leaves=31,
                        subsample=0.8,
                        colsample_bytree=0.8,
                        random_state=seed,
                        class_weight="balanced",
                        verbosity=-1,
                    ),
                ),
            ]
        )
    return Pipeline(
        [
            ("imp", SimpleImputer(strategy="median")),
            (
                "clf",
                HistGradientBoostingClassifier(
                    max_depth=6,
                    learning_rate=0.05,
                    max_iter=200,
                    random_state=seed,
                    class_weight="balanced",
                ),
            ),
        ]
    )


def train_side_models(feat: pd.DataFrame, labels: pd.DataFrame, splits: dict, target_base: str = "CLEAN_B"):
    cols = feature_columns(feat)
    write_json(ENGINE_ROOT / "outputs" / "models" / "feature_columns.json", {"columns": cols})
    out = {}
    for side in ("LONG", "SHORT"):
        target = f"{target_base}_{side}"
        if target not in labels.columns:
            continue
        Xtr, ytr = make_xy(feat, labels, target, splits["train_idx"], cols)
        Xva, yva = make_xy(feat, labels, target, splits["val_idx"], cols)
        if len(ytr) < 50 or ytr.nunique() < 2:
            continue
        model = build_model("gbm")
        model.fit(Xtr, ytr)
        # calibrate on validation
        cal = CalibratedClassifierCV(model, method="isotonic", cv="prefit")
        try:
            cal.fit(Xva, yva)
            clf = cal
        except Exception:
            clf = model
        pva = clf.predict_proba(Xva)[:, 1]
        metrics = {
            "n_train": int(len(ytr)),
            "n_val": int(len(yva)),
            "pos_rate_train": float(ytr.mean()),
            "pos_rate_val": float(yva.mean()),
            "auc_val": float(roc_auc_score(yva, pva)) if yva.nunique() > 1 else None,
            "brier_val": float(brier_score_loss(yva, pva)),
        }
        path = ENGINE_ROOT / "outputs" / "models" / f"{side.lower()}_model.joblib"
        joblib.dump({"model": clf, "cols": cols, "target": target, "metrics": metrics}, path)
        out[side] = {"path": str(path), **metrics}
    write_json(ENGINE_ROOT / "outputs" / "models" / "train_metrics.json", out)
    return out


def predict_proba(bundle, feat_row: pd.DataFrame) -> float:
    cols = bundle["cols"]
    X = feat_row[cols]
    return float(bundle["model"].predict_proba(X)[:, 1][0])
