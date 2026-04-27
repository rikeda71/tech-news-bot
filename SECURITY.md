# Security Policy

## Supported Versions

Only the `main` branch is actively maintained.
Cloudflare Workers always runs the latest deployed revision, so there are no versioned releases to patch individually.

| Branch / Version | Supported |
| ---------------- | --------- |
| main             | Yes       |
| any other branch | No        |

## Reporting a Vulnerability

**Do not open a public issue or pull request to report security vulnerabilities.**

Please use GitHub's Private Vulnerability Reporting instead:

https://github.com/rikeda71/tech-news-bot/security/advisories/new

<!-- セキュリティ上の問題は上記の GitHub Private Vulnerability Reporting を使って報告してください。公開 issue / PR での報告はお控えください。 -->

Include the following in your report:

- Description of the vulnerability and its potential impact
- Steps to reproduce (proof-of-concept if available)
- Affected component (Worker API, collector, D1 schema, client, etc.)

## Response Targets

| Milestone         | Target                                               |
| ----------------- | ---------------------------------------------------- |
| Initial response  | Within 72 hours                                      |
| Triage / severity | Within 1 week                                        |
| Fix timeline      | Depends on severity; critical issues are prioritized |

We will keep you updated throughout the process via the private advisory thread.

## Out of Scope

The following are considered out of scope for this project's security policy:

- **Third-party dependency vulnerabilities**: Report these upstream. Dependabot will open PRs automatically for known CVEs.
- **Issues in feed sources**: Problems with the RSS/Atom feeds themselves (e.g., a blog serving malicious content) are outside our control.
- **Denial of Service (DoS)**: Rate limiting and traffic absorption are handled by Cloudflare's infrastructure.

<!-- 上記はこのプロジェクトのセキュリティポリシーの対象外です。依存パッケージの脆弱性は Dependabot 経由でアップストリームに報告してください。 -->

## Secret Handling

Secrets such as `ADMIN_TOKEN` must never be committed to the repository.

- Secrets are registered via `wrangler secret put` or GitHub Actions repository secrets.
- If a secret is accidentally exposed, rotate it immediately. Rotation procedures are documented in [`docs/operations/admin-token-rotation.md`](docs/operations/admin-token-rotation.md).
- After rotating, report the exposure through a private advisory using the link above.

<!-- `ADMIN_TOKEN` などのシークレットは絶対にコミットしないでください。漏洩した場合はただちにローテーションし、上記の private advisory で報告してください。 -->

## Disclosure Policy

- We follow a coordinated disclosure model.
- Once a fix is deployed to `main`, we will publish the GitHub Security Advisory.
- If the vulnerability warrants a CVE, we will request one after the advisory is published.
- The timing of the public advisory will be agreed upon with the reporter.

<!-- 修正が main にデプロイされた後、GitHub Security Advisory を公開します。CVE が適切な場合は公開後に申請します。公開タイミングはレポーターと合意した上で決定します。 -->
