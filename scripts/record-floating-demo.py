#!/usr/bin/env python3
"""Record actual Electron windows on an isolated Linux X11 desktop.

Requires the desktop runtime, Python Playwright's Node driver, Node.js, ffmpeg,
and an already-running X11 display/window manager. It uses the production app
with temporary preferences and preview records, never a user's store or keys.
Existing public-script narration is reused; this script makes no TTS calls.
"""

import argparse
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import tempfile
import time

import playwright as playwright_package

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("guardian_demo", ROOT / "scripts/record-guardian-demo.py")
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)


# This driver manipulates real windows through Playwright's Electron API. The
# backdrop is visibly a tutorial card, not a fabricated app or macOS desktop.
DRIVER = r"""
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const readline = require('node:readline');
const path = require('node:path');
const root = process.env.GUARDIAN_RECORD_ROOT;
const {launchFixture, nativeState, MAIN} = require(path.join(root, 'guardian-test/desktop-smoke.cjs'));
const lines = readline.createInterface({input:process.stdin});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const checks = [], errors = [], scenes = [], chat = [];
const check = (value, text) => { assert.ok(value, text); checks.push(text); };
let fixture, backdrop;
let started;

async function scene(seconds, caption, action) {
  const start = (performance.now()-started)/1000;
  await action();
  const left = seconds-(performance.now()-started)/1000+start;
  if(left>0) await wait(left*1000);
  const end = (performance.now()-started)/1000;
  scenes.push({start,end,caption});
  console.log(JSON.stringify({progress:scenes.length,caption}));
}

const card = (title, subtitle, commands, footer) => `<!doctype html><html><meta charset="utf-8">
<title>Token Guardian tutorial instructions</title><style>
*{box-sizing:border-box}body{margin:0;width:1280px;height:720px;background:#eee9df;color:#49424f;
font:22px system-ui;padding:72px 74px}.label{font-size:14px;letter-spacing:1.5px;color:#88745c;text-transform:uppercase}
h1{font:49px Georgia;margin:26px 0 12px;max-width:690px}p{max-width:620px;color:#786e7d;line-height:1.6}
.box{margin-top:28px;max-width:745px;background:#fbf7ed;border:1px solid #dacaa5;border-radius:16px;padding:22px}
.line{font:20px ui-monospace,monospace;margin:10px 0}footer{max-width:720px;margin-top:26px;color:#786e7d;font-size:17px;line-height:1.6}
</style><div class="label">Tutorial instructions · actual Electron recording on Linux</div>
<h1>${title}</h1><p>${subtitle}</p><div class="box">${commands.map(x=>`<div class="line">${x}</div>`).join('')}</div>
<footer>${footer}</footer></html>`;

async function showCard(html) {
  await fixture.app.evaluate(async ({BrowserWindow}, html) => {
    let window = BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Token Guardian tutorial instructions');
    if(!window) window = new BrowserWindow({x:0,y:0,width:1280,height:720,frame:false,show:false,
      backgroundColor:'#eee9df',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
    await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
    window.setBounds({x:0,y:0,width:1280,height:720});window.showInactive();
  }, html);
}

(async()=>{
  try {
    fixture = await launchFixture({seed:false});
    const {app,widget} = fixture;
    widget.on('pageerror',e=>errors.push(e.message));
    widget.on('response',async response=>{
      if(response.url().endsWith('/api/guardian/chat'))chat.push(await response.json());
    });
    await widget.waitForFunction(()=>document.querySelector('.mode-badge')?.textContent==='Preview activity');
    const health = await fetch(fixture.origin+'/api/guardian/health').then(r=>r.json());
    check(!health.chat.configured && !health.voice.configured,'No cloud chat or voice keys are configured');
    await app.evaluate(()=>{const w=globalThis.__guardianDesktopTest.getWindows().widget;w.setPosition(852,38);w.hide();});
    await showCard(card('A companion beside your work','Keep a small watchtower nearby. Summon your champion when you want to follow the usage trail.',
      ['Compact summary → companion → text chat','Full dashboard remains a separate window'],
      'This is the actual Electron app on Linux. All usage is synthetic preview data. macOS window behavior remains a pilot check.'));
    console.log(JSON.stringify({ready:true}));
    await new Promise(resolve=>lines.once('line',resolve));
    started = performance.now();
    await scene(6,'Floating Token Guardian · actual Electron windows · synthetic preview data',async()=>{});
    await scene(8,'Compact summary · pin above other windows',async()=>{
      await showCard(card('Your little watchtower','The floating window reads the same local service as the full dashboard.',
        ['Tokens and known usage value','Recorded trail and provider coverage'],
        'Preview activity is clearly labeled. Missing records stay unknown. Pinning uses a real native window level.'));
      await widget.evaluate(()=>window.guardianDesktop.openWidget());
      await widget.locator('[data-widget-action="pin"]').click();
      check(!(await nativeState(app)).alwaysOnTop,'Unpin changes the native window level');
      await wait(700);
      await widget.locator('[data-widget-action="pin"]').click();
      check((await nativeState(app)).alwaysOnTop,'Pin restores the native window level');
      check((await nativeState(app)).bounds.height===270,'Compact view is a real 400 by 270 window');
    });
    await scene(11,'Summon your champion · inspect a session and its evidence',async()=>{
      await widget.locator('[data-widget-action="summon"]').click();
      await widget.waitForSelector('.mode-butler');
      check((await nativeState(app)).bounds.height===470,'Summon opens the real companion window');
      check(chat.length===0,'Summoning does not call chat');
      await wait(2500);
      await widget.locator('[data-widget-action="chat"]').click();
      await widget.waitForSelector('#widget-chat-input');
      await widget.locator('[data-widget-action="session-evidence"]').click();
      check(await widget.locator('dialog[open]').isVisible(),'Recorded session evidence opens in the widget');
      await wait(2500);
      await widget.locator('[data-widget-action="evidence-close"]').click();
    });
    await scene(11,'Ask in floating chat · local evidence explanation',async()=>{
      if(!await widget.locator('#widget-chat-input').count()) await widget.locator('[data-widget-action="chat"]').click();
      await widget.waitForSelector('#widget-chat-input');
      await widget.locator('#widget-chat-input').fill('Which session used the most tokens?');
      check(chat.length===0,'The question remains a draft until Send');
      await wait(800);
      await widget.locator('[data-widget-action="send"]').click();
      await widget.waitForFunction(()=>document.querySelectorAll('.answer-mode').length>=2);
      for(let attempt=0;chat.length<1&&attempt<25;attempt++) await wait(20);
      check(chat.length===1 && chat[0].mode==='local','The actual handler returns one local explanation');
      check((await nativeState(app)).bounds.height===640,'Chat is a real 420 by 640 window');
      await widget.locator('.widget-chat-log').evaluate(el=>el.scrollTop=0);
      await wait(3000);
      await widget.locator('.widget-chat-log').evaluate(el=>el.scrollTop=el.scrollHeight);
    });
    await scene(11,'Ahri, Jinx and Jhin · classic and cozy outfits',async()=>{
      await widget.locator('[data-widget-action="butler"]').click();
      await widget.waitForSelector('.mode-butler');
      for(const champion of ['ahri','jinx','jhin']) {
        await widget.locator(`button[data-companion="${champion}"]`).click();
        await widget.locator('button[data-skin="cozy"]').click();
        await wait(1400);
      }
      check((await widget.locator('.atlas-art img').getAttribute('src')).includes('champion-variants'),'Cozy artwork loads in the real widget');
      await widget.locator('button[data-skin="classic"]').click();await wait(1100);
      await widget.locator('button[data-skin="cozy"]').click();
    });
    let dashboard;
    await scene(9,'Full dashboard in a separate window · same companion preferences',async()=>{
      const opened = app.waitForEvent('window');
      await widget.locator('[data-widget-action="dashboard"]').first().click();
      dashboard = await opened;
      dashboard.on('pageerror',e=>errors.push(e.message));
      await dashboard.waitForSelector('.companion-name');
      await app.evaluate(()=>{const {dashboard}=globalThis.__guardianDesktopTest.getWindows();dashboard.setBounds({x:20,y:20,width:1200,height:660});dashboard.focus();});
      check((await dashboard.locator('.companion-name').textContent()).includes('Jhin'),'Dashboard and widget share the companion preference');
      check((await nativeState(app)).dashboardVisible && (await nativeState(app)).alwaysOnTop,'The separate dashboard is visible while the widget stays pinned');
      await wait(2500);
      await dashboard.locator('[data-tab="sessions"]').first().click();
    });
    await scene(8,'Voice stays in your browser · native microphone permission is off',async()=>{
      await widget.locator('[data-widget-action="chat"]').click();
      await widget.waitForSelector('[data-widget-action="voice-browser"]');
      check(await widget.locator('[data-widget-action="voice-browser"]').isVisible(),'Native chat exposes the browser voice action');
      // Do not launch an external browser during the recording or fake audio.
      const permissions = await widget.evaluate(async()=>{
        try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});stream.getTracks().forEach(t=>t.stop());return false;}
        catch(e){return ['NotAllowedError','NotFoundError'].includes(e.name);}
      });
      check(permissions,'A native microphone request produces no audio stream');
    });
    await scene(9,'Dismiss, hide and restore · the local service keeps running',async()=>{
      await widget.locator('[data-widget-action="butler"]').click();
      await widget.locator('[data-widget-action="compact"]').click();
      await widget.waitForSelector('.mode-compact');
      await wait(1300);
      await widget.locator('[data-widget-action="hide"]').click();
      check(!(await nativeState(app)).visible,'Hide removes the native widget');
      await wait(1300);
      // Invoke the actual app menu, the same action used by a desktop user.
      await app.evaluate(({Menu})=>Menu.getApplicationMenu().items[0].submenu.items.find(x=>x.label==='Show floating widget').click());
      check((await nativeState(app)).visible,'The app menu restores the hidden widget');
      check((await fetch(fixture.origin+'/api/guardian/health')).ok,'Hiding keeps the local service available');
    });
    await scene(10,'Install the desktop runtime · Node 22.20+ · no Xcode · unsigned prototype',async()=>{
      await widget.evaluate(()=>window.guardianDesktop.hideWidget());
      await app.evaluate(()=>globalThis.__guardianDesktopTest.getWindows().dashboard.hide());
      await showCard(card('Try the floating companion','Install Node.js 22.20 or newer. Download the source repository, then run these commands once you are in its folder.',
        ['npm --prefix desktop ci','node scripts/start-floating-guardian.cjs'],
        'First launch may download the Electron runtime. On macOS, Start Floating Guardian.command is also available after setup. No Xcode is needed. The prototype is unsigned; a signed DMG remains pending.'));
    });
    check(errors.length===0,'No uncaught JavaScript errors in the recorded native views');
    console.log(JSON.stringify({complete:true,scenes,checks,errors,chatModes:chat.map(x=>x.mode),platform:process.platform}));
    await new Promise(resolve=>lines.once('line',resolve));
  } finally {if(fixture)await fixture.close();lines.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--display", default=os.environ.get("DISPLAY", ":91"))
    parser.add_argument("--output", type=pathlib.Path, default=ROOT.parent / "token-guardian-floating-demo.mp4")
    parser.add_argument("--publish-copy", action="store_true")
    parser.add_argument("--silent", action="store_true")
    parser.add_argument("--narration-plan", type=pathlib.Path, default=ROOT / "docs/demos/narration/floating/plan.json")
    args = parser.parse_args()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    subtitles, manifest_path = output.with_suffix(".srt"), output.with_suffix(".json")
    with tempfile.TemporaryDirectory(prefix="guardian-floating-video-") as scratch:
        scratch = pathlib.Path(scratch)
        driver = scratch / "record.cjs"
        driver.write_text(DRIVER, encoding="utf-8")
        environment = os.environ.copy()
        environment.update({"DISPLAY": args.display, "GUARDIAN_RECORD_ROOT": str(ROOT),
                            "GUARDIAN_PLAYWRIGHT_PACKAGE": str(pathlib.Path(playwright_package.__file__).parent / "driver/package")})
        capture = None
        with (scratch / "electron.log").open("w+") as error_log, (scratch / "ffmpeg.log").open("w+") as recorder_log:
            node = subprocess.Popen(["node", str(driver)], cwd=ROOT, env=environment,
                                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=error_log, text=True)
            try:
                ready_line = node.stdout.readline()
                if not ready_line or not json.loads(ready_line).get("ready"):
                    raise RuntimeError("Electron recording did not become ready: " + ready_line)
                raw = scratch / "capture.mp4"
                capture = subprocess.Popen([
                    "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "x11grab",
                    "-video_size", "1280x720", "-framerate", "25", "-draw_mouse", "0", "-i", args.display,
                    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", str(raw),
                ], stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=recorder_log, text=True)
                time.sleep(0.4)
                if capture.poll() is not None:
                    raise RuntimeError("X11 capture could not start")
                # The recorder has a short pre-roll. Scene offsets include it.
                pre_roll = 0.4
                node.stdin.write("record\n"); node.stdin.flush()
                result = None
                for line in node.stdout:
                    value = json.loads(line)
                    if value.get("complete"):
                        result = value
                        break
                    print(json.dumps(value), flush=True)
                if result is None:
                    raise RuntimeError("The actual Electron walkthrough failed")
                capture.communicate("q", timeout=15)
                capture = None
                node.stdin.write("done\n"); node.stdin.flush()
                node.wait(timeout=15)
                if node.returncode:
                    raise RuntimeError("Electron did not close cleanly")
                scenes = [{**scene, "start": scene["start"] + pre_roll,
                           "end": scene["end"] + pre_roll} for scene in result["scenes"]]
                cues = [(s["start"], s["end"], s["caption"]) for s in scenes]
                subtitles.write_text("\n\n".join(
                    f"{index + 1}\n{shared.timestamp(start)} --> {shared.timestamp(end)}\n{caption}"
                    for index, (start, end, caption) in enumerate(cues)) + "\n", encoding="utf-8")
                safe_subtitle_path = subtitles.as_posix().replace("\\", "\\\\").replace(":", "\\:").replace("'", "\\'")
                subtitle_filter = (f"subtitles='{safe_subtitle_path}':force_style='FontName=DejaVu Sans,FontSize=10,"
                                   "PrimaryColour=&HFFFFFF,OutlineColour=&H40362F,BackColour=&HBB40362F,"
                                   "BorderStyle=3,Outline=1,Shadow=0,MarginV=4'")
                subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw),
                                "-vf", subtitle_filter, "-c:v", "libx264", "-preset", "medium", "-crf", "24",
                                "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output)], check=True)
                narration = None if args.silent else shared.mix_narration(output, cues, args.narration_plan, scratch)
                manifest = {"recording": "actual Electron windows captured from Linux X11",
                            "platform": result["platform"], "nativeMacVerified": False,
                            "syntheticPreviewData": True, "isolatedPreferencesAndStore": True,
                            "realMicrophoneUsed": False, "appPaidApiCalls": 0,
                            "tutorialCardsClearlyLabeled": True, "checks": result["checks"],
                            "errors": result["errors"], "chatModes": result["chatModes"],
                            "scenes": scenes, "narration": narration, "media": shared.media_probe(output)}
                manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
                if args.publish_copy:
                    if output.stat().st_size >= 20 * 1024 * 1024:
                        raise RuntimeError("The floating video exceeds 20 MB")
                    for artifact in (output, subtitles, manifest_path):
                        shutil.copyfile(artifact, ROOT / "docs/demos" / artifact.name)
                print(json.dumps({"video": str(output), "bytes": output.stat().st_size,
                                  "duration": manifest["media"]["format"]["duration"],
                                  "checks": len(result["checks"]), "narrated": bool(narration)}, indent=2))
            except Exception:
                error_log.flush(); recorder_log.flush()
                error_log.seek(0); recorder_log.seek(0)
                print(error_log.read()[-4000:]); print(recorder_log.read()[-2000:])
                raise
            finally:
                if capture and capture.poll() is None:
                    try: capture.communicate("q", timeout=5)
                    except subprocess.TimeoutExpired: capture.kill(); capture.wait()
                if node.poll() is None:
                    node.kill(); node.wait()


if __name__ == "__main__":
    main()
