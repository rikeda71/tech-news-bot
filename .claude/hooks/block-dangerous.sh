#!/usr/bin/env bash
# PreToolUse hook for Bash: 危険コマンドを exit 2 でブロックする。
# stdin に Claude Code から JSON ペイロードが渡る。
#   { tool_name, tool_input: { command, description }, ... }
# permissions.deny でも防げるが、コマンド合成 (`A && B`, `A; B`, `$(...)`) を避けるため
# こちらは正規表現で実コマンド全体を見て判断する。

set -euo pipefail

# jq が無い環境でも極力動くように、まず jq を試して fallback で grep を使う。
INPUT="$(cat)"

extract_command() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$INPUT" | jq -r '.tool_input.command // empty'
  else
    # jq なし: 雑な抽出 ("command":"..." を取り出す)。改行や escape は弱いが最低限。
    printf '%s' "$INPUT" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
  fi
}

CMD="$(extract_command)"

if [[ -z "$CMD" ]]; then
  exit 0
fi

block() {
  printf 'BLOCKED by .claude/hooks/block-dangerous.sh: %s\n' "$1" >&2
  printf 'Command: %s\n' "$CMD" >&2
  exit 2
}

# 1) ルート / ホーム配下を rm -rf で消そうとする
if echo "$CMD" | grep -Eq '(^|[[:space:]])rm[[:space:]]+(-[[:alnum:]]*[rRfF][[:alnum:]]*[[:space:]]+)+(/|/\*|~|~/|\$HOME|\$HOME/|\.\.[/[:space:]])'; then
  block "rm -rf against root / home / parent dir is forbidden"
fi

# 2) main / master ブランチへの force push
if echo "$CMD" | grep -Eq 'git[[:space:]]+push[[:space:]]+(-f|--force(-with-lease)?)([[:space:]]+[^[:space:]]+)*[[:space:]]+(main|master)([[:space:]]|$)'; then
  block "force push to main/master is forbidden"
fi
if echo "$CMD" | grep -Eq 'git[[:space:]]+push[[:space:]]+[^[:space:]]+[[:space:]]+(main|master)[[:space:]]+(-f|--force(-with-lease)?)'; then
  block "force push to main/master is forbidden"
fi

# 3) commit hook の skip (--no-verify / -n)
if echo "$CMD" | grep -Eq 'git[[:space:]]+commit([[:space:]]+[^&;|]*)*[[:space:]](-n|--no-verify)([[:space:]]|$)'; then
  block "commit --no-verify / -n is forbidden (fix the underlying issue instead)"
fi

# 4) wrangler でリモート D1 への破壊的操作
if echo "$CMD" | grep -Eq 'wrangler[[:space:]]+d1[[:space:]]+execute' && \
   echo "$CMD" | grep -Eq -- '--remote' && \
   echo "$CMD" | grep -Eiq '\b(DROP|TRUNCATE|DELETE[[:space:]]+FROM|ALTER[[:space:]]+TABLE[[:space:]]+[^[:space:]]+[[:space:]]+DROP)\b'; then
  block "destructive D1 operation against --remote is forbidden via shell (use a migration file instead)"
fi

# 5) git config --global (グローバル設定の書き換えは禁止)
if echo "$CMD" | grep -Eq 'git[[:space:]]+config[[:space:]]+(--global|--system)'; then
  block "modifying git --global / --system config is forbidden"
fi

# 6) sudo / curl | sh 系のリモート実行
if echo "$CMD" | grep -Eq '(^|[[:space:]])sudo([[:space:]]|$)'; then
  block "sudo is forbidden inside this project"
fi
if echo "$CMD" | grep -Eq 'curl[[:space:]]+[^|]*\|[[:space:]]*(sh|bash|zsh)([[:space:]]|$)'; then
  block "piping curl into a shell is forbidden"
fi

exit 0
