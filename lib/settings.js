/** Default settings mirroring Firefox Picture-in-Picture prefs. */
export const DEFAULT_SETTINGS = Object.freeze({
  toggleEnabled: true,
  alwaysShowToggle: false,
  minVideoSecs: 45,
  minVideoDimension: 140,
  respectDisablePictureInPicture: true,
  autoPipOnTabSwitch: false,
  keyboardControlsEnabled: true,
  captionsEnabled: true,
  captionFontSize: "medium",
  pauseOnClose: true,
  showPlaceholder: true,
});

export const STORAGE_KEY = "pipAddonSettings";

export function mergeSettings(partial) {
  return {
    ...DEFAULT_SETTINGS,
    ...(partial && typeof partial === "object" ? partial : {}),
  };
}

export async function loadSettings() {
  if (typeof chrome !== "undefined" && chrome.storage?.sync) {
    const data = await chrome.storage.sync.get(STORAGE_KEY);
    return mergeSettings(data[STORAGE_KEY]);
  }
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings) {
  const next = mergeSettings(settings);
  if (typeof chrome !== "undefined" && chrome.storage?.sync) {
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  }
  return next;
}
