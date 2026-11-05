"use strict";

// All user-facing text lives here.
const COPY = {
  title: "Token Guardian",
  refresh: "Refresh",
  quit: "Quit",
  demo: "Demo data — not your real usage.",
  loading: "Checking usage…",
  providers: { claude: "Claude Code", codex: "Codex", cursor: "Cursor" },
  status: {
    notConfigured: { claude: "Not signed in. Run `claude` and log in.", codex: "Not signed in. Open Codex and log in with ChatGPT.", cursor: "Not signed in." },
    expired: { claude: "Sign-in expired. Run `claude` once to refresh it.", codex: "Sign-in expired. Open Codex once to refresh it.", cursor: "Sign-in expired." },
    throttled: "Usage service is busy. Showing again at the next refresh.",
    unavailable: "Couldn't load usage",
    notBuilt: "Coming in the next update.",
  },
  used: (pct) => `${pct}% used`,
  left: (pct) => `${pct}% left`,
  resetsIn: (text) => `resets in ${text}`,
  resetUnknown: "reset time unknown",
  resetPassed: "reset — updating soon",
  notStarted: "not started",
  updated: (text) => `Updated ${text}`,
  justNow: "just now",
  minutesAgo: (m) => `${m} min ago`,
};

const $ = (id) => document.getElementById(id);
let status = null;

function formatDuration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function resetText(window) {
  if (!window.resetsAt) return window.usedPercent === 0 ? COPY.notStarted : COPY.resetUnknown;
  const remaining = Date.parse(window.resetsAt) - Date.now();
  // The app refreshes shortly after a reset; until then, don't present the old number as current.
  return remaining <= 0 ? COPY.resetPassed : COPY.resetsIn(formatDuration(remaining));
}

function statusText(provider) {
  const entry = COPY.status[provider.status];
  if (!entry) return "";
  const text = typeof entry === "string" ? entry : entry[provider.provider];
  return provider.detail ? `${text} (${provider.detail})` : text;
}

function level(pct) {
  if (pct >= 90) return "high";
  if (pct >= 70) return "mid";
  return "low";
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderWindow(window) {
  const row = el("div", "window");
  const head = el("div", "window-head");
  head.append(el("span", "window-label", window.label), el("span", "window-used", COPY.used(Math.round(window.usedPercent))));
  const bar = el("div", "bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-label", `${window.label} usage`);
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.setAttribute("aria-valuenow", String(Math.round(window.usedPercent)));
  const fill = el("div", `fill ${level(window.usedPercent)}`);
  fill.style.width = `${window.usedPercent}%`;
  bar.append(fill);
  const foot = el("div", "window-foot");
  foot.append(el("span", "", COPY.left(Math.round(window.remainingPercent))), el("span", "reset", resetText(window)));
  row.append(head, bar, foot);
  return row;
}

function renderCard(provider) {
  const card = el("article", `card ${provider.status}`);
  const head = el("div", "card-head");
  head.append(el("h2", "", COPY.providers[provider.provider] || provider.provider));
  if (provider.plan) head.append(el("span", "plan", provider.plan));
  card.append(head);
  if (provider.windows.length) {
    for (const window of provider.windows) card.append(renderWindow(window));
  }
  if (provider.status !== "ok" || !provider.windows.length) card.append(el("p", "note", statusText(provider)));
  return card;
}

function render() {
  const cards = $("cards");
  cards.replaceChildren();
  if (!status) {
    cards.append(el("p", "note", COPY.loading));
    return;
  }
  $("demo").hidden = !status.demo;
  for (const provider of status.providers) cards.append(renderCard(provider));
  const age = Date.now() - Date.parse(status.generatedAt);
  $("updated").textContent = COPY.updated(age < 60_000 ? COPY.justNow : COPY.minutesAgo(Math.floor(age / 60_000)));
}

async function load(force = false) {
  $("refresh").disabled = true;
  try {
    status = await window.tokenMonitor.getStatus({ force });
  } finally {
    $("refresh").disabled = false;
    render();
  }
}

$("title").textContent = COPY.title;
$("refresh").textContent = COPY.refresh;
$("quit").textContent = COPY.quit;
$("demo").textContent = COPY.demo;
$("refresh").addEventListener("click", () => load(true));
$("quit").addEventListener("click", () => window.tokenMonitor.quit());
window.tokenMonitor.onShown(() => load());
setInterval(render, 30_000); // keep the countdowns current
render();
load();
