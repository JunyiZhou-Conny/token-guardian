# FP Journal 1: Token Guardian

Repo: https://github.com/JunyiZhou-Conny/token-guardian

## 1. The problem, why it's unique, and why it excites me

I use several AI coding tools every day: Codex, Claude Code, Cursor, and Gemini CLI. Each one keeps its own usage records in its own format, and none of them answers the question I actually have when my usage jumps: **what happened, and was it me?**

This came from a real moment. On my Cursor plan, I set up a recurring "alarm" that had an agent check a Google Sheet every 10 minutes. I forgot about it, and it ran all night. When I woke up, everything looked normal, so I assumed the agent was behaving. It wasn't. It had been quietly eating my credits in the background. Finding the cause took a long time, because I had so many chat windows open and no way to tell which one was using the credits. The job ran behind the scenes, and nothing made it obvious that something was repeating on a schedule. That's the problem I want to solve: unexpected AI usage should be easy to spot and easy to trace back to where it came from.

Token Guardian is a local app that pulls usage from those four tools into one place and helps me *investigate* unexpected usage rather than just total it up. It flags request spikes and activity that repeats on a schedule (for example, a job firing every ten minutes), ranks sessions by usage, and links every claim back to the records behind it. It keeps reported, estimated, and unknown values separate instead of guessing. A companion character (Ahri, Jinx, or Jhin) can float on the desktop and answer questions like "Which session used the most tokens?" with citations to the evidence.

What excites me is the mix of a real annoyance in my own workflow with a fun interface. I'd actually leave it open, and I want friends who use these tools to try it.

**Research on existing solutions:**

- **Built-in tool views.** Claude Code's `/usage` and `/cost` show plan bars and per-session numbers, but only for Claude Code on one machine ([Claude Code docs](https://code.claude.com/docs/en/costs)). Cursor and Codex each have their own separate dashboards. Nothing looks across all of them.
- **ccusage** ([ccusage.com](https://ccusage.com/guide/)) reads local logs from many CLIs and reports daily/weekly/session totals and estimated cost. It's a reporting tool: it doesn't detect recurring jobs or spikes, doesn't cover Cursor's IDE usage, and doesn't explain *why* usage happened.
- **Claude-Code-Usage-Monitor** gives real-time burn-rate predictions, but for Claude Code only ([Faros AI overview](https://www.faros.ai/blog/claude-code-token-usage)).
- **LangWatch** and **Faros AI** do full tracing and team cost attribution ([LangWatch](https://langwatch.ai/claude-code-usage)), but they send telemetry to a hosted service and are built for teams and observability, not a single person asking "what is this spike?"
- **TokenTracker** ([xiufengsun/TokenTracker](https://github.com/xiufengsun/TokenTracker)), the MIT-licensed project I built on, collects usage and shows analytics dashboards. It doesn't investigate.

The gap: existing tools answer **"how much?"** Token Guardian tries to answer **"what happened, what's the evidence, and what can't we know?"** across tools, locally, without uploading prompts or code.

To be transparent about scope: I started from TokenTracker's collector and dashboard. My additions are the Guardian investigation layer (spike and cadence detection, the Sessions view, evidence dialogs), keeping Cursor's Automation ID and Cloud Agent ID columns instead of losing them in aggregation, the grounded companion chat with optional OpenAI/DeepSeek explanations and cost limits, voice-drafted questions, and the floating Electron desktop companion.

## 2. Why this is too complex to build without AI

- **Four tools, four undocumented data formats.** Each tool stores usage differently, sometimes only as half-hour buckets. Understanding a large existing codebase (TokenTracker's collectors, React dashboard, and desktop app) well enough to extend it would have taken me weeks alone.
- **Getting the evidence right is subtle.** Half-hour totals can't prove a ten-minute schedule, Cursor's CSV can revise past rows, and providers report late. Writing detection that's honest about these limits, and import logic that doesn't double-count re-imported exports, needed many iterations and tests. The repo has 175 Node checks plus Electron and browser checks, mostly written with AI.
- **A stack I don't normally work in.** Node.js, a local HTTP server, React, and an Electron desktop app with native window pinning are far from my usual Python/R data work.
- **An LLM inside the product.** The companion has to answer from local data with citations, keep private details (paths, session titles, IDs) out of anything sent to a provider, and stay within daily call and token limits.

## 3. The expertise I bring

- **Daily heavy user of the exact tools involved.** I know how Codex, Claude Code, Cursor, and Gemini CLI behave, what their limits look like, and what a confusing usage jump feels like, so I can specify what the tool should show and spot when it's wrong.
- **Health data science and biostatistics training (Harvard M.S. Health Data Science, B.S. Applied Mathematics and Statistics from Emory).** This shapes the core design: telling signal from noise in time-series data, handling missing data instead of imputing it silently, and separating "evidence of a pattern" from "proof of a cause." That's why Guardian labels recurring activity as an investigation lead, not proof, and keeps unknown values unknown.
- **Experience building and testing AI-driven software.** I'm used to checking AI-generated code with tests and synthetic data rather than trusting it, which is why the prototype ships with isolated synthetic test records.

## 4. Course goals, and how this pushes me beyond my comfort zone

My goal for this course is to build products I'll actually use, that can help other people and make a difference for the people around me. Along the way I want to get good at the course's core skills: building working prototypes by directing AI, testing and verifying AI-generated code, understanding the important parts of what the AI wrote, and using LLMs as components inside my own tools.

Token Guardian fits that goal directly. I built it because I needed it, and almost everyone I know who codes with AI is running several of these tools at once without a clear picture of where their usage goes.

How it advances these goals:

- **Building a real prototype:** a working local dashboard and desktop companion, not a notebook.
- **Testing and verifying:** I'm forcing myself to back every claim the app makes with records and automated checks.
- **LLMs as components:** the companion chat is grounded in local data, with privacy filtering and spending limits.
- **Sharing my work:** the next milestone is a friends pilot on real Macs, collecting feedback through GitHub issues.
- **Knowing AI's limits:** the project is literally about making AI usage visible and being honest about what the data can and can't show.

Beyond my comfort zone: I'm a data scientist, not an app developer. Extending someone else's large open-source codebase, building an Electron desktop app, handling privacy for real users' data, and running a pilot with friends are all new to me.

**Next steps:** run the friends pilot on real Macs, reproduce a known scheduled job end to end, check what Cursor's export actually exposes, and publish what each source can and can't tell you.
