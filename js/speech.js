// speech.js: read-aloud engine.
// One utterance per sentence. Pause cancels speech and remembers the
// sentence, because pause() and resume() are unreliable in some browsers.

const synth = window.speechSynthesis;
export const supported = !!(synth && window.SpeechSynthesisUtterance);

export const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isApple = isIOS || /Mac/.test(navigator.platform || "");
const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);

// Sound-effect voices that Apple lists alongside real ones.
const EFFECT_VOICES = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox)\b/i;
// Older robotic voices: kept, but listed last.
const ROBOTIC = /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley|Fred|Junior|Kathy|Ralph)\b/i;
const QUALITY = /premium|enhanced|natural|neural/i;

/* ---------- Voices ---------- */

let voices = [];
let voicesKey = "";
const voiceListeners = new Set();

// Safari hands back new voice objects on every call, so compare the
// list by name, not by object, or the reader restarts for no reason.
function refreshVoices() {
  const next = synth.getVoices() || [];
  const key = next.map((v) => v.voiceURI + "|" + v.name).join("\n");
  if (key === voicesKey) return;
  voices = next;
  voicesKey = key;
  voiceListeners.forEach((fn) => fn());
}

if (supported) {
  refreshVoices();
  if (synth.addEventListener) synth.addEventListener("voiceschanged", refreshVoices);
  else synth.onvoiceschanged = refreshVoices;
  // Safari does not always fire voiceschanged.
  [250, 1000, 3000].forEach((ms) => setTimeout(refreshVoices, ms));
}

export function onVoicesChanged(fn) {
  voiceListeners.add(fn);
  return () => voiceListeners.delete(fn);
}

const langOf = (v) => (v.lang || "").replace("_", "-").toLowerCase();

function score(v, region) {
  let s = 0;
  if (QUALITY.test(v.name)) s += 4;
  if (region && langOf(v) === region) s += 2;
  if (v.default) s += 1;
  if (ROBOTIC.test(v.name)) s -= 3;
  return s;
}

// Voices for a language, best first. Online voices send text to a
// server, so they only appear when the user allows them.
export function voicesFor(lang, allowOnline = false) {
  const region = (navigator.language || "").toLowerCase();
  const regionMatch = region.startsWith(lang) ? region : null;
  return voices
    .filter((v) => langOf(v).split("-")[0] === lang)
    .filter((v) => allowOnline || v.localService !== false)
    .filter((v) => !EFFECT_VOICES.test(v.name))
    .sort((a, b) => score(b, regionMatch) - score(a, regionMatch) || a.name.localeCompare(b.name));
}

/* ---------- Voices that turned out not to work ---------- */

// Safari can list voices it cannot actually play (for example a voice
// whose download was removed), and there is no way to tell in advance.
// When a voice fails, EasyRead remembers it here and uses another one.
const BROKEN_KEY = "easyread.brokenVoices";
const broken = new Set(readBroken());
const avoidThisVisit = new Set();

function readBroken() {
  try {
    return JSON.parse(localStorage.getItem(BROKEN_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveBroken() {
  try {
    localStorage.setItem(BROKEN_KEY, JSON.stringify([...broken]));
  } catch {
    // Storage blocked: remembered for this visit only.
  }
}

export function isBroken(voice) {
  return !!voice && (broken.has(voice.voiceURI) || avoidThisVisit.has(voice.voiceURI));
}

// Called when the reader picks a voice themselves: give it another try.
export function forgiveVoice(voice) {
  if (!voice) return;
  avoidThisVisit.delete(voice.voiceURI);
  if (broken.delete(voice.voiceURI)) saveBroken();
}

export const DEVICE_DEFAULT = "default";

// savedURI "default" means "let the device choose" (no voice set).
export function pickVoice(lang, savedURI, allowOnline) {
  if (savedURI === DEVICE_DEFAULT) return null;
  const list = voicesFor(lang, allowOnline).filter((v) => !isBroken(v));
  return list.find((v) => v.voiceURI === savedURI) || list[0] || null;
}

export function voiceCount() {
  return voices.length;
}

// How the reader could get a more natural voice, if the best one
// available is a basic (robotic-sounding) voice:
//   "download": Apple devices offer free Enhanced and Premium voices.
//   "online":   this browser has natural online voices, currently hidden.
//   null:       a natural voice is already in use, or there is no fix to suggest.
export function voiceAdvice(lang, allowOnline) {
  const best = voicesFor(lang, allowOnline)[0];
  if (!best || QUALITY.test(best.name) || isBroken(best)) return null;
  if (isApple) return "download";
  if (!allowOnline && voicesFor(lang, true).some((v) => v.localService === false && QUALITY.test(v.name))) return "online";
  return null;
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
  // onEnd(), onNoSound(), onUnsupported(),
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
      if (wordBoundaries && sentence.words.length >= 3) {
        // Never fake word timing: no boundary after 1.2s means this
        // browser or voice does not report words.
        this._timer(() => {
          if (live() && !gotWord && !done) {
            wordBoundaries = false;
            this.h.onWord?.(i, -1);
          }
        }, 1200);
      }
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

    // Nothing started: try the device's default voice once. If that
    // doesn't start either, the problem is the sound, not the voice.
    this._timer(() => {
      if (!live() || started || !this.playing) return;
      if (this.voice) this._voiceFailed(false);
      else this.h.onNoSound?.();
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
