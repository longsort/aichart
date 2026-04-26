FULINK PRO FINAL (Serverless A) - FU5 BASE
- Home 탭: HUD Dashboard Live (ConsensusBus 실데이터)
- 테마: HudTheme (네온/글래스)
- 백업: 홈 우측 상단 다운로드 버튼 -> fulink_backups 폴더에 JSON 저장 (서버 없이)
NOTE(중요):
- 이 ZIP은 FU5 베이스가 android/ 폴더가 없는 상태라, Android 배경 감시(Foreground Service)는 포함하지 못합니다.
  Android 배포를 하려면, 이 프로젝트 폴더에서 `flutter create .` 로 android/ios 생성 후,
  그 다음에 Foreground Service 패치(Manifest + RuntimeGuard)를 병합해야 합니다.
