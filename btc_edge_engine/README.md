# BTC 15M Autonomous Edge Discovery Engine

스펙 기반 연구 엔진. Flutter 앱과 분리된 Python 모듈.

## Quick start

```bash
cd btc_edge_engine
pip install -r requirements.txt
# place raw CSV at data/raw/BTCUSDT_15m.csv
PYTHONPATH=. python3 scripts/run_pipeline.py
```

## Outputs

- `outputs/reports/FINAL_REPORT.md` — 20문항 포함
- `outputs/models/*` — calibrated LGBM
- `outputs/thresholds/frontier_oos.json` — probability frontier
- `outputs/reports/feature_ablation.json`

## Principles

DATA DISCOVERS → VALIDATION SELECTS → OOS PROVES → COSTS DECIDE → LIVE SIGNAL
