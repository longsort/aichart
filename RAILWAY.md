# Railway 배포

## Start Command (필수)

**Start Command** 없이 기본 `npm start`로 동작합니다. (Next.js + server 동시 실행)

## 동작

- **Next.js**: Railway가 부여한 `PORT`에서 실행 (웹/API)
- **server**: `SERVER_PORT`(기본 3001)에서 실행. 거래소 연결 후 `exchange connected success`, `collector started` 로그 출력
- `/api/market`, `/api/analyze`는 Next.js가 설정된 거래소(Bybit 기본)로 요청해 응답

## 환경 변수 (선택)

- `PORT`: Railway가 자동 설정. Next.js가 사용
- `SERVER_PORT`: server 포트 (기본 3001)
- **`EXCHANGE`**: `bybit`(기본, 451 회피) | `binance`. 451 오류 시 `bybit` 사용 권장
- `BINANCE_API_BASE`: Binance API 베이스 (기본 `https://api.binance.com`)
- `BYBIT_API_BASE`: Bybit API 베이스 (기본 `https://api.bybit.com`)
