// app.js: boot and routing between screens.

import * as settings from "./settings.js";
import * as library from "./library.js";
import { parse, detectLang, makeTitle } from "./text.js";
import { Speaker, supported as speechSupported, voicesFor, pickVoice, onVoicesChanged, voiceCount, voiceAdvice, isIOS } from "./speech.js";
import { Reader } from "./reader.js";
import { selfTest, customTheme } from "./contrast.js";
import { kindOf, titleFromFile, readTextFile, readDocx, readPdf, recognize, cancelOcr, Cancelled, OCR_FIRST_DOWNLOAD } from "./import.js";
import * as lookup from "./lookup.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const app = $("#app");
const homeView = $("#home");
const readerView = $("#reader");
const input = $("#input");
const lookSheet = $("#look-sheet");
const settingsSheet = $("#settings-sheet");
const lookupSheet = $("#lookup-sheet");
const rowMenu = $("#row-menu");
const alertDialog = $("#alert");

const wide = window.matchMedia("(min-width: 900px)");
const coarse = window.matchMedia("(pointer: coarse)");
const isMac = /Mac/.test(navigator.platform || "") && !isIOS;

const RATES = [0.6, 0.8, 1, 1.2, 1.4, 1.6];
const LAYOUT_KEYS = ["font", "size", "spacing", "letter", "lineHeight", "width", "dyslexiaMode"];

const WELCOME_TITLE = "Welcome to EasyRead";
const WELCOME_TEXT = `Welcome to EasyRead.

EasyRead makes reading more comfortable. Paste or type any text, then tap Read it.

Press the play button to hear the text. Each sentence lights up as it is read. On many devices, each word lights up too.

While it reads, tap a sentence to jump there. When reading is stopped, tap a word to hear just that word. Then press play to read on from there.

Tap an empty space to hide the buttons. Tap again to bring them back.

No typing needed. On the home screen, tap Scan a page to take a photo of a printed page. Tap Look up to find a topic on Wikipedia. Open file reads PDFs and Word documents.

Tap Aa to change the colors, the font, the size and the spacing. You can also turn on the reading ruler. It dims the lines above and below the one you are reading.

Dyslexia mode is also under Aa. It switches the whole app to the OpenDyslexic font with extra-wide spacing. Some people find it easier to read.

Your texts are saved on this device, so you can come back to them. Nothing you read is sent anywhere.`;

let currentId = null;
let cameFromHome = false;
let noSoundShown = false;
let tintOpen = false;

/* ---------- Toast ---------- */

let toastTimer = 0;
function toast(message, ms = 3200) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

/* ---------- Alert dialog (confirm and rename) ---------- */

function ask({ title, message = "", ok = "OK", cancel = "Cancel", danger = false, input: value = null }) {
  if (typeof alertDialog.showModal !== "function") {
    if (value !== null) return Promise.resolve(window.prompt(title, value));
    return Promise.resolve(window.confirm(message ? `${title}\n\n${message}` : title));
  }
  const field = $("#alert-input");
  $("#alert-title").textContent = title;
  $("#alert-msg").textContent = message;
  $("#alert-msg").hidden = !message;
  field.hidden = value === null;
  field.value = value ?? "";
  $("#alert-ok").textContent = ok;
  $("#alert-ok").className = danger ? "danger" : "strong";
  $("#alert-cancel").textContent = cancel;
  alertDialog.returnValue = "";
  alertDialog.showModal();
  if (value !== null) {
    field.focus();
    field.select();
  } else {
    $("#alert-cancel").focus();
  }
  return new Promise((resolve) => {
    alertDialog.addEventListener("close", () => {
      const yes = alertDialog.returnValue === "ok";
      resolve(value !== null ? (yes ? field.value : null) : yes);
    }, { once: true });
  });
}

$("#alert-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    alertDialog.close("ok");
  }
});

/* ---------- Sheets ---------- */

let openSheetEl = null;
let sheetOpener = null;

function openSheet(sheet, opener) {
  if (openSheetEl === sheet) return;
  closeSheet(true);
  closeMenu(false);
  openSheetEl = sheet;
  sheetOpener = opener || document.activeElement;
  const backdrop = $("#backdrop");
  backdrop.hidden = false;
  backdrop.classList.toggle("dim", sheet !== lookSheet);
  sheet.hidden = false;
  sheet.getBoundingClientRect(); // start the slide from the closed position
  sheet.classList.add("open");
  if (sheet === lookSheet) {
    syncLook();
    $("#aa-btn").setAttribute("aria-expanded", "true");
  }
  sheet.focus({ preventScroll: true });
}

function closeSheet(immediate = false) {
  const sheet = openSheetEl;
  if (!sheet) return;
  openSheetEl = null;
  sheet.classList.remove("open");
  $("#backdrop").hidden = true;
  $("#backdrop").classList.remove("dim");
  $("#aa-btn").setAttribute("aria-expanded", "false");
  const hide = () => {
    if (openSheetEl !== sheet) sheet.hidden = true;
  };
  if (immediate) hide();
  else setTimeout(hide, 280);
  if (sheetOpener && document.contains(sheetOpener) && sheetOpener.offsetParent !== null) sheetOpener.focus({ preventScroll: true });
  sheetOpener = null;
}

function trapFocus(e) {
  const items = Array.from(openSheetEl.querySelectorAll("button, input, select")).filter((el) => !el.disabled && el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && (document.activeElement === first || document.activeElement === openSheetEl)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

// Drag a sheet down by its top edge to close it (phone layout).
function enableSheetDrag(sheet) {
  for (const zone of sheet.querySelectorAll(".sheet-grab, .sheet-head")) {
    let startY = null;
    let dy = 0;
    zone.addEventListener("pointerdown", (e) => {
      if (wide.matches || e.target.closest("button")) return;
      startY = e.clientY;
      dy = 0;
      sheet.classList.add("dragging");
      zone.setPointerCapture?.(e.pointerId);
    });
    zone.addEventListener("pointermove", (e) => {
      if (startY === null) return;
      dy = Math.max(0, e.clientY - startY);
      sheet.style.transform = `translateY(${dy}px)`;
    });
    const end = () => {
      if (startY === null) return;
      startY = null;
      sheet.classList.remove("dragging");
      sheet.style.transform = "";
      if (dy > 80) closeSheet();
    };
    zone.addEventListener("pointerup", end);
    zone.addEventListener("pointercancel", end);
  }
}

[lookSheet, settingsSheet, lookupSheet].forEach((sheet) => {
  sheet.tabIndex = -1;
  enableSheetDrag(sheet);
  sheet.querySelector("[data-close]").addEventListener("click", () => closeSheet());
});
$("#backdrop").addEventListener("click", () => closeSheet());

/* ---------- Row menu (Rename, Delete) ---------- */

let menuDocId = null;
let menuOpener = null;

function openMenu(button, id) {
  if (menuOpener === button && !rowMenu.hidden) {
    closeMenu(true);
    return;
  }
  menuDocId = id;
  menuOpener = button;
  rowMenu.hidden = false;
  const r = button.getBoundingClientRect();
  const w = rowMenu.offsetWidth;
  const h = rowMenu.offsetHeight;
  const left = Math.max(12, Math.min(window.innerWidth - w - 12, r.right - w));
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - 12) top = r.top - h - 6;
  rowMenu.style.left = left + "px";
  rowMenu.style.top = Math.max(12, top) + "px";
  button.setAttribute("aria-expanded", "true");
  rowMenu.querySelector("button").focus();
}

function closeMenu(restoreFocus) {
  if (rowMenu.hidden) return;
  rowMenu.hidden = true;
  menuOpener?.setAttribute("aria-expanded", "false");
  if (restoreFocus) menuOpener?.focus();
  menuOpener = null;
}

document.addEventListener("pointerdown", (e) => {
  if (!rowMenu.hidden && !e.target.closest("#row-menu, [data-more]")) closeMenu(false);
}, true);

rowMenu.addEventListener("click", async (e) => {
  const action = e.target.closest("[data-menu]")?.dataset.menu;
  const id = menuDocId;
  const opener = menuOpener;
  closeMenu(false);
  const doc = library.get(id);
  if (!action || !doc) return;
  if (action === "rename") {
    const name = await ask({ title: "Rename", input: doc.title, ok: "Save" });
    if (name && name.trim()) await library.update(id, { title: name.trim().slice(0, 120) }, { touch: false });
    if (opener && document.contains(opener)) opener.focus();
  } else if (action === "delete") {
    const yes = await ask({ title: `Delete “${doc.title}”?`, message: "This can’t be undone.", ok: "Delete", danger: true });
    if (!yes) return;
    await library.remove(id);
    if (id === currentId) go("#/");
    toast("Deleted.");
  }
});

rowMenu.addEventListener("keydown", (e) => {
  const items = Array.from(rowMenu.querySelectorAll("button"));
  const i = items.indexOf(document.activeElement);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    const next = (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  } else if (e.key === "Tab") {
    closeMenu(false);
  }
});

/* ---------- Document lists ---------- */

const relative = typeof Intl.RelativeTimeFormat === "function" ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;

function timeAgo(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return { short: "now", long: "just now" };
  const units = [["minute", 60, "m"], ["hour", 3600, "h"], ["day", 86400, "d"], ["week", 604800, "w"]];
  const limits = [3600, 86400, 604800, 2592000];
  for (let k = 0; k < units.length; k++) {
    if (s < limits[k]) {
      const [unit, size, abbr] = units[k];
      const n = Math.floor(s / size);
      return { short: n + abbr, long: relative ? relative.format(-n, unit) : `${n} ${unit}s ago` };
    }
  }
  const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(t);
  return { short: date, long: date };
}

function rowFor(doc) {
  const li = document.createElement("li");
  li.className = "doc-row";
  const active = doc.id === currentId;
  li.classList.toggle("active", active);

  const open = document.createElement("button");
  open.type = "button";
  open.className = "doc-open";
  open.dataset.open = doc.id;
  if (active) open.setAttribute("aria-current", "page");
  const when = timeAgo(doc.updatedAt);
  open.setAttribute("aria-label", `${doc.title}, ${when.long}`);
  const title = document.createElement("span");
  title.className = "doc-title";
  title.textContent = doc.title;
  const time = document.createElement("time");
  time.className = "doc-time";
  time.dateTime = new Date(doc.updatedAt).toISOString();
  time.textContent = when.short;
  open.append(title, time);

  const more = document.createElement("button");
  more.type = "button";
  more.className = "icon-btn doc-more";
  more.dataset.more = doc.id;
  more.setAttribute("aria-label", `More options for ${doc.title}`);
  more.setAttribute("aria-haspopup", "menu");
  more.setAttribute("aria-expanded", "false");
  more.innerHTML = '<svg class="icon"><use href="#i-more"/></svg>';

  li.append(open, more);
  return li;
}

function renderLists() {
  const docs = library.list();
  const pairs = [[$("#home-list"), $("#home-empty")], [$("#sidebar-list"), $("#sidebar-empty")]];
  for (const [list, empty] of pairs) {
    list.replaceChildren(...docs.map(rowFor));
    list.hidden = !docs.length;
    empty.hidden = !!docs.length;
  }
}

for (const list of [$("#home-list"), $("#sidebar-list")]) {
  list.addEventListener("click", (e) => {
    const more = e.target.closest("[data-more]");
    if (more) {
      openMenu(more, more.dataset.more);
      return;
    }
    const open = e.target.closest("[data-open]");
    if (open) {
      cameFromHome = !readerOpen();
      go("#/doc/" + encodeURIComponent(open.dataset.open));
    }
  });
}

library.onChange(() => {
  renderLists();
  const doc = currentId && library.get(currentId);
  if (doc) {
    $("#doc-title").textContent = doc.title;
    document.title = `${doc.title} – EasyRead`;
  }
});

/* ---------- Routing ---------- */

function readerOpen() {
  return !readerView.hidden;
}

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  const m = location.hash.match(/^#\/doc\/(.+)$/);
  if (m) openDoc(decodeURIComponent(m[1]));
  else showHome();
}

window.addEventListener("hashchange", route);

function leaveReader() {
  if (!currentId) return;
  speaker.stop();
  saveProgress(true);
  closeSheet(true);
  reader.setFocus(false);
}

function showHome() {
  leaveReader();
  currentId = null;
  cameFromHome = false;
  readerView.hidden = true;
  homeView.hidden = false;
  document.title = "EasyRead";
  renderLists();
}

function openDoc(id) {
  const doc = library.get(id);
  if (!doc) {
    toast("That text is no longer saved.");
    location.replace("#/");
    return;
  }
  if (id === currentId && readerOpen()) return;
  leaveReader();
  currentId = id;

  const lang = detectLang(doc.text);
  const parsed = parse(doc.text, lang);
  homeView.hidden = true;
  readerView.hidden = false;
  reader.render(parsed, lang, doc.source);
  $("#doc-title").textContent = doc.title;
  document.title = `${doc.title} – EasyRead`;

  speaker.load(parsed.sentences, lang, doc.lastSentence || 0);
  updateVoice();
  const resume = doc.lastSentence || 0;
  if (resume > 0 && resume < parsed.sentences.length) {
    reader.setCurrent(resume, false);
    reader.scrollToSentence(resume);
  }
  reader.setRuler(settings.get().ruler);
  library.update(id, {}, { touch: true }); // moves it to the top of Recent
}

/* ---------- Reader and speech ---------- */

let saveTimer = 0;
function saveProgress(now = false) {
  if (!currentId) return;
  const id = currentId;
  const index = speaker.index;
  clearTimeout(saveTimer);
  const run = () => library.get(id) && library.update(id, { lastSentence: index }, { touch: false });
  if (now) run();
  else saveTimer = setTimeout(run, 800);
}

const reader = new Reader(
  {
    reader: readerView,
    scroller: $("#scroller"),
    page: $("#page"),
    ruler: $("#ruler"),
    handle: $("#ruler-handle"),
    chip: $("#back-chip"),
    topbar: $("#topbar"),
  },
  {
    onTapSentence(i, wordIndex, wordEl) {
      if (speaker.playing) {
        speaker.jump(i);
        reader.follow();
        return;
      }
      speaker.finished = false;
      speaker.index = i;
      reader.setCurrent(i, false);
      saveProgress();
      if (wordEl) {
        speaker.speakWord(wordEl.textContent);
        reader.flashWord(wordEl);
      }
    },
    onTapEmpty() {
      reader.setFocus(!reader.focused);
    },
  },
);

const speaker = new Speaker({
  onSentence(i, playing) {
    reader.setCurrent(i, playing);
    if (!playing) reader.follow(true);
    saveProgress();
  },
  onWord(i, wordIndex) {
    if (i === reader.current) reader.setWord(wordIndex);
  },
  onState(playing) {
    reader.setPlaying(playing);
    const btn = $("#play-btn");
    btn.setAttribute("aria-label", playing ? "Pause" : "Play");
    btn.querySelector("use").setAttribute("href", playing ? "#i-pause" : "#i-play");
    if (!playing) saveProgress(true);
  },
  onEnd() {
    reader.clearCurrent();
    if (currentId) library.update(currentId, { lastSentence: 0 }, { touch: false });
  },
  onNoSound() {
    if (noSoundShown) return;
    noSoundShown = true;
    toast(isIOS ? "No sound? Check the volume and the silent switch." : "No sound? Check the volume.", 5000);
  },
  onUnsupported() {
    toast("This browser can’t read aloud. Try Safari, Chrome or Edge.", 5000);
  },
});

$("#play-btn").addEventListener("click", () => speaker.toggle());
$("#prev-btn").addEventListener("click", () => speaker.prev());
$("#next-btn").addEventListener("click", () => speaker.next());

$("#speed-btn").addEventListener("click", () => {
  const rate = settings.get().rate;
  const next = RATES.find((r) => r > rate + 0.001) ?? RATES[0];
  settings.set({ rate: next });
});

function updateSpeedLabel() {
  const rate = settings.get().rate;
  $("#speed-btn").textContent = rate.toFixed(1) + "×";
  $("#speed-btn").setAttribute("aria-label", `Speed ${rate.toFixed(1)} times`);
}

$("#back-btn").addEventListener("click", () => {
  if (cameFromHome && history.length > 1) history.back();
  else go("#/");
});

$("#sidebar-btn").addEventListener("click", () => {
  const collapsed = app.classList.toggle("sidebar-collapsed");
  $("#sidebar-btn").setAttribute("aria-label", collapsed ? "Show library" : "Hide library");
  $("#sidebar-btn").setAttribute("aria-expanded", String(!collapsed));
  reader.updateRuler();
});

$("#aa-btn").addEventListener("click", (e) => {
  if (openSheetEl === lookSheet) closeSheet();
  else openSheet(lookSheet, e.currentTarget);
});

$$('[data-action="settings"]').forEach((b) => b.addEventListener("click", () => openSheet(settingsSheet, b)));
$$('[data-action="new"]').forEach((b) => b.addEventListener("click", () => {
  go("#/");
  input.focus();
}));

// iOS can stop speech when the screen locks without telling us.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !speaker.playing) return;
  setTimeout(() => {
    if (speaker.playing && !window.speechSynthesis.speaking && !window.speechSynthesis.pending) speaker.stop();
  }, 400);
});

/* ---------- Voices ---------- */

function updateVoice() {
  const s = settings.get();
  const lang = speaker.lang;
  speaker.setVoice(pickVoice(lang, s.voices[lang], s.onlineVoices));
  syncVoiceSelect();
}

function languageName(lang) {
  try {
    return new Intl.DisplayNames([navigator.language || "en"], { type: "language" }).of(lang);
  } catch {
    return lang;
  }
}

function syncVoiceSelect() {
  const select = $("#voice-select");
  const hint = $("#voice-hint");
  const lang = speaker.lang;
  const list = voicesFor(lang, settings.get().onlineVoices);
  select.replaceChildren();
  hint.hidden = true;
  if (!speechSupported) {
    select.add(new Option("Not available in this browser", ""));
    select.disabled = true;
    return;
  }
  if (!list.length) {
    select.add(new Option("Default voice", ""));
    select.disabled = true;
    if (voiceCount()) {
      hint.textContent = `No ${languageName(lang)} voice is installed on this device. See Settings for how to add one.`;
      hint.hidden = false;
    }
    return;
  }
  select.disabled = false;
  for (const v of list) select.add(new Option(v.name + (v.localService === false ? " (online)" : ""), v.voiceURI));
  select.value = speaker.voice?.voiceURI || list[0].voiceURI;

  const advice = voiceAdvice(lang, settings.get().onlineVoices);
  if (advice === "download") {
    hint.textContent = isIOS
      ? "Sounds robotic? Download a free natural voice: open Settings → Accessibility → Spoken Content → Voices, pick your language, and choose one marked Premium or Enhanced. Then come back and pick it here."
      : "Sounds robotic? Download a free natural voice: open System Settings → Accessibility → Spoken Content → System voice → Manage Voices, and choose one marked Premium or Enhanced. Then pick it here.";
    hint.hidden = false;
  } else if (advice === "online") {
    hint.textContent = "Sounds robotic? This browser has more natural online voices. Turn on Online voices in Settings to use them. Your text is then sent to Google or Microsoft to be spoken.";
    hint.hidden = false;
  }
}

$("#voice-select").addEventListener("change", (e) => {
  const voices = { ...settings.get().voices, [speaker.lang]: e.target.value };
  settings.set({ voices });
});

onVoicesChanged(updateVoice);

/* ---------- Look sheet ---------- */

function setPct(range) {
  const min = +range.min;
  const max = +range.max;
  range.style.setProperty("--pct", ((range.value - min) / (max - min)) * 100 + "%");
}

// Settings that move text around: keep the reader's place.
function setLayout(patch) {
  const anchor = readerOpen() ? reader.captureAnchor() : null;
  settings.set(patch);
  if (!anchor) return;
  reader.restoreAnchor(anchor);
  if ("font" in patch && document.fonts?.ready) document.fonts.ready.then(() => reader.restoreAnchor(anchor));
}

function changeSize(step) {
  const size = Math.max(settings.SIZE_MIN, Math.min(settings.SIZE_MAX, settings.effectiveSize() + step));
  setLayout({ size });
}

function syncLook() {
  const s = settings.get();
  for (const b of $$("[data-theme-choice]")) b.setAttribute("aria-pressed", String(b.dataset.themeChoice === s.theme));

  const custom = $("#custom-swatch");
  if (s.customVars) {
    custom.style.background = s.customVars["--bg"];
    custom.style.color = s.customVars["--text"];
    custom.classList.remove("add");
    custom.textContent = "Aa";
  } else if (!custom.classList.contains("add")) {
    custom.removeAttribute("style");
    custom.classList.add("add");
    custom.innerHTML = '<svg class="icon"><use href="#i-plus"/></svg>';
  }
  $("#tint-panel").hidden = !(tintOpen || s.theme === "custom");
  for (const chip of $$("[data-tint]")) chip.setAttribute("aria-pressed", String(s.theme === "custom" && chip.dataset.tint === s.customBg));
  if (s.customBg) $("#tint-input").value = s.customBg;

  for (const seg of $$(".seg[data-setting]")) {
    const value = s[seg.dataset.setting];
    for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.value === value));
  }

  const size = settings.effectiveSize();
  $("#size-range").value = size;
  $("#size-value").textContent = `${size} px`;

  const sp = settings.spacingValues();
  $("#custom-spacing").hidden = s.spacing !== "custom";
  $("#letter-range").value = sp.letter;
  $("#letter-value").textContent = `${sp.letter.toFixed(2)} em`;
  $("#line-range").value = sp.line;
  $("#line-value").textContent = sp.line.toFixed(2);

  $("#ruler-switch").setAttribute("aria-checked", String(s.ruler));
  syncDyslexiaSwitches();
  $("#rate-range").value = s.rate;
  $("#rate-value").textContent = s.rate.toFixed(1) + "×";
  $$('#look-sheet input[type="range"]').forEach(setPct);
  syncVoiceSelect();
}

function showTintNote(result) {
  const note = $("#tint-note");
  const ratio = result.ratio.toFixed(1);
  note.className = "tint-note" + (result.level === "ok" ? "" : " " + result.level);
  if (result.level === "block") note.textContent = `Contrast is ${ratio}:1, too low to read comfortably. Try a lighter or darker color.`;
  else if (result.level === "warn") note.textContent = `Contrast is ${ratio}:1. Readable, but under the 7:1 that EasyRead aims for.`;
  else note.textContent = `Contrast is ${ratio}:1. Easy to read.`;
}

function tryTint(hex) {
  const result = customTheme(hex);
  showTintNote(result);
  if (result.level === "block") return;
  settings.set({ theme: "custom", customBg: hex.toUpperCase(), customVars: result.vars });
}

$("#theme-swatches").addEventListener("click", (e) => {
  const choice = e.target.closest("[data-theme-choice]")?.dataset.themeChoice;
  if (!choice) return;
  if (choice === "custom") {
    tintOpen = true;
    const s = settings.get();
    if (s.customVars) {
      settings.set({ theme: "custom" });
      showTintNote(customTheme(s.customBg));
    } else {
      $("#tint-note").textContent = "Pick a background color.";
      $("#tint-note").className = "tint-note";
      syncLook();
    }
    return;
  }
  tintOpen = false;
  settings.set({ theme: choice });
});

$("#tint-suggestions").addEventListener("click", (e) => {
  const hex = e.target.closest("[data-tint]")?.dataset.tint;
  if (hex) tryTint(hex);
});
$("#tint-input").addEventListener("input", (e) => tryTint(e.target.value));

for (const seg of $$(".seg[data-setting]")) {
  seg.addEventListener("click", (e) => {
    const value = e.target.closest("button[data-value]")?.dataset.value;
    if (!value) return;
    const key = seg.dataset.setting;
    if (key === "spacing" && value === "custom" && settings.get().spacing !== "custom") {
      const sp = settings.spacingValues();
      setLayout({ spacing: "custom", letter: sp.letter, lineHeight: sp.line });
    } else {
      setLayout({ [key]: value });
    }
  });
}

$("#size-range").addEventListener("input", (e) => setLayout({ size: +e.target.value }));
$("#letter-range").addEventListener("input", (e) => setLayout({ letter: +e.target.value }));
$("#line-range").addEventListener("input", (e) => setLayout({ lineHeight: +e.target.value }));
$("#ruler-switch").addEventListener("click", () => settings.set({ ruler: !settings.get().ruler }));

// Show the speed while dragging; apply it on release so speech
// restarts once, not at every step.
$("#rate-range").addEventListener("input", (e) => {
  $("#rate-value").textContent = (+e.target.value).toFixed(1) + "×";
  setPct(e.target);
});
$("#rate-range").addEventListener("change", (e) => settings.set({ rate: +e.target.value }));

/* ---------- Dyslexia mode ---------- */

// One switch, like Canvas: OpenDyslexic and extra-wide spacing for the
// reading text and the whole interface. Turning it off restores the
// font and spacing the reader had before.
function setDyslexiaMode(on) {
  const s = settings.get();
  if (on === s.dyslexiaMode) return;
  if (on) {
    const before = { font: s.font, spacing: s.spacing, letter: s.letter, lineHeight: s.lineHeight };
    setLayout({ dyslexiaMode: true, beforeDyslexia: before, font: "opendyslexic", spacing: "extra" });
  } else {
    const before = s.beforeDyslexia || { font: settings.DEFAULTS.font, spacing: settings.DEFAULTS.spacing };
    setLayout({ dyslexiaMode: false, beforeDyslexia: null, ...before });
  }
}

function syncDyslexiaSwitches() {
  const on = String(settings.get().dyslexiaMode);
  for (const sw of $$("[data-dyslexia-switch]")) sw.setAttribute("aria-checked", on);
}

for (const sw of $$("[data-dyslexia-switch]")) {
  sw.addEventListener("click", () => setDyslexiaMode(!settings.get().dyslexiaMode));
}

/* ---------- Settings sheet ---------- */

function syncSettingsSheet() {
  $("#online-switch").setAttribute("aria-checked", String(settings.get().onlineVoices));
  syncDyslexiaSwitches();
}

$("#online-switch").addEventListener("click", () => settings.set({ onlineVoices: !settings.get().onlineVoices }));

$("#reset-btn").addEventListener("click", async () => {
  const yes = await ask({ title: "Reset all settings?", message: "Theme, font, size, spacing, voice and speed go back to how they started. Your saved texts stay.", ok: "Reset" });
  if (!yes) return;
  tintOpen = false;
  setLayout({ ...settings.DEFAULTS, voices: {} });
  toast("Settings reset.");
});

$("#delete-all-btn").addEventListener("click", async () => {
  if (!library.list().length) {
    toast("There are no saved texts.");
    return;
  }
  const yes = await ask({ title: "Delete all saved texts?", message: "Every text in your library will be removed. This can’t be undone.", ok: "Delete all", danger: true });
  if (!yes) return;
  await library.clear();
  closeSheet(true);
  if (readerOpen()) go("#/");
  toast("All saved texts deleted.");
});

settings.onChange((s, patch) => {
  if ("rate" in patch) {
    speaker.setRate(s.rate);
    updateSpeedLabel();
  }
  if ("ruler" in patch) reader.setRuler(s.ruler);
  if ("voices" in patch || "onlineVoices" in patch) updateVoice();
  if (LAYOUT_KEYS.some((k) => k in patch)) reader.updateRuler();
  if (openSheetEl === lookSheet || !lookSheet.hidden) syncLook();
  syncSettingsSheet();
});

/* ---------- Home ---------- */

function updateReadButton() {
  $("#read-btn").disabled = !input.value.trim();
}

input.addEventListener("input", updateReadButton);

function insertText(text) {
  const current = input.value.replace(/\s+$/, "");
  input.value = current ? `${current}\n\n${text}` : text;
  updateReadButton();
}

async function openText(text, title, extra = {}) {
  const clean = text.trim();
  const doc = library.findByText(clean) || (await library.add(title, clean, extra));
  cameFromHome = true;
  go("#/doc/" + encodeURIComponent(doc.id));
}

/* ---------- Importing: photos, files and links ---------- */

const importButtons = ["#scan-btn", "#lookup-btn", "#paste-btn", "#open-btn"].map((s) => $(s));
let importJob = 0;

function showProgress(status, { note = "", fraction = null } = {}) {
  const card = $("#import-progress");
  card.hidden = false;
  card.classList.toggle("indeterminate", fraction === null);
  $("#import-status").textContent = status;
  $("#import-note").textContent = note;
  $("#import-bar").style.width = fraction === null ? "" : Math.round(fraction * 100) + "%";
}

function setBusy(busy) {
  importButtons.forEach((b) => (b.disabled = busy));
  $("#read-btn").disabled = busy || !input.value.trim();
  if (!busy) $("#import-progress").hidden = true;
}

function ocrNote() {
  try {
    return localStorage.getItem("easyread.ocrReady") ? "" : `The first time, EasyRead downloads its text reader (${OCR_FIRST_DOWNLOAD}). After that it works offline.`;
  } catch {
    return "";
  }
}

function markOcrReady() {
  try {
    localStorage.setItem("easyread.ocrReady", "1");
  } catch {
    // Storage blocked: the note just shows again next time.
  }
}

function showOcrProgress(p, what = "the page") {
  if (p.stage === "prepare") showProgress("Getting the text reader ready…", { note: ocrNote() });
  else showProgress(`Reading ${what}…`, { fraction: p.progress });
}

// Scanned text goes into the text box first, so it can be checked
// and fixed (and more pages added) before reading.
function addScannedText(text) {
  if (text.replace(/\s/g, "").length < 3) {
    toast("No text found. Try again with the page flat, close and well lit.", 5000);
    return;
  }
  insertText(text);
  homeView.scrollTop = 0;
  toast("Check the text, then tap Read it. You can scan another page to add it.", 5000);
}

function importError(kind) {
  if (!navigator.onLine && (kind === "image" || kind === "pdf")) return "The first scan needs internet to download the text reader.";
  if (kind === "image") return "Couldn’t read that photo. Try again with the page flat and well lit.";
  if (kind === "pdf") return "Couldn’t open that PDF.";
  if (kind === "docx") return "Couldn’t open that Word document.";
  return "Couldn’t open that file.";
}

async function importFile(file) {
  const kind = kindOf(file);
  if (!kind) {
    toast("EasyRead can open photos, PDFs, Word documents (.docx) and text files.", 5000);
    return;
  }
  const job = ++importJob;
  const cancelled = () => job !== importJob;
  const title = titleFromFile(file);
  setBusy(true);
  try {
    if (kind === "text") {
      const text = await readTextFile(file);
      if (!text.trim()) toast("That file is empty.");
      else await openText(text, title || makeTitle(text));
    } else if (kind === "docx") {
      showProgress("Opening the document…");
      const text = await readDocx(file);
      if (!text.trim()) toast("No text found in that document.");
      else await openText(text, title || makeTitle(text));
    } else if (kind === "image") {
      const text = await recognize(file, (p) => showOcrProgress(p), cancelled);
      markOcrReady();
      if (!cancelled()) addScannedText(text);
    } else if (kind === "pdf") {
      const { text, scanned } = await readPdf(file, (p) => {
        if (p.stage === "open") showProgress(p.pages ? `Opening the PDF… page ${p.page} of ${p.pages}` : "Opening the PDF…", { fraction: p.pages ? p.progress : null });
        else showOcrProgress(p, p.pages > 1 ? `page ${p.page} of ${p.pages}` : "the page");
      }, cancelled);
      if (cancelled()) return;
      if (scanned) {
        markOcrReady();
        addScannedText(text);
      } else if (!text.trim()) {
        toast("No text found in that PDF.");
      } else {
        await openText(text, title || makeTitle(text));
      }
    }
  } catch (err) {
    if (!(err instanceof Cancelled) && !cancelled()) {
      console.warn("EasyRead import failed.", err);
      toast(importError(kind), 5000);
    }
  } finally {
    if (!cancelled()) setBusy(false);
  }
}

$("#import-cancel").addEventListener("click", () => {
  importJob++;
  cancelOcr();
  setBusy(false);
  toast("Stopped.");
});

$("#scan-btn").addEventListener("click", () => $("#scan-input").click());
$("#open-btn").addEventListener("click", () => $("#file-input").click());
for (const id of ["#scan-input", "#file-input"]) {
  $(id).addEventListener("change", (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) importFile(file);
  });
}

// Wikipedia links work directly. Other websites block apps from reading
// their pages, so for those the reader copies the text instead.
async function importLink(url) {
  const wiki = lookup.parseWikiLink(url);
  if (!wiki) {
    toast("EasyRead can’t open that link. Open the page, select the text and copy it, then tap Paste.", 6000);
    return;
  }
  setBusy(true);
  showProgress("Getting the article from Wikipedia…");
  try {
    const a = await lookup.article(wiki.title, wiki);
    await openText(a.text, a.title, { source: { name: "Wikipedia", url: a.url } });
    input.value = "";
  } catch {
    toast(navigator.onLine ? "Couldn’t get that article." : "Getting an article needs an internet connection.", 5000);
  } finally {
    setBusy(false);
  }
}

$("#paste-btn").addEventListener("click", async () => {
  let text;
  try {
    text = await navigator.clipboard.readText();
  } catch {
    input.focus();
    toast(coarse.matches ? "Press and hold to paste." : isMac ? "Press ⌘V to paste." : "Press Ctrl+V to paste.");
    return;
  }
  if (!text.trim()) {
    toast("The clipboard is empty.");
    return;
  }
  if (lookup.isLink(text)) await importLink(text.trim());
  else insertText(text);
});

$("#read-btn").addEventListener("click", async () => {
  const text = input.value;
  if (!text.trim()) return;
  if (lookup.isLink(text)) {
    await importLink(text.trim());
    updateReadButton();
    return;
  }
  await openText(text, makeTitle(text));
  input.value = "";
  updateReadButton();
});

/* ---------- Look up (Wikipedia) ---------- */

const lookupLang = (navigator.language || "en").slice(0, 2).toLowerCase();
let lookupSimple = lookupLang === "en";
let lookupAbort = null;
$("#simple-switch").hidden = lookupLang !== "en";

$("#lookup-btn").addEventListener("click", (e) => {
  openSheet(lookupSheet, e.currentTarget);
  $("#lookup-input").focus();
});

$("#simple-switch").addEventListener("click", () => {
  lookupSimple = !lookupSimple;
  $("#simple-switch").setAttribute("aria-checked", String(lookupSimple));
  if ($("#lookup-input").value.trim()) runSearch();
});

$("#lookup-form").addEventListener("submit", (e) => {
  e.preventDefault();
  runSearch();
});

function lookupFailed(err) {
  if (err.name === "AbortError") return;
  $("#lookup-status").textContent = navigator.onLine ? "Wikipedia didn’t answer. Try again in a moment." : "Look up needs an internet connection.";
}

async function runSearch() {
  const words = $("#lookup-input").value.trim();
  if (!words) return;
  lookupAbort?.abort();
  lookupAbort = new AbortController();
  const { signal } = lookupAbort;
  const status = $("#lookup-status");
  const list = $("#lookup-results");
  list.replaceChildren();
  status.textContent = "Searching…";
  $("#lookup-input").blur(); // hide the keyboard so the results show
  try {
    let options = { lang: lookupLang, simple: lookupSimple };
    let results = await lookup.search(words, options, signal);
    let note = "";
    if (!results.length && options.simple) {
      options = { ...options, simple: false };
      results = await lookup.search(words, options, signal);
      if (results.length) note = "No simpler article found, so these come from the regular Wikipedia.";
    }
    if (!results.length) {
      status.textContent = `Nothing found for “${words}”. Try other words.`;
      return;
    }
    status.textContent = note;
    list.replaceChildren(...results.map((r) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      const t = document.createElement("span");
      t.className = "result-title";
      t.textContent = r.title;
      const sn = document.createElement("span");
      sn.className = "result-snippet";
      sn.textContent = r.snippet;
      b.append(t, sn);
      b.addEventListener("click", () => openArticle(r.title, options));
      li.append(b);
      return li;
    }));
  } catch (err) {
    lookupFailed(err);
  }
}

async function openArticle(title, options) {
  lookupAbort?.abort();
  lookupAbort = new AbortController();
  $("#lookup-status").textContent = `Getting “${title}”…`;
  try {
    const a = await lookup.article(title, options, lookupAbort.signal);
    closeSheet(true);
    await openText(a.text, a.title, { source: { name: "Wikipedia", url: a.url } });
  } catch (err) {
    lookupFailed(err);
  }
}

/* ---------- Keyboard (Mac and Windows) ---------- */

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!rowMenu.hidden) closeMenu(true);
    else if (openSheetEl) closeSheet();
    else if (readerOpen() && reader.focused) reader.setFocus(false);
    return;
  }
  if (e.key === "Tab" && openSheetEl) {
    trapFocus(e);
    return;
  }
  if (!readerOpen() || openSheetEl || alertDialog.open || !rowMenu.hidden) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;

  switch (e.key) {
    case " ":
      if (e.target.closest?.("button")) return; // the button handles Space itself
      e.preventDefault();
      speaker.toggle();
      break;
    case "ArrowLeft":
      e.preventDefault();
      speaker.prev();
      break;
    case "ArrowRight":
      e.preventDefault();
      speaker.next();
      break;
    case "ArrowUp":
    case "ArrowDown":
      if (settings.get().ruler && !speaker.playing) {
        e.preventDefault();
        reader.moveBandBy(e.key === "ArrowUp" ? -1 : 1);
      }
      break;
    case "+":
    case "=":
      e.preventDefault();
      changeSize(1);
      break;
    case "-":
    case "_":
      e.preventDefault();
      changeSize(-1);
      break;
  }
});

/* ---------- Boot ---------- */

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  if (location.protocol !== "https:" && !local) return;
  navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("EasyRead offline mode is unavailable.", err));
}

async function boot() {
  settings.apply();
  speaker.rate = settings.get().rate;
  speaker.lang = (navigator.language || "en").slice(0, 2).toLowerCase();
  updateSpeedLabel();
  syncSettingsSheet();
  reader.setRuler(settings.get().ruler);

  await library.init(library.newDoc(WELCOME_TITLE, WELCOME_TEXT));
  renderLists();
  route();
  updateVoice();

  setTimeout(selfTest, 0);
  setInterval(() => {
    if (document.visibilityState === "visible") renderLists();
  }, 60000);
  if (document.readyState === "complete") registerServiceWorker();
  else window.addEventListener("load", registerServiceWorker);
}

boot();
