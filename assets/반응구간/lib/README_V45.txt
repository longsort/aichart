v45 PATCH: 가격대 네모박스(요약) 추가

- ultra_home_screen.dart에 ZonePriceBoxesV1 삽입 (핵심 구간 요약)
- 새 위젯: lib/ui/widgets/zone_price_boxes_v1.dart
- 기존 ZoneCandidateEngine 결과(_zoneTop3)를 그대로 사용 (기능 삭제 없음)

적용:
1) 이 ZIP을 프로젝트 루트에 덮어쓰기
2) flutter clean
3) flutter pub get
4) flutter run -d windows
