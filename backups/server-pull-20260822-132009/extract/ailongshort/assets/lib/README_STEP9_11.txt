STEP9~11 통합 패치 (Procion v6 기준)

포함 내용
- manager_trade_panel.dart : 매니저 패널(실시간 브리핑/다음 포인트/방향 표기) 통합
- direction_gate_v10.dart : 방향 게이트(롱/숏/관망) 최소엔진 추가(향후 확장용)

적용 방법
1) 이 ZIP 압축 해제
2) 압축 안의 lib 폴더를 프로젝트 루트에 그대로 덮어쓰기
3) flutter clean
4) flutter pub get
5) flutter run

주의
- 기존 Step9/10/11 ZIP을 '따로' 덮어쓰지 말고, 이 통합본만 적용하면 됨
