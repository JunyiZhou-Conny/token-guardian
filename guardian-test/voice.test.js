"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { createVoice, readAudio, MAX_AUDIO_BYTES } = require("../guardian-server/voice");

const audio = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt "), Buffer.alloc(32)]);
const clip = { bytes: audio, contentType: "audio/wav" };
async function fixture(t) {
  const guardianDir = await fs.mkdtemp(path.join(os.tmpdir(), "guardian-voice-"));
  t.after(() => fs.rm(guardianDir, { recursive: true, force: true }));
  return { guardianDir };
}

test("voice without a server key exposes configuration only and sends no audio", async (t) => {
  const store = await fixture(t);
  let called = false;
  const voice = createVoice({ store, env: {}, fetchImpl: async () => { called = true; } });
  assert.equal(voice.configuration().configured, false);
  assert.equal(voice.configuration().maxRecordingSeconds, 30);
  await assert.rejects(voice.transcribe(clip), { status: 503, publicCode: "voice-not-configured" });
  assert.equal(called, false);
  assert.deepEqual(await fs.readdir(store.guardianDir), []);
});

test("audio requests enforce streaming limits, formats and empty uploads", async () => {
  const request = (body, contentType, headers = {}) => Object.assign(Readable.from(body), { headers: { "content-type": contentType, ...headers } });
  assert.deepEqual(await readAudio(request([audio], "audio/wav; codecs=pcm")), clip);
  await assert.rejects(readAudio(request([], "audio/wav")), { publicCode: "empty-audio" });
  await assert.rejects(readAudio(request([Buffer.from("text")], "text/plain")), { status: 415 });
  for (const type of ["constructor", "__proto__", "tostring"]) {
    await assert.rejects(readAudio(request([Buffer.from("ID3mock")], type)), { status: 415 });
  }
  await assert.rejects(readAudio(request([audio], "audio/wav", { "content-length": MAX_AUDIO_BYTES + 1 })), { status: 413 });
  await assert.rejects(readAudio(request([Buffer.alloc(MAX_AUDIO_BYTES), Buffer.from([1])], "audio/webm")), { status: 413 });
});

test("OpenAI transcription uses multipart audio, returns an editable draft and saves counters only", async (t) => {
  const store = await fixture(t);
  let call;
  const voice = createVoice({ store, env: { OPENAI_API_KEY: "placeholder-secret" }, fetchImpl: async (url, options) => {
    call = { url, options };
    return { ok: true, json: async () => ({ text: "Which session used the most tokens?" }) };
  } });
  const result = await voice.transcribe(clip);
  assert.equal(call.url, "https://api.openai.com/v1/audio/transcriptions");
  assert.equal(call.options.body.get("model"), "gpt-4o-mini-transcribe");
  assert.equal(call.options.body.get("file").name, "question.wav");
  assert.deepEqual(Buffer.from(await call.options.body.get("file").arrayBuffer()), audio);
  assert.equal(result.text, "Which session used the most tokens?");
  assert.equal(result.provider, "openai");
  assert.match(result.notice, /Review this draft/);
  assert.deepEqual(await fs.readdir(store.guardianDir), ["voice-budget.json"]);
  const budget = await fs.readFile(path.join(store.guardianDir, "voice-budget.json"), "utf8");
  assert.equal(JSON.parse(budget).calls, 1);
  assert.equal(budget.includes("placeholder-secret"), false);
  assert.equal(budget.includes("Which session"), false);
});

test("invalid audio cannot reserve a paid transcription request", async (t) => {
  const store = await fixture(t);
  let calls = 0;
  const voice = createVoice({ store, env: { OPENAI_API_KEY: "placeholder" }, fetchImpl: async () => { calls++; } });
  await assert.rejects(voice.transcribe({ bytes: Buffer.from("<html>not audio</html>"), contentType: "audio/wav" }), { publicCode: "invalid-audio" });
  for (const type of ["constructor", "__proto__", "toString"]) {
    await assert.rejects(voice.transcribe({ bytes: Buffer.from("ID3mock"), contentType: type }), { status: 415 });
  }
  assert.equal(calls, 0);
  assert.deepEqual(await fs.readdir(store.guardianDir), []);
});

test("separate voice instances share daily limits and do not retry provider failures", async (t) => {
  const store = await fixture(t);
  let calls = 0;
  const options = { store, env: { OPENAI_API_KEY: "placeholder", TOKENTRACKER_GUARDIAN_VOICE_DAILY_CALLS: "1" }, fetchImpl: async () => {
    calls++;
    return { ok: false, status: 429 };
  } };
  const first = createVoice(options), second = createVoice(options);
  await assert.rejects(first.transcribe(clip), { status: 502, publicCode: "voice-provider-error" });
  await assert.rejects(second.transcribe(clip), { status: 429, publicCode: "voice-budget-reached" });
  assert.equal(calls, 1);
});

test("a simultaneous voice reservation cannot spend the final allowance twice", async (t) => {
  const store = await fixture(t);
  let calls = 0;
  const options = { store, env: { OPENAI_API_KEY: "placeholder", TOKENTRACKER_GUARDIAN_VOICE_DAILY_CALLS: "1" }, fetchImpl: async () => {
    calls++; return { ok: true, json: async () => ({ text: "A draft" }) };
  } };
  const replies = await Promise.allSettled([createVoice(options).transcribe(clip), createVoice(options).transcribe(clip)]);
  assert.equal(calls, 1);
  assert.equal(replies.filter(reply => reply.status === "fulfilled").length, 1);
});

test("orphaned voice locks fail closed without leaking internal errors", async (t) => {
  const store = await fixture(t);
  await fs.writeFile(path.join(store.guardianDir, "voice-budget.lock"), "");
  let calls = 0;
  const voice = createVoice({ store, env: { OPENAI_API_KEY: "placeholder" }, fetchImpl: async () => { calls++; } });
  await assert.rejects(voice.transcribe(clip), { status: 503, publicCode: "voice-budget-unavailable" });
  assert.equal(calls, 0);
});

test("corrupt prior-day voice budgets fail closed while valid prior-day budgets roll over", async (t) => {
  const store = await fixture(t);
  let calls = 0;
  const voice = createVoice({ store, env: { OPENAI_API_KEY: "placeholder" }, now: () => Date.parse("2026-10-11T12:00:00Z"), fetchImpl: async () => {
    calls++; return { ok: true, json: async () => ({ text: "Draft" }) };
  } });
  for (const saved of [{ day: "invalid-date", calls: 99 }, { day: "2026-02-30", calls: 1 }, { day: "2026-10-10", calls: -1 }, { day: "2026-10-12", calls: 0 }]) {
    await fs.writeFile(path.join(store.guardianDir, "voice-budget.json"), JSON.stringify(saved));
    await assert.rejects(voice.transcribe(clip), { publicCode: "voice-budget-unavailable" });
  }
  assert.equal(calls, 0);
  await fs.writeFile(path.join(store.guardianDir, "voice-budget.json"), JSON.stringify({ day: "2026-10-10", calls: 6 }));
  assert.equal((await voice.transcribe(clip)).text, "Draft");
  assert.equal(calls, 1);
});
