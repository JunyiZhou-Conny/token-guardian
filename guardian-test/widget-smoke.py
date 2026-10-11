"""Verify the floating UI in Chromium through the production local handler.

All usage and preferences are synthetic and isolated. The subprocess bridge has
no configured provider keys; routes reject all external network requests. This
checks the browser preview, not native Electron window behavior.
"""
import base64
import json
import os
import pathlib
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright


ROOT = pathlib.Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)
KEY = "token-guardian-preferences"
HOSTILE = '<img src="x" onerror="window.__widgetInjected=true">'
SEED = {
    "companion": "ahri", "skins": {"ahri": "classic", "jinx": "classic", "jhin": "classic"},
    "chatProvider": "local", "preferences": {"autoRefresh": False, "notifications": False, "budget": 37},
    "widget": {"mode": "compact", "pinned": False, "anchor": {"x": 80, "y": 50}, "layoutPreference": "manual"},
}


def fixture_events():
    now = datetime.now(timezone.utc)
    return [
        {"id": "widget-request-1", "source": "codex", "timestamp": (now - timedelta(minutes=5)).isoformat(),
         "model": "gpt-5 " + HOSTILE, "sessionId": "widget-session", "project": HOSTILE,
         "inputTokens": 110, "outputTokens": 10, "cachedTokens": 30,
         "prompt": "PRIVATE_BODY_MUST_NOT_BE_STORED"},
        {"id": "widget-request-2", "source": "codex", "timestamp": now.isoformat(),
         "model": "gpt-5 " + HOSTILE, "sessionId": "widget-session", "project": HOSTILE,
         "inputTokens": 100, "cachedTokens": 10, "costUsd": 0.04, "costType": "estimated"},
        {"id": "widget-recorded-zero", "source": "claude", "timestamp": now.isoformat(),
         "model": "claude-sonnet-4", "inputTokens": 0, "totalTokens": 0, "costUsd": 0, "costType": "estimated"},
    ]


def main():
    checks, errors, external_requests, chat_requests, chat_responses = [], [], [], [], []
    fail_snapshots = False
    with tempfile.TemporaryDirectory(prefix="guardian-widget-browser-") as data_dir:
        # The handler explicitly receives env={}, but remove keys from the child
        # environment too: this browser check must never consume real allowance.
        child_env = {key: value for key, value in os.environ.items() if key not in ("OPENAI_API_KEY", "DEEPSEEK_API_KEY")}
        bridge = subprocess.Popen(
            ["node", str(ROOT / "guardian-test/browser-bridge.cjs"), data_dir],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, cwd=ROOT, env=child_env,
        )
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(
                    executable_path=os.environ.get("GUARDIAN_CHROMIUM_PATH", "/usr/bin/chromium"),
                    headless=True, args=["--no-sandbox"],
                )
                context = browser.new_context(viewport={"width": 1000, "height": 900}, device_scale_factor=1)
                context.add_init_script("""{
                    if (location.origin === 'http://127.0.0.1:7681') {
                        const key = 'token-guardian-preferences';
                        if (!localStorage.getItem(key)) localStorage.setItem(key, %s);
                    }
                }""" % json.dumps(json.dumps(SEED)))
                context.on("page", lambda page: page.on("pageerror", lambda error: errors.append(str(error))))

                def check(condition, description):
                    assert condition, description
                    checks.append(description)

                def serve(route):
                    request = route.request
                    url = urlsplit(request.url)
                    if url.scheme not in ("http", "https") or url.hostname != "127.0.0.1" or url.port != 7681:
                        external_requests.append(request.url)
                        route.abort()
                        return
                    if fail_snapshots and request.method == "GET" and url.path == "/api/guardian":
                        route.fulfill(status=503, content_type="application/json", body=json.dumps({"error": "Synthetic unavailable service"}))
                        return
                    payload = {
                        "method": request.method, "url": url.path + ("?" + url.query if url.query else ""),
                        "headers": request.all_headers(), "body": base64.b64encode(request.post_data_buffer or b"").decode(),
                    }
                    bridge.stdin.write(json.dumps(payload) + "\n")
                    bridge.stdin.flush()
                    line = bridge.stdout.readline()
                    if not line:
                        raise RuntimeError("The production-handler bridge stopped unexpectedly.")
                    response = json.loads(line)
                    body = base64.b64decode(response["body"])
                    if url.path == "/api/guardian/chat" and request.method == "POST":
                        chat_requests.append(json.loads(request.post_data))
                        chat_responses.append(json.loads(body))
                    route.fulfill(status=response["status"], headers=response["headers"], body=body)

                context.route("**/*", serve)
                widget = context.new_page()
                widget.goto("http://127.0.0.1:7681/widget.html", wait_until="networkidle")

                def settle_widget():
                    widget.wait_for_function("!document.querySelector('[data-widget-action=refresh]').disabled")
                    widget.evaluate("""async () => {
                        await document.fonts.ready;
                        await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
                        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
                    }""")

                def preferences(page=widget):
                    return page.evaluate("key => JSON.parse(localStorage.getItem(key))", KEY)

                def mode(name):
                    widget.wait_for_selector("#widget.mode-" + name)
                    settle_widget()

                def submit(question):
                    previous = len(chat_responses)
                    widget.locator("#widget-chat-input").fill(question)
                    widget.locator('[data-widget-action="send"]').click()
                    widget.wait_for_function("!document.querySelector('[data-widget-action=send]').disabled")
                    check(len(chat_responses) == previous + 1, "Question reaches the production chat handler")
                    return chat_responses[-1]

                settle_widget()
                check(widget.locator(".mode-badge").inner_text() == "Preview activity", "Empty isolated store labels preview activity")
                check(widget.locator("#browser-hint").inner_text().startswith("Browser preview"), "Widget explicitly labels browser preview")
                check(widget.locator('[data-widget-action="pin"]').is_disabled() and widget.locator('[data-widget-action="hide"]').is_disabled(), "Native pin and hide controls are disabled in browser preview")
                widget.screenshot(path=str(ARTIFACTS / "guardian-widget-browser-compact.png"))

                widget.locator('[data-widget-action="summon"]').click()
                mode("butler")
                check(widget.locator(".butler-name").inner_text() == "Ahri", "Summon expands the selected companion")
                widget.locator('[data-widget-action="chat"]').click()
                mode("chat")
                demo_answer = submit("Which session uses the most tokens?")
                check(demo_answer["mode"] == "local" and "simulated example" in demo_answer["answer"], "Preview chat uses the real local explanation and labels simulation")
                check(chat_requests[-1]["datasetMode"] == "demo" and chat_requests[-1]["provider"] == "local", "Preview request explicitly keeps chat local")
                widget.locator('[data-widget-action="compact"]').click()
                mode("compact")

                imported = widget.evaluate("""async events => {
                    const response = await fetch('/api/guardian/import', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({format:'json',data:events})});
                    if (!response.ok) throw new Error(await response.text());
                    return response.json();
                }""", fixture_events())
                check(imported["added"] == 3, "Synthetic request metadata imports through the production handler")
                widget.locator('[data-widget-action="refresh"]').click()
                widget.wait_for_selector(".mode-badge:not(.preview)")
                settle_widget()
                check(widget.locator(".mode-badge").inner_text() == "Local records", "Imported records replace preview activity")
                check(widget.locator('.provider-tile[data-source="codex"] strong').inner_text() == "260", "Widget counts normalized cache and output tokens once")
                check(widget.locator('.provider-tile[data-source="claude"] strong').inner_text() == "0", "An observed zero-token record displays zero")
                check(widget.locator('.provider-tile[data-source="gemini"] strong').inner_text() == "—", "A source without records stays unavailable instead of zero")
                check("PRIVATE_BODY_MUST_NOT_BE_STORED" not in pathlib.Path(data_dir, "guardian/events.jsonl").read_text(), "Import persistence retains metadata without original prompt bodies")

                widget.locator('[data-widget-action="investigate"]').click()
                mode("chat")
                widget.wait_for_selector("dialog.widget-evidence[open]")
                check(HOSTILE in widget.locator("dialog.widget-evidence").inner_text(), "Hostile metadata is displayed literally in evidence")
                check(widget.locator("dialog.widget-evidence .evidence-row").count() >= 3, "Evidence dialog includes model breakdown and underlying requests")
                check(widget.locator("dialog.widget-evidence img").count() == 0 and widget.evaluate("!window.__widgetInjected"), "Evidence escapes hostile model and project markup")
                widget.locator('[data-widget-action="evidence-close"]').click()
                widget.wait_for_selector("dialog.widget-evidence", state="hidden")
                before = len(chat_requests)
                widget.locator('[data-widget-action="session-draft"]').click()
                check("widget-session" in widget.locator("#widget-chat-input").input_value(), "Session action prepares an editable grounded question")
                check(len(chat_requests) == before, "Preparing a session question does not send chat automatically")
                local_answer = submit(widget.locator("#widget-chat-input").input_value())
                check("widget-session" in local_answer["answer"] and "260 tokens" in local_answer["answer"], "Local chat investigates the selected real session")
                check(len(local_answer["evidenceIds"]) == 2 and chat_requests[-1].get("focusId"), "Selected session explanation retains concrete evidence and opaque focus")
                check(local_answer["recommendations"] and all(step["action"] == "investigate" and not step["automated"] and step["savingsUsd"] is None for step in local_answer["recommendations"]), "Companion recommendations remain grounded user investigations")
                widget.locator(".chat-evidence button").last.click()
                widget.wait_for_selector("dialog.widget-evidence[open]")
                check(widget.locator("dialog.widget-evidence .evidence-row").count() >= 2, "Chat citation opens its underlying session trail")
                widget.locator('[data-widget-action="evidence-close"]').click()
                widget.wait_for_selector("dialog.widget-evidence", state="hidden")
                widget.screenshot(path=str(ARTIFACTS / "guardian-widget-browser-chat.png"))

                widget.locator('[data-widget-action="butler"]').click()
                mode("butler")
                with widget.expect_popup() as popup:
                    widget.locator('[data-widget-action="dashboard"]').first.click()
                dashboard = popup.value
                dashboard.set_viewport_size({"width": 1440, "height": 1000})
                dashboard.wait_for_load_state("networkidle")
                dashboard.locator('.nav-item[data-tab="collection"]').click()
                widget.locator('.companion-options [data-companion="jinx"]').click()
                widget.locator('.skin-options [data-skin="cozy"]').click()
                dashboard.wait_for_selector('.champion-card.jinx.selected [data-skin="cozy"][aria-pressed="true"]')
                check(dashboard.locator('.champion-card.jinx.selected').count() == 1, "Widget companion and skin preferences update full Guardian")
                dashboard.locator('.champion-card.jhin [data-companion="jhin"]').click()
                dashboard.locator('.champion-card.jhin [data-skin="cozy"]').click()
                widget.wait_for_selector('.companion-options [data-companion="jhin"][aria-pressed="true"]')
                check(widget.locator('.skin-options [data-skin="cozy"][aria-pressed="true"]').count() == 1, "Full Guardian companion and skin updates return to the widget")
                dashboard.locator('.nav-item[data-tab="settings"]').click()
                dashboard.locator('[data-pref="budget"]').fill("23")
                dashboard.locator('[data-pref="budget"]').press("Tab")
                widget.locator('[data-widget-action="chat"]').click()
                mode("chat")
                stored = preferences()
                check(stored["preferences"]["budget"] == 23, "Widget writes preserve the dashboard's current budget")
                check(stored["widget"]["anchor"] == SEED["widget"]["anchor"] and stored["widget"]["layoutPreference"] == "manual", "Both views preserve unrelated native widget preferences")
                check(stored["companion"] == "jhin" and stored["skins"]["jhin"] == "cozy", "Shared preference writes retain the chosen companion and skin")

                widget.locator('[data-widget-action="compact"]').click()
                mode("compact")
                previous_tokens = widget.locator(".usage-summary strong").first.inner_text()
                fail_snapshots = True
                widget.locator('[data-widget-action="refresh"]').click()
                widget.wait_for_selector(".mode-badge.stale")
                settle_widget()
                check(widget.locator(".usage-summary strong").first.inner_text() == previous_tokens, "Failed refresh preserves the last loaded usage")
                check(widget.locator(".mode-badge").inner_text() == "Local records · Stale records", "Failed refresh labels stale local data without substituting preview")
                check("Synthetic unavailable service" in widget.locator("#widget-toast").inner_text(), "Manual refresh failure exposes a clear error")
                fail_snapshots = False
                widget.locator('[data-widget-action="refresh"]').click()
                widget.wait_for_selector(".mode-badge:not(.stale)")
                settle_widget()
                check(widget.locator(".mode-badge").inner_text() == "Local records", "Successful refresh clears the stale indicator")
                widget.set_viewport_size({"width": 390, "height": 844})
                check(not widget.evaluate("document.documentElement.scrollWidth > innerWidth"), "Browser widget stays within a narrow viewport")
                fail_snapshots = True
                unavailable = context.new_page()
                unavailable.goto("http://127.0.0.1:7681/widget.html", wait_until="networkidle")
                unavailable.wait_for_function("document.querySelector('.mode-badge').textContent === 'Records unavailable'")
                check(unavailable.locator(".usage-summary strong").first.inner_text() == "—", "Initial service failure keeps usage unavailable instead of fabricating preview or zero")
                check(all(value == "—" for value in unavailable.locator(".provider-tile strong").all_text_contents()), "Initial service failure leaves all source totals unknown")
                unavailable.close()
                fail_snapshots = False
                check(not errors, "Widget and full Guardian have no JavaScript errors: " + repr(errors))
                check(not external_requests, "No external request or model provider was contacted")
                report = {"checks": checks, "errors": errors, "chatModes": [answer["mode"] for answer in chat_responses],
                          "externalRequests": external_requests, "screenshots": ["guardian-widget-browser-compact.png", "guardian-widget-browser-chat.png"]}
                (ARTIFACTS / "guardian-widget-browser-checks.json").write_text(json.dumps(report, indent=2) + "\n")
                print(json.dumps(report, indent=2))
                browser.close()
        finally:
            bridge.terminate()
            bridge.wait(timeout=5)


if __name__ == "__main__":
    main()
