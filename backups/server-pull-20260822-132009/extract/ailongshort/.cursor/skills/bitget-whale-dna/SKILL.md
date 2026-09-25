---
name: bitget-whale-dna
description: >
  Bitget BTC 선물 CSV·고래 거래량 DNA 카탈로그 → 롱/숏·롱빔/숏빔·약/중/강 반등·하락.
  ailongshort 전용. UI는 캔들·거래량·가격축만 — 카드/HUD/레일/패널 금지.
  Trigger: bitget, 고래, whale, 거래량 DNA, 롱빔, 숏빔, 매집, 분산, beam intel,
  whale volume, bitget-whale, 구간 분석, 과거 CSV 비교.
---

# Bitget Whale DNA (ailongshort 전용)

## 데이터 파이프

1. `npm run data:bitget-futures` → `data/bitget-futures/BTCUSDT_*.csv`
2. `npm run data:bitget-whale-catalog` → `data/bitget-whale-catalog/*.json`
3. API: `/api/bitget-whale-volume-beam-intel`, `/api/bitget-whale-volume-match`

## 코드 (수정 시 이 순서)

| 파일 | 역할 |
|------|------|
| `lib/bitgetWhaleVolumeCatalog.ts` | 티어·지문·과거 매칭 |
| `lib/bitgetWhaleVolumeCompare.ts` | 구간·단일 캔들 비교 |
| `lib/whaleVolumeBeamIntel.ts` | 롱빔/숏빔 · 판정 · oracle 데이터 |
| `lib/whaleBeamChartMarkers.ts` | 거래량 시리즈 마커 |
| `lib/whaleVolumeSegmentSignals.ts` | SVG 구간 geom |
| `app/components/WhaleVolumeSegmentDrawLayer.tsx` | 박스·선·화살 (글자 없음) |
| `app/components/ChartView.tsx` | `bitgetVolumePackOn` 연동 |

## UI 정책 (절대)

- **금지**: 플로팅 카드, HUD, 레일, 패널, `WhaleBeamIntelRail`, `BitgetWhaleVolumeHud`, bottom strip 카드
- **허용**: SVG 구간 박스, 진입/목표 가격축 선, 거래량 막대 색·마커, 캔들 이탈 ▲▼ (짧은 글자만 거래량 막대 위)
- **마지막 캔들**: 박스는 직전 봉까지, 텍스트는 마지막 봉 위에 두지 않음
- **zone/SMC/OB**: 사용자 지시 없이 수정·삭제 금지

## 한글 등급

- 방향: `상승` / `하락` / `횡보`
- 빔: `롱빔` / `숏빔` / `관망`
- 등급: `약반등` `중반등` `강반등` `약하락` `중하락` `강하락`
- 진입: `롱·구간저점` / `숏·구간고점`
- 표현: 조건부·참고용 — 고정 승률·확정 수익 금지

## 작업 체크

- [ ] 카드/HUD 추가하지 않았는가
- [ ] `lib/`·`data/` 기준으로 추측 API 만들지 않았는가
- [ ] `npm run build` 또는 tsc 확인
