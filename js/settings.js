// settings.js: themes, fonts and spacing; saved to localStorage.

import { customTheme } from "./contrast.js";

const KEY = "easyread.settings";

export const DEFAULTS = Object.freeze({
  theme: "auto",          // auto | paper | clear | sky | dusk | night | custom
  customBg: null,
  customVars: null,
  font: "lexend",         // lexend | atkinson | opendyslexic | system
  size: null,             // null = 20px on phone, 22px on iPad and Mac
  spacing: "comfortable", // normal | comfortable | wide | custom
  letter: 0.04,           // custom letter spacing in em; word spacing is 3.5x this
  lineHeight: 1.7,        // custom line spacing
  width: "medium",        // narrow | medium | wide
  ruler: false,
  rate: 1,
  voices: {},             // language -> voiceURI
  onlineVoices: false,
});

export const SPACING = {
  normal: { letter: 0, word: 0 },
  comfortable: { letter: 0.04, word: 0.14 },
  wide: { letter: 0.08, word: 0.28 },
};

export const WIDTHS = { narrow: 50, medium: 62, wide: 72 };

const FONTS = {
  lexend: '"Lexend", var(--sys-font)',
  atkinson: '"Atkinson Hyperlegible", var(--sys-font)',
  opendyslexic: '"OpenDyslexic", var(--sys-font)',
  system: "var(--sys-font)",
};

export const SIZE_MIN = 16;
export const SIZE_MAX = 34;

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const bigQuery = window.matchMedia("(min-width: 744px)");
const listeners = new Set();
let state = load();
let customKeys = [];

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object") return { ...DEFAULTS, ...saved, voices: { ...(saved.voices || {}) } };
  } catch {
    // Storage blocked or corrupt: fall back to defaults.
  }
  return { ...DEFAULTS, voices: {} };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked: settings still work for this visit.
  }
}

export function get() {
  return state;
}

export function set(patch) {
  state = { ...state, ...patch };
  save();
  apply();
  listeners.forEach((fn) => fn(state, patch));
}

export function reset() {
  set({ ...DEFAULTS, voices: {} });
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resolvedTheme() {
  if (state.theme === "auto") return darkQuery.matches ? "dusk" : "paper";
  if (state.theme === "custom" && !state.customVars) return "paper";
  return state.theme;
}

export function effectiveSize() {
  return state.size || (bigQuery.matches ? 22 : 20);
}

export function spacingValues() {
  if (state.spacing === "custom") {
    return { letter: state.letter, word: +(state.letter * 3.5).toFixed(3), line: state.lineHeight };
  }
  const p = SPACING[state.spacing] || SPACING.comfortable;
  return { letter: p.letter, word: p.word, line: 1.7 };
}

export function apply() {
  const root = document.documentElement;
  const theme = resolvedTheme();

  customKeys.forEach((k) => root.style.removeProperty(k));
  customKeys = [];
  if (theme === "custom") {
    const vars = state.customVars || customTheme(state.customBg).vars;
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    customKeys = Object.keys(vars);
  }
  root.dataset.theme = theme;

  root.style.setProperty("--read-font", FONTS[state.font] || FONTS.lexend);
  if (state.size) root.style.setProperty("--read-size", state.size + "px");
  else root.style.removeProperty("--read-size");

  const sp = spacingValues();
  root.style.setProperty("--ls", sp.letter + "em");
  root.style.setProperty("--ws", sp.word + "em");
  root.style.setProperty("--lh", String(sp.line));
  root.style.setProperty("--measure", String(WIDTHS[state.width] || WIDTHS.medium));

  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && bg) meta.setAttribute("content", bg);
}

darkQuery.addEventListener?.("change", () => {
  if (state.theme === "auto") {
    apply();
    listeners.forEach((fn) => fn(state, { theme: "auto" }));
  }
});
