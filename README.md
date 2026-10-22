# OpenCode Quota ｜ OpenCode 额度

Show how much of your **OpenCode Go** subscription is left, without leaving PI-Desktop.

在 PI-Desktop 里直接看到 **OpenCode Go** 订阅还剩多少额度，不用再开浏览器。

---

## English

### What it does

A compact panel with one row per quota window:

| Window | What it means |
| --- | --- |
| Rolling 5h | Resets 5 hours after your first use |
| Weekly | Resets every Monday 00:00 UTC |
| Monthly | Resets with your paid period |

Each row shows the progress bar (how much is *used*), the share **still available**, and how long until it resets. Rows turn amber at 25% left and red at 10%, so a nearly-exhausted window is obvious at a glance.

The panel refreshes every minute, and again whenever the window regains focus.

### Only when it applies

The panel asks PI-Desktop which provider is active. If it is **not** an OpenCode Go / Zen provider, no numbers are shown and **no request is made** — the panel says which provider is in use instead. Printing `0%` there would read as "full quota", which is the opposite of the truth.

### Setup

1. Open **OpenCode Quota: Open** from the command palette.
2. In this plugin's settings, paste an **OpenCode Go API key** — create one at [opencode.ai/console](https://opencode.ai/console) under **Account → Personal API keys**.
3. That's it. The panel fills in on its next poll.

### Language

English and Simplified Chinese, **following your system language** by default. Pin it in the plugin settings if you prefer. Traditional Chinese (`zh-TW` / `zh-HK` / `zh-Hant`) falls back to English rather than showing Simplified text.

### Privacy

- **Read-only.** The only request the plugin ever makes is `GET https://opencode.ai/zen/go/v1/usage`, and only while an OpenCode Go provider is active.
- **One domain.** The manifest declares `net.domains: ["opencode.ai"]`, so no other host is reachable.
- **No file scanning.** It never reads chats, transcripts, project files, or PI-Desktop's own provider secrets. (PI-Desktop does not let plugins read its credential store, which is why the key is entered by hand.)
- **The key stays local.** It lives in this plugin's own `settings.json` under PI-Desktop's data directory and is sent to no one but the endpoint above.
- **Nothing is cached.** Quota is never written to disk; reopening the panel always reads live numbers.

### Permissions

| Permission | Why |
| --- | --- |
| `ui.panel` | Draw the quota panel |
| `models.list` | Read the active provider, so quota is never shown for the wrong one |
| `net.fetch` | Call the single quota endpoint on `opencode.ai` |

### Changelog

- **0.3.0** — Compact single-row layout; the last-refreshed time moved into the header just before the refresh button; removed the provider subtitle and the endpoint footer.
- **0.2.0** — English and Simplified Chinese, following the system locale.
- **0.1.0** — First release.

---

## 中文

### 功能

一个紧凑面板，每个额度窗口一行：

| 窗口 | 含义 |
| --- | --- |
| 滚动 5 小时 | 首次使用后 5 小时重置 |
| 每周 | 每周一 00:00 UTC 重置 |
| 每月 | 随订阅周期重置 |

每行显示进度条（**已用**多少）、**剩余**百分比，以及还有多久重置。剩余低于 25% 变黄，低于 10% 变红，一眼就能看出哪一档快用完了。

面板每分钟刷新一次，窗口重新获得焦点时也会刷新。

### 只在适用时显示

面板会向 PI-Desktop 查询当前使用的供应商。若**不是** OpenCode Go / Zen 供应商，就**不显示任何数字、也不发请求**，只提示当前用的是什么。若在那里显示 `0%`，会被读成「额度全满」，与事实正好相反。

### 配置

1. 从命令面板执行 **OpenCode Quota: Open**。
2. 在本插件设置里填入 **OpenCode Go API Key** —— 可在 [opencode.ai/console](https://opencode.ai/console) 的「账户 → 个人 API 密钥」创建。
3. 完成。下次轮询就会显示数据。

### 语言

内置英文与简体中文，**默认跟随系统语言**；也可以在插件设置里手动指定。繁体中文（`zh-TW` / `zh-HK` / `zh-Hant`）回落英文，而不是硬塞简体。

### 隐私

- **只读。** 插件唯一会发的请求是 `GET https://opencode.ai/zen/go/v1/usage`，且只在当前供应商是 OpenCode Go 时才发。
- **只访问一个域名。** manifest 声明了 `net.domains: ["opencode.ai"]`，其他主机一律不可达。
- **不扫描文件。** 不读取对话、记录、项目文件，也不读取 PI-Desktop 自身的供应商密钥（宿主不允许插件读取凭据，所以 Key 需要你手填）。
- **Key 只留在本机。** 保存在本插件自己的 `settings.json`（位于 PI-Desktop 数据目录），除上述接口外不发给任何地方。
- **不做缓存。** 额度不落盘，每次打开面板都是实时数据。

### 权限

| 权限 | 用途 |
| --- | --- |
| `ui.panel` | 绘制额度面板 |
| `models.list` | 读取当前供应商，避免在错误的供应商下显示额度 |
| `net.fetch` | 调用 `opencode.ai` 上唯一的额度接口 |

### 更新记录

- **0.3.0** —— 改为紧凑单行布局；更新时间移到标题栏、刷新按钮之前；移除供应商副标题与接口地址页脚。
- **0.2.0** —— 支持英文与简体中文，跟随系统语言。
- **0.1.0** —— 首个版本。
