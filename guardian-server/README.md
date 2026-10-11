# Guardian local service

Run `node guardian-server/server.js` from the repository root, then visit
`http://127.0.0.1:7681`. No npm dependencies are needed. The existing CLI can
delegate its Guardian routes to this service's request listener, without opening
a second port.

The default data root is `~/.tokentracker`. The service reads the current upstream
`tracker/queue.jsonl`, `tracker/cursor-guardian-events.jsonl`, and
`tracker/session.queue.jsonl`. It also supports the older direct paths. It never
installs hooks or starts upstream sync. Imported metadata is stored separately in
`guardian/events.jsonl` with private file permissions.

Set `TOKENTRACKER_GUARDIAN_DATA_DIR` to another data root or a direct tracker data
directory. Set `TOKENTRACKER_GUARDIAN_PORT` to change the standalone port.

## API

- `GET /api/guardian?mode=auto|local|demo` returns the selected events, summary,
  evidence-backed incidents, local session metadata and coverage notes. Auto
  selects simulation only when no supported usage is available. File errors and
  malformed rows remain visible in `coverage.warnings`.
- `POST /api/guardian/import` accepts `{ "format": "csv", "data": "..." }` for
  a Cursor usage export or `{ "format": "json", "data": [...] }` for normalized
  events. Requests are limited to 2 MB. Repeated imports are deduplicated while
  identical real rows retain their multiplicity. Cost corrections update events;
  usage corrections without a stable vendor request ID cannot be established
  conclusively.
- `POST /api/guardian/chat` accepts `{ "message": "...", "datasetMode": "local" }`.
  The response identifies `mode: "local"` or `mode: "openai"` and supplies
  evidence IDs. `useOpenAI: false` explicitly selects the local explanation engine.
- `GET /api/guardian/health` reports service readiness and whether OpenAI is
  configured. `/api/import`, `/api/chat` and `/api/health` remain compatibility aliases.

JSON events require `source` (`codex`, `claude`, `cursor` or `gemini`) and
`timestamp`. Token fields are `inputTokens`, `outputTokens`, `cachedTokens`,
`cacheWriteTokens`, optional `reasoningTokens`, and `totalTokens`. Optional
attribution fields are `project`, `sessionId`, `automationId`, `cloudAgentId` and
`requestId`. A stable `id` or `requestId` allows revisions to the same event.
`costUsd` is optional; `costType` is `reported`, `estimated` or `unknown`.
`billingKind` distinguishes `included`, `on-demand`, `free` and `unknown`.
Unknown costs stay unknown. Prompts, messages, tool arguments and arbitrary JSON
fields are discarded by an explicit allowlist.

Raw records replace matching account-bucket usage, and residual tokens remain in
an unattributed bucket when raw detail covers only part of a period. The same
timestamp/model records are matched across the Cursor ledger and imports using
usage columns and multiplicity. An unresolved overlap emits a warning. Session
metadata does not contribute additional usage totals. Thirty-minute buckets are
excluded from request-spike and cadence detection. A repeated pattern is an
investigation lead; the application does not pause or kill processes.

## Optional OpenAI explanation

Set `OPENAI_API_KEY` in the server environment to enable OpenAI Responses for
local-data chat. This sends the user's question and a bounded metadata evidence
bundle to OpenAI, with response storage disabled. Existing conversation bodies
are never collected or sent. Simulation always uses the local explanation engine.
The key is neither returned by the API nor written to disk.

Defaults are ten calls per UTC day and 350 output tokens per call. Set
`TOKENTRACKER_GUARDIAN_CHAT_DAILY_CALLS`,
`TOKENTRACKER_GUARDIAN_CHAT_OUTPUT_TOKENS`,
`TOKENTRACKER_GUARDIAN_CHAT_DAILY_OUTPUT_TOKENS`, or
`TOKENTRACKER_GUARDIAN_CHAT_MODEL` to configure them. These are call/output-token
limits, not a guarantee of dollar spend. Each request has a 12-second timeout and
the question is capped at 3,000 characters. Provider failures use a clearly
identified local explanation.

Reservations persist in `guardian/chat-budget.json` and use an exclusive lock
across simultaneous server instances. A corrupt budget or orphaned
`guardian/chat-budget.lock` fails closed to a local answer. Stop running Guardian
instances before removing an orphaned lock.

Run `npm run guardian:test` with Node.js 22.20 or newer for detector,
import/deduplication, real request-handler, local-store and mocked provider tests.
The HTTP handler tests use streams and do not need a network listening grant.
