FP Journal 2: Token Guardian

Prototype video (3 min): https://harvard.zoom.us/rec/share/y3o6Q4YVP_0G8kMg1Z11qfyBdZqVCjxBHdjzf1h5Gb2yWrGiHSDPIKoAq4zH24dZ.blxf6YfKDN9ao5C1?startTime=1793587342000

Repo: https://github.com/JunyiZhou-Conny/token-guardian 
And take a look at pull request #4: https://github.com/JunyiZhou-Conny/token-guardian/pull/4


Reformed problem statement:

My first version tried to do everything at once: spike detection, a chat companion, voice input, even game characters. Each time I asked the AI for more, it added it, until I couldn't explain or test most of it. That was my biggest lesson so far about vibe coding: the AI will build whatever I ask, so I have to be the one who keeps the scope small.

So I started over with the one question I actually ask several times a day: how much of my Claude Code, Codex, and Cursor subscription is left, and when does it reset?

Token Guardian is now a small app that sits in my Mac's menu bar. Each tool gets a card showing my plan, how much I've used, what's left, and when it resets. It only reads the sign-in each tool already saved on my computer. It never changes anything.


Task decomposition, and why each fits iteration with AI:

1. A basic menu-bar app. An icon and a small window with one card per tool. I can see the result right away, so I can tell the AI "make this smaller" or "this looks wrong" from a screenshot.

2. Show my Claude Code limits. The AI finds where the data comes from, and I check its answer against Claude Code's own usage screen.

3. Show my Codex limits. Same idea as task 2, so the AI can reuse what already worked. Again, I compare the numbers with what Codex itself reports.

4. Show my Cursor limits. This is the most uncertain one, since Cursor has several kinds of plans. I expect a lot of back-and-forth with the AI, trying it on my own account.

5. Usage and cost. Show roughly how much I've used and what it would cost. Free tools already count this, so the AI can connect one and I check that the totals match.

6. Polish. Easy opening, simple instructions, and a final check against each tool's official page.

What these tasks share is that I can check every one myself without reading the code: does it look right, and do the numbers match the real tool? That is what makes it safe for me, as someone without a computer science background, to let the AI write the code.


Work order

The order is 1, 2, 3, 4, 5, 6, with 4 and 5 possibly in parallel.

The basic app comes first because everything else lives inside it. Then Claude Code and Codex, because I use them most and they turned out to be the easiest. Cursor is next because it's the hardest and the most uncertain. Cost is nice to know, but it isn't what tells me I'm about to run out. Polish comes last.


Prototype for this journal

The prototype covers tasks 1 to 3. Because I can't fully judge the code myself, I had the AI write automated tests with made-up example data. All 32 tests pass. They check normal cases, problem cases like an expired sign-in, and that no password-like information ever shows up on screen. I also asked a separate AI to review the code. It found 13 problems, and I had them fixed. The video shows it running with my real accounts.


On your feedback

Testing now uses example data instead of my live accounts. For "many AI models," I focused on the three subscriptions I actually pay for. Looking at existing tools helped me realize I should restart smaller.


Questions for my mentor

1. Is it okay that I restarted with a much smaller scope for the final project?

2. The tools don't officially publish where their usage numbers come from. Is it acceptable to rely on that, as long as the app clearly says when something fails?

3. As a non-programmer, how can I best judge whether the AI's tests are actually good enough?

4. Should I add more tools (like Gemini or Copilot), or go deeper on these three?

5. Would asking a few friends to try it on their Macs be a good final evaluation?
