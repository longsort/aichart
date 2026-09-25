# Fulink Pro ULTRA (윈도우/안드로이드 빌드)

## 0) 폴더명 바꿨는데 CMakeCache 에러가 나요
- **반드시** 아래 스크립트로 빌드 캐시를 지우고 다시 시작하세요.
  - Windows: `tools\\clean_all.bat`
  - Mac/Linux: `bash tools/clean_all.sh`

## 1) 실행
```bash
flutter pub get
flutter run -d windows
```

## 2) 안드로이드
```bash
flutter run -d emulator
# 또는
flutter run -d <deviceId>
```

## 3) 가격/캔들 실시간
- 기본은 **Bitget 공식(퍼블릭) API/WS** 경로로 연결됩니다.
- 네트워크가 막혀있으면 가격이 갱신되지 않을 수 있습니다.

## 4) Nuget.exe not found
- 윈도우 빌드에서 종종 뜨는 안내입니다(자동 다운로드/캐시 사용). 
- 빌드가 계속 실패하면 Visual Studio Build Tools + C++ Desktop 구성요소가 설치되어야 합니다.
