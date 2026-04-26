# chart-analysis-step10-bundle

## run
npm install
npm run dev

## open
http://localhost:3000

## 사이트 로그인
- 첫 화면에서 **아이디·비밀번호** 입력 후 접속합니다.
- 기본값: `aichart` / `longshort` (`.env.local`에서 `APP_BRIEFING_LOGIN_USER`, `APP_BRIEFING_LOGIN_PASSWORD`로 변경 가능)
- 운영 시 `APP_SESSION_SECRET`에 임의의 긴 문자열을 설정하세요 (세션 쿠키 서명).
- 로그인 성공 시 HttpOnly 쿠키가 발급되며, `/api/*`(인증 제외)는 쿠키 없으면 401입니다.

## added in step10
- premium / discount / equilibrium zone
- support / resistance trendlines
- top references panel improved
- analysis history panel
- live engine scores
- cleaner right-side dashboard
