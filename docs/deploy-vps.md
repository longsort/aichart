# ailongshort / aichart — VPS 배포 (실사용)

배포 방식: **PM2 + Next.js** on Vultr VPS. (Vercel 아님)

## 실호스트

| 항목 | 값 |
|------|-----|
| Host | `167.179.119.140` |
| User | `root` |
| App root | `/root/ailongshort` |
| Live URL | **http://167.179.119.140:3000** |
| PM2 name | `ailongshort` |
| 로컬 PC | `D:\apps\ailongshort` |

## 자격증명 (로컬 전용 · gitignore)

실배포 스크립트들은 **gitignored** `deploy_today.py` 또는 환경변수로 SSH 비밀번호를 읽습니다.

```python
# deploy_today.py (repo 루트, 커밋 금지)
HOST = "167.179.119.140"
PORT = 22
USER = "root"
PASSWORD = "…"  # 로컬만
REMOTE_ROOT = "/root/ailongshort"
```

또는:

```bash
export VPS_HOST=167.179.119.140
export VPS_USER=root
export VPS_PASSWORD='…'
export VPS_PORT=22
export REMOTE_ROOT=/root/ailongshort
```

히스토리의 `scripts/_deploy_*.py` / `scripts/sync-from-vps.sh` 가 같은 패턴입니다.

## 서버에서 배포 (권장 · 실사용)

```bash
ssh root@167.179.119.140
cd /root/ailongshort
git fetch origin
git checkout -B cursor/login-route-deploy-4db5 origin/cursor/login-route-deploy-4db5   # 또는 main
# Prisma (WMS)
grep -q '^DATABASE_URL=' .env || echo 'DATABASE_URL="file:./data/wms.db"' >> .env
npx prisma generate && npx prisma db push
# 실사용 원샷
bash scripts/remote-full-deploy.sh
# (= cron secret 보정 → scripts/vps-deploy.sh → npm install → build → pm2)
```

헬스: `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/`

## 로그인 목적지

| 계정 | 로그인 후 |
|------|-----------|
| `u1` | `/dashboard` (WMS 재고) |
| `aichart1`, `aichart2`, `aichart3` | `/` (차트) |

공개 가입 없음 (allowlist).

## 운영

```bash
pm2 status
pm2 logs ailongshort --lines 80
pm2 restart ailongshort --update-env
```

## 주의

- **필수:** 루트에 `postcss.config.mjs` + `tailwind.config.ts` 가 있어야 WMS(`/dashboard`) CSS가 빌드됩니다. 없으면 프로덕션 CSS에 raw `@tailwind` 가 남아 미스타일 HTML이 됩니다.
- `vps-deploy.sh` 는 **devDeps 포함** `npm install` 후 빌드하고, 빌드 산출물에 raw `@tailwind` 가 있으면 실패합니다.
- 서버에 `restore-chart-features` 등 **untracked** 소스가 남아 있으면 typecheck가 깨질 수 있습니다. 배포 전에 격리하거나 clean 하세요.
- 디스크 full 이면 stash/checkout 실패 → `df -h`, `npm cache clean`, `.next`/로그 정리.
- 차트 전역 스타일은 `public/globals.css` (`/globals.css`). WMS는 Next 번들 `/_next/static/css/*.css` (Tailwind).
