#!/usr/bin/env bash
# PostToolUse hook for Edit / Write / MultiEdit: 編集されたファイルに oxfmt をかける。
# 失敗してもブロックしない (PostToolUse は exit 2 でも非ブロッキング)。
# stdin: { tool_input: { file_path | path | edits[].file_path }, ... }

set -uo pipefail

INPUT="$(cat)"

# jq が無い場合のフォールバック (file_path のみ抜き出し)
extract_path() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r '
      .tool_input.file_path
      // .tool_input.path
      // .tool_input.notebook_path
      // empty
    '
  else
    printf '%s' "$INPUT" | sed -n 's/.*"file_path"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
  fi
}

FILE="$(extract_path)"

if [[ -z "$FILE" ]] || [[ ! -f "$FILE" ]]; then
  exit 0
fi

case "$FILE" in
  *.ts|*.tsx|*.mts|*.cts|*.js|*.jsx|*.mjs|*.cjs|*.json|*.md|*.css|*.html|*.yaml|*.yml)
    ;;
  *)
    exit 0
    ;;
esac

# vp が無い環境ではスキップ (新規 clone 直後など)
if ! command -v pnpm >/dev/null 2>&1; then
  exit 0
fi

# 編集対象のあるファイルにのみ oxfmt 適用。失敗は警告ログだけにする。
if ! pnpm exec vp fmt --write "$FILE" >/dev/null 2>&1; then
  printf 'note: vp fmt failed for %s (non-blocking)\n' "$FILE" >&2
fi

exit 0
