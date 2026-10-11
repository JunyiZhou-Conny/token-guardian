"""Browser verification with the real local handler and no listening sockets."""
import base64
import csv
import io
import json
import pathlib
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)


def fixture_csv():
    """Synthetic Cursor metadata; never read or write a user's tracker store."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Date", "Model", "Input (w/ Cache Write)", "Input (w/o Cache Write)",
        "Cache Read", "Output Tokens", "Total Tokens", "Cost", "Kind", "Project",
        "Session ID", "Automation ID", "Cloud Agent ID", "Request ID",
    ])
    now = datetime.now(timezone.utc)
    for index in range(7):
        writer.writerow([
            (now - timedelta(minutes=60 - index * 10)).isoformat(),
            "claude-sonnet-4", 150, 100, 200, 50, 400, 0.25, "Included in Pro",
            "Browser smoke fixture", "smoke-session", "smoke-sheet-review",
            "smoke-cloud-agent", f"smoke-request-{index}",
        ])
    return output.getvalue().encode()

with tempfile.TemporaryDirectory(prefix="guardian-browser-") as data_dir:
    bridge = subprocess.Popen(
        ["node", str(ROOT / "guardian-test/browser-bridge.cjs"), data_dir],
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, cwd=ROOT,
    )
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
            context = browser.new_context(viewport={"width": 1440, "height": 1100}, device_scale_factor=1)
            # Exercise UI lifecycle without using a microphone or speech service.
            context.add_init_script("""window.SpeechRecognition = class {
                constructor() { window.mockDictation = this; }
                start() { this.started = true; }
                stop() { this.onend?.(); }
                abort() { this.aborted = true; }
            };
            window.microphoneStops = 0;
            Object.defineProperty(navigator, 'mediaDevices', {value:{getUserMedia:async()=>({
                getTracks:()=>[{stop:()=>window.microphoneStops++}]
            })}, configurable:true});
            window.MediaRecorder = class {
                static isTypeSupported(type) { return type.startsWith('audio/webm'); }
                constructor(stream, options) {this.mimeType=options.mimeType;this.state='inactive';}
                start() {this.state='recording';}
                stop() {
                    this.state='inactive';
                    this.ondataavailable?.({data:new Blob([new Uint8Array([26,69,223,163,0,0,0,0])],{type:this.mimeType})});
                    this.onstop?.();
                }
            };""")
            errors = []
            checks = []
            imports = []
            chat_responses = []
            chat_requests = []
            quota_requests = []
            voice_requests = []
            mock_voice_available = False
            page = context.new_page()
            page.on("pageerror", lambda error: errors.append(str(error)))

            def check(condition, description):
                assert condition, description
                checks.append(description)

            def serve(route):
                request = route.request
                url = urlsplit(request.url)
                if url.hostname not in ("127.0.0.1", "localhost"):
                    route.abort()
                    return
                if url.path == "/api/guardian/grokbot":
                    quota_requests.append(url.query)
                    enabled = "enabled=1" in url.query
                    route.fulfill(status=200, content_type="application/json", body=json.dumps({
                        "provider": "grokbot", "enabled": enabled,
                        "availability": "available" if enabled else "disabled",
                        "usedPercent": 41.25 if enabled else None,
                        "message": "Synthetic quota fixture" if enabled else "Quota checks disabled.",
                    }))
                    return
                if url.path == "/api/guardian/transcribe":
                    voice_requests.append(request.post_data_buffer)
                    route.fulfill(status=200, content_type="application/json", body=json.dumps({
                        "text":"the scheduled task", "provider":"openai", "notice":"Synthetic transcription fixture"
                    }))
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
                if url.path == "/api/guardian/health" and mock_voice_available:
                    health = json.loads(body)
                    health["voice"]["configured"] = True
                    body = json.dumps(health).encode()
                if request.method == "POST" and url.path == "/api/guardian/import":
                    imports.append(json.loads(body))
                if request.method == "POST" and url.path == "/api/guardian/chat":
                    chat_requests.append(json.loads(request.post_data))
                    chat_responses.append(json.loads(body))
                route.fulfill(status=response["status"], headers=response["headers"], body=body)

            def settle():
                page.wait_for_function("!document.querySelector('[data-action=refresh]').disabled")
                page.evaluate("""async () => {
                    await document.fonts.ready;
                    await Promise.all([...document.images].map(image => {
                        image.loading = 'eager';
                        return image.decode().catch(() => {});
                    }));
                    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                }""")

            def navigate(tab):
                page.locator(f'.nav-item[data-tab="{tab}"]').click()
                page.wait_for_selector(f'.nav-item[data-tab="{tab}"][aria-current="page"]')
                settle()

            def snapshot():
                return page.evaluate("async () => (await fetch('/api/guardian?mode=local')).json()")

            def import_fixture():
                page.locator("#usage-file").set_input_files([])
                with page.expect_file_chooser() as chooser:
                    page.locator('[data-action="import"]').last.click()
                chooser.value.set_files({"name": "synthetic-cursor.csv", "mimeType": "text/csv", "buffer": fixture})
                page.wait_for_selector(".mode-pill.local")
                page.wait_for_function("document.getElementById('toast').textContent === 'Usage records imported.'")
                settle()

            def mobile_navigate(tab):
                page.get_by_role("button", name="Open navigation", exact=True).click()
                page.wait_for_selector(".sidebar.open")
                page.locator(f'.sidebar.open .nav-item[data-tab="{tab}"]').click()
                page.wait_for_selector(f'.nav-item[data-tab="{tab}"][aria-current="page"]')
                page.wait_for_function("""() => {
                    const sidebar = document.querySelector('.sidebar');
                    return !sidebar.classList.contains('open') && sidebar.getBoundingClientRect().right <= 1;
                }""")
                page.wait_for_selector(".mobile-scrim.visible", state="hidden")
                settle()

            context.route("**/*", serve)
            page.goto("http://127.0.0.1:7681/", wait_until="networkidle")
            page.wait_for_selector(".stat-card")
            settle()
            check(page.locator(".mode-pill").inner_text() == "Preview data", "Empty isolated store shows labeled preview data")
            page.locator('[data-period="week"]').click()
            settle()
            check(page.locator(".companion-card .champion-art.asset-loaded img").count() == 1, "Companion image loads successfully")
            page.screenshot(path=str(ARTIFACTS / "guardian-desktop.png"), full_page=True)

            navigate("collection")
            page.locator('[data-companion="jinx"]').click()
            check(page.locator('[data-companion="jinx"][aria-pressed="true"]').count() == 1, "Collection selects Jinx")
            page.locator('[data-skin="cozy"][data-skin-companion="jinx"]').click()
            settle()
            check("champion-variants.png" in page.locator('.champion-card.jinx img').get_attribute("src"), "Cozy outfit uses the new transparent atlas")
            page.reload(wait_until="networkidle")
            settle()
            check(page.locator('[data-companion="jinx"][aria-pressed="true"]').count() == 1, "Jinx selection persists after reload")
            check(page.locator('[data-skin="cozy"][data-skin-companion="jinx"][aria-pressed="true"]').count() == 1, "Jinx cozy outfit persists after reload")
            page.screenshot(path=str(ARTIFACTS / "guardian-collection.png"), full_page=True)

            navigate("sessions")
            check(page.locator('.session-card').count() > 0, "Preview sessions are ranked with recorded metadata")
            page.locator('[data-session]').first.click()
            page.wait_for_selector('.session-dialog[open]')
            check("Models in this session" in page.locator('.session-dialog').inner_text(), "Session detail exposes the model breakdown")
            page.locator('[data-dialog-close]').click()
            page.locator('[data-session-ask]').first.click()
            page.wait_for_function("!document.querySelector('#chat-form button[type=submit]').disabled")
            check(bool(chat_requests[-1].get('focusId')), "Session question passes its exact focus identifier")
            check(bool(chat_responses[-1].get('evidenceIds')), "Focused session answer includes evidence")
            check(page.locator('#chat-provider').input_value() == 'local', "Chat starts with the free local provider")
            check(page.locator('#chat-provider option[value=deepseek]').is_disabled(), "Unconfigured DeepSeek is clearly unavailable")
            before_voice = len(chat_requests)
            check(page.locator('[data-action=voice-cancel]').is_hidden(), "Idle voice input hides its cancel control")
            page.locator('#chat-input').fill('Review')
            page.locator('[data-action=voice]').click()
            page.evaluate("window.mockDictation.onresult({results:[[{transcript:'the busiest session'}]]})")
            page.locator('[data-action=voice]').click()
            check(page.locator('#chat-input').input_value() == 'Review the busiest session', "Dictation produces an editable draft")
            check(len(chat_requests) == before_voice, "Dictation never automatically sends a chat request")
            page.locator('[data-action=voice]').click()
            page.evaluate("window.mockDictation.onresult({results:[[{transcript:'discard this'}]]})")
            page.locator('[data-action=voice-cancel]').click()
            check(page.locator('#chat-input').input_value() == 'Review the busiest session', "Cancel preserves the previous draft")
            page.locator('[data-action=voice]').click()
            page.locator('[data-action=chat-close]').click()
            check(page.evaluate('window.mockDictation.aborted === true'), "Closing chat aborts active dictation")
            mock_voice_available = True
            page.reload(wait_until="networkidle")
            settle()
            page.locator('[data-action=chat]').first.click()
            page.locator('#voice-method').select_option('openai')
            page.locator('#chat-input').fill('Review')
            chat_count = len(chat_requests)
            page.locator('[data-action=voice]').click()
            page.wait_for_selector('.voice-button.recording')
            page.locator('[data-action=voice]').click()
            page.wait_for_function("document.querySelector('.voice-status').textContent.includes('draft is ready')")
            check(page.locator('#chat-input').input_value() == 'Review the scheduled task', "Mocked OpenAI transcription produces a reviewable draft")
            check(len(voice_requests) == 1 and len(chat_requests) == chat_count, "Audio upload creates no automatic chat request")
            stopped = page.evaluate('window.microphoneStops')
            page.locator('[data-action=voice]').click()
            page.wait_for_selector('.voice-button.recording')
            page.locator('[data-action=chat-close]').click()
            check(page.evaluate('window.microphoneStops') > stopped, "Closing chat releases recording microphone tracks")
            check(len(voice_requests) == 1, "Canceled recording never uploads audio")
            mock_voice_available = False
            page.reload(wait_until="networkidle")
            settle()
            page.screenshot(path=str(ARTIFACTS / "guardian-sessions.png"), full_page=True)

            navigate("overview")
            check(not quota_requests, "Grok quota is never fetched before opt-in")
            check('not a token count' in page.locator('.grok-mini').inner_text(), "Grok quota explains its units separately from tokens")
            page.locator('[data-action=grok-enable]').click()
            page.wait_for_selector('[data-action=grok-refresh]:not([disabled])')
            check('41.3%' in page.locator('.grok-value').inner_text(), "Opt-in quota shows the provider percentage")
            page.locator('[data-action=grok-disable]').click()
            page.wait_for_selector('[data-action=grok-enable]:not([disabled])')
            check(page.locator('.grok-value').inner_text() == '—', "Disabling quota hides the cached percentage")
            page.locator("[data-incident]").first.click()
            page.wait_for_selector(".detail-dialog[open] .evidence-item")
            check(page.locator(".detail-dialog .evidence-item").count() >= 6, "Incident dialog exposes recurring-event evidence")
            check("demo-job-board-review" in page.locator(".detail-dialog").inner_text(), "Incident evidence retains the automation identifier")
            page.screenshot(path=str(ARTIFACTS / "guardian-evidence.png"), full_page=True)
            page.locator(".detail-dialog [data-dialog-close]").click()
            page.wait_for_selector(".detail-dialog", state="hidden")
            check(page.locator(".detail-dialog[open]").count() == 0, "Incident dialog closes")

            page.locator('.companion-card [data-action="chat"]').click()
            page.locator('[data-question="Why did Cursor keep running?"]').click()
            page.wait_for_function("""() => [...document.querySelectorAll('.chat-message.assistant')]
                .some(message => message.textContent.includes('Automation ID: demo-job-board-review'))""")
            page.wait_for_selector(".chat-evidence button")
            check(chat_responses[-1]["mode"] == "local", "Demo companion uses the production local explanation")
            check(len(chat_responses[-1]["evidenceIds"]) >= 6, "Companion answer cites supporting event IDs")
            check("simulated example" in page.locator(".chat-messages").inner_text(), "Companion labels simulated evidence")
            page.screenshot(path=str(ARTIFACTS / "guardian-chat.png"), full_page=True)
            page.locator(".chat-evidence button").first.click()
            page.wait_for_selector(".detail-dialog[open] .evidence-item")
            check(page.locator(".detail-dialog .evidence-item").count() == 1, "Chat citation opens its underlying usage record")
            page.locator(".detail-dialog [data-dialog-close]").click()
            page.wait_for_selector(".detail-dialog", state="hidden")
            page.locator('[data-action="chat-close"]').click()
            page.wait_for_selector(".drawer-backdrop", state="hidden")

            fixture = fixture_csv()
            navigate("activity")
            import_fixture()
            first = snapshot()
            check(first["mode"] == "local" and len(first["events"]) == 7, "CSV import switches to seven local records")
            check(first["summary"]["totalTokens"] == 2800, "Imported token totals include cache reads and writes once")
            check(imports[-1]["added"] == 7 and imports[-1]["duplicates"] == 0, "First CSV import adds its seven events")
            check(all(event["automationId"] == "smoke-sheet-review" for event in first["events"]), "CSV import preserves automation attribution")
            import_fixture()
            repeated = snapshot()
            check(imports[-1]["added"] == 0 and imports[-1]["duplicates"] == 7, "Repeated CSV import deduplicates all seven events")
            check(repeated["summary"]["totalTokens"] == 2800 and len(repeated["events"]) == 7, "Repeated import does not inflate totals")

            navigate("settings")
            page.locator('[data-action="demo"]').click()
            page.wait_for_selector(".mode-pill:not(.local)")
            settle()
            navigate("overview")
            page.set_viewport_size({"width": 390, "height": 844})
            page.wait_for_selector(".mobile-menu", state="visible")
            mobile_navigate("collection")
            check(page.locator('[data-companion="jinx"][aria-pressed="true"]').count() == 1, "Mobile collection retains the chosen companion")
            check(not page.evaluate("document.documentElement.scrollWidth > innerWidth"), "Mobile collection has no horizontal overflow")
            page.screenshot(path=str(ARTIFACTS / "guardian-mobile-collection.png"), full_page=True)
            mobile_navigate("sessions")
            check(not page.evaluate("document.documentElement.scrollWidth > innerWidth"), "Mobile sessions has no horizontal overflow")
            mobile_navigate("overview")
            check(page.locator(".sidebar.open, .mobile-scrim.visible, .drawer-backdrop, .detail-dialog[open]").count() == 0, "Mobile navigation closes every overlay")
            check(not page.evaluate("document.documentElement.scrollWidth > innerWidth"), "Mobile overview has no horizontal overflow")
            check(page.locator("h1").evaluate("""heading => {
                const bounds = heading.getBoundingClientRect();
                const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
                return Boolean(bounds.x >= 0 && bounds.right <= innerWidth && target && target.closest('main'));
            }"""), "Mobile heading is readable and unobscured")
            page.screenshot(path=str(ARTIFACTS / "guardian-mobile.png"), full_page=True)
            check(not errors, "No browser JavaScript errors")
            print(json.dumps({"title": page.title(), "checks": checks, "screenshots": [
                "guardian-desktop.png", "guardian-collection.png", "guardian-evidence.png",
                "guardian-chat.png", "guardian-mobile.png", "guardian-mobile-collection.png", "guardian-sessions.png",
            ], "errors": errors}, indent=2))
            browser.close()
    finally:
        bridge.terminate()
        bridge.wait(timeout=5)
