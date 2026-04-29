#!/usr/bin/env bash
# SessionStart hook: 現在の git 状態 + 直近の D1 マイグレーション数を context に注入する。
# stdout に hookSpecificOutput の JSON を返すと Claude のコンテキストに乗る。

set -uo pipefail

if ! command -v git >/dev/null 2>&1; then
  exit 0
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")"
SHORT_SHA="$(git rev-parse --short HEAD 2>/dev/null || echo "?")"
DIRTY_COUNT="$(git status --porcelain 2>/dev/null | wc -l | tr -d ' ' || echo "0")"
MIGRATIONS_COUNT="$(ls migrations/*.sql 2>/dev/null | wc -l | tr -d ' ' || echo "0")"
LATEST_MIGRATION="$(ls migrations/*.sql 2>/dev/null | sort | tail -n 1 | sed 's|migrations/||' || echo "?")"
DATE_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "?")"

# 改行を含めたい場合は \n を使う (jq が無い場合の最小限 JSON 生成)
read -r -d '' CONTEXT <<EOF || true
session-start context (auto-injected from .claude/hooks/session-context.sh):
- branch: $BRANCH @ $SHORT_SHA
- working tree: $DIRTY_COUNT modified/untracked files
- migrations: $MIGRATIONS_COUNT files (latest: $LATEST_MIGRATION)
- now (UTC): $DATE_UTC
- main commands: pnpm check / pnpm test / pnpm test:client / pnpm e2e / pnpm build
- task flow: see .claude/rules/05-task-flow.md (issue-first)
EOF

# JSON エスケープ用の最小ヘルパ
escape_json() {
  python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null \
    || node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0, "utf8")))' 2>/dev/null \
    || printf '"%s"' "$(printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\t/\\t/g' | awk 'BEGIN{ORS=""} {print $0 "\\n"}')"
}

ESCAPED="$(printf '%s' "$CONTEXT" | escape_json)"

cat <<JSON
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": $ESCAPED
  }
}
JSON
