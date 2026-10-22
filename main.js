/**
 * OpenCode Quota — registers the command that opens the quota panel.
 *
 * All of the work happens in the panel: the panel bridge already exposes the
 * three calls this feature needs (`models.list` for the active provider,
 * `plugin.getSettings` for the key, `net.fetch` for the one quota endpoint), so
 * there is no state to mirror here and nothing to keep in sync.
 */

async function onLoad() {
  await pi.commands.register({
    id: "opencodeQuota.open",
    title: "OpenCode Quota: Open",
    keywords: ["opencode", "quota", "usage", "额度", "订阅"],
    category: "Productivity",
    run: async () => {
      await pi.ui.openPanel();
    },
  });
}

async function onUnload() {
  await pi.commands.unregister("opencodeQuota.open");
}

module.exports = { onLoad, onUnload };
