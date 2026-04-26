#!/usr/bin/env bash
# VPS(예: 167.179.119.140)에서 프로젝트 루트에서 실행:
#   bash scripts/vps-deploy.sh
# 또는:
#   APP_ROOT=/root/ailongshort bash scripts/vps-deploy.sh
set -euo pipefail

ROOT="${APP_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"
echo "=========================================="
echo "[ailongshort] deploy ROOT=$ROOT"
echo "=========================================="

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "[오류] '$1' 명령이 없습니다. 설치 후 다시 실행하세요."
    exit 1
  }
}

need_cmd node
need_cmd npm

NODE_MAJOR="$(node -p "parseInt(process.versions.node,10)" 2>/dev/null || echo 0)"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "[경고] Node.js 18 LTS 이상을 권장합니다. 현재: $(node -v 2>/dev/null || true)"
fi

if [ ! -f package.json ]; then
  echo "[오류] package.json 없음. 코드가 $ROOT 에 있는지 확인하세요."
  exit 1
fi

# --- 운영 환경 파일 (없으면 예시 복사) ---
if [ ! -f .env.production ] && [ ! -f .env.local ]; then
  if [ -f .env.example ]; then
    echo "[안내] .env.production 생성 → .env.example 복사 (비밀번호·APP_SESSION_SECRET 반드시 수정)"
    cp .env.example .env.production
  elif [ -f env.example ]; then
    cp env.example .env.production
    echo "[안내] .env.production 생성 → env.example 복사 (값 수정 필수)"
  else
    echo "[안내] .env.production 이 없습니다. APP_SESSION_SECRET 등을 넣어 만드세요."
  fi
fi

export NODE_ENV=production

echo "[1/4] npm ci"
npm ci

echo "[2/4] npm run build"
npm run build

echo "[3/4] PM2 기동"
if ! command -v pm2 >/dev/null 2>&1; then
  echo "[안내] PM2 없음 → 전역 설치: npm install -g pm2"
  npm install -g pm2
fi

pm2 delete ailongshort 2>/dev/null || true
pm2 start "$ROOT/ecosystem.config.cjs"
pm2 save

echo "[4/4] 로컬 헬스 체크"
sleep 2
if curl -sf -o /dev/null "http://127.0.0.1:${PORT:-3000}/"; then
  echo "[OK] http://127.0.0.1:${PORT:-3000}/ 응답"
else
  echo "[경고] 로컬 HTTP 응답 없음. 로그: pm2 logs ailongshort"
fi

echo "=========================================="
echo "완료."
echo "  상태:    pm2 status"
echo "  로그:    pm2 logs ailongshort --lines 80"
echo "  재시작:  pm2 restart ailongshort"
echo "방화벽(ufw 사용 시): sudo ufw allow ${PORT:-3000}/tcp && sudo ufw reload"
PUB_IP="$( (curl -sS --connect-timeout 2 ifconfig.me 2>/dev/null) || true)"
if [ -n "$PUB_IP" ]; then
  echo "브라우저: http://${PUB_IP}:${PORT:-3000}"
fi
echo "=========================================="
