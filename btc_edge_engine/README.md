# BTC 15M Autonomous Edge Discovery Engine

스펙 기반 연구 엔진. Flutter/Next 앱과 분리된 Python 모듈.
**레버는 검증 통과값만** (`validated_only`). 50배 고정 금지. 실주문 기본 OFF.

## Quick start

```bash
cd btc_edge_engine
pip install -r requirements.txt
# place raw CSV at data/raw/BTCUSDT_15m.csv
PYTHONPATH=. python3 scripts/run_pipeline.py
```

### 페이퍼 신호 방출 (연구 통과 설정 → active_mode)

```bash
PYTHONPATH=. python3 scripts/15_emit_live_signal.py
```

앱 읽기: `GET /api/btc-edge/signal` (JSON만)

## Outputs

- `outputs/thresholds/active_mode.json` — 현재 페이퍼 모드 (레버·SL·게이트)
- `outputs/thresholds/paper_survival_m5_v1.json` — 5분확정 페이퍼 승격본
- `outputs/reports/latest_live_signal.json` — 최신 한글 상태 신호
- `outputs/trades/paper_journal.jsonl` — 페이퍼 저널
- `outputs/reports/FINAL_REPORT.md` — 20문항 포함

## Principles

DATA DISCOVERS → VALIDATION SELECTS → OOS PROVES → COSTS DECIDE → LIVE SIGNAL (paper)
