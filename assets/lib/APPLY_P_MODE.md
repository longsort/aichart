# P MODE (PROFIT MODE) 패치 적용

## 핵심 변화
- WAIT 제거
- ZoneHit 발생 시 무조건 신호 후보 생성
- 확률 낮아도 소액 진입
- 하루 최소 신호 수 강제

## 연결 위치
- UltraHomeScreen _refresh():
  - FuState 생성 후
  - ProfitSignalForcer.shouldForce(state) == true 이면
    - signalDir 강제 설정
    - showSignal = true

이 패치는 '돈 버는 모드' 전용입니다.
