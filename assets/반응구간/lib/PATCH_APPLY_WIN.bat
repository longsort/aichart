\
@echo off
setlocal enabledelayedexpansion

REM Place this folder's contents into your Flutter project root (same level as pubspec.yaml)
REM Then run this script. It will copy patched lib files into your project.

if not exist "pubspec.yaml" (
  echo [ERROR] pubspec.yaml not found. Put this extracted folder contents into your Flutter project root and run again.
  pause
  exit /b 1
)

echo [OK] Found pubspec.yaml

REM Ensure target folders exist
if not exist "lib\ui\widgets" mkdir "lib\ui\widgets"
if not exist "lib\service" mkdir "lib\service"

echo Copying patched files...
copy /Y "lib\ui\widgets\future_wave_panel.dart" "lib\ui\widgets\future_wave_panel.dart" >nul
copy /Y "lib\ui\widgets\trade_review_card.dart" "lib\ui\widgets\trade_review_card.dart" >nul
copy /Y "lib\service\trade_log_db.dart" "lib\service\trade_log_db.dart" >nul

echo [DONE] Patch applied. Now run: flutter clean && flutter pub get && flutter run -d windows
pause
