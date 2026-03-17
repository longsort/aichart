# 이미지 기반 AI 차트 100% 동일 작도 설계서

> `assets/` 내 차트·분석 이미지를 AI가 자동 인식하여, 원본과 **똑같이** 작도·브리핑하는 구조

---

## 1. 목표

| 항목 | 설명 |
|------|------|
| **입력** | `assets/` 내 차트 이미지 (PNG, JPG 등) |
| **출력** | 원본 이미지와 **100% 동일**한 차트 작도 + 브리핑 |
| **요구** | 이미지만 넣으면 AI가 스스로 인식·작도 |

---

## 2. Assets 구조

```
assets/
├── images/                    # 차트/분석 이미지
│   ├── charts/                # 순수 차트 스크린샷
│   │   ├── BTCUSDT_1h_001.png
│   │   └── ...
│   ├── analysis/              # 분석 오버레이 포함 이미지
│   │   └── ...
│   └── reference/             # 100% 재현 기준 이미지
│       └── ...
├── image_analysis/            # AI 추출 결과 (자동 생성)
│   ├── BTCUSDT_1h_001_overlay.json   # CHART_OVERLAY_KEYS 형식
│   ├── BTCUSDT_1h_001_briefing.json  # sample_briefing 형식
│   ├── BTCUSDT_1h_001_candles.json   # 캔들 OHLCV (옵션)
│   └── _manifest.json         # 이미지↔결과 매핑
├── CHART_OVERLAY_KEYS.md      # (기존) 오버레이 키 명세
├── sample_overlay_output.json # (기존) 오버레이 예시
└── sample_briefing.json       # (기존) 브리핑 예시
```

---

## 3. 파이프라인 개요

```
[이미지] → [Vision 분석] → [추출 JSON] → [작도 엔진] → [100% 동일 차트]
                ↓
           [브리핑 생성]
                ↓
           [브리핑 카드]
```

---

## 4. Phase 1: Vision 추출 (이미지 → JSON)

### 4.1 추출 대상

| 요소 | 추출 형식 | CHART_OVERLAY_KEYS 키 |
|------|-----------|------------------------|
| 수평선 (진입/손절/TP/BOS/CHOCH) | `{price: number, label?: string}` | entryLow, stop, tp1, bos, choch 등 |
| 수평 영역 (진입구간, 박스) | `{top: number, bottom: number}` | entryLow/High, boxTop/Bottom |
| 대각선 (추세선) | `{t1, p1, t2, p2, label}` | trendlineSegments |
| 패턴 (삼각, 깃발, H&S) | 기존 명세 형식 | triangleType, flagTop, hsNeckline 등 |
| 라벨/텍스트 | `{text, price?, time?}` | 라벨 표시용 |

### 4.2 Vision 옵션

| 옵션 | 설명 | 장단점 |
|------|------|--------|
| **로컬** | Flutter `image` + `tflite` / `google_mlkit` | 오프라인, 속도 제한 |
| **클라우드** | Google Vision API, OpenAI Vision | 정확도 높음, API 키·비용 |
| **하이브리드** | 이미지→픽셀/색 추출 후 휴리스틱 | 구현 단순, 정확도 보통 |

### 4.3 추출 스키마 (image_analysis/*.json)

```json
{
  "sourceImage": "images/charts/BTCUSDT_1h_001.png",
  "extractedAt": "2026-03-09T12:00:00Z",
  "overlay": {
    "entryLow": 90350,
    "entryHigh": 90450,
    "stop": 89500,
    "tp1": 91200,
    "tp2": 92000,
    "tp3": 92800,
    "side": "LONG",
    "bos": 91200,
    "choch": 90500,
    "sweep": 89800,
    "trendlineSegments": [...],
    "triangleType": "ASCENDING",
    "triangleLine": 90200,
    "triangleTarget": 92500
  },
  "briefing": { "decision": "LONG", ... },
  "candles": null
}
```

- `overlay` 는 `CHART_OVERLAY_KEYS`·`sample_overlay_output.json` 과 동일 형식
- `briefing` 는 `sample_briefing.json` 과 동일 형식

---

## 5. Phase 2: 작도 엔진 (JSON → 차트)

### 5.1 100% 동일 작도 조건

| 조건 | 처리 |
|------|------|
| **가격 스케일** | 이미지 Y축 ↔ 실제 가격 매핑 (픽셀→가격) |
| **시간 스케일** | 이미지 X축 ↔ 실제 타임스탬프 매핑 |
| **선 색/두께** | CHART_OVERLAY_KEYS 또는 추출 시 저장된 style |
| **라벨 위치** | (price, time) → (x%, y%) 좌표 보존 |

### 5.2 좌표 정규화

```
이미지 픽셀 (px, py) → (time_normalized, price_normalized) → 작도 좌표
```

- Vision 단계에서 **축 가격/시간 구간** 추출
- `price = pMin + (1 - py/height) * (pMax - pMin)`
- `time = tMin + (px/width) * (tMax - tMin)`

### 5.3 기존 작도 레이어 재사용

- `ChartHost.fullOverlayPayload` 에 `image_analysis/*.json` 의 `overlay` 전달
- `_OverlayPainter` 로 수평선·대각선·영역 등 통합 렌더링

---

## 6. Phase 3: 통합 흐름

### 6.1 AssetAnalyzer 확장

```
AssetAnalyzer.analyzeFromImages(symbol?)
  ├── assets/images/charts/*.png 스캔
  ├── image_analysis/{name}_overlay.json 로드 (캐시)
  │   └── 없으면 Vision 추출 → 저장
  └── overlay + briefing 반환
```

### 6.2 병합 우선순위

```
최종 overlay = 캔들분석 ∪ assets JSON ∪ image_analysis JSON
```

- 이미지 기반 결과가 있으면 우선 사용
- 부족한 키는 캔들·assets JSON으로 보강

---

## 7. 구현 순서

| 단계 | 작업 | 산출물 |
|------|------|--------|
| 1 | `assets/images/` 구조 + 이미지 경로 설정 | 폴더 구조 |
| 2 | 이미지→JSON 수동 샘플 작성 | `image_analysis/sample_overlay.json` |
| 3 | `ImageAnalysisService` - JSON 로드·병합 | 분석 서비스 |
| 4 | ChartHost에 image overlay 적용 | 차트 작도 |
| 5 | (선택) Vision API 연동 또는 휴리스틱 추출 | 자동 추출 |

---

## 8. pubspec assets 추가

```yaml
flutter:
  assets:
    - assets/images/
    - assets/image_analysis/
```

---

## 9. 참고

- `CHART_OVERLAY_KEYS.md` : 오버레이 키 정의
- `sample_overlay_output.json` : 오버레이 예시
- `sample_briefing.json` : 브리핑 예시
- `ASSETS_PATTERN_SPEC_100.md` : 패턴 규칙
