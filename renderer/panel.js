/**
 * OpenCode Quota panel.
 *
 * The panel is the whole feature: it asks the host which provider is active,
 * reads the Go key from plugin settings, and makes the single quota request.
 * Nothing is cached to disk — a panel reopened later always shows live numbers.
 *
 * Design notes:
 *  - With a provider that is not OpenCode Go, this panel says so and shows no
 *    meters. Printing 0% there would read as "you have full quota", which is
 *    the opposite of the truth.
 *  - `percent` is *used*, so the bar fills as quota drains; the headline number
 *    is the remaining share, because that is the question people actually ask.
 *  - Layout is deliberately compact: one row per window, label / bar / reset.
 *  - Language follows the system by default (`app.getAppearance().locale`) and
 *    can be pinned to English or 简体中文 in the plugin settings.
 */

const USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
const REFRESH_MS = 60_000;

const bridge = window.pluginBridge;

/** Row order is the order people hit the limits in. */
const WINDOWS = ["rolling", "weekly", "monthly"];

const STRINGS = {
  en: {
    title: "OpenCode Quota",
    refresh: "Refresh",
    checking: "checking…",
    updatedJustNow: "updated just now",
    updatedAgo: "updated {{count}}m ago",
    updatedAt: "updated {{time}}",
    rolling: "Rolling 5h",
    weekly: "Weekly",
    monthly: "Monthly",
    rollingHint: "Resets 5 hours after first use",
    weeklyHint: "Resets every Monday 00:00 UTC",
    monthlyHint: "Resets with the paid period",
    left: "{{percent}} left",
    used: "{{percent}} used",
    usedResets: "{{percent}} used · resets {{when}}",
    resetsInMinutes: "in {{count}}m",
    resetsInHours: "in {{count}}h {{minutes}}m",
    resetsInDays: "in {{count}}d {{hours}}h",
    resetting: "resetting",
    notApplicableTitle: "Not an OpenCode Go provider",
    notApplicableBody:
      "PI-Desktop is using {{name}}. This panel only reports OpenCode Go subscription quota, so it stays out of the way for other providers.",
    noKeyTitle: "No API key yet",
    noKeyBody:
      "Add an OpenCode Go API key in this plugin's settings. Create one at opencode.ai/console under Account → Personal API keys.",
    unauthorizedTitle: "Key was not accepted",
    unsupportedTitle: "No Go subscription",
    errorTitle: "Could not read quota",
  },
  "zh-CN": {
    title: "OpenCode 额度",
    refresh: "刷新",
    checking: "正在查询…",
    updatedJustNow: "刚刚更新",
    updatedAgo: "{{count}} 分钟前更新",
    updatedAt: "更新于 {{time}}",
    rolling: "滚动 5 小时",
    weekly: "每周",
    monthly: "每月",
    rollingHint: "首次使用后 5 小时重置",
    weeklyHint: "每周一 00:00 UTC 重置",
    monthlyHint: "随订阅周期重置",
    left: "剩余 {{percent}}",
    used: "已用 {{percent}}",
    usedResets: "已用 {{percent}} · {{when}}重置",
    resetsInMinutes: "{{count}} 分钟后",
    resetsInHours: "{{count}} 小时 {{minutes}} 分后",
    resetsInDays: "{{count}} 天 {{hours}} 小时后",
    resetting: "即将重置",
    notApplicableTitle: "当前不是 OpenCode Go 供应商",
    notApplicableBody:
      "PI-Desktop 正在使用 {{name}}。本面板只展示 OpenCode Go 订阅额度，其他供应商下不会显示数据。",
    noKeyTitle: "尚未配置 API Key",
    noKeyBody:
      "请在本插件设置中填入 OpenCode Go 的 API Key。可在 opencode.ai/console 的「账户 → 个人 API 密钥」创建。",
    unauthorizedTitle: "密钥未被接受",
    unsupportedTitle: "没有 Go 订阅",
    errorTitle: "无法读取额度",
  },
};

const el = (id) => document.getElementById(id);

let timer = null;
let busy = false;
let last = null;
let strings = STRINGS.en;

/* ------------------------------------------------------------------ locale */

/**
 * Pick the UI language: the plugin setting wins, otherwise the host's locale,
 * otherwise the browser's. Simplified Chinese covers every `zh-*` variant
 * except Traditional, which falls back to English rather than guessing.
 */
function resolveLocale(setting, hostLocale) {
  if (setting === "en" || setting === "zh-CN") return setting;
  const raw = String(hostLocale || navigator.language || "en").replaceAll("_", "-").toLowerCase();
  if (raw.startsWith("zh-tw") || raw.startsWith("zh-hk") || raw.startsWith("zh-hant") || raw.startsWith("zh-mo")) {
    return "en";
  }
  return raw.startsWith("zh") ? "zh-CN" : "en";
}

function fill(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars?.[key] ?? ""));
}

function t(key, vars) {
  return fill(strings[key] ?? STRINGS.en[key] ?? key, vars);
}

/* ------------------------------------------------------------------ format */

function pct(value) {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** "in 3h 12m" / "in 4d" — relative is what people can act on. */
function until(iso) {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  const delta = at - Date.now();
  if (delta <= 0) return t("resetting");
  const minutes = Math.round(delta / 60_000);
  if (minutes < 60) return t("resetsInMinutes", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("resetsInHours", { count: hours, minutes: minutes % 60 });
  return t("resetsInDays", { count: Math.floor(hours / 24), hours: hours % 24 });
}

/** Local wall-clock time for the tooltip; the visible line stays terse. */
function localTime(iso) {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  return new Date(at).toLocaleString(strings === STRINGS["zh-CN"] ? "zh-CN" : "en");
}

function updatedLabel(at) {
  if (!at) return "";
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 45) return t("updatedJustNow");
  if (seconds < 3600) return t("updatedAgo", { count: Math.round(seconds / 60) });
  return t("updatedAt", { time: new Date(at).toLocaleTimeString(strings === STRINGS["zh-CN"] ? "zh-CN" : "en") });
}

/* ------------------------------------------------------------------- state */

/** Is the provider PI-Desktop is currently on an OpenCode Go one? */
function activeProvider(models) {
  if (!Array.isArray(models) || models.length === 0) return null;
  const active = models.find((model) => model.isDefault) ?? models[0];
  const id = String(active?.providerId ?? "");
  const name = String(active?.providerName ?? "");
  const isGo = /opencode/i.test(id) || /opencode/i.test(name);
  return { isGo, id, name: name || id };
}

async function readSettings() {
  try {
    return (await bridge.invoke("plugin.getSettings")) ?? {};
  } catch {
    return {};
  }
}

async function fetchQuota(key) {
  const response = await bridge.invoke("net.fetch", {
    url: USAGE_URL,
    method: "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    redirect: "error",
    timeoutMs: 15_000,
  });

  const status = Number(response?.status ?? 0);
  if (status === 401 || status === 403) {
    return { status: "unauthorized", message: `HTTP ${status}` };
  }
  if (status === 404) {
    return { status: "unsupported", message: "HTTP 404" };
  }
  if (status < 200 || status >= 300) {
    return { status: "http", message: `HTTP ${status}` };
  }

  let body;
  try {
    body = JSON.parse(String(response?.bodyText ?? ""));
  } catch {
    return { status: "malformed", message: "invalid JSON" };
  }

  const usage = body?.usage;
  if (!usage || typeof usage !== "object") {
    return { status: "malformed", message: "no usage meters" };
  }

  const meters = {};
  for (const name of WINDOWS) {
    const raw = usage[name];
    if (!raw || typeof raw !== "object") continue;
    const used = Number(raw.percent);
    if (!Number.isFinite(used)) continue;
    meters[name] = {
      used: Math.max(0, Math.min(100, used)),
      resetsAt: typeof raw.resetsAt === "string" ? raw.resetsAt : null,
      state: typeof raw.status === "string" ? raw.status : "ok",
    };
  }
  if (Object.keys(meters).length === 0) {
    return { status: "malformed", message: "no usable meters" };
  }
  return { status: "ready", meters };
}

async function collect() {
  const models = await bridge.invoke("models.list").catch(() => []);
  const provider = activeProvider(models);
  const settings = await readSettings();
  const key = typeof settings.apiKey === "string" ? settings.apiKey.trim() : "";

  if (provider && !provider.isGo) {
    return {
      status: "not-applicable",
      at: Date.now(),
      provider,
      title: t("notApplicableTitle"),
      body: t("notApplicableBody", { name: provider.name }),
    };
  }

  if (!key) {
    return {
      status: "no-key",
      at: Date.now(),
      provider,
      title: t("noKeyTitle"),
      body: t("noKeyBody"),
    };
  }

  const result = await fetchQuota(key);
  if (result.status !== "ready") {
    const title =
      result.status === "unauthorized"
        ? t("unauthorizedTitle")
        : result.status === "unsupported"
          ? t("unsupportedTitle")
          : t("errorTitle");
    return { status: result.status, at: Date.now(), provider, title, body: result.message };
  }

  return { status: "ready", at: Date.now(), provider, meters: result.meters };
}

/* ------------------------------------------------------------------ render */

function renderMeters(meters) {
  const host = el("meters");
  host.replaceChildren();
  host.hidden = false;

  for (const key of WINDOWS) {
    const meter = meters[key];
    if (!meter) continue;

    const remaining = Math.max(0, 100 - meter.used);
    const tone = remaining <= 10 ? "critical" : remaining <= 25 ? "warning" : "ok";

    // One line per window: label | bar | reset. Compact by design.
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.tone = tone;

    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = t(key);
    label.title = t(`${key}Hint`);

    const track = document.createElement("div");
    track.className = "track";
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-label", t(key));
    track.setAttribute("aria-valuenow", String(Math.round(meter.used)));
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");

    const fill = document.createElement("div");
    fill.className = "fill";
    fill.style.width = `${meter.used}%`;
    track.append(fill);

    const value = document.createElement("span");
    value.className = "row-value";
    value.textContent = t("left", { percent: pct(remaining) });

    const meta = document.createElement("span");
    meta.className = "row-meta";
    meta.textContent = meter.resetsAt ? until(meter.resetsAt) : "";
    if (meter.resetsAt) {
      meta.title = t("usedResets", { percent: pct(meter.used), when: localTime(meter.resetsAt) });
    } else {
      meta.title = t("used", { percent: pct(meter.used) });
    }

    row.append(label, track, value, meta);
    host.append(row);
  }
}

function renderNotice(title, body) {
  el("notice").hidden = false;
  el("noticeTitle").textContent = title;
  el("noticeBody").textContent = body;
  el("meters").hidden = true;
}

function render(state) {
  last = state;
  el("meters").hidden = true;
  el("notice").hidden = true;

  el("title").textContent = t("title");
  el("refresh").title = t("refresh");
  el("refreshLabel").textContent = t("refresh");

  if (state.status === "ready") {
    renderMeters(state.meters);
  } else {
    renderNotice(state.title ?? t("errorTitle"), state.body ?? "");
  }

  el("updated").textContent = updatedLabel(state.at);
  document.documentElement.lang = strings === STRINGS["zh-CN"] ? "zh-CN" : "en";
}

function renderLoading() {
  el("meters").hidden = true;
  el("notice").hidden = true;
  el("updated").textContent = t("checking");
}

/* ------------------------------------------------------------------ driver */

async function applyLocale() {
  const settings = await readSettings();
  const appearance = await bridge.invoke("app.getAppearance").catch(() => null);
  const locale = resolveLocale(settings.language, appearance?.locale);
  strings = STRINGS[locale] ?? STRINGS.en;
}

async function refresh() {
  if (busy) return;
  busy = true;
  el("refresh").disabled = true;
  if (!last) renderLoading();
  try {
    await applyLocale();
    render(await collect());
  } catch (error) {
    render({
      status: "error",
      at: Date.now(),
      title: t("errorTitle"),
      body: String(error?.message || error),
    });
  } finally {
    busy = false;
    el("refresh").disabled = false;
  }
}

function startTimer() {
  stopTimer();
  timer = setInterval(() => void refresh(), REFRESH_MS);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

el("refresh").addEventListener("click", () => void refresh());

window.addEventListener("focus", () => void refresh());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void refresh();
});
window.addEventListener("pagehide", stopTimer);
window.addEventListener("beforeunload", stopTimer);

// Re-render when the host switches appearance or language.
bridge?.on?.("appearance:changed", () => void refresh());

void refresh().then(startTimer);
