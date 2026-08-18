chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  // Older Chrome builds may not support setPanelBehavior; the action still opens the panel
  // once the user enables it from the toolbar context menu.
});
