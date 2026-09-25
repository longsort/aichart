---
name: merged-desk-visual-design
description: 통합·분석 차트 시각 재설계. 라벨 위치·문구는 유지하고 글꼴·존 fill/테두리만 바꾼다. Trigger: 차트 디자인, zone 색, 테두리, 글자체, 라벨 유지, 꽉 찬 화면, UI 설계.
---

# 통합분석 차트 시각 (라벨 유지)

이미지 생성으로 레이아웃을 새로 그리지 마라. 라벨을 레일로 옮기지 마라. 기능을 끄지 마라.

근거: Anthropic `frontend-design`(토큰 먼저, AI 슬롭 금지), Vercel Web Interface Guidelines(`tabular-nums`, 대비율), TradingView 작도 관례(존은 얇은 테두리 + 낮은 fill), `chart-ux`(존은 반투명 띠, 선은 1px).

## 고정 제약 (사용자)

- 모든 라벨 **위치·문구 그대로**
- 손대는 것: **글자체** + **zone 색상·테두리**만
- 파동경로, 마커, 하단 휴즘 HUD, 우측 툴레일 유지

## 글꼴

차트 라벨은 본문 폰트가 아니라 **데이터 라벨**이다.

| 역할 | 폰트 | 크기 | 두께 | 기타 |
|------|------|------|------|------|
| 가격·존 라벨 | Pretendard Variable, fallback `IBM Plex Sans KR` | 11px | 500 | `font-variant-numeric: tabular-nums` |
| 가격축 | 동일 | 11px | 500 | tabular-nums, 자간 0 |
| 짧은 배너 (오촌 등) | 동일 | 10px | 600 | padding 2×6px, radius 2px, 테두리 1px |

금지: Inter, Roboto, Arial, 두꺼운 라운드 캡슐, 3px 이상 검정 외곽선, 그림자 글로우.

라벨 칩 배경: `rgba(8,10,14,0.72)` — 글자 대비율 4.5:1 이상. 칩이 봉을 가리되 **위치를 옮기지 않음**.

## 존 색 (fill 낮고, 테두리만 또렷)

TradingView rectangle 관례: fill 약 12–18%, stroke 1px. 속이 탁하면 캔들이 안 보인다.

| 역할 | fill | border |
|------|------|--------|
| HTF 고점/금색대 | `rgba(196,163,90,0.14)` | `1px solid #C4A35A` |
| 공급/저항 | `rgba(232,93,93,0.14)` | `1px solid #E85D5D` |
| 수요/지지 | `rgba(46,201,183,0.14)` | `1px solid #2EC9B7` |
| 채널/추세띠 | `rgba(61,220,151,0.10)` | `1px solid #3DDC97` |
| 핵심 합류 | `rgba(196,163,90,0.18)` | `1px solid #D4B56A` |

금지: 8px 이상 두꺼운 밴드, 불투명 70%+ fill, 같은 색 여러 겹 포개서 탁하게.

가로 가격선은 존과 같은 hue, `lineWidth: 1`, opacity 0.85. 존 fill과 선을 이중으로 두껍게 그리지 말 것.

## 시안을 그릴 때

1. 사용자 스크린샷을 기준으로 **같은 라벨 자리**에 같은 한글을 둔다.
2. 존만 위 토큰으로 다시 칠한다.
3. 실전/분석/연구 토글, 상단 결정 스트립, 가격축 레일 **추가 금지** (사용자가 거절함).
4. 이미지 모델이 한글을 새로 창작하면 그 시안은 버린다.

## 구현 시 찾을 곳

- 존 HTML/오버레이: `app/components/ChartView.tsx`, zone overlay CSS
- 라벨 폰트: `CHART_PRO_FONT`, overlay label styles in `app/globals.css`
- 존 엔진 색: `lib/mergedDesk*` zone color helpers — **좌표·수명주기는 건드리지 말고 fill/stroke만**
