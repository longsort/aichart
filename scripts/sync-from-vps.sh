#!/usr/bin/env bash
# 1:1 mirror: VPS /root/ailongshort → this workspace (keeps only local .git)
set -euo pipefail
: "${VPS_PASSWORD:?set VPS_PASSWORD}"
HOST="${VPS_HOST:-167.179.119.140}"
USER="${VPS_USER:-root}"
PORT="${VPS_PORT:-22}"
REMOTE="${REMOTE_ROOT:-/root/ailongshort}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export SSHPASS="$VPS_PASSWORD"
rsync -avz --delete \
  --exclude '.git/' \
  -e "sshpass -e ssh -o StrictHostKeyChecking=no -p ${PORT}" \
  "${USER}@${HOST}:${REMOTE}/" "${ROOT}/"
echo "OK: ${REMOTE}/ → ${ROOT}/ (identical except .git)"
