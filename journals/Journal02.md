# FP Journal 2: Token Guardian

**Prototype video:** [VIDEO LINK TO BE ADDED]

Repo: https://github.com/JunyiZhou-Conny/token-guardian

## Decomposing the remaining work

My next challenge is making Token Guardian useful for people like me who use subscriptions for Codex, Claude, and Cursor, rather than assuming all usage comes from pay-as-you-go API calls. I broke the remaining work into tasks that I can build and check in small iterations with AI:

1. **Connect Codex subscription activity.** Ask AI to help build a read-only adapter, then test the response, missing fields, and the dashboard separately. Compare a real response with what Codex itself reports.
2. **Map each source's coverage.** Inspect my Mac's Codex, Claude Code, Cursor, and Gemini records and document which fields actually exist. AI can propose parsers and synthetic examples; I will verify the claims against the available evidence.
3. **Investigate recurring Cursor activity.** Reproduce a harmless ten-minute job, export its usage, and see whether Guardian can trace it. AI can help build fixtures and detection checks, but a real export determines what the product can honestly claim.
4. **Evaluate model explanations and privacy.** Give local and optional remote chat models the same synthetic questions, checking citations, unknowns, private-data exposure, and reported API costs. AI can help generate test cases; I will inspect failures and refine the evaluation.
5. **Harden and pilot.** Add tests for late reports, revised rows, duplicates, and missing identifiers; address desktop dependencies; then ask friends to try the app on their Macs. AI can help reproduce and fix bugs, while pilot feedback tells me which problems matter.
6. **Finish the demo and documentation.** Compare existing monitoring tools, explain the project's sources and my contributions, and show what was tested. AI can help organize findings, but I need to verify the evidence and record the demonstration.

## Prototype this week

I chose the Codex subscription connection because it addresses the core data problem before I evaluate explanations or run a pilot. I am building an opt-in card that reads account activity and quota through the locally installed Codex App Server using an existing sign-in. The request contacts OpenAI; it is not an offline-only source and does not require a separate API key for a supported ChatGPT login. Guardian keeps this account summary separate from local records because they may overlap. Token counts, quota percentages, estimated API-equivalent value, and actual subscription charges are different measures; the app should not invent a bill from usage.

On my Mac, I connected the new card end to end in a browser and confirmed that it displayed my account summary, daily data, and a quota window. I also checked a simulated response, disconnection, and a narrow screen. All 95 Guardian checks passed, including tests for unavailable and partial responses. Many local Codex logs are compressed and the existing collector skips them; coverage across ChatGPT products and devices is still unknown. Native macOS desktop behavior remains untested.

Token Guardian builds on the MIT-licensed [TokenTracker](https://github.com/xiufengsun/TokenTracker). [Token Monitor](https://github.com/Javis603/token-monitor), which I have used, is also an inspiration for the product. My work is the Guardian investigation and companion layer and the new subscription connection; I will preserve the source credits.

## Schedule and mentor questions

- **October 30–November 1:** Finish and test the Codex prototype, write this journal, and record the new demonstration. I chose this first so I have a real, reviewable increment for the deadline.
- **November 2–5:** Check source coverage on my Mac, investigate the Cursor job, and discuss the results with Aadity on November 5. Real data should guide the remaining design.
- **Weeks of November 9 and 16:** Expand synthetic tests and model comparisons, research other monitoring tools, and run a small friends pilot. Use their feedback to prioritize fixes before the final presentation.

For Aadity: How should I distinguish my contribution from the open-source base? What evidence would make the model evaluation and test suite sufficiently thorough? How many pilot users and what macOS packaging evidence should the final project include?
