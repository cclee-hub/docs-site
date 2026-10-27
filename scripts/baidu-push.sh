#!/usr/bin/env bash
# 百度普通收录 API 推送（ziyuan.baidu.com → 普通收录 → API 推送）
# 用法:
#   baidu-push.sh <url> [<url>...]     推送指定 URL
#   cat urls.txt | baidu-push.sh       从 stdin 批量推送（每行一条）
# 响应: {"remain":N,"success":M} — remain 为今日剩余配额（新站配额有限，只推新文章）
# 接口地址（含 token）存于 cclee 根 credentials/ 目录，不进 git
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUSH_URL_FILE="$HOME/.secrets/shared/docs-site/baidu-push-url.env"
PUSH_URL="$(head -1 "$PUSH_URL_FILE" | tr -d '[:space:]')"
[ -n "$PUSH_URL" ] || { echo "::ERROR:: $PUSH_URL_FILE 为空或不存在"; exit 1; }

if [ $# -gt 0 ]; then
  URLS=$(printf '%s\n' "$@")
else
  URLS=$(cat)
fi
[ -n "$URLS" ] || { echo "::ERROR:: 未提供 URL（参数或 stdin）"; exit 1; }

curl -s -X POST -H 'Content-Type: text/plain' --data "$URLS" "$PUSH_URL"
echo
