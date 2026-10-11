# Token Guardian contributor and agent guidance

Current repository: [JunyiZhou-Conny/token-guardian](https://github.com/JunyiZhou-Conny/token-guardian).
This is a local source prototype built on xiufengsun/TokenTracker, initially
focused on macOS and records from Codex, Claude Code, Cursor, and Gemini CLI.
There is no signed Guardian DMG or configured Guardian cloud backend or release
pipeline. Keep documentation clear about what has been tested and what still
requires a real Mac/provider check.

## Source map

- `guardian/`: vanilla browser UI. Keep user-facing text in the `COPY` registry in
  `guardian/app.js`; preserve accessible controls and labeled preview/local modes.
- `guardian-server/`: CommonJS service using Node built-ins. `engine.js` normalizes
  metadata and detects incidents; `store.js` reads and reconciles records;
  `chat.js` provides local explanations and optional bounded OpenAI calls;
  `server.js` serves the UI and request handler. See its README for API details.
- `scripts/start-guardian.cjs` and `Start Token Guardian.command`: dependency-free
  local launcher. It does not install hooks or start upstream sync.
- `src/` and `bin/`: inherited CommonJS collector and CLI. Cursor sync now retains
  metadata events before aggregation in `src/lib/guardian-events.js`.
- `dashboard/`: inherited React/Vite dashboard, ESM and TypeScript. Its user-facing
  copy remains in `dashboard/src/content/copy.csv`.
- `TokenTrackerBar/`: Swift macOS menu-bar app source. Native builds require a
  Mac, Xcode, and XcodeGen. The fork disables upstream automatic app updates.
- `guardian-test/` and `test/guardian-cursor-events.test.js`: focused regression
  coverage. Add tests for meaningful detector, import, privacy, or billing changes.

## Local commands

The Guardian launcher requires Node.js 20 or newer and no npm install:

```sh
node scripts/start-guardian.cjs
```

The current test runner flag requires Node.js 22.20 or newer:

```sh
npm run guardian:test
node test/cursor-config.test.js
```

For relevant browser changes, `python guardian-test/browser-smoke.py` exercises
the real request handler through `guardian-test/browser-bridge.cjs`, using
synthetic fixtures and an isolated store. It currently requires Python Playwright
and Chromium at `/usr/bin/chromium`; adapt the executable path for another local
installation. Its screenshots and results are generated verification artifacts,
not evidence that real provider collection or native packaging works.

The inherited collector/dashboard requires its own dependencies and build;
follow [GUARDIAN.md](GUARDIAN.md). Run checks appropriate to the changed source,
and report limitations directly.

## Data and normalization

Canonical tracker records live under `~/.tokentracker/tracker/`:
`queue.jsonl`, `session.queue.jsonl`, and `cursor-guardian-events.jsonl`. Older
direct paths are compatibility fallbacks. The append-only usage queue contains
UTC half-hour buckets; read the latest row per `(source, model, hour_start)`,
rather than summing successive revisions. Session metadata adds attribution,
not additional usage totals. Reconcile raw events and bucket residuals instead
of counting overlapping records twice.

- `input_tokens`: non-cached input only, excluding cache reads and writes.
- `cached_input_tokens`: cache reads.
- `cache_creation_input_tokens`: cache writes.
- `output_tokens`: output tokens. `reasoning_output_tokens` can already be a
  subset of output, including for Codex; add reasoning only when output excludes
  it, so totals and pricing do not double-count it.
- `total_tokens`: the sum of normalized categories, adding reasoning only when
  it is not already included in output. Raw Codex input includes cached tokens;
  subtract cached input when normalizing it.

Compute cost from normalized token categories through `src/lib/pricing/index.js`,
not by treating `total_tokens` as a priced input category. Preserve reported,
estimated, and unknown values, and keep included subscription usage distinct from
extra charges. Missing prices and identifiers remain unknown. Aggregate buckets
cannot establish per-request cadence, and repeated activity is an investigation
lead rather than proof of an unwanted automation.

## Privacy and operations

Collect token counts and allowed usage metadata only, never original prompts,
messages, code, tool arguments, or conversation bodies. Keep explicit metadata
allowlists on imports and provider evidence. Local chat works without a key;
optional OpenAI chat sends the question and bounded metadata, honors persistent
call/output-token reservations, and keeps simulation local. Those limits are not
a dollar billing guarantee. Never commit credentials or real private usage data.

Preserve [LICENSE](LICENSE), [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), and
[avatar provenance](guardian/assets/PROVENANCE.md). The software MIT license and
fan artwork rights are separate.

[CLAUDE.upstream.md](CLAUDE.upstream.md), [AGENTS.upstream.md](AGENTS.upstream.md),
and [README.upstream.md](README.upstream.md) preserve inherited material verbatim
for historical reference. Archived release instructions, InsForge services,
leaderboards, npm publishing, and Homebrew maintenance are upstream operations.
Do not deploy to the original services or treat their release instructions as
Guardian's configured workflow. Keep issue fixes reproducible, tested where
appropriate, and reviewable as pull requests before a release.
