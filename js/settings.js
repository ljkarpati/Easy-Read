// settings.js: theme, font, size, spacing and voice, saved to localStorage.

const KEY = "easyread.settings";

export const DEFAULTS = Object.freeze({
  theme: "auto",       // auto (follows the device until a swatch is tapped) | paper | sky | dark | night
  font: "dyslexic",    // dyslexic (OpenDyslexic) | standard (Atkinson Hyperlegible)
  size: null,          // null = 19px on phone, 21px on iPad and Mac
  spacing: "normal",   // normal | wide
  ruler: false,        // line focus
  rate: 1,
  voices: {},          // language -> voiceURI
});

export const SPACING = {
  normal: { letter: 0, word: 0, line: 1.8 },
  wide: { letter: 0.06, word: 0.21, line: 2 },
};

const FONTS = {
  dyslexic: '"OpenDyslexic", var(--sys-font)',
  standard: '"Atkinson Hyperlegible", var(--sys-font)',
};

export const SIZE_MIN = 15;
export const SIZE_MAX = 33;
export const SIZE_STEP = 2;

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");
const bigQuery = window.matchMedia("(min-width: 744px)");
const listeners = new Set();
let state = load();

// Older saves used options that no longer exist; map them to today's.
function migrate(saved) {
  const s = { ...DEFAULTS, ...saved, voices: { ...(saved.voices || {}) } };
  if (!FONTS[s.font]) s.font = s.font === "atkinson" ? "standard" : "dyslexic";
  if (!SPACING[s.spacing]) s.spacing = s.spacing === "wide" || s.spacing === "extra" ? "wide" : "normal";
  if (s.theme === "dusk") s.theme = "dark";
  if (!["auto", "paper", "sky", "dark", "night"].includes(s.theme)) s.theme = "paper";
  for (const old of ["customBg", "customVars", "width", "letter", "lineHeight", "dyslexiaMode", "beforeDyslexia", "onlineVoices"]) delete s[old];
  return s;
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (saved && typeof saved === "object") return migrate(saved);
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

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resolvedTheme() {
  if (state.theme === "auto") return darkQuery.matches ? "dark" : "paper";
  return state.theme;
}

export function effectiveSize() {
  return state.size || (bigQuery.matches ? 21 : 19);
}

export function apply() {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme();
  root.style.setProperty("--read-font", FONTS[state.font] || FONTS.dyslexic);
  if (state.size) root.style.setProperty("--read-size", state.size + "px");
  else root.style.removeProperty("--read-size");
  const sp = SPACING[state.spacing] || SPACING.normal;
  root.style.setProperty("--ls", sp.letter + "em");
  root.style.setProperty("--ws", sp.word + "em");
  root.style.setProperty("--lh", String(sp.line));

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
