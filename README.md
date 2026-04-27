# tech-news-bot

海外 big tech / AI tech / 国内企業の tech blog を 3 時間ごとに RSS から収集し、Web UI で閲覧できる PoC アプリ。

## アーキテクチャ

完全に Cloudflare 無料枠で動作します。

| レイヤ | サービス |
|---|---|
| RSS 収集 | Cloudflare Workers + Cron Triggers (3 時間ごと) |
| データベース | Cloudflare D1 (SQLite) + FTS5 全文検索 |
| API | 同 Worker 内で Hono が `/api/*` をハンドリング |
| 静的フロント | Worker Static Assets (Vite で React SPA をビルド) |
| 設定 | `config/feeds.json` を Worker にバンドル |

```
┌────────────────────────────────────────────────┐
│ Cloudflare Worker (single)                     │
│                                                │
│  ┌────────────┐   ┌────────────┐  ┌─────────┐ │
│  │ Cron 3h    │──▶│ collectAll │─▶│   D1    │ │
│  └────────────┘   └────────────┘  │ articles│ │
│                                   │  feeds  │ │
│  ┌────────────┐   ┌────────────┐  └────┬────┘ │
│  │ /api/*     │──▶│ Hono       │◀──────┘      │
│  │ /          │──▶│ ASSETS (SPA)              │
│  └────────────┘   └────────────┘              │
└────────────────────────────────────────────────┘
```

## ディレクトリ

```
config/feeds.json        # 監視する RSS フィードのマスタデータ
migrations/              # D1 用 SQL マイグレーション
worker/                  # Cloudflare Worker (Cron + API)
  ├─ index.ts            # entrypoint (fetch + scheduled)
  ├─ api/                # Hono ルーター
  ├─ collector/          # RSS 収集ロジック
  ├─ db/                 # D1 アクセス層
  └─ utils/
src/                     # フロントエンド (React + Vite)
shared/types.ts          # Worker / フロント共有型
test/                    # vitest (workers pool)
```

## セットアップ

```sh
pnpm install
```

### Cloudflare 側の準備

```sh
# 1) D1 データベース作成
pnpm exec wrangler d1 create tech-news-bot-db
# → 出力された database_id を wrangler.toml の REPLACE_WITH_REAL_ID_FROM_wrangler_d1_create に貼り付ける

# 2) スキーマ適用 (本番)
pnpm migrate:prod

# 3) ローカル D1 にもスキーマ適用 (wrangler dev 用)
pnpm migrate:local
```

### ローカル開発

```sh
pnpm dev          # vite + miniflare 統合サーバ (http://localhost:8787 など)
pnpm test         # vitest run
pnpm typecheck    # tsc --noEmit
```

ローカルで Cron を手動実行:

```sh
curl "http://localhost:8787/__scheduled?cron=0+*/3+*+*+*"
```

### デプロイ

```sh
pnpm deploy
# vite build → wrangler deploy
```

## 設定ファイル: `config/feeds.json`

```jsonc
{
  "version": 1,
  "feeds": [
    {
      "id": "openai-blog",          // 一意キー
      "name": "OpenAI Blog",
      "url": "https://openai.com/blog/rss.xml",
      "category": "ai",             // "bigtech" | "ai" | "jp"
      "lang": "en",                 // "ja" | "en"
      "enabled": true
    }
  ]
}
```

`enabled: false` にすると次回 Cron から収集対象外になります。設定変更は再デプロイで反映されます。

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/articles` | 記事一覧。クエリ `category`, `lang`, `feed_id`, `q`, `limit`, `cursor` |
| GET | `/api/feeds` | フィード一覧と最終収集状況 |
| GET | `/api/health` | DB 接続疎通と総記事数 |

ページングは Base64 エンコードされた cursor を `nextCursor` で返します。

## 無料枠と制約

| 項目 | 無料上限 | 想定使用量 |
|---|---|---|
| Workers リクエスト | 10 万/日 | UI 含めて数千 / 日 |
| Workers CPU | 10ms/req | API は D1 1 クエリで数 ms |
| Cron wall clock | 15 分 | 38 フィード × 数秒 |
| D1 ストレージ | 5GB | 1 記事 ≈ 2KB → 10 万件 = 200MB |
| D1 Reads | 500 万/日 | 余裕 |

## ライセンス

PoC のため未指定。
