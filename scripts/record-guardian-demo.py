#!/usr/bin/env python3
"""Record the real Guardian UI with isolated fixtures and disclosed dictation.

No user store, microphone, API key, or external provider request is used. The
browser bridge executes the production HTTP handler, not a mock app server.
Requires Python Playwright, Chromium, Node.js, and ffmpeg on the developer machine.
"""

import argparse
import base64
import csv
import html
import io
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import playwright as playwright_package
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
ORIGIN = "http://127.0.0.1:7681"
DICTATION_PHRASE = "Which session used the most tokens?"


def timestamp(seconds):
    milliseconds = int(round(seconds * 1000))
    hours, milliseconds = divmod(milliseconds, 3600000)
    minutes, milliseconds = divmod(milliseconds, 60000)
    seconds, milliseconds = divmod(milliseconds, 1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"


def fixture_csv():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Date", "Model", "Input (w/ Cache Write)", "Input (w/o Cache Write)",
        "Cache Read", "Output Tokens", "Total Tokens", "Cost", "Kind",
        "Project", "Session ID", "Automation ID", "Request ID",
    ])
    now = datetime.now(timezone.utc)
    for index in range(7):
        writer.writerow([
            (now - timedelta(minutes=60 - index * 10)).isoformat(),
            "claude-sonnet-4", 150, 100, 200, 50, 400, 0.25,
            "Included in Pro", "Synthetic walkthrough", "demo-import-session",
            "demo-import-sheet-review", f"demo-import-request-{index}",
        ])
    return output.getvalue().encode()


def tutorial_card(title, subtitle, lines, footer):
    """A visibly distinct tutorial card, never a fabricated product screen."""
    rows = "".join(f"<div class='line'>{html.escape(line)}</div>" for line in lines)
    return f"""<!doctype html><html lang="en"><meta charset="utf-8">
<title>Token Guardian tutorial instructions</title><style>
* {{ box-sizing: border-box }} body {{ margin: 0; background: #f7f4ef; color: #342e41;
font: 22px system-ui, sans-serif; width: 1280px; height: 720px; padding: 70px 98px; }}
.label {{ color: #847291; font-size: 15px; letter-spacing: 2px; text-transform: uppercase; }}
h1 {{ font: 50px Georgia, serif; margin: 22px 0 12px }} p {{ color: #6b6475; line-height: 1.6;
margin: 0 0 30px }} .box {{ padding: 28px 32px; background: #ebe6ef; border-radius: 20px; }}
.line {{ margin: 8px 0; font: 22px ui-monospace, monospace; }} footer {{ margin-top: 24px;
color: #746c7e; font-size: 17px; line-height: 1.6; }}
</style><div class="label">Tutorial instructions · source prototype</div>
<h1>{html.escape(title)}</h1><p>{html.escape(subtitle)}</p><div class="box">{rows}</div>
<footer>{html.escape(footer)}</footer></html>"""


# The video labels this as a synthetic dictation demo. It exercises the app's
# editable-draft lifecycle without pretending a real microphone was available.
DICTATION_FIXTURE = """(() => {
  class DemoSpeechRecognition {
    start() {
      this.active = true;
      setTimeout(() => { if (this.active) this.onstart?.({}); }, 40);
      setTimeout(() => {
        if (!this.active) return;
        const result = {0: {transcript: 'Which session used the most tokens?'},
          length: 1, isFinal: true};
        this.onresult?.({resultIndex: 0, results: [result]});
        this.active = false;
        this.onend?.({});
      }, 1700);
    }
    stop() { this.active = false; this.onend?.({}); }
    abort() { this.active = false; this.onend?.({}); }
  }
  window.SpeechRecognition = DemoSpeechRecognition;
  window.webkitSpeechRecognition = DemoSpeechRecognition;
})();"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=pathlib.Path,
                        default=ROOT.parent / "token-guardian-demo.mp4")
    parser.add_argument("--chromium", default="/usr/bin/chromium")
    parser.add_argument("--publish-copy", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    subtitles = output.with_suffix(".srt")
    manifest_path = output.with_suffix(".json")
    cues, errors, checks, import_results, chat_results = [], [], [], [], []
    recording_start = time.monotonic()
    fixture = fixture_csv()
    cards = {}
    video_path = None

    with tempfile.TemporaryDirectory(prefix="guardian-demo-") as scratch:
        # Reuse the installed ffmpeg rather than downloading Playwright browsers
        # or a second recorder binary. Registry location is isolated and removed
        # with this recording's temporary directory.
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise RuntimeError("ffmpeg is required to record the developer demo.")
        browser_manifest = pathlib.Path(playwright_package.__file__).parent / "driver/package/browsers.json"
        ffmpeg_revision = next(item["revision"] for item in
                               json.loads(browser_manifest.read_text())["browsers"]
                               if item["name"] == "ffmpeg")
        recorder_tools = pathlib.Path(scratch) / "recorder-tools"
        binary_dir = recorder_tools / f"ffmpeg-{ffmpeg_revision}"
        binary_dir.mkdir(parents=True)
        binary_name = "ffmpeg-mac" if os.uname().sysname == "Darwin" else "ffmpeg-linux"
        (binary_dir / binary_name).symlink_to(ffmpeg)
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = str(recorder_tools)
        data_dir = pathlib.Path(scratch) / "metadata"
        data_dir.mkdir()
        bridge = subprocess.Popen(
            ["node", str(ROOT / "guardian-test/browser-bridge.cjs"), str(data_dir)],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, cwd=ROOT,
        )
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    executable_path=args.chromium, headless=True, args=["--no-sandbox"],
                )
                context = browser.new_context(
                    viewport={"width": 1280, "height": 720}, device_scale_factor=1,
                    record_video_dir=str(pathlib.Path(scratch) / "recordings"),
                    record_video_size={"width": 1280, "height": 720},
                )
                context.add_init_script(DICTATION_FIXTURE)
                page = context.new_page()
                page.on("pageerror", lambda error: errors.append(str(error)))
                recording_start = time.monotonic()

                def serve(route):
                    request = route.request
                    url = urlsplit(request.url)
                    if url.hostname not in ("127.0.0.1", "localhost"):
                        route.abort()
                        return
                    if url.path in cards:
                        route.fulfill(status=200, content_type="text/html", body=cards[url.path])
                        return
                    payload = {
                        "method": request.method,
                        "url": url.path + ("?" + url.query if url.query else ""),
                        "headers": request.all_headers(),
                        "body": base64.b64encode(request.post_data_buffer or b"").decode(),
                    }
                    bridge.stdin.write(json.dumps(payload) + "\n")
                    bridge.stdin.flush()
                    line = bridge.stdout.readline()
                    if not line:
                        raise RuntimeError("The production-handler bridge stopped unexpectedly.")
                    response = json.loads(line)
                    body = base64.b64decode(response["body"])
                    if request.method == "POST" and url.path == "/api/guardian/import":
                        import_results.append(json.loads(body))
                    if request.method == "POST" and url.path == "/api/guardian/chat":
                        chat_results.append(json.loads(body))
                    route.fulfill(status=response["status"], headers=response["headers"], body=body)

                context.route("**/*", serve)

                def check(condition, description):
                    if not condition:
                        raise AssertionError(description)
                    checks.append(description)

                def hold(seconds, caption):
                    start = time.monotonic() - recording_start
                    cues.append((start, start + seconds, caption))
                    print(f"Scene: {caption.replace(chr(10), ' ')}", flush=True)
                    page.wait_for_timeout(seconds * 1000)

                def settle():
                    page.wait_for_function("!document.querySelector('[data-action=refresh]').disabled")
                    page.evaluate("""async () => {
                      await document.fonts.ready;
                      await Promise.all([...document.images].map(image => {
                        image.loading = 'eager'; return image.decode().catch(() => {});
                      }));
                      await new Promise(resolve => requestAnimationFrame(resolve));
                    }""")

                def navigate(tab):
                    page.locator(f'.nav-item[data-tab="{tab}"]').click()
                    page.wait_for_selector(f'.nav-item[data-tab="{tab}"][aria-current="page"]')
                    page.evaluate("window.scrollTo(0, 0)")
                    settle()

                def show_card(name, title, subtitle, lines, footer):
                    path = f"/demo-tutorial-{name}"
                    cards[path] = tutorial_card(title, subtitle, lines, footer)
                    page.goto(ORIGIN + path, wait_until="networkidle")

                show_card("install", "Your token watchtower, with company.",
                          "Install Node.js 20+, then download the project from GitHub.",
                          ["git clone https://github.com/JunyiZhou-Conny/token-guardian.git",
                           "cd token-guardian", "node scripts/start-guardian.cjs"],
                          "macOS: you can also open Start Token Guardian.command. "
                          "No npm install or API key is needed for the browser app.")
                hold(6, "Install Node.js 20+, download the source, and start the local app.\n"
                     "This is a browser prototype; a signed macOS installer is still pending.")

                page.goto(ORIGIN + "/", wait_until="networkidle")
                page.wait_for_selector(".stat-card")
                settle()
                check("Preview data" in page.locator(".mode-pill").inner_text(),
                      "Empty isolated store shows labeled preview data")
                page.locator('[data-period="week"]').click()
                settle()
                hold(6, "The overview combines Codex, Claude Code, Cursor, and Gemini CLI.\n"
                     "All usage in this walkthrough is synthetic; check the Preview data label.")

                navigate("sessions")
                page.wait_for_selector(".session-card")
                check(page.locator(".session-card").count() > 0,
                      "Actual Sessions view ranks available attributed sessions")
                hold(6, "Find the largest attributed sessions and compare the available evidence.\n"
                     "Missing identifiers remain unknown; aggregate totals cannot invent a session.")
                page.locator("[data-session]").first.click()
                page.wait_for_selector(".detail-dialog[open]")
                hold(6, "Open a session to inspect its usage trail and recommended next steps.\n"
                     "Guardian helps you investigate; it cannot stop jobs in the originating app.")
                page.locator(".detail-dialog [data-dialog-close]").click()
                page.wait_for_selector(".detail-dialog", state="hidden")

                page.locator(".sidebar-guardian[data-action=chat]").click()
                page.wait_for_selector("#chat-input")
                if page.locator("#chat-provider").count():
                    page.locator("#chat-provider").select_option("local")
                page.locator("#chat-input").fill(DICTATION_PHRASE)
                page.locator("#chat-form").evaluate("form => form.requestSubmit()")
                page.wait_for_function("!document.querySelector('#chat-form button[type=submit]').disabled")
                check(bool(chat_results) and chat_results[-1]["mode"] == "local",
                      "Session question answered by the production local explanation engine")
                check(bool(chat_results[-1].get("evidenceIds")),
                      "Session answer returns supporting evidence IDs")
                page.locator("#chat-messages").evaluate("""log => {
                    const answer = [...log.querySelectorAll('.chat-message.assistant')].at(-1);
                    log.scrollTop += answer.getBoundingClientRect().top - log.getBoundingClientRect().top;
                }""")
                hold(4, "Ask: Which session used the most tokens? Read the answer and its evidence.\n"
                     "This recording uses local explanations; OpenAI and DeepSeek are optional.")
                page.locator("#chat-messages").evaluate("log => { log.scrollTop = log.scrollHeight; }")
                hold(5, "Review grounded suggestions: inspect the job, reduce repeated context, or try caching.\n"
                     "Suggestions require your judgment; Guardian cannot promise exact savings.")

                page.locator("#voice-method").select_option("browser")
                page.locator("[data-action=voice]").click()
                hold(3, "Dictation demo: a synthetic browser transcription is being injected.\n"
                     "No real microphone, audio upload, or speech-model call is used here.")
                page.wait_for_function("document.getElementById('chat-input').value.includes('Which session')")
                check(DICTATION_PHRASE in page.locator("#chat-input").input_value(),
                      "Disclosed synthetic browser dictation creates an editable draft")
                check(len(chat_results) == 1, "Voice draft does not automatically send a chat request")
                hold(6, "Review or edit the dictated draft before sending it.\n"
                     "Browser speech may use its vendor service; OpenAI audio is a separate opt-in.")
                page.locator('[data-action="chat-close"]').click()
                page.wait_for_selector(".drawer-backdrop", state="hidden")

                navigate("overview")
                grok = page.locator('[data-action="grok-enable"]')
                check(grok.count() == 1, "Grok Bot quota access has an explicit opt-in control")
                grok.scroll_into_view_if_needed()
                hold(7, "Grok Bot inside Cursor has an optional read-only quota connection.\n"
                     "Percent used and reset time are quota measures, not token counts. It is off here.")

                navigate("collection")
                page.locator('[data-companion="ahri"]').click()
                classic = page.locator('[data-skin="classic"][data-skin-companion="ahri"]')
                cozy = page.locator('[data-skin="cozy"][data-skin-companion="ahri"]')
                classic.click()
                hold(3, "Choose Ahri, Jinx, or Jhin; switch between classic and cozy outfits.")
                cozy.click()
                hold(4, "Cute companions and stickers celebrate attention and good habits.\n"
                     "You do not have to spend more tokens to collect them.")
                page.locator('[data-companion="jinx"]').click()
                page.locator('[data-skin="cozy"][data-skin-companion="jinx"]').click()
                check(page.locator('[data-companion="jinx"][aria-pressed="true"]').count() == 1,
                      "Companion selection is an actual app interaction")
                hold(3, "Your companion and outfit choice stay in this browser.")

                navigate("activity")

                def import_fixture():
                    page.locator("#usage-file").set_input_files([])
                    with page.expect_file_chooser() as chooser:
                        page.locator('[data-action="import"]').last.click()
                    with page.expect_response(lambda response:
                                              urlsplit(response.url).path == "/api/guardian/import"
                                              and response.request.method == "POST"):
                        chooser.value.set_files({"name": "synthetic-demo-cursor.csv",
                                                 "mimeType": "text/csv", "buffer": fixture})
                    page.wait_for_selector(".mode-pill.local")
                    page.wait_for_function("document.getElementById('toast').textContent === 'Usage records imported.'")
                    settle()

                import_fixture()
                check(import_results[-1].get("added") == 7, "Synthetic import adds seven metadata events")
                hold(5, "Import a Cursor CSV or normalized metadata JSON into local storage.\n"
                     "Local data in this recording still comes from a synthetic demo fixture.")
                import_fixture()
                check(import_results[-1].get("added") == 0 and import_results[-1].get("duplicates") == 7,
                      "Importing the unchanged fixture twice does not inflate totals")
                hold(5, "Reimport the same export: duplicate records are skipped.\n"
                     "Included plan usage, estimated cost, and extra charges stay distinct.")

                show_card("finish", "Follow the evidence. Keep the company.",
                          "Start locally, investigate a session, and tell us what should improve.",
                          ["Setup: docs/INSTALL.md", "Walkthrough: docs/DEMO.md",
                           "Feedback: github.com/JunyiZhou-Conny/token-guardian/issues"],
                          "Live models, real dictation, real quota access, and end-to-end Mac collection "
                          "still need an account-based pilot. No paid API calls were made for this video.")
                hold(5, "Try the source prototype and send anonymized feedback through GitHub issues.\n"
                     "Live provider and macOS checks remain; the video demonstrates the actual UI.")
                check(not errors, "No browser JavaScript errors during the walkthrough")
                video = page.video
                context.close()
                video_path = pathlib.Path(video.path())
                browser.close()

            subtitles.write_text("\n\n".join(
                f"{index}\n{timestamp(start)} --> {timestamp(end)}\n{caption}"
                for index, (start, end, caption) in enumerate(cues, 1)
            ) + "\n", encoding="utf-8")
            # Use a safe temporary subtitle path: no interpolation of shell text.
            subtitle_copy = pathlib.Path(scratch) / "captions.srt"
            shutil.copyfile(subtitles, subtitle_copy)
            filter_text = (
                f"subtitles={subtitle_copy}:force_style='FontName=DejaVu Sans,FontSize=10,"
                "Outline=1,Shadow=0,MarginV=12,BorderStyle=3,BackColour=&H88000000',"
                "fps=25,format=yuv420p"
            )
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(video_path),
                "-vf", filter_text, "-c:v", "libx264", "-preset", "fast", "-crf", "25",
                "-movflags", "+faststart", "-an", str(output),
            ], check=True)
            probe = json.loads(subprocess.check_output([
                "ffprobe", "-v", "error", "-show_entries", "format=duration,size:stream=codec_name,width,height",
                "-of", "json", str(output),
            ], text=True))
            manifest = {
                "recordedAt": datetime.now(timezone.utc).isoformat(),
                "video": output.name, "subtitles": subtitles.name,
                "dimensions": {"width": 1280, "height": 720},
                "fixtureDataOnly": True, "handler": "guardian-server/server.js",
                "paidApiCalls": 0, "microphone": "not used",
                "dictation": "disclosed synthetic browser-recognition fixture",
                "grokQuota": "opt-in control shown, no provider connection enabled",
                "checks": checks, "browserErrors": errors,
                "scenes": [{"start": round(start, 3), "end": round(end, 3), "caption": caption}
                           for start, end, caption in cues],
                "media": probe,
            }
            manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            if args.publish_copy:
                if output.stat().st_size >= 20 * 1024 * 1024:
                    raise RuntimeError("Video exceeds the 20 MB publication-copy limit.")
                destination = ROOT / "docs/demos"
                destination.mkdir(exist_ok=True)
                for artifact in (output, subtitles, manifest_path):
                    shutil.copyfile(artifact, destination / artifact.name)
            print(json.dumps({"video": str(output), "subtitles": str(subtitles),
                              "manifest": str(manifest_path), "bytes": output.stat().st_size,
                              "duration": probe["format"]["duration"], "checks": len(checks)}, indent=2))
        finally:
            bridge.terminate()
            try:
                bridge.wait(timeout=5)
            except subprocess.TimeoutExpired:
                bridge.kill()
                bridge.wait(timeout=5)


if __name__ == "__main__":
    main()
