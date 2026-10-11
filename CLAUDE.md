# Token Guardian contributor and agent guidance

Current repository: [JunyiZhou-Conny/token-guardian](https://github.com/JunyiZhou-Conny/token-guardian).
This is a local source prototype built on xiufengsun/TokenTracker, initially
focused on macOS and records from Codex, Claude Code, Cursor, and Gemini CLI.
There is no signed Guardian DMG or configured Guardian cloud backend or release
pipeline. Keep documentation clear about what has been tested and what still
requires a real Mac/provider check.

## Source map

- `guardian/`: vanilla dashboard and floating widget UI. Keep user-facing text in
  the `COPY` registries in `guardian/app.js` and `guardian/widget.js`; preserve
  accessible controls and labeled preview/local modes.
- `desktop/`: isolated Electron host and fixed preload bridge. Installation
  requires Node.js 22.12 or newer. Renderers use the same verified local service;
  keep Node access, arbitrary navigation, and native media permissions disabled.
- `scripts/start-floating-guardian.cjs` and `Start Floating Guardian.command`:
  desktop launchers after `npm --prefix desktop ci`.
- `guardian-server/`: CommonJS service using Node built-ins. `engine.js` normalizes
  metadata, detects incidents, and ranks directly attributed sessions/sidecars;
  `store.js` reconciles events and exposes `sessionInsights`; `chat.js` offers local
  explanations and opt-in bounded OpenAI/DeepSeek calls. `voice.js` handles optional
  OpenAI transcription; `grokbot.js` reads opt-in Cursor quota percentages.
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

`python guardian-test/widget-smoke.py` checks browser widget behavior against the
same production handler. Actual native windows use the pinned Electron runtime
and Playwright QA driver:

```sh
npm --prefix desktop ci
npm --prefix desktop install --no-save --package-lock=false playwright-core@1.62.0
xvfb-run -a -s '-screen 0 1440x1000x24' node guardian-test/desktop-smoke.cjs
```

The native test creates isolated synthetic usage and preferences, exercises pin,
hide, chat, dashboard, navigation restrictions, persistence, and owned-service
shutdown. Its Linux container flag disables Chromium's OS sandbox only for QA;
the customer launcher does not add that flag. Linux verification does not
establish macOS window behavior or live provider collection.

The inherited collector/dashboard requires its own dependencies and build;
follow [GUARDIAN.md](GUARDIAN.md). Run checks appropriate to the changed source,
and report limitations directly.

## Data and normalization

Canonical tracker records live under `~/.tokentracker/tracker/`:
`queue.jsonl`, `session.queue.jsonl`, and `cursor-guardian-events.jsonl`. Older
direct paths are compatibility fallbacks. The append-only usage queue contains
UTC half-hour buckets; read the latest row per `(source, model, hour_start)`,
rather than summing successive revisions. Session metadata adds attribution,
not additional account usage. `sessionInsights` ranks each session on one basis:
direct raw events or a sufficiently current session-sidecar snapshot. Never sum
overlapping session/raw/account views. Preserve basis, period, partial costs,
per-model unknowns, and attribution coverage. Reconcile raw events and bucket
residuals instead of counting overlapping records twice. Chat `focusId` selects
only an existing opaque session/project/automation ID; unknown focus remains
unresolved. Recommendations are evidence-backed user steps, not executed actions.

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
optional OpenAI or DeepSeek chat sends the user's question and bounded usage
metadata to its pinned official endpoint. Remote evidence omits local project
paths, titles, vendor session IDs/hashes, request IDs, and arbitrary prose; the
voluntary question is a separate input. Preserve opaque evidence links and local
observed identifiers without inventing missing ones. Keys stay server-side and
configuration/health responses are key-free. Simulation questions stay local.

`TOKENTRACKER_GUARDIAN_CHAT_PROVIDER` accepts `local`, `openai`, or `deepseek`.
For API clients omitting `provider`, prefer OpenAI when its key exists, then
DeepSeek if only its key exists; invalid settings fall back locally. The UI defaults
to local and requires explicit remote selection. Defaults are `gpt-4.1-mini` and
`deepseek-chat`. Both providers share persistent daily call/output reservations
(10 calls, 350 output tokens/call, 3,500 output tokens/day by default). Preserve
exclusive locking and fail closed on corrupt/unavailable ledgers. These limits
are not a dollar billing guarantee; provider failures return a labeled local answer.

Voice creates an editable question draft and never sends chat automatically.
Browser dictation may send audio to the browser vendor's speech service; optional
read-aloud uses browser/OS speech synthesis. OpenAI transcription explicitly uploads
audio with a server-side OpenAI key, even when chat uses DeepSeek. The service saves
neither audio nor transcript history. Limits are 2 MiB uploads, a 30-second browser
recording timer, a 15-second provider timeout, and a separate persisted voice-call
counter (six/day by default, configurable up to 20). Server bytes do not prove clip
duration, and voice limits are not a dollar cap. Preserve cancel and draft review.

Grok Bot quota access is disabled by default and opt-in via its UI control or
`TOKENTRACKER_GUARDIAN_GROKBOT=1`. Use existing local Cursor sign-in only for the
official read-only quota RPCs. A reported percentage/reset time is not token usage:
do not infer tokens, create a fifth usage provider, or add it to Cursor totals.
Never commit credentials, recordings, transcripts, or real private usage data.

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
