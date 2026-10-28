function enableSidePanel() {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

enableSidePanel();
chrome.runtime.onInstalled.addListener(enableSidePanel);
