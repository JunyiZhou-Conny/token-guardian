# Install Token Guardian

Token Guardian currently ships as a source prototype. Start with the browser app;
there is no compiled or signed macOS installer yet. The browser app runs on your
own computer and requires **Node.js 20 or newer**.

## Download and start on macOS

1. Install the current Node.js LTS release from [nodejs.org](https://nodejs.org/).
2. Open [token-guardian on GitHub](https://github.com/JunyiZhou-Conny/token-guardian),
   choose **Code → Download ZIP**, and unzip it.
3. Open Terminal, type `cd `, drag the unzipped folder into Terminal, and press
   Return. Then run:

   ```sh
   node scripts/start-guardian.cjs
   ```

The launcher opens `http://127.0.0.1:7681` on macOS. Keep the Terminal window open
while using Guardian. Press **Control-C** there to stop it. No npm install,
account, or API key is needed for the standalone app.

You can also double-click **Start Token Guardian.command**. If macOS blocks a
downloaded launcher, use the Terminal command above. If the shell reports a
permission error, run `chmod +x "Start Token Guardian.command"` in the project
folder before opening it again.

If you use Git, the equivalent setup is:

```sh
git clone https://github.com/JunyiZhou-Conny/token-guardian.git
cd token-guardian
node scripts/start-guardian.cjs
```

## Try the features first

An empty supported dataset starts with a visible **Preview data** label. This
simulated usage lets you explore the overview, session investigations, companion
chat, and the collection without spending API tokens. Preview activity does not
claim to describe your computer.

Choose **Show local records** to leave the preview. Existing TokenTracker records
are read from `~/.tokentracker/tracker/`, with compatibility for older layouts.
You can import a Cursor usage CSV or normalized usage JSON. Imports stay in
`~/.tokentracker/guardian/`; importing the same unchanged export twice does not
double its usage. Remove private prompts, account details, and keys from anything
you share publicly.

The standalone launcher reads records. It does not install collection hooks or
start an upstream synchronization automatically. For collection setup, follow
[GUARDIAN.md](../GUARDIAN.md#collect-real-usage-with-this-fork). The included Codex,
Claude Code, Cursor, and Gemini CLI integrations still need a real macOS pilot.

For a different port or an isolated data directory:

```sh
TOKENTRACKER_GUARDIAN_PORT=7682 TOKENTRACKER_GUARDIAN_DATA_DIR=/path/to/data-root node scripts/start-guardian.cjs
```

Do not point this variable at a folder of raw conversations. Guardian expects
the tracker metadata layout or files that you deliberately import.

## Questions and privacy

Companion chat includes a free, labeled local explanation engine. A question such
as **“Which session used the most tokens?”** ranks the available attributed
sessions and links supporting metadata. The result depends on what your tools
recorded: absent session identifiers cannot be reconstructed from a total.

Optional model and voice configuration is described in
[GUARDIAN.md](../GUARDIAN.md#companion-chat). Provider keys belong in the server's
environment, never in browser forms, imported records, GitHub issues, or commits.
Preview questions remain local. Provider calls can incur charges; the app's call
and output-token limits are not a dollar spending cap.

Recommendations are suggestions you can review and carry out in the originating
tool. Guardian cannot pause Cursor jobs or verify that an automation was unwanted.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| `node: command not found` | Install Node.js LTS and reopen Terminal. |
| Port 7681 is busy | Choose another `TOKENTRACKER_GUARDIAN_PORT` and use the printed URL. |
| The browser did not open | Open the localhost URL printed in Terminal. |
| Only preview records appear | Switch to local records, import metadata, or finish collector setup. |
| Chat says “Local explanation” | This works without a key. Check the provider setup if you want a paid model. |
| A session or project is unavailable | The source did not supply an identifier; inspect the coverage notes. |

For feedback, [open an issue](https://github.com/JunyiZhou-Conny/token-guardian/issues)
with your OS, tool, steps, and expected result. Share anonymized usage metadata
only. The [demo walkthrough](DEMO.md) explains what the recording demonstrates
and which real-account checks are still pending.
