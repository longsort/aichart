# 전체 353개 이미지 분석 요약

## 분석 기준
- 실제 읽어본 이미지: 40+개
- 나머지: 경로/파일명 패턴 기반 분류 추정

---

## 1. 카테고리별 분포

| 카테고리 | 개수 | 설명 | SMC/ICT 적용 가능 |
|----------|------|------|-------------------|
| **FU-LINK 앱 UI** | ~25 | 한국어 브리핑, MARS 80:20, 패턴유사도, 세력/고래, 마감추세 | 브리핑 텍스트·수치 추출 |
| **캔들+SMC 오버레이** | ~90 | BOS, CHOCH, EQL, EQH, FVG, BPR, Zone, 트렌드라인 | ✅ 직접 적용 |
| **기술적 분석 교육** | ~35 | Double Top, Wedge, Gartley, Flag, Chart patterns | 패턴 참조용 |
| **하모닉 패턴** | ~15 | XABCD, Bat, Crab, Butterfly, Fib ratios | harmonicPoints | 타이롱
| **Bitget/TV 차트** | ~15 | BTCUSDT, Entry/SL/TP, 볼륨, MA | 진입/손절/TP 추출 |
| **스크린샷 (Samsung/Discord)** | ~90 | 웹/앱 캡처 | 일부 차트 포함 |
| **중국어 자료 (图片_*)** | ~45 | SMC 로드맵, 스윙, 하모닉 | OB/FVG/CHOCH/BOS 참조 |
| **비차트** | ~15 | 도넛, 막대, Behance UI, 공백 | ❌ 적용 불가 |
| **해시파일 (32자 .jpg)** | ~23 | ForexDoc 등 교육용 | 플래그, 더블탑 등 |

---

## 2. 실제 읽어 분석한 대표 이미지 (40+)

### FU-LINK / 앱 UI (13)
- `고래/퓨링크/고래/file_*.png` - 앱 대시보드 (Entry/SL/TP, 한국어 브리핑)
- `퓨에게_1~5.jpg` - 요약 코멘트, 패턴유사도, 세력압력, 리스크 5%룰
- `퓨_미래엔진_도넛/막대.png` - 도넛·막대 차트 (비캔들)

### SMC/ICT 캔들 차트 (12)
- `image.png` - BPR 1/2, Support Line (BTC 4h)
- `image-1.png` - XABCD 하모닉, Fib 0.618
- `BTCUSD_2026-02-26_00-24-11.png` - BOS, CHOCH, EQL, EQH, FVG (LuxAlgo)
- `3PGLQaYV.png` - Double Top (BTCUSDT 일봉)
- `4brU5AHk.png` - Double Top 4단계 (이중천장형)
- `2r6u4zi3.png` - Falling Wedge (하락쐐기)
- `0lHoXVm5.png` - Gann Fan, Resistance, 가격움직임 예측
- `D4i89WXF.png` - Gann 가격-시간 관계
- `1763472727638.png`, `1763475218951.png` - Bitget BTCUSDT (중국어)

### 교육/참조 자료 (10)
- `0943d86fd...jpg` - Wedge, Double Top, Neckline (ForexDoc)
- `09ca42bb9...jpg` - Gartley Bullish/Bearish
- `0e138381e...jpg` - Flag, V-shape, Double Top (ForexDoc)
- `0fcbd1479...jpg` - Elliott Wave Fib 표
- `고래/.../Screenshot_20251210_194312_ChatGPT.jpg` - 29 Chart Patterns
- `图片_20260208090148.jpg` - Top 9 SMC (OB, FVG, Zone, CHOCH, BOS)
- `下载.png` - 8 하모닉 패턴 (일본어)
- `图片_20260314000854.jpg` - Head & Shoulders, 头肩顶

### 비차트 (3)
- `고래/.../Screenshot_20251210_194248_ChatGPT.jpg` - Behance 대시보드
- `퓨에게_5.jpg` - 공백
- `퓨_미래엔진_도넛/막대.png` - 도넛·막대 (비캔들)

---

## 3. 적용 우선순위

| 우선순위 | 대상 | 예시 경로 |
|----------|------|-----------|
| 1 | LuxAlgo/트레이딩뷰 SMC 차트 | BTCUSD_*.png, image.png, image-1.png |
| 2 | Double Top, Wedge 등 패턴 | 3PGLQaYV, 4brU5AHk, 2r6u4zi3 |
| 3 | Bitget 앱 스크린샷 | 1763472727638, 1763475218951 |
| 4 | FU-LINK 브리핑 | 퓨에게_*, file_* |
| 5 | 图片_* 시리즈 | SMC·스윙 중국어 자료 |
| 6 | 해시 .jpg | ForexDoc 등 교육 차트 |

---

## 4. CHART_OVERLAY_KEYS 매핑

이미지에서 추출 시 참고할 오버레이 키:

| 이미지 유형 | 적용 가능 키 |
|-------------|--------------|
| SMC 차트 | `bprZones`, `supportLines`, `resistanceLines`, `trendlineSegments`, `liquidityZones` |
| LuxAlgo 스타일 | `eql`, `eqh`, BOS/CHOCH → `levelFlips`, `bos`, `choch` |
| 하모닉 | `harmonicPoints`, `harmonicPrzLines`, `supplyDemandZones` |
| 진입/TP | `entryLow`, `entryHigh`, `stop`, `tp1`, `tp2`, `tp3`, `side` |
| 패턴 | `triangleType`, `flagType`, `hsType`, `neckline`, `target` |

---

## 5. 파일 목록 (_list.txt용)

`_list.txt`에는 오버레이 JSON을 생성할 이미지 ID를 한 줄에 하나씩 적습니다.
현재 353개 이미지 경로는 `_all_paths.txt`에 저장됨.

오버레이 JSON 생성 후 `_list.txt` 예시:
```
img001
img002
...
img353
```

---

---

## 6. 패치 완료 상태 (2026-03-14)

| 항목 | 상태 |
|------|------|
| CHART_OVERLAY_KEYS 전체 매핑 | ✅ bos, choch, levelFlips, triangleType, flagType, hsType, harmonicPoints, gannFan, sweep, tailong, futurePath, candlestickPatterns, rsiDivergences, po3Phases 포함 |
| 샘플 오버레이 JSON | 8개 (img024, 031, 035, 038, 067, 083, 110, 117) |
| 353개 플레이스홀더 생성 | `node scripts/generate-placeholder-overlays.js` 실행 |
| Vision 추출 스크립트 | `OPENAI_API_KEY=xxx node scripts/extract-overlays-from-images.js --limit N` |

---

*생성일: 2026-03-14 | 분석 이미지 수: 353*
