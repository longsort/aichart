# Fulink Pro ULTRA (원샷 완성본)

## 포함된 것
- **네온 다크 UI** (화려하게)
- **실시간 가격**: 거래소 선택(Bitget/Binance/Bybit) + 3초 주기 자동 갱신
- **타임프레임 종가마감 좋음/나쁨**: 15m/1h/4h/1D/1W/1M (캔들 기반)
- **결론/상태**: 대기/진입/유지/위험/종료 (단일 엔진)
- **1개 규칙**: 추천 진입 1 / 손절 1 / 목표 1
- **3버튼 실제 액션**: 들어가기(포지션 고정) / 유지하기(유지 강제) / 정리하기(종료)
- **자기학습 로그**: SQLite에 기록(심볼, TF, 진입/손절/목표, 상태, 결과)
- **미니차트 접기**: 기본은 접힘, 필요할 때만 펼침

## 실행
### 공통
```bash
flutter clean
flutter pub get
```

### Windows
```bash
flutter run -d windows
```

### Android
```bash
flutter run -d <deviceId>
```

## 가격이 거래소 앱이랑 다르면?
- 상단 **거래소 드롭다운**에서 해당 거래소로 바꿔서 확인.
- 심볼은 기본 `BTCUSDT`.

## 로그(DB)
- 앱 문서 폴더에 `fulink_trade_log.db` 생성
