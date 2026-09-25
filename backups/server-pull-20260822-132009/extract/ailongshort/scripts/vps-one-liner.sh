#!/usr/bin/env bash
# 원격 서버(SSH)에서 한 줄로: 저장소가 이미 /root/ailongshort 에 있다고 가정
#   curl -fsSL https://raw.githubusercontent.com/USER/REPO/main/scripts/vps-one-liner.sh | bash
# 로 쓰려면 저장소에 푸시 후 URL만 바꾸면 됩니다.
# 지금은 로컬에서 올린 코드 기준으로 서버에서만:
#   cd /root/ailongshort && bash scripts/vps-deploy.sh
set -euo pipefail
cd /root/ailongshort
exec bash scripts/vps-deploy.sh
