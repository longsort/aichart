# 백그라운드(폰 화면 꺼져도) 신호/분석 유지

이 프로젝트는 Android에서 `Foreground Service`로 동작합니다.
- 앱이 화면에서 내려가도 데이터 수집/분석 유지
- 롱/숏 신호(가능 상태)에서만 시스템 알림 발생

## 1) Android 권한/설정
1. 알림 권한 허용(Android 13+)
2. 배터리 최적화 제외(필수)
   - 설정 > 배터리 > 앱 배터리 사용 > 제한 없음(또는 최적화 제외)

## 2) 실행
```bash
flutter clean
flutter pub get
flutter run
```

## 3) 종료
백그라운드 서비스 종료가 필요하면 ServiceInstance에 stopService 이벤트를 보내도록 UI 버튼을 추가할 수 있습니다.
