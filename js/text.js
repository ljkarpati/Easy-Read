// text.js: splits text into paragraphs, sentences and words.

const MAX_SENTENCE = 220;

// A line that starts like a list item keeps its own line.
const LIST_ITEM = /^(?:[-*•‣◦▪–—]\s|\(?\d{1,3}[.)]\s|\(?[a-zA-Z]\)\s)/;

// Lines shorter than this are treated as deliberate breaks (addresses,
// lists, headings). Longer ones are joined, which undoes hard wrapping
// in text copied from PDFs and emails.
const SHORT_LINE = 45;

// Sentence breaks after these are almost always wrong.
const ABBREVIATION = /(?:^|[\s(])(?:Mr|Mrs|Ms|Mx|Dr|Prof|Sr|Jr|St|Mt|vs|e\.g|i\.e|No|Fig|approx|Ave|Rd|Inc|Ltd|Co|Gen|Col|Lt|Sgt|Capt|Rev|Hon|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|[A-Z])\.$/;

const segmenters = new Map();

function segmenter(lang, granularity) {
  const key = lang + ":" + granularity;
  if (!segmenters.has(key)) {
    let seg = null;
    try {
      if (typeof Intl !== "undefined" && Intl.Segmenter) seg = new Intl.Segmenter(lang, { granularity });
    } catch {
      seg = null;
    }
    segmenters.set(key, seg);
  }
  return segmenters.get(key);
}

// Paragraphs are separated by blank lines. Inside a paragraph, short
// lines and list items stay on their own line ("tight" blocks).
export function splitBlocks(text) {
  const blocks = [];
  const paragraphs = String(text).replace(/\r\n?/g, "\n").split(/\n\s*\n/);
  for (const para of paragraphs) {
    const lines = para.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!lines.length) continue;
    const groups = [];
    let current = lines[0];
    let previous = lines[0];
    for (const line of lines.slice(1)) {
      if (LIST_ITEM.test(line) || previous.length < SHORT_LINE || /:$/.test(previous)) {
        groups.push(current);
        current = line;
      } else {
        current += " " + line;
      }
      previous = line;
    }
    groups.push(current);
    groups.forEach((g, i) => blocks.push({ text: g, tight: i < groups.length - 1 }));
  }
  return blocks;
}

// Long utterances can stall some browsers, so split at commas and
// semicolons (or spaces as a last resort).
export function splitLong(sentence) {
  const out = [];
  let rest = sentence;
  while (rest.length > MAX_SENTENCE) {
    const window = rest.slice(0, MAX_SENTENCE);
    let cut = Math.max(window.lastIndexOf(", "), window.lastIndexOf("; "), window.lastIndexOf(": "), window.lastIndexOf(" – "), window.lastIndexOf(" — "));
    if (cut < 60) cut = window.lastIndexOf(" ");
    if (cut <= 0) cut = MAX_SENTENCE - 1;
    out.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export function splitSentences(text, lang = "en") {
  const seg = segmenter(lang, "sentence");
  let parts;
  if (seg) {
    parts = Array.from(seg.segment(text), (s) => s.segment);
  } else {
    parts = text.match(/[^.!?…]+(?:[.!?…]+["'”’)\]]*|$)\s*/g) || [text];
  }
  const merged = [];
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const last = merged.length - 1;
    if (last >= 0 && ABBREVIATION.test(merged[last])) merged[last] += " " + p;
    else merged.push(p);
  }
  return merged.flatMap(splitLong);
}

// Character offsets of each word inside the sentence.
export function splitWords(sentence, lang = "en") {
  const words = [];
  const seg = segmenter(lang, "word");
  if (seg) {
    for (const { segment, index, isWordLike } of seg.segment(sentence)) {
      if (isWordLike) words.push({ start: index, end: index + segment.length });
    }
  } else {
    for (const m of sentence.matchAll(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)) {
      words.push({ start: m.index, end: m.index + m[0].length });
    }
  }
  return words;
}

// { blocks: [{ tight, sentences: [index] }], sentences: [{ text, words, block }] }
export function parse(text, lang = "en") {
  const sentences = [];
  const blocks = splitBlocks(text).map((b, bi) => ({
    tight: b.tight,
    sentences: splitSentences(b.text, lang).map((t) => {
      sentences.push({ text: t, words: splitWords(t, lang), block: bi });
      return sentences.length - 1;
    }),
  }));
  return { blocks, sentences };
}

// The first line, or the first six words if there is no line break.
export function makeTitle(text) {
  const t = String(text).trim();
  if (!t) return "Untitled";
  const firstLine = t.split("\n")[0].trim();
  const words = firstLine.split(/\s+/);
  const useFirstLine = t.includes("\n") && words.length <= 10;
  let title = useFirstLine ? firstLine : words.slice(0, 6).join(" ");
  if (!useFirstLine && words.length > 6) title = title.replace(/[\s.,;:!?–—-]+$/u, "") + "…";
  if (title.length > 60) title = title.slice(0, 57).replace(/\s+\S*$/, "") + "…";
  return title;
}

const COMMON_WORDS = {
  en: "the and of to is in that it you was for are with this on have be not they his her",
  es: "el la de que y en los las del se por un una es con para no su al lo como",
  fr: "le la les de des et est un une que du en pour dans pas qui sur au il elle",
  de: "der die das und ist nicht ein eine zu den mit von sich auf ich es dem wir",
  it: "il di che la e un una per non sono del della con è gli le si da al",
  pt: "o a de que e do da em um uma para não com os é no na se por as",
  nl: "de het een en van is dat niet op te zijn met voor ik je die er",
};
const WORD_SETS = Object.fromEntries(Object.entries(COMMON_WORDS).map(([k, v]) => [k, new Set(v.split(" "))]));

// Guesses the document language from its most common words.
export function detectLang(text) {
  const fallback = (navigator.language || "en").slice(0, 2).toLowerCase();
  const words = String(text).slice(0, 4000).toLowerCase().match(/\p{L}+/gu) || [];
  const scores = Object.fromEntries(Object.keys(WORD_SETS).map((k) => [k, 0]));
  for (const w of words) {
    for (const [lang, set] of Object.entries(WORD_SETS)) if (set.has(w)) scores[lang]++;
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (best[1] >= 3 && best[1] > second[1] * 1.2) return best[0];
  return fallback;
}
