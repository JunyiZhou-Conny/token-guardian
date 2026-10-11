# Guardian local service

Run `node scripts/start-guardian.cjs` from the repository root, then visit
`http://127.0.0.1:7681`. Node.js 20 or newer is sufficient for the launcher;
no npm dependencies are needed. The inherited CLI can delegate Guardian routes
to the same request listener without opening a second port.

The default data root is `~/.tokentracker`. The service reads
`tracker/queue.jsonl`, `tracker/cursor-guardian-events.jsonl`, and
`tracker/session.queue.jsonl`, with older direct-path compatibility. It does not
install hooks or start upstream sync. Imports are separately stored in
`guardian/events.jsonl` with private file permissions.

Set `TOKENTRACKER_GUARDIAN_DATA_DIR` to another data root or a direct tracker data
directory. Set `TOKENTRACKER_GUARDIAN_PORT` to change the standalone port.
Requests must use the local loopback host and an allowed origin.

## API

- `GET /api/guardian?mode=auto|local|demo` returns events, summary, incidents,
  local session metadata, `sessionInsights`, and coverage. Auto selects labeled
  simulation when no supported local usage is available. File errors and
  malformed rows remain visible in `coverage.warnings`.
- `POST /api/guardian/import` accepts JSON
  `{ "format": "csv", "data": "..." }` for Cursor exports or
  `{ "format": "json", "data": [...] }` for normalized events. The JSON body is
  limited to 2 MiB. Repeated imports retain real identical-row multiplicity while
  avoiding duplicated copies; a stable vendor request ID is needed to establish
  arbitrary token revisions conclusively.
- `POST /api/guardian/chat` accepts
  `{ "message": "...", "datasetMode": "local", "provider": "deepseek", "focusId": "session-..." }`.
  The question is required and limited to 3,000 characters. Provider may be
  `local`, `openai`, or `deepseek`; omitted provider uses server configuration.
  Optional `focusId` selects an observed opaque session, project, or automation
  identifier from the current insights. Unknown focus remains unresolved.
  Legacy `useOpenAI: false` selects local explanations for either remote provider.
  Responses include `answer`, actual `mode`/`provider`, `model`, `evidenceIds`,
  grounded `recommendations`, `sessionIds`, `focusId`, `budget`, and `llmStatus`.
  An error, unavailable key, or exhausted budget produces a labeled local fallback.
- `GET /api/guardian/health` returns readiness plus key-free `chat` and `voice`
  configurations. Chat configuration lists the default provider, model, whether
  its key is configured, and available provider choices; it never returns keys.
- `POST /api/guardian/transcribe` accepts a raw WebM, MP4/M4A, WAV, or MP3 audio
  body with its matching audio content type, limited to 2 MiB. It returns
  `{ text, provider, model, truncated, notice }` for an editable question draft,
  not a chat answer. Unsupported or mismatched formats are rejected.
- `GET /api/guardian/grokbot?enabled=1&refresh=1` explicitly checks Cursor's
  official Grok Bot quota. Both query switches accept only `0` or `1`.
  Default access is disabled unless `TOKENTRACKER_GUARDIAN_GROKBOT=1` is set.
  This response is separate from token usage totals.

`/api/import`, `/api/chat`, and `/api/health` remain compatibility aliases.

## Usage and session evidence

JSON events require `source` (`codex`, `claude`, `cursor`, or `gemini`) and
`timestamp`. Token fields are `inputTokens`, `outputTokens`, `cachedTokens`,
`cacheWriteTokens`, optional `reasoningTokens`, and `totalTokens`. Optional local
attribution fields are `project`, `sessionId`, `automationId`, `cloudAgentId`,
and `requestId`. A stable `id` or `requestId` allows revisions to the same event.
`costUsd` is optional; `costType` is reported, estimated, or unknown. `billingKind`
distinguishes included, on-demand, free, and unknown. Conversation content and
arbitrary JSON fields are discarded by an explicit allowlist.

Raw events replace matching account-bucket usage, with unattributed residual
tokens retained when detail covers only part of a period. Overlapping exports
without common request IDs produce an uncertainty warning.

`sessionInsights` exposes ranked sessions, raw/sidecar views, project and
automation groups, per-model token/cache/cost details, periods, coverage, and
reviewable recommendations. Each ranked session uses one evidence basis: directly
attributed raw events or a sufficiently current local session snapshot.
Overlapping sidecar totals are never added to raw requests or account totals.
Sidecar lifetime totals can cover a different window; sparse pricing, model
breakdowns, time ranges, and vendor identifiers stay unavailable where missing.

Ranked and group IDs are opaque hashes; actual observed session identifiers and
project paths remain available locally. Recommendations cite existing evidence,
use `action: "investigate"`, and do not execute changes or promise savings.
Thirty-minute buckets cannot establish individual request cadence. Repeated
activity merits investigation; this service cannot pause or kill an originating
application.

## Optional OpenAI or DeepSeek explanations

Configure `OPENAI_API_KEY` or `DEEPSEEK_API_KEY` only in the local server
environment. OpenAI uses the pinned Responses endpoint with `store: false`;
DeepSeek uses `https://api.deepseek.com/chat/completions`. Arbitrary API URLs and
redirects are not accepted. Simulation questions always remain local.

For API clients that omit `provider`, OpenAI is selected if its key exists;
DeepSeek is selected if only its key exists; otherwise explanations are local.
`TOKENTRACKER_GUARDIAN_CHAT_PROVIDER=local|openai|deepseek` sets the default.
An invalid provider setting falls back to local.

The browser interface defaults to local explanations and sends its selected
provider explicitly. A user must select an available remote provider to use it;
configuring a key alone does not switch the interface to paid chat.

Model defaults are `gpt-4.1-mini` for OpenAI and `deepseek-chat` for DeepSeek.
`TOKENTRACKER_GUARDIAN_CHAT_MODEL` overrides the server-default provider's model.
`TOKENTRACKER_GUARDIAN_CHAT_OPENAI_MODEL` and
`TOKENTRACKER_GUARDIAN_CHAT_DEEPSEEK_MODEL` configure each provider independently.

A remote question sends the user's question and at most 24,000 UTF-8 bytes of
allowlisted question/evidence input, including up to 16 usage events, six ranked
session summaries, four models per summary, and limited coverage and action
metadata. Original prompts and conversation bodies are not collected. Local
project paths, titles, vendor session IDs/hashes, and request IDs are excluded
from evidence. The question itself is a voluntary user input and may contain
information the user types. Observed automation/cloud-agent IDs can be supplied
as investigation metadata. Provider processing follows the selected provider's
policies; questions are not saved as a server transcript.

Defaults are 10 calls per UTC day, 350 output tokens per call, and 3,500 reserved
output tokens per day. Configure
`TOKENTRACKER_GUARDIAN_CHAT_DAILY_CALLS`,
`TOKENTRACKER_GUARDIAN_CHAT_OUTPUT_TOKENS`, and
`TOKENTRACKER_GUARDIAN_CHAT_DAILY_OUTPUT_TOKENS`.
Limits apply across OpenAI and DeepSeek together and persist in
`guardian/chat-budget.json`, protected by `guardian/chat-budget.lock`.
Failed requests retain their reservations; corrupt or locked ledgers fail closed.
Stop running instances before investigating an orphaned lock. API calls have a
12-second timeout. These are call/output reservations, not a dollar billing cap.

## Voice privacy and limits

Browser dictation is separate from the local transcription API and may use the
browser vendor's speech service. It is not guaranteed to be offline. Optional
read-aloud uses browser speech synthesis only when the user requests it.

OpenAI transcription requires `OPENAI_API_KEY`, even if chat uses DeepSeek.
Recording begins only after the user starts it. The browser stops recordings
after 30 seconds; the server enforces upload bytes, not arbitrary clip duration.
Audio is explicitly sent to OpenAI's pinned transcription endpoint, kept in
memory for the request, and not saved locally. The transcript becomes an editable
draft and is never automatically submitted to chat. Cancel discards the recording.

The model defaults to `gpt-4o-mini-transcribe`; set
`TOKENTRACKER_GUARDIAN_VOICE_MODEL` to change it. The daily allowance defaults to
six calls, with `TOKENTRACKER_GUARDIAN_VOICE_DAILY_CALLS` capped at 20. Voice has
a separate persistent counter in `guardian/voice-budget.json` and an exclusive
`guardian/voice-budget.lock`. The provider timeout is 15 seconds. Call, byte,
and browser recording limits do not guarantee dollar spend. The service saves
neither audio nor transcript history; browser/provider services have their own
processing behavior.

## Grok Bot quota

Grok Bot operates inside Cursor. Its optional adapter uses existing local Cursor
sign-in and read-only first-party access/usage RPCs. It does not refresh or write
credentials. It reports a provider-exposed quota percentage and reset time,
with a 60-second cache and an eight-second deadline. Missing access stays
unavailable. The percentage is not a token count, is not converted into tokens,
and does not create a fifth provider or add to Cursor's existing totals.

## Verification

Run `npm run guardian:test` with Node.js 22.20 or newer for normalization,
session ranking/focus, imports, request handling, provider payload/privacy,
persistent budgets, voice, and quota-adapter regressions. Provider interactions
are mocked; no paid request is needed. HTTP tests use streams without listening.
Real microphone, provider accounts, and macOS collection require separate checks.
