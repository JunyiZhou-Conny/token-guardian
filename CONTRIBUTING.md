# Contributing to Token Guardian

Token Guardian is a source prototype built on xiufengsun's MIT-licensed
[TokenTracker](https://github.com/xiufengsun/TokenTracker). The first focus is
macOS and usage records from Codex, Claude Code, Cursor, and Gemini CLI.

## Start locally

Use Node.js 20 or newer to run the Guardian launcher. Use Node.js 22.20 or newer
for focused tests; local validation has used Node.js 24.

```sh
git clone https://github.com/JunyiZhou-Conny/token-guardian.git
cd token-guardian
node scripts/start-guardian.cjs
```

Open `http://127.0.0.1:7681`. On macOS, you can also double-click
**Start Token Guardian.command**. The standalone Guardian requires no npm install,
account, or API key. It reads existing local tracker records or accepts imports;
it does not install collection hooks or start a sync. Preview data is labeled.

See [GUARDIAN.md](GUARDIAN.md) for collection setup, data paths, and current limits.

## Make a contribution

1. Open or find an [issue](https://github.com/JunyiZhou-Conny/token-guardian/issues)
   describing the problem, expected behavior, platform, and reproduction steps.
2. Reproduce a bug with synthetic or anonymized metadata. Keep credentials and
   conversation content out of fixtures.
3. Make a focused change and add a regression test when needed to preserve the
   corrected behavior. Match the conventions of the component you change.
4. Open a pull request with the resulting behavior, checks run, and remaining
   limits. Include a sanitized screenshot for interface changes.
5. Review the evidence and CI results before merging. AI-assisted changes follow
   the same reviewed pull-request process.

Source areas are `guardian/` for the interface, `guardian-server/` for local
storage, detection, and chat, `guardian-test/` for focused tests, and `src/` for
the inherited collector. The upstream React dashboard and native app sources
remain available for further development.

## Focused checks

```sh
npm run guardian:test
node --test --experimental-test-isolation=none test/cursor-config.test.js test/cursor-store.test.js test/cursor-migration.test.js test/cursor-billable-total-tokens.test.js
node --check guardian/app.js
bash -n "Start Token Guardian.command"
bash -n TokenTrackerBar/scripts/bundle-node.sh
```

[Guardian CI](.github/workflows/guardian-ci.yml) runs focused regressions and syntax
checks on Node.js 22 and 24 without provider credentials or a dependency install.
Guardian-only changes do not require building the inherited React dashboard or
all desktop platforms. For changes to those components, also run checks relevant
to the affected code and describe what you could verify.

Use conventional commit messages such as `fix:`, `feat:`, `docs:`, and `test:`.
Retain the upstream license, source attribution, and third-party asset notices.

## Data and evidence

Store only the documented usage metadata; do not collect original prompts, code,
responses, or conversation bodies. Anonymize account identifiers and private paths
before attaching records or screenshots to a public issue or pull request.

Keep included subscription usage, estimated model cost, and actual extra charges
distinct. Leave unavailable attribution and unknown prices explicit. Aggregate
buckets cannot establish individual request schedules, and repeated activity is
an investigation lead rather than proof that a job is unwanted.

## Prototype releases

This repository currently provides source, with no compiled or signed Guardian
DMG or supported release line. Upstream package publishing, desktop releases,
backend jobs, and issue bots are archived and dormant. A merge does not publish
packages or enable an autonomous improvement loop. Future distribution needs its
own reviewed build and release process for this repository.
