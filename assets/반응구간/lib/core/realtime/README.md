REALTIME MINI CHART (Option 1)

추가된 것:
- RealtimeBus: 2초 폴링/스트림 업데이트
- MiniRealtimePanel: StreamBuilder로 자동 갱신
- MiniRealtimeChart: 간단 캔들 CustomPainter (0값/극단치 방어)

연결:
1) RealtimeCandleRepo 구현만 해주면 됨.
2) 화면 initState에서 bus.start()
3) dispose에서 bus.dispose()
