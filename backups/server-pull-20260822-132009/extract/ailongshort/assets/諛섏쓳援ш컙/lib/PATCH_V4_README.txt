
PATCH v4: 전체화면 브리핑 '실데이터 바인딩' 1차

- ultra_home_screen.dart: '통합 브리핑' 카드 탭 시 FullscreenBriefingScreen 열기
- FullscreenBriefingScreen: FuState(state) 기반으로
  - 지지/저항 가격(s1/r1)
  - 반응구간 유효도(zoneValid)
  - 신호 방향(signalDir, signalWhy)
  를 표시
- 오버레이(FVG/OB/CHOCH/BOS)는 FuState의 토글(showFvg/showOb/showChoch/showBos)에 따라 표시

v5에서:
- 실제 캔들 스케일/좌표와 연동하여 FVG/OB를 '가격기반 Rect'로 정확히 매핑
- 체결강도/매수·매도 강도 패널 추가
