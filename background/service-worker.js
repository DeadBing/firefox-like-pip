import { DEFAULT_SETTINGS, STORAGE_KEY, mergeSettings } from "../lib/settings.js";

async function ensureDefaults() {
  const data = await chrome.storage.sync.get(STORAGE_KEY);
  if (!data[STORAGE_KEY]) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: { ...DEFAULT_SETTINGS } });
  }
}

function createContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "pip-addon-watch",
      title: chrome.i18n.getMessage("contextWatch") || "Watch in Picture-in-Picture",
      contexts: ["video", "page", "frame"],
    });
  });
}

/**
 * Inject the toggle in the same turn as the user gesture.
 * Awaiting another script first drops transient activation, and
 * Document PiP / requestPictureInPicture then reject.
 */
function toggleInTab(tab, frameId) {
  if (!tab?.id) {
    return;
  }
  const target = { tabId: tab.id };
  if (Number.isInteger(frameId)) {
    target.frameIds = [frameId];
  } else {
    target.allFrames = true;
  }
  chrome.scripting.executeScript({
    target,
    func: () => globalThis.PipAddonContent?.toggleBest?.(),
  }).catch(() => {
    /* Restricted pages such as chrome:// cannot be scripted */
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  createContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  createContextMenu();
});

chrome.action.onClicked.addListener((tab) => {
  toggleInTab(tab);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== "toggle-pip") {
    return;
  }
  if (tab) {
    toggleInTab(tab);
    return;
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      toggleInTab(tabs[0]);
    }
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "pip-addon-watch") {
    return;
  }
  toggleInTab(tab, info.frameId);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[STORAGE_KEY]) {
    mergeSettings(changes[STORAGE_KEY].newValue);
  }
});
