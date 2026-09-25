[윈도우/안드로이드 빌드 에라 1번에 정리]

1) 폴더 이름을 바꿨거나(coin2/cion 혼용) 위치를 옮긴 경우
- 반드시 아래를 삭제하고 다시 빌드하세요.
  - 프로젝트/build
  - 프로젝트/windows/flutter/ephemeral
  - 프로젝트/windows/flutter/ephemeral/.plugin_symlinks

2) CMakeCache 경로 불일치 에라
- 원인: build/windows/x64/CMakeCache.txt 가 예전 폴더 경로를 기억함
- 해결:
  - 프로젝트/build 폴더 삭제
  - flutter clean
  - flutter pub get
  - flutter run -d windows

3) PathExistsException (plugin_symlinks ... 이미 있음, errno=183)
- 해결:
  - 프로젝트/windows/flutter/ephemeral/.plugin_symlinks 삭제
  - flutter clean
  - flutter pub get

4) Nuget.exe not found
- 보통 경고(Flutter가 nuget 다운로드 시도). 네트워크/권한 문제면 VS Build Tools 설치 확인.

[중요 변경]
- flutter_background_service / flutter_background_service_android 제거
  (윈도우/안드로이드 동시 pub get 실패 방지)
- 실시간 갱신은 앱 실행(포그라운드) 상태에서 Timer로 동작

[권장 명령(순서 그대로)]
flutter clean
rmdir /s /q build
rmdir /s /q windows\flutter\ephemeral
flutter pub get
flutter run -d windows
