#!/usr/bin/env bash
#
# skills.sh — build / install / uninstall the Cakebaba Crypto Trading skill.
#
#   ./skills.sh build        Package the skill into dist/<name>.skill (upload to Claude.ai)
#   ./skills.sh install       Install into your local Claude Code skills dir
#   ./skills.sh uninstall     Remove the local install
#   ./skills.sh reinstall     uninstall + install (refresh after edits)
#   ./skills.sh status        Show build + install state
#
# Env overrides:
#   CLAUDE_SKILLS_DIR   Target skills dir (default: ~/.claude/skills)
#   INSTALL_MODE        copy | symlink   (default: copy)
#
set -euo pipefail

SKILL_NAME="cakebaba-crypto-skill"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIST="$ROOT/dist"
CLAUDE_SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
INSTALL_MODE="${INSTALL_MODE:-copy}"
TARGET="$CLAUDE_SKILLS_DIR/$SKILL_NAME"

# Files/dirs that make up the shippable skill.
PAYLOAD=(SKILL.md README.md references scripts .env.example)

c_green="$(printf '\033[32m')"; c_red="$(printf '\033[31m')"
c_dim="$(printf '\033[2m')";   c_reset="$(printf '\033[0m')"
ok()   { printf "%s✓%s %s\n" "$c_green" "$c_reset" "$1"; }
err()  { printf "%s✗%s %s\n" "$c_red" "$c_reset" "$1" >&2; }
info() { printf "%s•%s %s\n" "$c_dim" "$c_reset" "$1"; }

require() { command -v "$1" >/dev/null 2>&1 || { err "missing required command: $1"; exit 1; }; }

stage() {
  # Copy PAYLOAD into a clean dir, preserving the top-level skill folder name.
  local out="$1"
  rm -rf "$out"
  mkdir -p "$out/$SKILL_NAME"
  local item
  for item in "${PAYLOAD[@]}"; do
    [ -e "$ROOT/$item" ] || { info "skip (not found): $item"; continue; }
    cp -R "$ROOT/$item" "$out/$SKILL_NAME/"
  done
}

cmd_build() {
  require zip
  local stagedir="$DIST/.stage"
  stage "$stagedir"
  mkdir -p "$DIST"
  local archive="$DIST/$SKILL_NAME.skill"
  rm -f "$archive"
  ( cd "$stagedir" && zip -rq "$archive" "$SKILL_NAME" -x '*.DS_Store' )
  rm -rf "$stagedir"
  ok "built $archive"
  info "upload via Claude.ai → Settings → Capabilities → Skills"
}

cmd_install() {
  mkdir -p "$CLAUDE_SKILLS_DIR"
  if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
    info "removing existing $TARGET"
    rm -rf "$TARGET"
  fi
  if [ "$INSTALL_MODE" = "symlink" ]; then
    ln -s "$ROOT" "$TARGET"
    ok "symlinked $TARGET → $ROOT"
  else
    stage "$DIST/.stage-install"
    mv "$DIST/.stage-install/$SKILL_NAME" "$TARGET"
    rm -rf "$DIST/.stage-install"
    ok "installed $TARGET"
  fi
  info "restart Claude Code (or /skills reload) to pick it up"
}

cmd_uninstall() {
  if [ -e "$TARGET" ] || [ -L "$TARGET" ]; then
    rm -rf "$TARGET"
    ok "removed $TARGET"
  else
    info "nothing to remove at $TARGET"
  fi
}

cmd_reinstall() { cmd_uninstall; cmd_install; }

cmd_status() {
  info "skill name:        $SKILL_NAME"
  info "repo root:         $ROOT"
  info "skills dir:        $CLAUDE_SKILLS_DIR"
  info "install mode:      $INSTALL_MODE"
  if [ -f "$DIST/$SKILL_NAME.skill" ]; then
    ok "package built:     $DIST/$SKILL_NAME.skill"
  else
    info "package built:     no (run ./skills.sh build)"
  fi
  if [ -L "$TARGET" ]; then
    ok "installed:         $TARGET (symlink → $(readlink "$TARGET"))"
  elif [ -d "$TARGET" ]; then
    ok "installed:         $TARGET (copy)"
  else
    info "installed:         no (run ./skills.sh install)"
  fi
}

usage() {
  # Print the leading comment block only (stop at the first non-comment line).
  awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    build)      cmd_build ;;
    install)    cmd_install ;;
    uninstall)  cmd_uninstall ;;
    reinstall)  cmd_reinstall ;;
    status)     cmd_status ;;
    ""|-h|--help|help) usage ;;
    *) err "unknown command: $cmd"; echo; usage; exit 1 ;;
  esac
}

main "$@"
