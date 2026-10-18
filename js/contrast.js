// contrast.js: WCAG contrast self-test for the themes (development only).

export const TARGET = 7; // every text/background pair must reach this

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
