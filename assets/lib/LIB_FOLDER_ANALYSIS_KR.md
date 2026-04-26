# assets/lib 폴더 정밀 분석 보고서

## 1. 개요

- **프로젝트명**: Fulink Pro ULTRA (cion)
- **패키지명**: `fulink_pro_ultra`
- **타입**: Flutter 앱 (SDK >=3.0.0 <4.0.0) + 일부 Python 스크립트
- **대략 규모**: Dart 파일 약 **763개**, 기타(.py, .md, .txt, .json 등) 포함 시 **889개** 이상

---

## 2. 진입점 및 앱 구조

### 2.1 진입점

- **`main.dart`**
  - 데스크톱(Windows/Linux/macOS)에서 `sqfliteFfiInit()` 호출
  - `ForegroundServiceBridge.start()` 실행
  - `RiskPresetManager.load().then(apply)` 후 `runApp(const FulinkApp())`
- **실제 루트 위젯**: `FulinkApp` → `MaterialApp` → `home: RootShell()`

### 2.2 루트 네비게이션 (RootShell)

- **IndexedStack** + 하단 **BottomNavigationBar** 3탭:
  1. **차트** → `UltraHomeScreen`
  2. **플랜** → `SignalsScreenV82`
  3. **통계** → `StatsSQLiteScreen`

### 2.3 참고: 사용되지 않는 진입점

- `app.dart`: `App` → `HomeScreen` (Fulink Pro 제목). **main에서는 사용 안 함** → 레거시 또는 다른 빌드용으로 추정.

---

## 3. 아키텍처 레이어

### 3.1 코어 싱글톤 (core/)

| 싱글톤 | 역할 |
|--------|------|
| **AppCore.I** | 앱 전체 **중앙 파이프**. `SnapshotHub` 1개 보유, `hub.push(Evidence)` / `hub.stream` 로 스냅샷 공급. |
| **EngineBridge.I** | 실시간 Evidence를 **AppCore**로 넣는 브리지. BitgetLiveStore 폴링 + EvidenceLiveHub 구독 → `AppCore.I.push(Evidence)`. 오프라인 시 데모(랜덤) Evidence로 폴백. |
| **RiskPresetManager** | 로드/적용 시점에 `main()`에서 사용. |

- **AppCore**는 `data/snapshot/` 의 `SnapshotHub`, `Evidence`, `EngineSnapshot` 를 사용.
- **EngineBridge**는 `engine/evidence/evidence_live_hub.dart` 를 import → **아래 “문제점” 참고.**

### 3.2 스냅샷 파이프: pipe/ vs data/snapshot/ (중복)

- **실제 사용처**: `core/app_core.dart` → **`data/snapshot/`** (snapshot_hub, evidence, engine_snapshot).
- **pipe/** 에도 거의 동일한 역할의 파일 존재:
  - `pipe/snapshot_hub.dart`, `pipe/evidence.dart`, `pipe/snapshot.dart` (클래스명 `EngineSnapshot`).
- **차이**:
  - **data/snapshot/evidence.dart**: `EvidenceSide` enum, `label` getter 등 보강.
  - **pipe/evidence.dart**: 위 확장 없음.
- **일부 UI만 pipe 사용**:
  - `practical_dashboard_screen.dart`, `half_compass_gauge.dart` 등은 **pipe** 의 SnapshotHub/Evidence/EngineSnapshot 사용 → **중앙 AppCore와 별개 인스턴스** 사용 가능성 있음 (일관성/버그 위험).

**권장**: 스냅샷/Evidence는 **한 곳(data/snapshot/)** 으로 통일하고, pipe 사용처를 data/snapshot 기반으로 이전하는 것이 안전함.

### 3.3 엔진 레이어 (engine/)

- **engine/engine.dart**: `decision_engine_v2.dart` 만 export.
- **DecisionEngineV2**: 캔들 기반 롱/숏/관망 판단, EMA/RSI/ATR, 구간(KeyZones), TyRong 확률, LearningEngine 보수성 패널티 적용. 결과는 `Decision` (title, subtitle, score, confidence, meters, locked 등).
- **engine/** 하위: decision, consensus, evidence, zone, learning, trade, paper, briefing, bootstrap, analyzer, safety, sync, notify 등 **다수의 서브엔진/헬퍼** 존재 (파일 수 많음).
- **core/engine_bridge.dart** 와 **engine/engine_bridge.dart** 는 별개: 전자가 실제 **EngineBridge** 클래스, 후자는 패치 조각(if (!evidence.valid) 등)만 포함.

### 3.4 코어 분석/설정 (core/)

- **core/analysis/**: 캔들 확률, 볼륨 품질, 구조 마크, 리스크, 브레이크아웃 품질, 히트맵, 엔트리 플래너, 패턴 shim 등.
- **core/engines/**: confidence, zone, structure_ai, position, liquidity_ai, reaction_strength, risk, consensus, probability_ai, decision_engine_v1 등.
- **core/autotune/**: tuning_params, tuning_bus, auto_tune.
- **core/ai/**: final_judgement_v2, ai_weights, ai_engine.
- **core/db/**: app_db, signal_dao, outcome_dao, tuning_dao, reports_dao 등.
- **core/models/**: **FuState** (매우 많은 필드: 가격, 점수, 신호, 구간, 포지션, P-LOCK, 마감/돌파/거래량 점수, 캔들/존 리스트 등), fu_candle, struct_mark 등.

### 3.5 로직 레이어 (logic/)

- tyron_engine, tyron_pro_engine, tyron_pre_engine, tf_consensus, trade_journal, session_score, flow_metrics, post_mortem, simple_review, self_tune, no_trade_lock 등 **11개** Dart 파일. 트레이딩/세션/리뷰/락 로직.

### 3.6 Core AI (core_ai/)

- **core_ai.dart**: Evidence 리스트로 LONG/SHORT/LOCK 비율 계산하는 단순 **CoreAI.run()**.
- **super_agi_v6/**: ev_calculator_v6, position_sizer_v6, stop_hunt_calculator_v6 등.
- **super_agi_v7.dart**: 반응구간 + 스탑헌팅 밴드 + EV + 동적 레버, **FuState** 기반으로 `SuperAgiV7Out` (state, evR, stopHuntRisk, huntBand, sl, qty, leverage, tp1/2/3, managerLine 등) 계산.

### 3.7 데이터 레이어 (data/)

- **data/snapshot/**: 스냅샷 허브/리더/스토어, Evidence, EngineSnapshot (실제 앱 코어 파이프).
- **data/bitget/**: BitgetLiveStore, BitgetClient, live_store 확장 등. 실시간 가격/거래량 폴링.
- **data/repository/**: Bitget 실시간 캔들 repo, 공개 API.
- **data/market/**: market_ticker, market_store, exchange, binance_public_client.
- **data/local/**, **data/exchange/**: DB, DAO, DTO (candle_dto, ticker_dto).
- **data/logging/**: log_service, future_path_db, app_db.
- **data/models/candle.dart**: `Candle` (DateTime t, o,h,l,c,v), fromJson 지원.

### 3.8 UI (ui/)

- **ui/screens/**: ultra_home_screen (매우 큼), signals_screen_v82, stats_screen_v82, root_shell, chart/briefing/future_path 풀스크린, 로그/튜닝/포지션/설정 등.
- **ui/widgets/**: 차트 관련(ai_gauges, ai_cards_panel, future_wave_panel), decision_dock/hud, tf_strip, sr_line, manager_trade_panel, neon_theme 등 다수.
- **ui/zone/**: zone_panel, zone_gauge_card.
- **theme/neon_theme.dart**: 네온 테마 export.

### 3.9 모델·기타

- **models/models.dart**: decision, ticker, plan, key_zones, ultra_result, zone export.
- **models/candle.dart**: `Candle` (tsMs, open, high, low, close, volume, turnover), fromArray(Bitget v3).
- **zone/**: user_zones_store 등.
- **pipe/**: 위와 같이 스냅샷/Evidence 중복 구현.
- **shims.dart**: fu_state_shims, pattern_shims, csv_chip_row_v1_shim export.

---

## 4. Candle 모델 분산 (중요)

**동일/유사 이름의 Candle(또는 캔들 DTO)이 여러 위치에 존재**하며, 필드/용도가 다름:

| 위치 | 클래스 | 주요 필드/용도 |
|------|--------|----------------|
| data/models/candle.dart | Candle | DateTime t, o,h,l,c,v; fromJson |
| models/candle.dart | Candle | tsMs, open..close, volume, turnover; fromArray (Bitget v3) |
| data/bitget_candles.dart | Candle | ts, open... (필드명 일부 다름) |
| data/exchange/dto/candle_dto.dart | CandleDto | int t, o,h,l,c,v |
| engine/modules/candle.dart | Candle | int t, o,h,l,c,v |
| engine/models/candle.dart | Candle | int t, o,h,l,c,v |
| engine/resample/candle_resampler.dart | Candle | DateTime t, o,h,l,c,v |
| model/candle.dart | Candle | openTimeMs 등 (다른 스키마) |

- **DecisionEngineV2**는 `../models/candle.dart` 가 아닌 `../models/candle.dart`(engine 쪽이 아닌 루트 models) 및 **engine/learning/learning_engine** 사용; 일부 코드는 `data/models/candle.dart` as rt, `models/candle.dart` as m 처럼 **alias로 구분**해 사용.
- **리팩터링 권장**: 도메인별로 하나의 Candle(또는 DTO) 정의를 두고, 나머지는 래퍼/변환 레이어로 정리하면 유지보수와 버그 감소에 유리함.

---

## 5. EvidenceLiveHub / EvidenceLive 부재 (빌드 위험)

- **core/engine_bridge.dart** 가 `../engine/evidence/evidence_live_hub.dart` 를 import하고, **EvidenceLiveHub.I**, **EvidenceLive** 타입을 사용.
- **engine/evidence/evidence_live_hub.dart** 내용은 **패치 조각만** 있음 (예: `Evidence buildEvidence(Store store) { ... }`). **EvidenceLiveHub 클래스와 EvidenceLive 클래스 정의가 해당 파일에 없음.**
- **EvidenceEngine** (evidence_engine.dart)에는 **EvidenceItem** / **EvidenceResult** 만 있고, EvidenceLive / EvidenceLiveHub 는 없음.

**결론**: 현재 상태로는 **EvidenceLiveHub** 및 **EvidenceLive** 가 정의되지 않아, 해당 import를 쓰는 모든 대상(EngineBridge, report_builder, dashboard_screen_v82 등)에서 **컴파일 에러**가 날 가능성이 큼.  
→ **EvidenceLiveHub** (싱글톤, `items: ValueNotifier<List<EvidenceLive>>`, `start()`) 및 **EvidenceLive** (key, title, score, dir 등)를 한 곳에 정의하거나, 패치로 덮어씌워진 원본 파일을 복구해야 함.

---

## 6. Python 파일

- **engine.py**, **main.py**, **models.py**, **config.py** 가 lib 루트에 있음. README에는 “python main.py” 로 **Decision Spine(롱/숏/관망 뼈대)** 실행 안내. Flutter 앱과 별도 스크립트로 보임.

---

## 7. 기타 파일/폴더

- **.dart_tool/**, **pubspec.lock**, ***.iml**: Flutter/Dart/IDE 설정.
- **assets/assets/**: patch.json, i18n (en.json, ko.json, zh.json). i18n은 짧은 키-값 위주.
- **README*.md / README*.txt / PATCH*.txt / BUILD*.md 등**: 빌드/패치/체크리스트 문서 다수. 실제 런타임 코드가 아닌 문서.
- **lib/lib/core/services/fu_engine.dart**: **lib 아래에 lib/core/... 중첩** → 패키지 구조상 일반적으로는 `lib/` 한 단계만 두므로, 이 경로는 실수이거나 레거시일 가능성 있음.

---

## 8. 요약 및 권장 사항

| 항목 | 상태 | 권장 |
|------|------|------|
| 스냅샷/Evidence | pipe/ 와 data/snapshot/ 이중 구현, 일부 UI가 pipe 사용 | data/snapshot 으로 통일, pipe 참조 제거 또는 위임 |
| Candle 모델 | 8곳 이상에 유사 Candle/캔들 DTO 분산 | 도메인별 1개 정의 + 변환 레이어로 정리 |
| EvidenceLiveHub / EvidenceLive | 사용되는데 정의 없음(패치 조각만 존재) | 클래스 정의 복구 또는 새 파일에 구현 |
| app.dart / HomeScreen | main에서 미사용 | 제거하거나 별도 진입점으로 명시 |
| lib/lib/ 중첩 | fu_engine 등 1파일 | lib 직하위로 이동 또는 패키지 구조 정리 |
| 테스트 | test/ 하위 Dart 파일 없음 | 핵심 엔진/브리지에 단위 테스트 추가 권장 |

전체적으로 **트레이딩/신호 판단 앱**으로, **중앙 파이프(AppCore + SnapshotHub)** 에 Evidence를 모아 스냅샷으로 뿌리고, **UltraHomeScreen** 등에서 FuState·Tyron·SuperAgiV7·차트/플랜/통계를 보여주는 구조이다.  
위와 같이 **스냅샷 단일화**, **Candle 모델 정리**, **EvidenceLiveHub/EvidenceLive 구현 복구**를 우선 적용하면 안정성과 유지보수성이 크게 좋아질 것이다.
