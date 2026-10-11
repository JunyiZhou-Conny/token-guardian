# Token Guardian

A League of Legends inspired source prototype built on the existing TokenTracker,
with a macOS focus. The Guardian view targets records from **Codex, Claude Code,
Cursor and Gemini CLI**. Ahri, Jinx and Jhin are selectable prototype companions.
The included collectors have not all been verified end to end against real
accounts on a Mac. Codex is the OpenAI coding-tool source, rather than an account-
wide OpenAI or ChatGPT usage integration.

## Run on macOS

Install Node.js 20 or newer. The guardian needs no npm dependencies:

```sh
node scripts/start-guardian.cjs
```

Or double-click **Start Token Guardian.command**. The launcher starts a local
server at `http://127.0.0.1:7681` and opens your browser on macOS. Control-C stops
it. If the port is busy, set `TOKENTRACKER_GUARDIAN_PORT` to another port.

The app reads existing TokenTracker records in `~/.tokentracker/tracker/`, with
fallback for older installations. It starts with a clearly labeled simulation
when no supported local usage is available. Use the dataset switch to inspect
your local data, or import a Cursor usage CSV / normalized usage JSON. Importing
the same export again does not duplicate its records. Imported data stays local
under `~/.tokentracker/guardian/`.

For an isolated data folder:

```sh
TOKENTRACKER_GUARDIAN_DATA_DIR=/path/to/tracker-folder node scripts/start-guardian.cjs
```

## Collect real usage with this fork

The upstream collector and dashboard sources are included. Install their
dependencies when your machine has network access:

```sh
npm ci
npm --prefix dashboard ci
npm run dashboard:build
node bin/tracker.js
```

The existing tracker sets up integrations and syncs available usage. Open
`http://127.0.0.1:7680/guardian/` for the companion, or the original root dashboard
for its detailed analytics. The guardian can also run separately on port 7681.

This fork extends Cursor CSV parsing to retain populated **Automation ID** and
**Cloud Agent ID** columns in a metadata-only local ledger before half-hour
aggregation. A successful Cursor sync writes
`~/.tokentracker/tracker/cursor-guardian-events.jsonl`.

Sync replaces the recent exported window when Cursor revises usage, while
preserving older saved records. The CSV does not supply an explicit coverage
boundary or a stable ID for every request, so a deleted oldest row or a malformed
export can leave uncertainty in that history. Previously aggregated records
cannot recover identifiers that were never saved.

The guardian detects repeated cadence from individual events; half-hour totals
cannot establish a ten-minute schedule. An observed recurring pattern is a reason
to investigate, not proof that a job is unwanted. Missing project/session IDs
remain unavailable. Provider reporting can be delayed. There is no automatic
pause/kill control in this version.

Reported usage value, included subscription usage, estimated model cost and
extra on-demand charges remain distinct. A CSV usage value is not a subscription
invoice. Bucket-only data may have unknown costs and attribution.

## Companion chat

Chat works without a key using a local explanation engine, labeled as such.
Optionally set `OPENAI_API_KEY` in the server environment to enable the OpenAI
Responses API for local-data questions. The UI shows whether a model is configured;
simulation questions use local explanations without a paid API call.

The model receives the user's question and a bounded selection of usage metadata.
Original prompts, code and conversation bodies are not collected. Questions are
not saved as a server transcript. Default limits are 10 calls/day and 350 output
tokens/call, with a daily output-token reservation cap of 3,500. These are call
and token limits, not a guaranteed dollar spending cap.

Optional environment settings:

- `TOKENTRACKER_GUARDIAN_CHAT_MODEL` (default `gpt-4.1-mini`)
- `TOKENTRACKER_GUARDIAN_CHAT_DAILY_CALLS`
- `TOKENTRACKER_GUARDIAN_CHAT_OUTPUT_TOKENS`
- `TOKENTRACKER_GUARDIAN_CHAT_DAILY_OUTPUT_TOKENS`

## macOS app source

The existing Swift menu-bar app now opens `/guardian/?app=1`. The Node bundle script
includes guardian assets and server code. Upstream automatic updates are disabled
for this fork so they cannot overwrite its changes. The original analytics
dashboard remains available.

Native compilation requires a Mac with Xcode and XcodeGen. Follow the preserved
upstream macOS build instructions in [README.upstream.md](README.upstream.md#building-the-macos-app)
after installing dependencies and building the original dashboard. Icon Composer
assets require Xcode 26 or newer; the committed .icns icon is the fallback for
older Xcode versions. There is no compiled or signed Guardian DMG yet, and the
prototype has not yet received a browser visual check.

## Verification and source credit

The current test runner command uses Node.js 24:

```sh
npm run guardian:test
node test/cursor-config.test.js
```

The source snapshot is pinned to xiufengsun/TokenTracker commit
`c388d675e2e7512264c44ede1610b7a28100307e`. LICENSE retains the original MIT notice.
See [UPSTREAM_SNAPSHOT.json](UPSTREAM_SNAPSHOT.json) for import provenance and
exclusions. Champion avatar provenance is in
[guardian/assets/PROVENANCE.md](guardian/assets/PROVENANCE.md); the software license
and artwork rights are separate. The root [README.md](README.md) describes this
fork; [README.upstream.md](README.upstream.md) retains the upstream documentation.

The next development milestone is a friends-only test on real Mac usage: verify
Cursor automation IDs, check detection against a known scheduled run, and collect
issues with a reproduction and anonymized metadata. Follow that pilot by improving
event and attribution coverage and adding persistent collectible progression for
good usage-management habits. AI-assisted fixes should arrive as tested,
reviewable pull requests before a release.
