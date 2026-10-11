# Token Guardian

A League of Legends inspired source prototype built on the existing TokenTracker,
with a macOS focus. The Guardian view targets records from **Codex, Claude Code,
Cursor and Gemini CLI**. Ahri, Jinx and Jhin are selectable prototype companions,
each with classic and cozy outfits. The [installation guide](docs/INSTALL.md)
provides download steps; [docs/DEMO.md](docs/DEMO.md) explains the recorded walkthrough.
The included collectors have not all been verified end to end against real
accounts on a Mac. Codex is the OpenAI coding-tool source, rather than an account-
wide OpenAI or ChatGPT usage integration.

## Floating desktop companion

Install Node.js 22.20 or newer, then run from the repository:

```sh
npm --prefix desktop ci
node scripts/start-floating-guardian.cjs
```

The dependency install is a one-time setup for the isolated Electron package.
The first launch may download the platform's runtime and needs an internet connection.
Afterward, double-click **Start Floating Guardian.command** on macOS if you
prefer. The runtime provides a compact usage widget, a summoned champion butler,
and text chat, while keeping the full dashboard available separately. Pin the
widget above other windows, dismiss the butler, or hide and restore the widget
from the app menu. Desktop widget and dashboard preferences share the same origin.

The native host denies microphone and camera permissions. Use **Open dashboard
in browser** from the app menu for browser voice input, or launch the browser
version below. The native text companion does not record audio.

This source launcher needs no Xcode. It uses a development Electron runtime;
there is no signed or notarized Guardian DMG. A real Mac pilot remains necessary
to verify window behavior and provider collection.

## Browser dashboard on macOS

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
It can answer **“Which session used the most tokens?”**, rank available attributed
sessions, cite the supporting records, and suggest steps you can review in the
originating application. The Sessions view exposes the same evidence and limits.
Request-level attribution and local session summary totals are different evidence
bases; session summaries do not get added to account usage totals.

Optionally set `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` in the server environment.
OpenAI uses the Responses API; DeepSeek uses its official chat-completions API.
The UI shows which providers are configured and allows a local explanation or an
available model to be selected. Simulation questions always use local explanations
without a paid API call.
The browser starts with Local even when a server key is available; explicitly
choose the configured provider when you want a model explanation.

The selected model receives the user's question and a bounded selection of usage
metadata. Local project paths, session titles, and vendor session identifiers are
excluded from the remote evidence bundle. Original prompts, code, and conversation
bodies are not collected. The question is sent as you type it, so identifiers or
private details you put into that question are not automatically removed.
Questions are not saved as a server transcript. OpenAI
requests use `store: false`; provider processing still follows the provider's
policies. Default limits are 10 calls/day and 350 output tokens/call, with a daily
output-token reservation cap of 3,500 shared across both chat providers. These are
call and token limits, not a guaranteed dollar spending cap. Provider failures or
exhausted limits return a clearly labeled local explanation.

Optional environment settings:

- `TOKENTRACKER_GUARDIAN_CHAT_PROVIDER` (`local`, `openai`, or `deepseek`)
- `TOKENTRACKER_GUARDIAN_CHAT_MODEL` (overrides the default provider's model)
- `TOKENTRACKER_GUARDIAN_CHAT_OPENAI_MODEL` (default `gpt-4.1-mini`)
- `TOKENTRACKER_GUARDIAN_CHAT_DEEPSEEK_MODEL` (default `deepseek-chat`)
- `TOKENTRACKER_GUARDIAN_CHAT_DAILY_CALLS`
- `TOKENTRACKER_GUARDIAN_CHAT_OUTPUT_TOKENS`
- `TOKENTRACKER_GUARDIAN_CHAT_DAILY_OUTPUT_TOKENS`

For direct API clients that do not specify a provider, an OpenAI key selects
OpenAI, a DeepSeek key alone selects DeepSeek, and no key selects local
explanations. This server default does not override the browser's Local choice.
Configure keys using your
preferred local secret environment; do not put them in browser settings, usage
imports, GitHub issues, or committed files.

## Voice input

Voice input creates an editable question draft. It never sends a question to the
companion automatically. Choose a method in the chat drawer and review the
privacy text before starting:

- **Browser dictation:** uses the browser's speech-recognition capability when
  available. Its implementation may send audio to the browser vendor's service;
  this option is not guaranteed to be offline. Guardian does not receive that
  audio through its own transcription endpoint.
- **OpenAI transcription:** records audio only after you start the microphone
  control, then explicitly uploads it through the local service to OpenAI. It
  requires a server-side OpenAI key, even if chat uses DeepSeek. DeepSeek chat
  configuration does not provide speech recognition.

The default transcription model is `gpt-4o-mini-transcribe`; change it with
`TOKENTRACKER_GUARDIAN_VOICE_MODEL`. The default daily call allowance is six,
configurable with `TOKENTRACKER_GUARDIAN_VOICE_DAILY_CALLS` up to 20. Voice has its
own persistent reservation counter, separate from the chat budget. Uploads are
limited to 2 MiB, the browser recorder stops after 30 seconds, and the provider
request times out after 15 seconds. The server's byte limit does not establish the
duration of an arbitrary uploaded clip, and these limits are not a dollar cap.

Cancel to discard a recording. The local service does not persist audio or save a
transcript history. Text appears in the draft so you can correct it, clear it, or
send it yourself. Live microphone and provider transcription still need a real
browser/account test; the recorded walkthrough discloses a synthetic dictation
fixture.

Optional read-aloud uses the browser's speech synthesis and starts only when you
request it. A browser or operating-system voice may have its own service behavior.

## Grok Bot inside Cursor

Grok Bot runs inside Cursor, so its token records belong to Cursor's existing
usage stream. Guardian does not add a fifth token provider or double-count them.
Optional quota support uses Cursor's existing local sign-in and read-only
first-party access and usage endpoints. It reports quota percentage and reset
time only when the provider exposes them; a percentage cannot be converted into
an exact number of tokens.

Enable the connection explicitly under Cursor's card in Overview. The browser
keeps that choice as a preference and makes quota requests only when enabled.

No additional API key or npm package is required. A missing Cursor sign-in is
reported as unavailable; the adapter does not refresh credentials or write them.
Results are cached for 60 seconds, and a request has an eight-second deadline.
Use Refresh to request current quota data or disable the connection to stop
queries. Quota adapter tests use mocked responses; real provider access still
requires a signed-in Cursor check.

## Optional inherited Swift macOS app source

These build instructions apply to the inherited Swift menu-bar app. The floating
Electron launcher above does not require this build or Xcode.

The existing Swift menu-bar app now opens `/guardian/?app=1`. The Node bundle script
includes guardian assets and server code. Upstream automatic updates are disabled
for this fork so they cannot overwrite its changes. The original analytics
dashboard remains available.

Native compilation requires a Mac with Xcode and XcodeGen. Follow the preserved
upstream macOS build instructions in [README.upstream.md](README.upstream.md#building-the-macos-app)
after installing dependencies and building the original dashboard. Icon Composer
assets require Xcode 26 or newer; the committed .icns icon is the fallback for
older Xcode versions. There is no compiled or signed Guardian DMG yet. Browser
checks use Chromium with isolated synthetic records; they do not verify native
compilation or real macOS collection.

## Verification and source credit

The current test runner command uses Node.js 24:

```sh
npm run guardian:test
node test/cursor-config.test.js
```

Local validation passed 175 Node regression checks (88 Guardian and 87 Cursor),
45 full-dashboard browser checks, 37 widget-preview browser checks, and 42 real
Linux/Electron checks. Native coverage includes the desktop launcher, window
controls, shared preferences, permission boundaries, and owned-backend shutdown.
Browser and desktop checks use isolated synthetic metadata. Real Mac collection,
macOS window behavior, and live provider checks remain part of the friends pilot.

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
