# Dormant upstream automation

This archive belongs to [Token Guardian](https://github.com/JunyiZhou-Conny/token-guardian).

These files were copied from [xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker) at commit `c388d675e2e7512264c44ede1610b7a28100307e` and retained for reference.

GitHub Actions loads workflows from `.github/workflows/`. This archive is outside that directory, so its workflow events and schedules do not run. The archived `dependabot.yml` is also outside GitHub's active `.github/dependabot.yml` configuration path.

The original workflows operate the upstream product: npm publication, desktop releases, Homebrew dispatches, leaderboard moderation and monitoring, issue label/stale/lock bots, broader platform CI, and scheduled CodeQL scans. Their backend URLs, secrets, publishing targets, and issue automation do not belong to the Token Guardian prototype.

The only active workflow is [Guardian CI](../workflows/guardian-ci.yml). It runs focused guardian and Cursor regressions plus source and shell syntax checks on Node.js 22 and 24. It has read-only repository permissions and requires no provider credentials or npm dependency installation.

Dependabot configuration is dormant while the fork's maintained components and dependency policy are being established. Restore an archived job only after adapting its services, ownership, permissions, and release targets to this repository. Publishing the source does not enable package publication, release distribution, backend moderation, or automated issue messages.
