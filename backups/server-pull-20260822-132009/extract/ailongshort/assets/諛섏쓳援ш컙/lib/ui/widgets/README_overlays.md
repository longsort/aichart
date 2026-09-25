STEP 12 - 미니차트 오버레이

추가:
- ZoneOverlay: 지지/저항/FVG/BPR 같은 '박스' 표현
- LineOverlay: 레벨/VWAP 같은 '라인' 표현
- MiniRealtimeChart에 zones/lines 파라미터 추가

사용 예:
MiniRealtimeChart(
  candles: candles,
  zones: [ZoneOverlay(top: 96500, bottom: 96000, color: Colors.red, label: '저항')],
  lines: [LineOverlay(y: 95180, color: Colors.cyan, label: 'VWAP')],
)
