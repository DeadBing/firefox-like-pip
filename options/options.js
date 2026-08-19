import { loadSettings, saveSettings } from "../lib/settings.js";

const form = document.getElementById("form");
const saved = document.getElementById("saved");

function t(key) {
  return chrome.i18n.getMessage(key) || key;
}

document.getElementById("title").textContent = t("optionsTitle");
document.getElementById("intro").textContent = t("optionsIntro");
document.getElementById("shortcuts-heading").textContent = t("shortcutsHeading");
document.getElementById("shortcut-toggle").textContent = t("shortcutToggle");
document.getElementById("shortcut-player").textContent = t("shortcutPlayer");
saved.textContent = t("saved");
document.title = t("optionsTitle");

for (const node of document.querySelectorAll("[data-i18n]")) {
  node.textContent = t(node.dataset.i18n);
}

function apply(settings) {
  for (const element of form.elements) {
    if (!element.name) {
      continue;
    }
    if (element.type === "checkbox") {
      element.checked = Boolean(settings[element.name]);
    } else {
      element.value = String(settings[element.name] ?? "");
    }
  }
}

function read() {
  const values = {};
  for (const element of form.elements) {
    if (!element.name) {
      continue;
    }
    if (element.type === "checkbox") {
      values[element.name] = element.checked;
    } else if (element.type === "number") {
      values[element.name] = Number(element.value);
    } else {
      values[element.name] = element.value;
    }
  }
  return values;
}

let saveTimer = 0;
form.addEventListener("input", () => {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    await saveSettings(read());
    saved.hidden = false;
    window.setTimeout(() => {
      saved.hidden = true;
    }, 1500);
  }, 150);
});

apply(await loadSettings());
