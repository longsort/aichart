# The Aegis – Server Pipeline (Stage 1 & 2)

아키텍처: **엔진은 연산하고, AI는 해설한다.**  
모든 수치/승률 계산은 이 서버(고정 규칙)에서 수행하고, OpenAI는 계산된 수치를 바탕으로 브리핑만 담당한다.

## 1단계: Data Ingestion

- **Binance WebSocket** 실시간 스트리밍
  - `depth@100ms`: 오더북 Depth (증분 병합 후 전체 유지)
  - `aggTrade`: 체결 데이터
- **Redis** 실시간 캐시
  - `orderbook:BTCUSDT` – 오더북 스냅샷
  - `trades:BTCUSDT` – 최근 5분 체결 (rolling, 중복 제거)

## 2단계: Microstructure Replay

- **입력**: Redis `orderbook:BTCUSDT`, `trades:BTCUSDT`
- **구간**: 30s / 60s / 180s / 300s rolling window
- **계산**:
  - **Dynamic Wall**: 가격대별 bid/ask 벽 변화 속도 (유지/쇠퇴/증가)
  - **Delta Acceleration**: 체결 델타의 시간에 따른 가속 (매수/매도 압력)
  - **Trade Density**: 가격대별 체결 밀도, absorption 후보
  - **Spread Monitor**: 스프레드 확대 여부 → 시장 불안정/실행 감점
- **출력**: `replay:BTCUSDT` – `replayBias` (bullish_building / bearish_building / neutral / unstable / spoof_risk)

## 실행 방법

```bash
# 의존성 (Python 3.10+)
pip install -r server/requirements-server.txt

# Redis 기동 (로컬)
redis-server

# 파이프라인 기동 (프로젝트 루트에서)
python -m server.run_pipeline
```

## 폴더 구조

```
server/
├── data/
│   ├── collectors/
│   │   ├── websocket_client.py   # Binance WS 재연결
│   │   ├── orderbook_collector.py
│   │   └── trades_collector.py
│   ├── storage/
│   │   └── redis_cache.py
│   ├── microstructure/
│   │   ├── replay_state.py      # 통합 replay + replayBias
│   │   ├── wall_velocity.py
│   │   ├── delta_acceleration.py
│   │   ├── trade_density.py
│   │   └── spread_monitor.py
│   └── dataHub.py               # 단일 진입점 (수집 + replay 루프)
├── requirements-server.txt
├── run_pipeline.py
└── README.md
```

## 다음 단계 (3~12)

- Zone Cluster Engine, Regime, Session, Probability, Freshness, False Break, Execution Gate, Kill Switch, Signal Engine, Decision Compression, AI Briefing는 동일 Redis/DataHub 인터페이스를 사용하도록 연동하면 된다.
