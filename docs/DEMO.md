# Token Guardian demos

[Watch or download the video](demos/token-guardian-demo.mp4) ·
[Subtitle file](demos/token-guardian-demo.srt) ·
[Recording manifest](demos/token-guardian-demo.json)

The full dashboard video is **79 seconds**, H.264 MP4 at 1280 × 720, about **2.2 MB**,
with spoken English narration and burned subtitles. Eleven walkthrough checks passed, and the
recording reported no browser JavaScript errors.

The recording is a walkthrough of the actual browser app and production local
request handler. It uses an isolated temporary data directory, labeled preview
usage, and synthetic imported metadata. No real conversations, user account
usage, or credentials are recorded. No paid app chat or speech-recognition calls
are used. Tutorial narration was generated separately through fal.ai using the
ElevenLabs Turbo v2.5 **Rachel** preset; it uses the public walkthrough script,
not a user's voice or private usage.

## Floating companion tour

[Watch or download the floating desktop video](demos/token-guardian-floating-demo.mp4) ·
[Subtitles](demos/token-guardian-floating-demo.srt) ·
[Recording manifest](demos/token-guardian-floating-demo.json)

The floating tour is **84 seconds**, H.264 MP4 at 1280 × 720, about **1.9 MB**,
with spoken narration and subtitles. Nineteen walkthrough assertions passed
without uncaught JavaScript errors.

This tour records the actual Electron app on a Linux X11 desktop with isolated
preferences and synthetic preview data. It shows the compact usage summary,
native pinning, the summoned companion, session evidence, local text chat,
classic and cozy outfits, and a separate full dashboard window. It also shows
hiding and restoring the widget from the real app menu. Linux desktop behavior
does not establish macOS window behavior.

The native window denies microphone access. Its **Voice in browser** action
opens the full browser dashboard; the floating tour shows the control and
permission boundary without recording speech or opening an external browser.
Use the full dashboard tour for the explicitly synthetic dictation example.
Both tours have spoken English narration from the public tutorial script.

## Follow along

1. Install Node.js 20 or newer and download the repository. Run
   `node scripts/start-guardian.cjs`, or open **Start Token Guardian.command** on
   macOS. The browser app needs no npm dependencies.
2. Check **Preview data** before interpreting any numbers. Explore the overview
   and the simulated recurring Cursor activity.
3. Open **Sessions** to find the largest attributed session, then inspect its
   metadata and recommendations. Unknown attribution stays unknown.
4. Ask your companion **“Which session used the most tokens?”**. Read the
   explanation label and open an evidence link. The video demonstrates the local
   engine; OpenAI and DeepSeek calls require your own server-side configuration.
5. Inspect the voice control and its privacy choice. A captioned **Dictation
   demo** injects a synthetic browser transcription into the editable question
   draft. It demonstrates review-before-send, not real microphone recognition.
6. Inspect the optional Grok Bot in Cursor quota support. Provider quota
   percentages are different from token counts; a disconnected quota source
   stays visibly unconfigured.
7. Choose Ahri, Jinx, or Jhin and change their outfit. Companion cosmetics do not
   require spending more tokens.
8. Import a Cursor CSV and import it again to check that unchanged records are
   deduplicated. These demo records are synthetic, even when the app correctly
   labels them as local imported data.

Guardian helps you locate evidence and decide what to investigate. A ten-minute
pattern is a lead, not proof of an unwanted job. It cannot stop the originating
application or promise exact savings. Aggregate buckets alone cannot establish
per-request cadence or identify a conversation.

## Recreate the recording

The developer recorder requires Python with Playwright, Chromium, Node.js, and
ffmpeg. These are **recording tools**, not dependencies of the app itself. Run:

```sh
python scripts/record-guardian-demo.py
```

The default output is `../token-guardian-demo.mp4`, accompanied by an SRT subtitle
file and a JSON manifest. Set `--output /path/to/demo.mp4` to choose another
destination. Set `--chromium /path/to/chromium` if it is not at
`/usr/bin/chromium`. `--publish-copy` also copies a video smaller than 20 MB and
its subtitles into `docs/demos/`.

Existing narration clips and their public text plan are included under
`docs/demos/narration/guardian/`. Recording reuses those clips and makes no TTS
provider calls. Use `--silent` for a caption-only recording. To add the existing
narration to a previously verified MP4/JSON/SRT set without recording the UI
again, use `--narrate-existing`. Narration is aligned to the scene times, slightly
sped up where necessary, and mixed into an AAC audio track; it does not replace
or simulate the app's voice-input feature.

For the floating tour, first install the isolated desktop package with
`npm --prefix desktop ci`. On a developer Linux machine with a running X11
desktop and window manager, run:

```sh
DISPLAY=:91 python scripts/record-floating-demo.py --publish-copy
```

Replace `:91` with your display. This recorder uses Playwright's Electron API,
the repository's isolated desktop fixture, and ffmpeg's X11 capture. It does
not install recording tools, start a display server, or use real account data.
It captures real native windows, rather than the widget's browser preview.
The distinct backdrop and installation screen are labeled tutorial cards.
Its combined narration clip and exact script are under
`docs/demos/narration/floating/`; no provider calls are made during recording.

The full-dashboard recorder delegates all app requests to the production handler
through the existing browser bridge, blocks outbound browser requests, and provides an empty
provider environment. Browser dictation is mocked with one disclosed synthetic
phrase; no audio is captured or transmitted. Installation and ending cards are tutorial instructions;
the middle of the video is the actual app. The script asserts key states and
records any browser errors in the manifest. A failed flow stops recording rather
than substituting a fabricated feature.

## What remains to verify

The broader local validation passed 175 Node checks (88 Guardian and 87 Cursor),
42 actual Electron checks on Linux, 37 widget browser checks, and 45 full-dashboard
browser checks. These checks use isolated synthetic records and mocked provider
responses where applicable.

- Collection and attribution against real Codex, Claude Code, Cursor, and Gemini
  CLI accounts on macOS, including available Cursor automation identifiers.
- Live OpenAI/DeepSeek answers and real microphone transcription with the user's
  selected privacy option and provider credentials.
- Grok Bot quota reporting against a real compatible provider connection.
- Compiled, signed macOS packaging. The source launcher is the current install
  path; there is no Guardian DMG yet.

See [INSTALL.md](INSTALL.md) for setup and [GUARDIAN.md](../GUARDIAN.md) for source,
provider configuration, and evidence limits. Share feedback through
[GitHub issues](https://github.com/JunyiZhou-Conny/token-guardian/issues).
