// contrast.js: WCAG contrast math for themes and custom tint.

export const TARGET = 7;      // every reading pair aims for this
export const MINIMUM = 4.5;   // custom tints below this are blocked

const DARK_TEXT = "#24201B";
const LIGHT_TEXT = "#F3EEE6";
const AMBER = [245, 196, 81];

// "#abc", "#aabbcc", "rgb(1, 2, 3)" or "rgba(1, 2, 3, .5)" -> [r, g, b, a]
export function parseColor(str) {
  const s = String(str).trim();
  if (s[0] === "#") {
    let h = s.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const nums = s.match(/[\d.]+%?/g);
  if (!nums || nums.length < 3) return null;
  const a = nums[3] === undefined ? 1 : nums[3].endsWith("%") ? parseFloat(nums[3]) / 100 : parseFloat(nums[3]);
  return [parseFloat(nums[0]), parseFloat(nums[1]), parseFloat(nums[2]), a];
}

export function toHex([r, g, b]) {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function channel(c) {
  c /= 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Paint a translucent color over an opaque one.
export function blend(under, over) {
  const a = over[3] === undefined ? 1 : over[3];
  return [0, 1, 2].map((i) => under[i] * (1 - a) + over[i] * a);
}

const rgba = ([r, g, b], a) => `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+a.toFixed(3)})`;

// Builds every theme property for a user-picked background.
// Returns { vars, ratio, level } where level is "ok", "warn" or "block".
export function customTheme(bgHex) {
  const bg = parseColor(bgHex);
  const dark = parseColor(DARK_TEXT);
  const light = parseColor(LIGHT_TEXT);
  const darkRatio = contrast(dark, bg);
  const lightRatio = contrast(light, bg);
  const isDark = lightRatio > darkRatio;
  const text = isDark ? light : dark;
  const ratio = isDark ? lightRatio : darkRatio;
  const level = ratio >= TARGET ? "ok" : ratio >= MINIMUM ? "warn" : "block";

  // Fade the highlight until the text on it still reaches the target.
  let hlAlpha = isDark ? 0.24 : 0.38;
  while (hlAlpha > 0.12 && contrast(text, blend(bg, [...AMBER, hlAlpha])) < Math.min(TARGET, ratio)) hlAlpha -= 0.02;
  const hl = [...AMBER, hlAlpha];
  const underWord = blend(bg, hl);
  const wordText = isDark ? [255, 255, 255] : text;
  let wordAlpha = isDark ? 0.1 : 0.42;
  while (wordAlpha > 0.06 && contrast(wordText, blend(underWord, [...AMBER, wordAlpha])) < Math.min(TARGET, ratio)) wordAlpha -= 0.02;

  let mutedAlpha = 0.68;
  while (mutedAlpha < 1 && contrast(blend(bg, [...text, mutedAlpha]), bg) < MINIMUM) mutedAlpha += 0.04;
  const muted = blend(bg, [...text, Math.min(1, mutedAlpha)]);

  const white = [255, 255, 255];
  const vars = isDark
    ? {
        "color-scheme": "dark",
        "--surface": rgba(blend(bg, [...white, 0.08]), 0.88),
        "--surface-solid": toHex(blend(bg, [...white, 0.09])),
        "--field": toHex(blend(bg, [...white, 0.05])),
        "--fill": rgba(text, 0.08),
        "--fill-strong": rgba(text, 0.14),
        "--separator": rgba(text, 0.14),
        "--accent": "#F2C14E",
        "--on-accent": "#1F1C17",
        "--danger": "#FF8A80",
        "--shadow": "0 8px 30px rgba(0, 0, 0, 0.32)",
        "--shadow-strong": "0 12px 40px rgba(0, 0, 0, 0.45)",
      }
    : {
        "color-scheme": "light",
        "--surface": rgba(blend(bg, [...white, 0.6]), 0.86),
        "--surface-solid": toHex(blend(bg, [...white, 0.7])),
        "--field": toHex(blend(bg, [...white, 0.7])),
        "--fill": rgba(text, 0.06),
        "--fill-strong": rgba(text, 0.11),
        "--separator": rgba(text, 0.12),
        "--accent": "#E9A93B",
        "--on-accent": "#2B2620",
        "--danger": "#B3261E",
        "--shadow": "0 8px 30px rgba(0, 0, 0, 0.08)",
        "--shadow-strong": "0 12px 40px rgba(0, 0, 0, 0.16)",
      };

  Object.assign(vars, {
    "--bg": toHex(bg),
    "--bg-rgb": bg.slice(0, 3).map(Math.round).join(", "),
    "--text": toHex(text),
    "--muted": toHex(muted),
    "--hl": rgba(AMBER, hlAlpha),
    "--word-bg": rgba(AMBER, wordAlpha),
    "--word-text": toHex(wordText),
  });

  return { vars, ratio, level };
}

// Reads each theme straight from the stylesheet and checks it.
// Logs a warning for anything under 7:1. Returns the results.
export function selfTest() {
  const themes = {};
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of Array.from(rules || [])) {
      const sel = rule.selectorText || "";
      const names = Array.from(sel.matchAll(/data-theme="?([\w-]+)"?/g), (m) => m[1]);
      if (!names.length || !rule.style.getPropertyValue("--bg")) continue;
      for (const name of names) themes[name] = rule.style;
    }
  }

  const results = [];
  for (const [name, style] of Object.entries(themes)) {
    const get = (p) => parseColor(style.getPropertyValue(p));
    const bg = get("--bg");
    const text = get("--text");
    const sentenceBg = blend(bg, get("--hl"));
    const wordBg = blend(sentenceBg, get("--word-bg"));
    const pairs = {
      "text on background": contrast(text, bg),
      "text on sentence highlight": contrast(text, sentenceBg),
      "text on word highlight": contrast(get("--word-text"), wordBg),
    };
    for (const [pair, ratio] of Object.entries(pairs)) {
      const ok = ratio >= TARGET;
      results.push({ theme: name, pair, ratio: +ratio.toFixed(2), ok });
      if (!ok) console.warn(`EasyRead contrast: ${name} ${pair} is ${ratio.toFixed(2)}:1, under ${TARGET}:1.`);
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  if (!failed) console.info(`EasyRead contrast self-test passed: ${Object.keys(themes).length} themes, all pairs at ${TARGET}:1 or better.`);
  return results;
}
