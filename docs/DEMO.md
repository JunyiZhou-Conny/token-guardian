# Token Guardian demo

[Watch or download the video](demos/token-guardian-demo.mp4) ·
[Subtitle file](demos/token-guardian-demo.srt) ·
[Recording manifest](demos/token-guardian-demo.json)

The video is **79 seconds**, H.264 MP4 at 1280 × 720, about **1.5 MB**, with burned
English subtitles. It is silent. Eleven walkthrough checks passed, and the
recording reported no browser JavaScript errors.

The recording is a walkthrough of the actual browser app and production local
request handler. It uses an isolated temporary data directory, labeled preview
usage, and synthetic imported metadata. No real conversations, user account
usage, credentials, or paid provider calls are recorded.

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

The recorder delegates all app requests to the production handler through the
existing browser bridge, blocks outbound browser requests, and provides an empty
provider environment. Browser dictation is mocked with one disclosed synthetic
phrase; no audio is captured or transmitted. Installation and ending cards are tutorial instructions;
the middle of the video is the actual app. The script asserts key states and
records any browser errors in the manifest. A failed flow stops recording rather
than substituting a fabricated feature.

## What remains to verify

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
