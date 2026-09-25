# Fulink Pro – Super AI 앱 (통합본)

이 폴더는 사용자가 올린 두 ZIP(캔들 수 관리 단계 + AI 코멘트 단계)을 **통합한 단일 Flutter 프로젝트**입니다.

## 실행
### Android
```bash
flutter pub get
flutter run
```

### Windows
```bash
flutter pub get
flutter run -d windows
```

## 실전 기본값(운영 모드)
- 기본 심볼: **BTCUSDT**
- 기본 타임프레임: **15m**
- 신호 최소 확률 컷: **75%**
- 알림 최소 확률 컷: **75%**

설정 위치:
- `lib/core/app_settings.dart`

## 주요 파일(빠른 탐색)
- 앱 엔트리: `lib/main.dart`
- 메인 화면: `lib/ui/screens/ultra_home_screen.dart`
- AI 코멘트: `lib/core/services/ai_comment_service.dart`
- 엔진 허브: `lib/core/services/fu_engine.dart`

