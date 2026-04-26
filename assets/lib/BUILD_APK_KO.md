# Fulink Pro (v6) APK 빌드 가이드 (KO)

## 0) 이 ZIP이 뭐냐
- **Fulink Pro v6 기준** 코드가 들어있습니다.
- 기존 기능 삭제 없이, **빌드 막는 컴파일 에러**(대표: `toUpperCase(int)`, `tp1/tp2/tp3`, `noTradeReason`, `levNeed` 등 UI-모델 계약 문제)를 **호환 게터/안전 처리**로 맞춘 상태입니다.

---

## 1) 추천 루트: PC에서 APK 만들기 (가장 확실)

### 1-1. 준비
- Flutter SDK (stable)
- Android Studio (Android SDK 포함)

### 1-2. 빌드
프로젝트 루트에서:
```bash
flutter clean
flutter pub get
flutter build apk --release
```

### 1-3. 생성된 APK 위치
```bash
build/app/outputs/flutter-apk/app-release.apk
```
이 파일을 폰으로 옮겨 설치하면 됩니다.

---

## 2) 폰(안드로이드)에서 직접 빌드 (난이도 높음)
> 가능은 하지만 환경 세팅이 빡셉니다.

### 2-1. Termux 설치
- Termux(F-Droid 버전) 권장

### 2-2. (권장) 폰에서는 "빌드"만 하지 말고, PC에서 APK 만든 뒤 설치
- 폰은 실행/테스트/설치가 목적일 때 가장 안정적입니다.

---

## 3) 빌드 꼬임(캐시) 해결
아래 3개를 **항상** 먼저 하세요.
```bash
flutter clean
rm -rf .dart_tool build
flutter pub get
```

---

## 4) 확인 체크리스트
- 앱 실행됨
- 패턴 클릭 시 분석 패널 열림
- ManagerTradePanel 관련 컴파일 에러 없음

