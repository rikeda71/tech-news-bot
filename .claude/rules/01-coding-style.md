# コーディングスタイル

- TypeScript strict mode を尊重。`any` の使用は最小限、必要なら `unknown` で受けて narrow する。
- Lint: oxlint。Format: oxfmt。両方とも Rust 製で高速。ESLint/Prettier 設定は追加しない。
- Import 順序: 外部パッケージ → workspace パッケージ (`@tnb/*`) → 相対 import の順。oxfmt で自動整列されるので手動調整不要。
- パス alias: パッケージ間は必ず `@tnb/<name>` を使用。深い相対 import (`../../shared/...`) は禁止。
- コメント: 「なぜ」を書く。「何を」はコードで読めるので書かない。日本語可。
- 早期 return を優先し、ネストを浅く保つ。
- 例外でなく Result 風 (`{ status, ...}`) を使う既存パターン (`worker/collector/index.ts` の `CollectResult`) に倣う。
- 関数 200 行・ファイル 400 行を目安に分割。
