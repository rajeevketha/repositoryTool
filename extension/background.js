chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  // Older Chrome builds may not support setPanelBehavior; the action still opens the panel
  // once the user enables it from the toolbar context menu.
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type !== "closeSidePanel") return;
  (async () => {
    try {
      if (chrome.sidePanel.close) await chrome.sidePanel.close();
    } catch {
      /* close() needs a windowId on some Chrome builds */
    }
    try {
      await chrome.sidePanel.setOptions({ enabled: false });
      await chrome.sidePanel.setOptions({ enabled: true, path: "sidepanel.html" });
    } catch {
      /* ignore */
    }
    sendResponse({ ok: true });
  })();
  return true;
});
