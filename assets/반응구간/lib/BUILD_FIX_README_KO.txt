[빌드 에러 빠른 해결]

1) CMakeCache 경로 불일치 (cion/coin2 등 폴더명 바꿨을 때)
- 해결: build 폴더를 지우고 다시 생성해야 합니다.
- Windows: tools\clean_all.bat 실행
- Mac/Linux: ./tools/clean_all.sh 실행

2) Nuget.exe not found 메시지
- Windows 데스크탑 빌드 시 flutter가 NuGet을 자동으로 받으려다 뜨는 로그입니다.
- 보통은 자동 다운로드 후 계속 진행됩니다.
- 계속 막히면 Visual Studio Installer에서 "Desktop development with C++" 구성과 Windows SDK 설치 확인.

3) pub get 버전 충돌
- 이 프로젝트는 flutter_background_service 계열을 제거해서 충돌 원인을 원천 차단했습니다.

[권장 실행 순서]
1) tools\clean_all.bat
2) flutter pub get
3) flutter run -d windows
4) flutter run -d <android device>
