from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import yaml

ENGINE_ROOT = Path(__file__).resolve().parents[1]


def load_yaml(path: Path | str) -> dict:
    with open(path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_config() -> dict:
    cfg = load_yaml(ENGINE_ROOT / "config" / "config.yaml")
    fees = load_yaml(ENGINE_ROOT / "config" / "fees.yaml")
    search = load_yaml(ENGINE_ROOT / "config" / "search_space.yaml")
    cfg["fees"] = fees
    cfg["search"] = search
    return cfg


def ensure_dirs() -> None:
    for p in [
        "data/raw",
        "data/cleaned",
        "data/features",
        "data/labels",
        "data/splits",
        "outputs/reports",
        "outputs/models",
        "outputs/charts",
        "outputs/trades",
        "outputs/thresholds",
    ]:
        (ENGINE_ROOT / p).mkdir(parents=True, exist_ok=True)


def file_hash(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()[:16]


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2, default=str), encoding="utf-8")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_div(a: np.ndarray | float, b: np.ndarray | float, eps: float = 1e-12):
    return a / np.maximum(b, eps)
