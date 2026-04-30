# ADMIN_TOKEN ローテーション手順

`/api/admin/*` エンドポイントを保護する `ADMIN_TOKEN` のローテーション手順を示す。

## GitHub Actions との自動同期について

`WORKER_ADMIN_TOKEN` (GitHub Actions Secret) は **single source of truth** として扱う。
`.github/workflows/deploy.yml` に "Sync admin secret to Worker" ステップが含まれており、
`main` への push / deploy 実行時に `wrangler secret put ADMIN_TOKEN` で Worker 側に自動同期される。

### 自動同期パターン (推奨)

Worker の `ADMIN_TOKEN` を GitHub Actions の `WORKER_ADMIN_TOKEN` に従って自動更新する方式。

1. GitHub Actions Secret の `WORKER_ADMIN_TOKEN` を新しい値に更新する
2. `main` ブランチへの push (または GitHub Actions UI から deploy workflow を手動実行) する
3. deploy workflow が完了すると Worker の `ADMIN_TOKEN` も自動的に新しい値に更新される

この方式では GH と Cloudflare の 2 箇所に同じ値を個別に登録する手間が不要。

### 手動管理パターン

GitHub Actions を使わず、`wrangler secret put` で直接 Worker secret を更新する方式。
下記「ローテーション手順」に従って操作する。

---

Worker は `ADMIN_TOKEN`（現行）と `ADMIN_TOKEN_NEXT`（次世代）の両方を timing-safe で検証し、
どちらかに一致した場合に認証を通す。これによりダウンタイムなしでトークンを切り替えられる。

---

## ローテーション手順

### 1. 次世代トークンを生成して登録する

```bash
# 安全なランダム文字列を生成 (例: 32 バイト hex)
openssl rand -hex 32

# 生成した文字列を ADMIN_TOKEN_NEXT として登録
wrangler secret put ADMIN_TOKEN_NEXT
# 対話プロンプトに生成したトークンを貼り付ける
```

Worker は自動的に再デプロイされ、旧トークン (ADMIN_TOKEN) と新トークン (ADMIN_TOKEN_NEXT) の
両方を受け入れるようになる。

### 2. クライアント側を新トークンに切り替える

`/api/admin/*` を呼び出しているすべてのクライアント（GitHub Actions の secrets、
外部スクリプト等）を新トークン (`ADMIN_TOKEN_NEXT` に設定した値) に切り替える。

### 3. 稼働確認

新トークンで `/api/admin/*` が正常に動作することを確認する（例: `/api/admin/reports` から 200 レスポンスを受信）。

```bash
curl -s -o /dev/null -w "%{http_code}" \
  https://tech-news-bot.rikeda71.workers.dev/api/admin/reports \
  -H "Authorization: Bearer <new-token>"
# → 200 であれば OK
```

旧トークンがもう使われていないことも確認する。

### 4. 旧トークンを新トークンで上書きする

```bash
wrangler secret put ADMIN_TOKEN
# 対話プロンプトに新トークン (= ADMIN_TOKEN_NEXT の値) を貼り付ける
```

### 5. 次世代 secret を削除する

```bash
wrangler secret delete ADMIN_TOKEN_NEXT
```

これでローテーション完了。`ADMIN_TOKEN` のみが有効なトークンとなる。

---

## 注意事項

- `ADMIN_TOKEN` と `ADMIN_TOKEN_NEXT` の値が同じになると意図した区別がなくなるため、
  必ず別の値を使うこと。
- ローテーション完了後は `ADMIN_TOKEN_NEXT` を速やかに削除すること（不要な secret を残さない）。
- トークンの最小推奨長: 32 バイト以上 (hex 64 文字以上)。
- 本番ではトークンをソースコードや logs に出力しないこと。
