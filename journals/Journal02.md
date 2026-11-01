# FP Journal 2: Token Monitor

**Prototype video (3 min):** [VIDEO LINK — paste the "anyone with the link can view" URL here]

Repo: https://github.com/JunyiZhou-Conny/token-guardian (pull request [#4](https://github.com/JunyiZhou-Conny/token-guardian/pull/4))

## Reformed problem statement

My first version, Token Guardian, tried to do everything: four collectors, spike detection, a chat companion, voice input, and game characters. It reached about 1,700 files that I could no longer explain or test. So I restarted with the question I actually ask several times a day:

**How much of my Claude Code, Codex (ChatGPT), and Cursor subscription is left, and when does it reset?**

Token Monitor is a small macOS menu-bar app. For each tool it shows the plan, how much of the 5-hour and weekly windows I've used, what's left, and a countdown to the reset. Later it will also show tokens used and their API-equivalent cost. It reads the sign-in each tool already saved on my Mac, never changes it, and talks only to that tool's own usage service.

I borrowed the approach from the open-source Javis603/token-monitor (MIT): I traced its commit history to the commits where it first read each tool's limits, then rewrote just those ideas in about 1,600 lines I understand.

## Task decomposition, and why each fits iteration with AI

1. **Menu-bar skeleton.** An Electron tray icon, a small window, and one card per tool. The output is visible, so I can correct the AI from screenshots.
2. **Claude Code limits.** Find the sign-in, call the usage endpoint, and map the answer into the card. I can give the AI a sample response, and tests check every outcome: success, expired sign-in, rate-limited, and no sign-in.
3. **Codex limits.** The same pattern with a different sign-in file and response format. The AI can follow task 2's pattern, and tests catch differences such as free plans putting the weekly window in the "primary" slot.
4. **Cursor limits.** Read Cursor's local sign-in database and its plan/usage endpoints. This one is exploratory: Cursor has several plan types, so I'll iterate with the AI against real responses from my account.
5. **Tokens and API-equivalent cost.** Run an existing tool such as ccusage and display its totals. The AI can wire it up quickly, and I can check the numbers against ccusage's own output.
6. **Polish and real-Mac checklist.** A double-click launcher, README, and a checklist comparing the app's numbers with each tool's own usage page.

Every task has a checkable output: a test, a screenshot, or a number I can compare with the tool itself. That is what makes directing the AI safe.

## Work order

1 → 2 → 3 → 4 → 5 → 6, with 4 and 5 possibly in parallel.

The skeleton comes first because every later task plugs into it. Subscription limits come next because they are the core need: Claude and Codex first since I use them most and their data is simplest, then Cursor, the hardest. Tokens and cost are "nice to know", not what tells me I'm about to be cut off. Polish comes last, after real-Mac verification.

**Prototype for this journal:** tasks 1–3. 32 automated tests use synthetic responses and a fake Codex command to cover sign-in lookup order, response mapping, each error status, refresh timing, and that no token or account ID ever appears in the output. An AI code review found 13 issues, which I fixed. The video shows it running on my Mac with my real accounts.

**On your feedback:** for testing, every provider is tested against recorded responses rather than live accounts. For "many AI models", I now cover the three subscriptions I actually pay for. My research into existing monitors directly shaped the restart.

## Questions for my mentor

1. Is restarting with a narrower scope acceptable for the final project, given the earlier prototype?
2. These usage endpoints are undocumented. Is depending on them acceptable if the app fails clearly and never guesses?
3. What would an "extremely extensive" test suite look like to you here: more recorded edge cases, or real-account checks from friends?
4. Should "test many AI models" mean adding more tools (Gemini, Copilot), or going deeper on these three?
5. Would a small friends pilot (3–5 Macs) be a good final-stage evaluation?
