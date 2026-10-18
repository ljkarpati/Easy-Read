// voice-device.js: read-aloud with the device's own voices (Web Speech).
// One utterance per sentence. Pause cancels speech and remembers the
// sentence, because pause() and resume() are unreliable in some browsers.

const synth = window.speechSynthesis;
export const supported = !!(synth && window.SpeechSynthesisUtterance);

export const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);

/* ---------- Voices ---------- */

let voices = [];
let voicesKey = "";
const voiceListeners = new Set();
const notify = () => voiceListeners.forEach((fn) => fn());

// Safari hands back new voice objects on every call, so compare the
// list by name, not by object, or the reader restarts for no reason.
function refreshVoices() {
  const next = synth.getVoices() || [];
  const key = next.map((v) => v.voiceURI + "|" + v.name).join("\n");
  if (key === voicesKey) return;
  voices = next;
  voicesKey = key;
  if (next.length) forgetBrokenIfVoicesChanged(key);
  notify();
}

export function onVoicesChanged(fn) {
  voiceListeners.add(fn);
  return () => voiceListeners.delete(fn);
}

/* ---------- Voice quality ---------- */

// Quality ratings come from Readium's open voice list (voices/en.json,
// BSD 3-Clause, see voices/license.txt). For other languages, or before
// the list has loaded, EasyRead goes by the name: Premium, then Enhanced.
const RANK = { veryHigh: 5, high: 4, normal: 3, low: 2, veryLow: 0 };
let ratedByName = new Map();   // exact name (or alternative name) -> rank
let appleRanks = new Map();    // Apple base name ("Ava") -> ranks, lowest first
let novelty = new Set(["Albert", "Bad News", "Bahh", "Bells", "Boing", "Bubbles", "Cellos", "Good News", "Jester", "Organ", "Superstar", "Trinoids", "Whisper", "Wobble", "Zarvox", "Pipe Organ", "Deranged", "Hysterical", "Princess"]);
let veryLow = new Set(["Eddy", "Flo", "Grandma", "Grandpa", "Reed", "Rocko", "Sandy", "Shelley", "Fred", "Junior", "Kathy", "Ralph"]);

async function loadRatings() {
  try {
    const [list, filters] = await Promise.all(
      ["../voices/en.json", "../voices/filters.json"].map((u) => fetch(new URL(u, import.meta.url)).then((r) => r.json())),
    );
    for (const v of list.voices) {
      const ranks = (v.quality || []).map((q) => RANK[q]).filter((r) => r !== undefined).sort((a, b) => a - b);
      if (!ranks.length) continue;
      // Apple lists one name for up to three versions of a voice (basic,
      // Enhanced, Premium), so its ratings are matched by suffix below.
      if (v.localizedName === "apple") appleRanks.set(v.name, ranks);
      else for (const name of [v.name, ...(v.altNames || [])]) ratedByName.set(name, ranks[ranks.length - 1]);
    }
    filters.novelty.forEach((n) => novelty.add(n));
    filters.veryLowQuality.forEach((n) => veryLow.add(n));
    notify();
  } catch {
    // Offline before the first load, or blocked: the name rules still work.
  }
}

if (supported) loadRatings();

// A number for how good a voice sounds, or -1 for voices nobody should
// be offered: broken Edge entries ("undefined"), Apple's sound-effect
// voices, and the very robotic ones.
function quality(v) {
  const name = v.name || "";
  if (/undefined/i.test(name)) return -1;
  const first = name.split(" (")[0].trim();
  if (novelty.has(name) || novelty.has(first) || veryLow.has(name) || veryLow.has(first)) return -1;
  if (ratedByName.has(name)) return ratedByName.get(name);
  const apple = name.match(/^(.*?)\s*\((Premium|Enhanced)\)$/i);
  const ranks = appleRanks.get(apple ? apple[1] : name);
  if (ranks) {
    if (!apple) return ranks[0];
    const want = apple[2].toLowerCase() === "premium" ? RANK.high : RANK.normal;
    return ranks.includes(want) ? want : ranks[ranks.length - 1];
  }
  if (/premium/i.test(name)) return RANK.high;
  if (/enhanced|natural|neural/i.test(name)) return RANK.normal;
  return RANK.low;
}

const langOf = (v) => (v.lang || "").replace("_", "-").toLowerCase();

// Voices worth offering for a language, best first. Online voices send
// the text to a server, so they're left out to keep text on the device.
export function voicesFor(lang, allowOnline = false) {
  // "en-US", "en-US@posix" or "en-US-u-…" all mean en-us here.
  const own = ((navigator.language || "").toLowerCase().match(/^[a-z]{2,3}(?:-[a-z]{2})?/) || [""])[0];
  const region = own.startsWith(lang + "-") ? own : lang === "en" ? "en-us" : null;
  const score = (v) => quality(v) * 10 + (region && langOf(v) === region ? 3 : 0) + (v.default ? 1 : 0);
  return voices
    .filter((v) => langOf(v).split("-")[0] === lang)
    .filter((v) => allowOnline || v.localService !== false)
    .filter((v) => quality(v) >= 0 && !isBroken(v))
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
}

/* ---------- Voices that turned out not to work ---------- */

// Safari can list voices it cannot actually play (for example a voice
// whose download was removed), and there is no way to tell in advance.
// When a voice fails, EasyRead remembers it here and stops offering it.
// If the device's voices change (say a new download), every voice gets
// another chance.
const BROKEN_KEY = "easyread.brokenVoices";
let brokenFor = "";
const broken = new Set();
const avoidThisVisit = new Set();

function hashOf(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return String(h);
}

try {
  const saved = JSON.parse(localStorage.getItem(BROKEN_KEY) || "null");
  if (saved && Array.isArray(saved.uris)) {
    brokenFor = saved.list || "";
    saved.uris.forEach((u) => broken.add(u));
  }
} catch {
  // Storage blocked: nothing remembered.
}

function saveBroken() {
  brokenFor = hashOf(voicesKey);
  try {
    localStorage.setItem(BROKEN_KEY, JSON.stringify({ list: brokenFor, uris: [...broken] }));
  } catch {
    // Storage blocked: remembered for this visit only.
  }
}

function forgetBrokenIfVoicesChanged(key) {
  if (broken.size && brokenFor && brokenFor !== hashOf(key)) {
    broken.clear();
    saveBroken();
  }
}

export function isBroken(voice) {
  return !!voice && (broken.has(voice.voiceURI) || avoidThisVisit.has(voice.voiceURI));
}

// Start reading the voice list only now, after everything above exists:
// some browsers have their voices ready immediately.
if (supported) {
  refreshVoices();
  if (synth.addEventListener) synth.addEventListener("voiceschanged", refreshVoices);
  else synth.onvoiceschanged = refreshVoices;
  // Safari does not always fire voiceschanged.
  [250, 1000, 3000].forEach((ms) => setTimeout(refreshVoices, ms));
}

export function pickVoice(lang, savedURI, allowOnline) {
  const list = voicesFor(lang, allowOnline);
  return list.find((v) => v.voiceURI === savedURI) || list[0] || null;
}

/* ---------- Audio session (iPhone) ---------- */

// Safari 17+ lets a page ask to be treated like a media player, which
// should keep speech audible when the ring/silent switch is on silent.
function setAudioSession(type) {
  try {
    if (navigator.audioSession) navigator.audioSession.type = type;
  } catch {
    // Not supported: nothing to do.
  }
}

/* ---------- Screen wake lock ---------- */

let wakeLock = null;
let wantWake = false;

async function holdWake() {
  wantWake = true;
  if (wakeLock || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try {
    const lock = await navigator.wakeLock.request("screen");
    lock.addEventListener("release", () => {
      if (wakeLock === lock) wakeLock = null;
    });
    wakeLock = lock;
    if (!wantWake) releaseWake();
  } catch {
    wakeLock = null;
  }
}

function releaseWake() {
  wantWake = false;
  const lock = wakeLock;
  wakeLock = null;
  lock?.release().catch(() => {});
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && wantWake) holdWake();
});

/* ---------- Speaker ---------- */

// Turns off for the rest of the session if a voice gives no word timing.
let wordBoundaries = true;

// Errors that mean "this voice can't speak", not "this sentence failed".
const VOICE_ERRORS = new Set(["voice-unavailable", "synthesis-unavailable", "synthesis-failed", "language-unavailable"]);

// A voice that "finishes" almost instantly made no sound. Normal speech
// is about 2.5 to 3 words a second, and even one word takes longer
// than 150 ms to say.
function finishedTooFast(text, startedAt, rate) {
  const words = (text.match(/\S+/g) || []).length;
  if (!words) return false;
  const expected = (words / 2.8) * 1000 / rate;
  return performance.now() - startedAt < Math.max(words > 1 ? 150 : 80, expected * 0.15);
}

function findWord(words, charIndex) {
  let lo = 0;
  let hi = words.length - 1;
  let found = hi < 0 ? -1 : 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= charIndex) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

export class Speaker {
  // handlers: onSentence(i, playing), onWord(i, wordIndex), onState(playing),
  // onEnd(), onNoSound(), onSound(), onUnsupported(),
  // onVoiceFailed(voice): the voice didn't play; choose another with setVoice()
  constructor(handlers = {}) {
    this.h = handlers;
    this.sentences = [];
    this.lang = "en";
    this.index = 0;
    this.playing = false;
    this.finished = false;
    this.rate = 1;
    this.voice = null;
    this.gen = 0;
    this.timers = [];
    this.keepAlive = null;
    this.utterance = null;
  }

  get wordMode() {
    return wordBoundaries;
  }

  load(sentences, lang, index = 0) {
    this.stop();
    this.sentences = sentences;
    this.lang = lang;
    this.finished = false;
    this.index = this._clamp(index);
  }

  setRate(rate) {
    if (rate === this.rate) return;
    this.rate = rate;
    if (this.playing) this._speak(); // restart the sentence at the new rate
  }

  setVoice(voice) {
    const same = (voice?.voiceURI ?? null) === (this.voice?.voiceURI ?? null);
    this.voice = voice;
    if (same) return;
    wordBoundaries = true; // give the new voice a fresh chance
    if (this.playing) this._speak();
  }

  // Must be called straight from a tap or key press the first time (iOS).
  play(index = this.index) {
    if (!supported) {
      this.h.onUnsupported?.();
      return;
    }
    if (!this.sentences.length) return;
    if (this.finished) {
      index = 0;
      this.finished = false;
    }
    this.index = this._clamp(index);
    this.playing = true;
    this.h.onState?.(true);
    setAudioSession("playback");
    holdWake();
    this._speak();
  }

  stop() {
    const wasPlaying = this.playing;
    this.playing = false;
    this.gen++;
    this._clearTimers();
    if (supported && (synth.speaking || synth.pending)) synth.cancel();
    releaseWake();
    if (wasPlaying) {
      setAudioSession("auto");
      this.h.onState?.(false);
    }
  }

  toggle() {
    if (this.playing) this.stop();
    else this.play();
  }

  jump(index) {
    if (!this.sentences.length) return;
    this.finished = false;
    this.index = this._clamp(index);
    if (this.playing) this._speak();
    else this.h.onSentence?.(this.index, false);
  }

  next() {
    this.jump(this.index + 1);
  }

  prev() {
    this.jump(this.index - 1);
  }

  // Says one word, slowly. Only while stopped.
  speakWord(text) {
    if (!supported || this.playing) return;
    this.gen++;
    this._clearTimers();
    if (synth.speaking || synth.pending) synth.cancel();
    const u = this._utterance(text, Math.max(0.5, this.rate * 0.7));
    this.utterance = u;
    synth.speak(u);
  }

  // Plays a short sample so the reader hears a voice right after
  // choosing it, and finds out at once if it doesn't work here.
  sample(text) {
    if (!supported || this.playing) return;
    const gen = ++this.gen;
    this._clearTimers();
    if (synth.speaking || synth.pending) synth.cancel();
    const u = this._utterance(text, this.rate);
    let startedAt = performance.now();
    u.onend = () => {
      if (gen === this.gen && this.voice && finishedTooFast(text, startedAt, this.rate)) this._voiceFailed(true);
    };
    u.onerror = (e) => {
      if (gen === this.gen && this.voice && VOICE_ERRORS.has(e.error)) this._voiceFailed(true);
    };
    this.utterance = u;
    startedAt = performance.now();
    synth.speak(u);
  }

  // The voice made no sound. permanent: remember it on this device;
  // otherwise avoid it for this visit only (the cause may be elsewhere).
  _voiceFailed(permanent) {
    const bad = this.voice;
    if (!bad) return;
    if (permanent) {
      broken.add(bad.voiceURI);
      saveBroken();
    } else {
      avoidThisVisit.add(bad.voiceURI);
    }
    this.voice = null;
    const gen = this.gen;
    this.h.onVoiceFailed?.(bad); // usually calls setVoice(), which restarts the sentence
    if (this.playing && gen === this.gen) this._speak();
  }

  _utterance(text, rate) {
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) {
      u.voice = this.voice;
      u.lang = this.voice.lang;
    } else {
      u.lang = this.lang;
    }
    u.rate = rate;
    return u;
  }

  _speak() {
    const gen = ++this.gen;
    const live = () => gen === this.gen;
    this._clearTimers();

    const i = this.index;
    const sentence = this.sentences[i];
    if (!sentence) {
      this._finish();
      return;
    }
    this.h.onSentence?.(i, true);
    this.h.onWord?.(i, -1);

    const u = this._utterance(sentence.text, this.rate);
    let started = false;
    let gotWord = false;
    let done = false;
    let speakAt = performance.now();

    u.onstart = () => {
      if (!live()) return;
      started = true;
      this.h.onSound?.();
    };

    u.onboundary = (e) => {
      if (!live() || (e.name && e.name !== "word")) return;
      gotWord = true;
      if (wordBoundaries) this.h.onWord?.(i, findWord(sentence.words, e.charIndex));
    };

    const next = () => {
      if (!live() || done) return;
      done = true;
      this._clearTimers();
      if (this.index + 1 >= this.sentences.length) {
        this._finish();
        return;
      }
      this.index += 1;
      this._speak();
    };

    u.onend = () => {
      if (!live() || done) return;
      if (this.voice && finishedTooFast(sentence.text, speakAt, this.rate)) {
        done = true;
        this._voiceFailed(true);
        return;
      }
      // Never fake word timing: a whole sentence with no word events means
      // this voice doesn't report words, so highlight sentences only.
      if (!gotWord && sentence.words.length >= 3) wordBoundaries = false;
      next();
    };
    u.onerror = (e) => {
      if (!live() || e.error === "interrupted" || e.error === "canceled") return;
      if (e.error === "not-allowed") {
        this.stop();
        this.h.onNoSound?.();
        return;
      }
      if (this.voice && VOICE_ERRORS.has(e.error)) {
        done = true;
        this._voiceFailed(true);
        return;
      }
      next(); // skip a sentence the engine could not speak
    };

    this.utterance = u; // keep a reference so the browser doesn't drop its events
    const busy = synth.speaking || synth.pending;
    if (synth.paused) synth.resume();
    if (busy) {
      synth.cancel();
      // Safari can swallow a speak() that comes right after cancel().
      this._timer(() => {
        if (!live()) return;
        speakAt = performance.now();
        synth.speak(u);
      }, 60);
    } else {
      speakAt = performance.now();
      synth.speak(u);
    }

    // Nothing heard after about a second: say so. Half a second later,
    // try the next voice, in case it's this voice that can't play.
    this._timer(() => {
      if (live() && !started && this.playing) this.h.onNoSound?.();
    }, 1000);
    this._timer(() => {
      if (live() && !started && this.playing && this.voice) this._voiceFailed(false);
    }, 1500);

    if (this.voice && this.voice.localService === false && !isSafari) {
      // Chrome cuts online voices off after about 15 seconds unless nudged.
      this.keepAlive = setInterval(() => {
        if (synth.speaking && !synth.paused) {
          synth.pause();
          synth.resume();
        }
      }, 10000);
    }
  }

  _finish() {
    this.playing = false;
    this.finished = true;
    this._clearTimers();
    releaseWake();
    this.h.onState?.(false);
    this.h.onEnd?.();
  }

  _timer(fn, ms) {
    this.timers.push(setTimeout(fn, ms));
  }

  _clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    clearInterval(this.keepAlive);
    this.keepAlive = null;
  }

  _clamp(i) {
    return Math.max(0, Math.min(this.sentences.length - 1, i | 0));
  }
}
