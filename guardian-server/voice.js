"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MAX_RECORDING_SECONDS = 30;
const AUDIO_FORMATS = {
  "audio/webm": "webm", "video/webm": "webm",
  "audio/mp4": "mp4", "video/mp4": "mp4", "audio/x-m4a": "m4a", "audio/m4a": "m4a",
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav",
  "audio/mpeg": "mp3", "audio/mp3": "mp3",
};

function publicError(message, status, publicCode) {
  return Object.assign(new Error(message), { status, publicCode });
}
function audioType(value) { return String(value || "").split(";")[0].trim().toLowerCase(); }
function validSignature(bytes, extension) {
  if (extension === "webm") return bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (extension === "mp4" || extension === "m4a") return bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp";
  if (extension === "wav") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WAVE";
  return bytes.length >= 3 && (bytes.toString("ascii", 0, 3) === "ID3" || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0));
}

async function readAudio(request) {
  const contentType = audioType(request.headers["content-type"]);
  if (!Object.hasOwn(AUDIO_FORMATS, contentType)) throw publicError("Record WebM, MP4, WAV or MP3 audio for transcription.", 415, "unsupported-audio");
  if (Number(request.headers["content-length"]) > MAX_AUDIO_BYTES) throw publicError("Audio uploads are limited to 2 MB.", 413, "audio-too-large");
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > MAX_AUDIO_BYTES) throw publicError("Audio uploads are limited to 2 MB.", 413, "audio-too-large");
    chunks.push(bytes);
  }
  if (!length) throw publicError("No audio was recorded. Try again or type your question.", 400, "empty-audio");
  return { bytes: Buffer.concat(chunks), contentType };
}

function createVoice({ store, env = process.env, fetchImpl = fetch, now = () => Date.now() } = {}) {
  const configured = Boolean(env.OPENAI_API_KEY);
  const parsedLimit = Number(env.TOKENTRACKER_GUARDIAN_VOICE_DAILY_CALLS);
  const maxDailyCalls = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 20) : 6;
  const model = env.TOKENTRACKER_GUARDIAN_VOICE_MODEL || "gpt-4o-mini-transcribe";
  const budgetPath = path.join(store.guardianDir, "voice-budget.json");
  const lockPath = path.join(store.guardianDir, "voice-budget.lock");
  let work = Promise.resolve();

  function configuration() {
    return { configured, provider: "openai", model, maxUploadBytes: MAX_AUDIO_BYTES,
      maxRecordingSeconds: MAX_RECORDING_SECONDS, maxDailyCalls,
      privacy: "OpenAI transcription sends the recorded clip to OpenAI. Audio is not saved locally. Browser dictation may use its browser provider.",
      budgetScope: "Call and upload-size limits, plus a browser recording timer; not a dollar spending guarantee." };
  }
  async function reserve() {
    const pending = work.then(async () => {
      await fs.mkdir(store.guardianDir, { recursive: true, mode: 0o700 });
      const lock = await fs.open(lockPath, "wx", 0o600);
      try {
        const day = new Date(now()).toISOString().slice(0, 10);
        let current = { day, calls: 0 };
        try {
          const saved = JSON.parse(await fs.readFile(budgetPath, "utf8"));
          if (!saved || typeof saved.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(saved.day) ||
              !Number.isFinite(Date.parse(`${saved.day}T00:00:00Z`)) ||
              new Date(`${saved.day}T00:00:00Z`).toISOString().slice(0, 10) !== saved.day ||
              saved.day > day || !Number.isSafeInteger(saved.calls) || saved.calls < 0) throw new Error("invalid budget");
          if (saved.day === day) {
            current = saved;
          }
        } catch (error) { if (error.code !== "ENOENT") throw new Error("invalid budget"); }
        if (current.calls >= maxDailyCalls) return false;
        const temp = `${budgetPath}.${crypto.randomUUID()}.tmp`;
        try {
          await fs.writeFile(temp, JSON.stringify({ day, calls: current.calls + 1 }), { mode: 0o600 });
          await fs.rename(temp, budgetPath);
        } finally { await fs.unlink(temp).catch(() => {}); }
        return true;
      } finally { await lock.close(); await fs.unlink(lockPath).catch(() => {}); }
    });
    work = pending.catch(() => {});
    return pending;
  }

  async function transcribe({ bytes, contentType }) {
    if (!configured) throw publicError("OpenAI voice needs OPENAI_API_KEY in the local server environment. You can also try browser dictation or type your question.", 503, "voice-not-configured");
    const type = audioType(contentType);
    if (!Object.hasOwn(AUDIO_FORMATS, type)) throw publicError("This audio format is not supported.", 415, "unsupported-audio");
    const extension = AUDIO_FORMATS[type];
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw publicError("No audio was recorded.", 400, "empty-audio");
    if (bytes.length > MAX_AUDIO_BYTES) throw publicError("Audio uploads are limited to 2 MB.", 413, "audio-too-large");
    if (!validSignature(bytes, extension)) throw publicError("The clip does not match its audio format. Try a new recording.", 400, "invalid-audio");
    let reserved;
    try { reserved = await reserve(); }
    catch { throw publicError("Voice budget tracking is unavailable, so no transcription request was sent. Type your question instead.", 503, "voice-budget-unavailable"); }
    if (!reserved) throw publicError("The daily voice request allowance is reached. Type your question or try browser dictation.", 429, "voice-budget-reached");
    const body = new FormData();
    body.append("file", new Blob([bytes], { type: audioType(contentType) }), `question.${extension}`);
    body.append("model", model);
    body.append("response_format", "json");
    let response;
    try {
      response = await fetchImpl("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body,
      });
      if (!response.ok) throw publicError(`OpenAI transcription returned HTTP ${response.status}. Type your question or try again later.`, 502, "voice-provider-error");
      const result = await response.json();
      if (typeof result.text !== "string" || !result.text.trim()) throw publicError("No speech was recognized. Try again or type your question.", 422, "no-speech");
      const text = result.text.trim();
      return { text: text.slice(0, 3000), provider: "openai", model, truncated: text.length > 3000,
        notice: "Review this draft before sending. The recorded clip was sent to OpenAI and was not saved locally." };
    } catch (error) {
      if (error.publicCode) throw error;
      throw publicError("OpenAI transcription could not finish. Your audio was not saved locally; type your question or try again later.", 502, "voice-unavailable");
    }
  }
  return { configuration, transcribe };
}

module.exports = { MAX_AUDIO_BYTES, MAX_RECORDING_SECONDS, AUDIO_FORMATS, readAudio, createVoice };
