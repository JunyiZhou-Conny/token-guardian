# Security policy

Token Guardian is a source prototype. Security review and fixes currently focus
on the latest source on the default branch; no packaged Guardian release line
or signed DMG is supported yet.

## Report privately

When private reporting is enabled, use this repository's
[GitHub private vulnerability reporting form](https://github.com/JunyiZhou-Conny/token-guardian/security/advisories/new).

Include the affected Git commit, platform, a minimal reproduction, expected
behavior, and potential impact. Use synthetic records and dummy credentials.
Do not publish secrets, conversation content, or exploit details in a public
issue.

If GitHub private reporting is unavailable, open a public issue asking the
maintainer to enable it, without disclosing the vulnerability. No alternative
email address or response-time guarantee is established for this prototype.

## Areas to review

- **Local HTTP service:** `guardian-server/server.js` serves the interface and
  import/chat routes. The standalone launcher binds to `127.0.0.1`. Review
  request-origin checks, input limits, path traversal, and file exposure.
- **Imports and local storage:** usage metadata is allowlisted and stored in the
  documented local data directory. Review validation, permissions, deduplication,
  malformed data handling, and disclosure of private identifiers or paths.
- **Optional OpenAI chat:** without a key, explanations run locally. Opt-in chat
  sends the user's question and bounded usage metadata to OpenAI. Review key
  handling, output/call reservations, prompt injection through metadata, and
  accidental disclosure. Keys must not be exposed by the API or committed.
- **Inherited collectors:** `src/` reads local tool records and, where supported,
  provider usage APIs. Review authentication handling, parser privacy, and
  correct boundaries between local collection and optional upstream services.

Original prompts, code, responses, and conversation bodies must not enter
Guardian's stored usage records or provider evidence bundle. Optional chat
questions are separate user inputs and may be sent to OpenAI when enabled.

The Guardian launcher does not install hooks, start upstream sync, or stop other
applications. The inherited dashboard and desktop sources need separate review
before they are distributed as Guardian builds.

## Fixes and disclosure

Security fixes follow reproduction, focused regression checks, and reviewed pull
requests. Coordinate disclosure through the private report before posting details.
Do not include real credentials or private usage records in a patch or test.
