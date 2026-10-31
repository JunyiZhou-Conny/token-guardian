# Token Monitor contributor and agent guidance

Token Monitor is a deliberately small macOS menu-bar app (Electron) that shows Claude Code, Codex
(ChatGPT plan), and Cursor subscription limits: used/remaining percent per window, reset time, and plan.
Tokens and API-equivalent cost are a planned addition. Keep it small: no analytics, characters, chat, or
extra views unless the user asks.

The earlier Token Guardian prototype lives on the `archive/guardian-v1` branch; do not bring its code back.

## Layout

- `src/main.js`: tray icon, popover window, 5-minute refresh, 60-second manual-refresh floor.
- `src/preload.js`: the only renderer bridge (`getStatus`, `onShown`, `quit`). Keep `contextIsolation`,
  `sandbox`, no `nodeIntegration`, blocked navigation, and denied permissions.
- `src/ui/`: plain HTML/CSS/JS. User-facing text lives in the `COPY` object in `src/ui/app.js`.
- `src/providers/*.js`: one file per tool. Each exports `fetch<Tool>Limits(deps)` returning the shape built
  by `providerResult` in `src/limits.js`. All I/O (`fetch`, `readFile`, `run`, `spawnFn`, `exists`, `now`)
  is injectable so tests never touch the network, Keychain, or real home directory.
- `src/status.js`: collects all providers; a failing provider becomes `unavailable`, never hides others.
- `test/`: `node:test` suites with synthetic fixtures in `test/fixtures/`.

## Commands

```sh
npm test          # Node 22.12+, no install needed
npm install && npm start      # macOS
npm run demo      # labeled demo data, opens the window immediately
```

## Rules

- Read-only: never write, refresh, or rotate a tool's credentials. Expired sign-ins show `expired` with a
  hint to open the tool once.
- Never put tokens, refresh tokens, account IDs, emails, or JWTs in results, logs, errors, fixtures, or
  screenshots. Tests assert this; keep those assertions.
- Unknown values stay `null`/unknown; never invent a percentage, reset time, or plan.
- Endpoints are undocumented; poll at most every 5 minutes and map failures to a labeled status.
- Credit Javis603/token-monitor (MIT) in `THIRD_PARTY_NOTICES.md` when adapting more of its approach.
- Linux/CI checks do not prove macOS behavior; say what still needs a real-Mac check.
