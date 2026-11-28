# ailongshort / aichart — VPS 배포

배포 방식: **PM2 + Next.js** (`scripts/vps-deploy.sh`, `ecosystem.config.cjs`). Vercel/Docker 아님.

## 알려진 호스트

| 항목 | 값 |
|------|-----|
| 예제 공인 IP | `167.179.119.140` |
| 앱 루트 (서버) | `/root/ailongshort` |
| HTTP | `http://167.179.119.140:3000` |
| 프로세스명 | `ailongshort` (PM2) |
| 로컬 경로 | `D:\apps\ailongshort` (Windows) / 이 저장소 `longsort/aichart` |

클라우드 에이전트에는 서버 SSH 키가 없습니다. 배포는 **서버에 SSH 가능한 사람**이 아래를 실행합니다.

## 로그인 목적지 (배포 후 확인)

허용 계정만 (공개 가입 없음):

| 계정 | 로그인 후 |
|------|-----------|
| `u1` | WMS 재고 `/dashboard` |
| `aichart1`, `aichart2`, `aichart3` | 차트 분석 홈 `/` |

## 서버에서 배포 (권장)

```bash
# 1) SSH
ssh root@167.179.119.140
# (키가 다르면) ssh -i ~/.ssh/<key> root@167.179.119.140

# 2) 코드 갱신 — 이 PR 머지 전이면 브랜치 지정
cd /root/ailongshort
git fetch origin
# 스택이 main에 머지된 뒤:
git checkout main && git pull origin main
# 또는 PR 브랜치를 직접 배포:
# git checkout cursor/login-route-deploy-4db5 && git pull origin cursor/login-route-deploy-4db5

# 3) Prisma (입고대기·경보 스키마 변경 시)
npx prisma generate
npx prisma db push

# 4) 빌드 + PM2
bash scripts/vps-deploy.sh
# 또는: npm run deploy:server
```

`vps-deploy.sh`가 하는 일: `npm ci` → `npm run build` → `pm2 start ecosystem.config.cjs` → `http://127.0.0.1:3000` 헬스체크.

## 환경 파일

서버에 `.env.production` 또는 `.env.local` 필요. 없으면 스크립트가 `.env.example`을 복사합니다.

필수:

```bash
APP_SESSION_SECRET=<긴-랜덤-문자열>
# 선택
PORT=3000
SERVER_PORT=3001
APP_USE_HTTPS=false   # HTTPS 리버스프록시 뒤면 true
```

계정 시드는 `data/site-users.json` + `lib/serverUsers.ts` (`u1` / `aichart1~3`).

## 운영 명령

```bash
pm2 status
pm2 logs ailongshort --lines 80
pm2 restart ailongshort
```

방화벽:

```bash
sudo ufw allow 3000/tcp && sudo ufw reload
```

## 로컬 → 서버 한 줄 (서버에 이미 클론된 경우)

```bash
ssh root@167.179.119.140 'cd /root/ailongshort && git pull && bash scripts/vps-deploy.sh'
```

## 라이브 URL

배포 성공 후: **http://167.179.119.140:3000**

(도메인/HTTPS가 있으면 리버스프록시만 추가하고 `APP_USE_HTTPS=true`.)
