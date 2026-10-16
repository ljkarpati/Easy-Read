// lookup.js: finds a topic on Wikipedia and brings back its text.
// Only the search words (or the article name) are sent, and only to
// Wikipedia, which allows apps like this to read it directly.

// Sections at the end of an article that aren't worth reading aloud.
const END_SECTIONS = /^(References|Notes|Sources|Bibliography|Citations|Footnotes|Further reading|External links|Other websites|Related pages|See also|Gallery)$/i;

export function wikiHost({ simple, lang }) {
  return simple && lang === "en" ? "simple.wikipedia.org" : `${lang}.wikipedia.org`;
}

async function api(host, params, signal) {
  const query = new URLSearchParams({ ...params, format: "json", formatversion: "2", origin: "*" });
  const res = await fetch(`https://${host}/w/api.php?${query}`, { signal });
  if (!res.ok) throw new Error(`Wikipedia answered ${res.status}`);
  return res.json();
}

function plain(html) {
  return new DOMParser().parseFromString(html || "", "text/html").body.textContent.trim();
}

export async function search(words, options, signal) {
  const data = await api(wikiHost(options), { action: "query", list: "search", srsearch: words, srlimit: "8", srprop: "snippet" }, signal);
  return (data.query?.search || []).map((r) => ({ title: r.title, snippet: plain(r.snippet) }));
}

export function cleanExtract(text) {
  const kept = [];
  for (const line of String(text).split("\n")) {
    if (END_SECTIONS.test(line.trim())) break;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function article(title, options, signal) {
  const host = wikiHost(options);
  const data = await api(host, {
    action: "query",
    prop: "extracts",
    explaintext: "1",
    exsectionformat: "plain",
    redirects: "1",
    titles: title,
  }, signal);
  const page = data.query?.pages?.[0];
  if (!page || page.missing || !page.extract) throw new Error("Article not found");
  return {
    title: page.title,
    text: cleanExtract(page.extract),
    url: `https://${host}/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
  };
}

// "https://en.wikipedia.org/wiki/Photosynthesis" -> { lang: "en", simple: false, title: "Photosynthesis" }
export function parseWikiLink(text) {
  let url;
  try {
    url = new URL(String(text).trim());
  } catch {
    return null;
  }
  const m = url.hostname.match(/^(?:([a-z-]+)\.)?(?:m\.)?wikipedia\.org$/i);
  if (!m || !url.pathname.startsWith("/wiki/")) return null;
  const sub = (m[1] || "en").toLowerCase();
  const title = decodeURIComponent(url.pathname.slice(6)).replace(/_/g, " ");
  if (!title) return null;
  return sub === "simple" ? { lang: "en", simple: true, title } : { lang: sub, simple: false, title };
}

export function isLink(text) {
  return /^https?:\/\/\S+$/i.test(String(text).trim());
}
