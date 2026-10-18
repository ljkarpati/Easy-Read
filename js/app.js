// app.js: boot and routing (Library ⇄ Reader).

import * as settings from "./settings.js";
import * as library from "./library.js";
import { parse, detectLang, makeTitle } from "./text.js";
import { Speaker, supported as speechSupported, voicesFor, pickVoice, onVoicesChanged, isIOS, isBroken, forgiveVoice, DEVICE_DEFAULT } from "./voice-device.js";
import { Reader } from "./reader.js";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const libraryView = $("#library");
const readerView = $("#reader");
const newSheet = $("#new-sheet");
const lookSheet = $("#look-sheet");
const newText = $("#new-text");

const wide = window.matchMedia("(min-width: 900px)");
const coarse = window.matchMedia("(pointer: coarse)");
const isMac = /Mac/.test(navigator.platform || "") && !isIOS;
const inAppBrowser = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Snapchat|musical_ly|TikTok|BytedanceWebview|Line\/|MicroMessenger|LinkedInApp|Pinterest/i.test(navigator.userAgent);

const RATES = [0.75, 1, 1.25, 1.5];
const LAYOUT_KEYS = ["font", "size", "spacing"];

const WELCOME_TITLE = "Welcome to EasyRead";
const WELCOME_TEXT = `Welcome to EasyRead.

Tap the plus button to add something to read.

Tap play to hear it, one sentence at a time.

Tap Aa to change the colors, the size and the spacing.

Your text stays on this device.`;

let currentId = null;
let cameFromLibrary = false;
let noSoundShown = false;

/* ---------- Toast ---------- */

let toastTimer = 0;
function toast(message, ms = 3200) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

function pasteHint() {
  return coarse.matches ? "Press and hold to paste." : isMac ? "Press ⌘V to paste." : "Press Ctrl+V to paste.";
}

/* ---------- Sheets ---------- */

let openSheetEl = null;
let sheetOpener = null;

function openSheet(sheet, opener) {
  if (openSheetEl === sheet) return;
  closeSheet(true);
  openSheetEl = sheet;
  sheetOpener = opener || document.activeElement;
  const backdrop = $("#backdrop");
  backdrop.hidden = false;
  backdrop.classList.toggle("dim", sheet === newSheet);
  sheet.hidden = false;
  sheet.getBoundingClientRect(); // start the slide from the closed position
  sheet.classList.add("open");
  if (sheet === lookSheet) {
    showLookPage("main", false);
    syncLook();
    $("#aa-btn").setAttribute("aria-expanded", "true");
    sheet.focus({ preventScroll: true });
  }
}

function closeSheet(immediate = false) {
  const sheet = openSheetEl;
  if (!sheet) return;
  openSheetEl = null;
  sheet.classList.remove("open");
  $("#backdrop").hidden = true;
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
  const items = Array.from(openSheetEl.querySelectorAll("button, input, select, textarea")).filter((el) => !el.disabled && el.offsetParent !== null);
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

// Drag the Aa sheet down by its top edge to close it (phone layout).
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

lookSheet.tabIndex = -1;
enableSheetDrag(lookSheet);
$("#backdrop").addEventListener("click", () => closeSheet());

/* ---------- Library ---------- */

const relative = typeof Intl.RelativeTimeFormat === "function" ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;

function timeAgo(t) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return { short: "now", long: "just now" };
  const units = [["minute", 60, "m", 3600], ["hour", 3600, "h", 86400], ["day", 86400, "d", 604800], ["week", 604800, "w", 2592000]];
  for (const [unit, size, abbr, limit] of units) {
    if (s < limit) {
      const n = Math.floor(s / size);
      return { short: n + abbr, long: relative ? relative.format(-n, unit) : `${n} ${unit}s ago` };
    }
  }
  const date = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(t);
  return { short: date, long: date };
}

// The first bit of text after the title, on one line.
function previewOf(doc) {
  let text = doc.text.replace(/\s+/g, " ").trim();
  const title = doc.title.replace(/…$/, "").trim();
  if (text.toLowerCase().startsWith(title.toLowerCase())) text = text.slice(title.length).replace(/^[\s.!?:;,]+/, "");
  return text.slice(0, 160);
}

function rowFor(doc) {
  const li = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "doc-row";
  button.dataset.open = doc.id;
  if (doc.id === currentId) {
    button.classList.add("active");
    button.setAttribute("aria-current", "page");
  }
  const when = timeAgo(doc.updatedAt);
  button.setAttribute("aria-label", `${doc.title}, ${when.long}`);

  const title = document.createElement("span");
  title.className = "doc-title";
  title.textContent = doc.title;
  const sub = document.createElement("span");
  sub.className = "doc-sub";
  const preview = document.createElement("span");
  preview.className = "doc-preview";
  preview.textContent = previewOf(doc);
  const time = document.createElement("time");
  time.className = "doc-time";
  time.dateTime = new Date(doc.updatedAt).toISOString();
  time.textContent = when.short;
  sub.append(preview, time);
  button.append(title, sub);
  li.append(button);
  return li;
}

function renderLibrary() {
  const docs = library.list();
  $("#doc-list").replaceChildren(...docs.map(rowFor));
  $("#doc-list").hidden = !docs.length;
  $("#empty").hidden = !!docs.length;
}

$("#doc-list").addEventListener("click", (e) => {
  const row = e.target.closest("[data-open]");
  if (!row) return;
  cameFromLibrary = !wide.matches;
  go("#/doc/" + encodeURIComponent(row.dataset.open));
});

library.onChange(() => {
  renderLibrary();
  const doc = currentId && library.get(currentId);
  if (doc) {
    $("#bar-title").textContent = doc.title;
    document.title = `${doc.title} – EasyRead`;
  }
});

/* ---------- Routing ---------- */

function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function route() {
  const m = location.hash.match(/^#\/doc\/(.+)$/);
  if (m) openDoc(decodeURIComponent(m[1]));
  else showLibrary();
}

window.addEventListener("hashchange", route);

function leaveReader() {
  if (!currentId) return;
  speaker.stop();
  saveProgress(true);
  closeSheet(true);
}

function showLibrary() {
  leaveReader();
  currentId = null;
  cameFromLibrary = false;
  // On iPad and Mac the library is a sidebar, so open the latest text beside it.
  const latest = library.list()[0];
  if (wide.matches && latest) {
    location.replace("#/doc/" + encodeURIComponent(latest.id));
    return;
  }
  readerView.hidden = true;
  libraryView.hidden = false;
  document.title = "EasyRead";
  renderLibrary();
}

function openDoc(id) {
  const doc = library.get(id);
  if (!doc) {
    location.replace("#/");
    return;
  }
  if (id === currentId && !readerView.hidden) return;
  leaveReader();
  currentId = id;

  const lang = detectLang(doc.text);
  const parsed = parse(doc.text, lang);
  libraryView.hidden = !wide.matches;
  readerView.hidden = false;
  reader.render(parsed, lang, doc.title);
  $("#bar-title").textContent = doc.title;
  document.title = `${doc.title} – EasyRead`;

  speaker.load(parsed.sentences, lang, doc.lastSentence || 0);
  updateVoice();
  const resume = doc.lastSentence || 0;
  if (resume > 0 && resume < parsed.sentences.length) {
    reader.setCurrent(resume, false);
    reader.scrollToSentence(resume);
  }
  reader.setRuler(settings.get().ruler);
  library.update(id, {}, { touch: true }); // moves it to the top of the library
}

wide.addEventListener?.("change", () => {
  if (currentId) libraryView.hidden = !wide.matches;
  else route();
});

$("#back-btn").addEventListener("click", () => {
  if (cameFromLibrary && history.length > 1) history.back();
  else go("#/");
});

/* ---------- New text ---------- */

function updateReadButton() {
  $("#new-read").disabled = !newText.value.trim();
}

function openNew(opener) {
  newText.value = "";
  updateReadButton();
  openSheet(newSheet, opener);
  newText.focus(); // inside the tap, so the iPhone keyboard opens
}

async function createFromText(text, title) {
  const clean = String(text).trim();
  if (!clean) return;
  const doc = library.findByText(clean) || (await library.add(title || makeTitle(clean), clean));
  closeSheet(true);
  cameFromLibrary = !wide.matches;
  go("#/doc/" + encodeURIComponent(doc.id));
}

async function readClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

$("#new-btn").addEventListener("click", (e) => openNew(e.currentTarget));
$("#new-cancel").addEventListener("click", () => closeSheet());
$("#new-read").addEventListener("click", () => createFromText(newText.value));
newText.addEventListener("input", updateReadButton);
newText.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) createFromText(newText.value);
});

$("#new-paste").addEventListener("click", async () => {
  const text = await readClipboard();
  if (text === null) {
    newText.focus();
    toast(pasteHint());
    return;
  }
  if (!text.trim()) {
    toast("The clipboard is empty.");
    return;
  }
  const current = newText.value.replace(/\s+$/, "");
  newText.value = current ? `${current}\n\n${text}` : text;
  updateReadButton();
});

// The empty library's Paste button goes straight to reading.
$("#empty-paste").addEventListener("click", async (e) => {
  const text = await readClipboard();
  if (text && text.trim()) {
    createFromText(text);
    return;
  }
  openNew(e.currentTarget);
  toast(text === null ? pasteHint() : "The clipboard is empty.");
});

async function readTextFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes); // older Windows files
  }
}

$("#new-open").addEventListener("click", () => $("#file-input").click());
$("#file-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const text = await readTextFile(file);
  if (!text.trim()) {
    toast("That file is empty.");
    return;
  }
  createFromText(text, file.name.replace(/\.txt$/i, "").trim() || makeTitle(text));
});

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
      reader.showBar();
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
    toast("No sound? Check volume and the silent switch.", 5000);
  },
  onUnsupported() {
    $("#no-voice").hidden = false;
  },
  onVoiceFailed(bad) {
    const s = settings.get();
    const next = pickVoice(speaker.lang, s.voices[speaker.lang], false);
    speaker.setVoice(next);
    syncVoices();
    toast(`“${bad.name}” didn’t play here, so EasyRead switched to ${next ? `“${next.name}”` : "the device voice"}.`, 6000);
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

function rateLabel(rate) {
  return `${+rate.toFixed(2)}×`;
}

function updateSpeedLabel() {
  const rate = settings.get().rate;
  $("#speed-btn").textContent = rateLabel(rate);
  $("#speed-btn").setAttribute("aria-label", `Speed ${+rate.toFixed(2)} times`);
}

$("#aa-btn").addEventListener("click", (e) => {
  if (openSheetEl === lookSheet) closeSheet();
  else openSheet(lookSheet, e.currentTarget);
});

// In-app browsers (Instagram, TikTok…) often block read-aloud.
if (!speechSupported || inAppBrowser) $("#no-voice").hidden = false;
if (!speechSupported) $("#player").hidden = true;

$("#copy-link").addEventListener("click", async () => {
  const link = location.href.split("#")[0];
  try {
    await navigator.clipboard.writeText(link);
    toast("Link copied.");
  } catch {
    window.prompt("Copy this link:", link);
  }
});

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
  speaker.setVoice(pickVoice(speaker.lang, s.voices[speaker.lang], false));
  syncVoices();
}

// "Best available" is stored as an empty choice: EasyRead picks for you.
function chosenVoiceURI() {
  return settings.get().voices[speaker.lang] || "";
}

function syncVoices() {
  const chosen = chosenVoiceURI();
  const current = speaker.voice;
  $("#voice-name").textContent = !speechSupported ? "Not available" : chosen && current ? current.name : "Best available";

  const list = $("#voice-list");
  const rows = [{ uri: "", name: "Best available", note: !chosen && current ? current.name : "" }];
  for (const v of voicesFor(speaker.lang, false)) rows.push({ uri: v.voiceURI, name: v.name, note: isBroken(v) ? "Didn’t play here" : "" });
  list.replaceChildren(...rows.map((r) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", String(r.uri === chosen));
    b.dataset.uri = r.uri;
    const text = document.createElement("span");
    text.textContent = r.name;
    if (r.note) {
      const note = document.createElement("span");
      note.className = "voice-note";
      note.textContent = ` · ${r.note}`;
      text.append(note);
    }
    b.append(text);
    b.insertAdjacentHTML("beforeend", '<svg class="icon"><use href="#i-check"/></svg>');
    li.append(b);
    return li;
  }));
  $("#voice-foot").hidden = !(isIOS || isMac);
}

// Choosing a voice selects it and plays a short sample.
$("#voice-list").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-uri]");
  if (!b) return;
  const uri = b.dataset.uri;
  if (uri) forgiveVoice(voicesFor(speaker.lang, true).find((v) => v.voiceURI === uri));
  settings.set({ voices: { ...settings.get().voices, [speaker.lang]: uri } });
  speaker.sample("This is how I sound.");
});

onVoicesChanged(updateVoice);

/* ---------- "Aa" sheet ---------- */

// Settings that move text around: keep the reader's place.
function setLayout(patch) {
  const anchor = readerView.hidden ? null : reader.captureAnchor();
  settings.set(patch);
  if (!anchor) return;
  reader.restoreAnchor(anchor);
  if ("font" in patch && document.fonts?.ready) document.fonts.ready.then(() => reader.restoreAnchor(anchor));
}

function changeSize(step) {
  const size = Math.max(settings.SIZE_MIN, Math.min(settings.SIZE_MAX, settings.effectiveSize() + step * settings.SIZE_STEP));
  setLayout({ size });
}

function showLookPage(name, moveFocus = true) {
  $("#look-main").hidden = name !== "main";
  $("#look-voices").hidden = name !== "voices";
  if (name === "voices") syncVoices();
  if (moveFocus) $(name === "voices" ? "#voices-back" : "#voice-row").focus({ preventScroll: true });
}

function syncLook() {
  const s = settings.get();
  const theme = settings.resolvedTheme();
  for (const b of $$("[data-theme-choice]")) b.setAttribute("aria-pressed", String(b.dataset.themeChoice === theme));
  for (const seg of $$(".seg[data-setting]")) {
    const value = s[seg.dataset.setting];
    for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.value === value));
  }
  const size = settings.effectiveSize();
  $("#size-down").disabled = size <= settings.SIZE_MIN;
  $("#size-up").disabled = size >= settings.SIZE_MAX;
  $("#ruler-switch").setAttribute("aria-checked", String(s.ruler));
  syncVoices();
}

$("#size-down").addEventListener("click", () => changeSize(-1));
$("#size-up").addEventListener("click", () => changeSize(1));

// Tapping a swatch stops following the device's light or dark mode.
$("#theme-swatches").addEventListener("click", (e) => {
  const choice = e.target.closest("[data-theme-choice]")?.dataset.themeChoice;
  if (choice) settings.set({ theme: choice });
});

for (const seg of $$(".seg[data-setting]")) {
  seg.addEventListener("click", (e) => {
    const value = e.target.closest("button[data-value]")?.dataset.value;
    if (value) setLayout({ [seg.dataset.setting]: value });
  });
}

$("#ruler-switch").addEventListener("click", () => settings.set({ ruler: !settings.get().ruler }));
$("#voice-row").addEventListener("click", () => showLookPage("voices"));
$("#voices-back").addEventListener("click", () => showLookPage("main"));

settings.onChange((s, patch) => {
  if ("rate" in patch) {
    speaker.setRate(s.rate);
    updateSpeedLabel();
  }
  if ("ruler" in patch) reader.setRuler(s.ruler);
  if ("voices" in patch) updateVoice();
  if (LAYOUT_KEYS.some((k) => k in patch)) reader.updateRuler();
  if (openSheetEl === lookSheet) syncLook();
});

/* ---------- Keyboard ---------- */

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (openSheetEl === lookSheet && !$("#look-voices").hidden) showLookPage("main");
    else if (openSheetEl) closeSheet();
    return;
  }
  if (e.key === "Tab" && openSheetEl) {
    trapFocus(e);
    return;
  }
  if (readerView.hidden || openSheetEl) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return; // leave browser shortcuts alone
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  if (e.key === " ") {
    if (e.target.closest?.("button")) return; // the button handles Space itself
    e.preventDefault();
    speaker.toggle();
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    speaker.prev();
  } else if (e.key === "ArrowRight") {
    e.preventDefault();
    speaker.next();
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
  const s = settings.get();
  if (!RATES.includes(s.rate)) settings.set({ rate: 1 });
  speaker.rate = settings.get().rate;
  speaker.lang = (navigator.language || "en").slice(0, 2).toLowerCase();
  updateSpeedLabel();
  reader.setRuler(s.ruler);

  await library.init(library.newDoc(WELCOME_TITLE, WELCOME_TEXT));
  renderLibrary();
  route();
  updateVoice();

  // The contrast self-test runs only during development.
  if (["localhost", "127.0.0.1"].includes(location.hostname)) import("./contrast.js").then((m) => m.selfTest());

  setInterval(() => {
    if (document.visibilityState === "visible") renderLibrary();
  }, 60000);
  if (document.readyState === "complete") registerServiceWorker();
  else window.addEventListener("load", registerServiceWorker);
}

boot();
