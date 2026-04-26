# FulinkPro FINAL ALL-IN-ONE (db.zip 기준)

## 1) 이 ZIP은 뭐냐
- lib/ : SQLite 기록 + 자율보정(AutoTune) + 통계 화면 + 데스크탑(Windows) SQLite 초기화 포함
- android_patch/ : 안드로이드 Foreground Service(A안)용 패치 조각 (기존 프로젝트의 android 폴더에 복붙)

## 2) 적용 순서 (Cursor)
1) 이 ZIP을 기존 프로젝트 루트에 덮어쓰기 (lib + pubspec)
2) pub get
3) (안드로이드) 기존 프로젝트에 android 폴더가 있으면:
   - android_patch/kotlin/ForegroundTradeService.kt 를
     android/app/src/main/kotlin/<패키지경로>/service/ForegroundTradeService.kt 로 복사
   - android_patch/AndroidManifest_service_snippet.xml 내용을 AndroidManifest.xml application 안에 추가
   - android_patch/MainActivity_methodchannel_snippet.kt 내용대로 MainActivity에 MethodChannel 추가

## 3) 결과
- 앱 재시작/리줌 시 DB + tuning_params 주입 자동
- 신호/결과/outcome 누적 → AutoTune이 thrConfirm 자동 조절
- 통계 탭에서 승률/튜닝로그 확인
- (안드) Foreground Service 붙이면 화면 꺼도 생존
