# chart-analysis-step10-bundle

## run
npm install
npm run dev

## open
http://localhost:3000

## 사이트 로그인
- 허용 계정만: `u1`, `aichart1`, `aichart2`, `aichart3` (공개 가입 없음).
- 로그인 후: `u1` → `/dashboard`(WMS 재고), `aichart1~3` → `/`(차트 분석).
- 운영 시 `APP_SESSION_SECRET`에 임의의 긴 문자열을 설정하세요 (세션 쿠키 서명).
- 로그인 성공 시 HttpOnly 쿠키가 발급되며, `/api/*`(인증 제외)는 쿠키 없으면 401입니다.
- VPS 배포: [docs/deploy-vps.md](docs/deploy-vps.md) (`npm run deploy:server` / PM2).

## added in step10
- premium / discount / equilibrium zone
- support / resistance trendlines
- top references panel improved
- analysis history panel
- live engine scores
- cleaner right-side dashboard
