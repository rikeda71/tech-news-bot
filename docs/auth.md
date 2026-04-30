# Authentication & Cloudflare Access

tech-news-bot の管理エンドポイント (`/api/admin/*`) は **Cloudflare Access (Zero Trust)** で
認証保護することを前提に設計されている。

## アーキテクチャ

```text
[ブラウザ] -> [Cloudflare Access (ネットワーク層)] -> [Worker]
                  | 未認証 -> ログインページへ
                  | 認証済み -> Cf-Access-Jwt-Assertion 付与
                                       |
                                  [accessJwtMiddleware]
                                       |
                                  [adminAuthMiddleware]  (Bearer token, 並行運用)
                                       |
                                  [admin handler]
```

cron (`scheduled()`) は Access を経由せず内部発火するため、middleware の影響を受けない。

## 設定手順

### 1. Cloudflare Zero Trust ダッシュボードでアプリケーション登録

1. https://one.dash.cloudflare.com/ にアクセス
2. **Access** -> **Applications** -> **Add an application** -> **Self-hosted**
3. アプリ設定:
   - **Application name**: `tech-news-bot-admin`
   - **Session Duration**: 24h など
   - **Application domain**: `tech-news-bot.<account>.workers.dev/api/admin/*`
4. ポリシー設定:
   - **Action**: Allow
   - **Include**: `Emails ending in @your-domain.com` または GitHub/Google IdP
5. **Audience Tag** (`CF_ACCESS_AUD`) と **Team Domain** (`<team>.cloudflareaccess.com`) を控える

### 2. Worker 側の env 設定

`wrangler secret put CF_ACCESS_AUD` と `wrangler secret put CF_ACCESS_TEAM_DOMAIN` で
本番に登録する。`[vars]` には書かない (運用統一)。

### 3. `/api/admin/*` の前段に middleware を適用

`apps/web/worker/api/router.ts` で admin パス group の冒頭に
`api.use("/admin/*", accessJwtMiddleware)` で適用済み。
secret 登録後は `wrangler.toml` の `SKIP_ACCESS_JWT = "1"` を削除すれば JWT 検証が有効化される。

## ローカル開発

ローカルでは Access の前段がいないため、`accessJwtMiddleware` は早期 return で
スキップする必要がある。`.dev.vars` (gitignore) に以下を記述:

```text
SKIP_ACCESS_JWT=1
```

`vitest` 環境では `vitest.config.ts` の miniflare binding で同じく `"1"` を設定する。

## トークン運用

- 既存の `ADMIN_TOKEN` (Bearer) も並行運用する
- CLI / cron / GitHub Actions からは `Authorization: Bearer <ADMIN_TOKEN>` で叩く
- 人間がブラウザから叩く際は Access ログイン経由
- どちらの認証もパスしない場合は 401

## トラブルシューティング

- 401 が出る: `Cf-Access-Jwt-Assertion` ヘッダーが欠落、または audience tag が一致しない
- 503 が出る: `CF_ACCESS_AUD` / `CF_ACCESS_TEAM_DOMAIN` が未設定
- ローカルで動かない: `.dev.vars` に `SKIP_ACCESS_JWT=1` を書く
