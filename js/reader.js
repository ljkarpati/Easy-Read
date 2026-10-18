// reader.js: rendering, highlight, line focus and auto-scroll.

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

export class Reader {
  // els: { reader, scroller, page, ruler, handle, chip, topbar }
  // handlers: onTapSentence(i, wordIndex, wordEl), onTapEmpty()
  // The top bar hides while reading aloud or scrolling down, and comes
  // back on a tap or when scrolling up.
  constructor(els, handlers = {}) {
    Object.assign(this, els);
    this.h = handlers;
    this.sentenceEls = [];
    this.current = -1;
    this.currentWord = null;
    this.playing = false;
    this.following = true;
    this.rulerOn = false;
    this.bandCenter = null;
    this.frame = 0;
    this._bind();
  }

  /* ---------- Rendering ---------- */

  // The document title is shown large at the top. If the text itself
  // starts with the title line, that line becomes the heading (and is
  // still read aloud) instead of appearing twice.
  render(parsed, lang, title = "") {
    const frag = document.createDocumentFragment();
    const norm = (t) => String(t).replace(/[\s.!?:;,…]+$/u, "").trim().toLowerCase();
    const first = parsed.blocks[0];
    const firstIsTitle = !!first && first.sentences.length === 1 && norm(parsed.sentences[first.sentences[0]].text) === norm(title);
    this.heading = null;
    if (title && !firstIsTitle) {
      this.heading = document.createElement("h1");
      this.heading.className = "doc-heading";
      this.heading.textContent = title;
      frag.appendChild(this.heading);
    }
    this.sentenceEls = new Array(parsed.sentences.length);
    parsed.blocks.forEach((block, bi) => {
      const asHeading = bi === 0 && firstIsTitle;
      const p = document.createElement(asHeading ? "h1" : "p");
      if (asHeading) {
        p.className = "doc-heading";
        this.heading = p;
      } else if (block.tight) {
        p.className = "tight";
      }
      block.sentences.forEach((idx, k) => {
        if (k) p.appendChild(document.createTextNode(" "));
        const s = parsed.sentences[idx];
        const span = document.createElement("span");
        span.className = "s";
        span.dataset.i = idx;
        let pos = 0;
        for (const w of s.words) {
          if (w.start > pos) span.appendChild(document.createTextNode(s.text.slice(pos, w.start)));
          const word = document.createElement("span");
          word.className = "w";
          word.dataset.start = w.start;
          word.dataset.end = w.end;
          word.textContent = s.text.slice(w.start, w.end);
          span.appendChild(word);
          pos = w.end;
        }
        if (pos < s.text.length) span.appendChild(document.createTextNode(s.text.slice(pos)));
        p.appendChild(span);
        this.sentenceEls[idx] = span;
      });
      frag.appendChild(p);
    });
    this.page.replaceChildren(frag);
    this.page.lang = lang;
    this.current = -1;
    this.currentWord = null;
    this.following = true;
    this.chip.hidden = true;
    this.scroller.scrollTop = 0;
    this.showBar();
    this._watchHeading();
    this.updateRuler();
  }

  // Once the big title scrolls away, a small copy appears in the top bar.
  _watchHeading() {
    this.headingObserver?.disconnect();
    this.topbar.classList.remove("titled");
    if (!this.heading || !("IntersectionObserver" in window)) return;
    this.headingObserver = new IntersectionObserver(([entry]) => {
      this.topbar.classList.toggle("titled", !entry.isIntersecting);
    }, { root: this.scroller, rootMargin: "-64px 0px 0px 0px" });
    this.headingObserver.observe(this.heading);
  }

  showBar() {
    this.reader.classList.remove("bar-hidden");
  }

  hideBar() {
    this.reader.classList.add("bar-hidden");
  }

  /* ---------- Highlights ---------- */

  setCurrent(i, playing) {
    if (this.current !== i) {
      const old = this.sentenceEls[this.current];
      old?.classList.remove("cur", "paused");
      this.setWord(-1);
    }
    this.current = i;
    const el = this.sentenceEls[i];
    if (!el) return;
    el.classList.add("cur");
    el.classList.toggle("paused", !playing);
    if (playing) this.ensureVisible();
    this.updateRuler();
  }

  clearCurrent() {
    this.sentenceEls[this.current]?.classList.remove("cur", "paused");
    this.setWord(-1);
    this.current = -1;
    this.updateRuler();
  }

  setWord(wordIndex) {
    this.currentWord?.classList.remove("cur");
    this.currentWord = null;
    if (wordIndex < 0) return;
    const word = this.sentenceEls[this.current]?.getElementsByClassName("w")[wordIndex];
    if (!word) return;
    word.classList.add("cur");
    this.currentWord = word;
    if (this.playing && this._isTall(this.sentenceEls[this.current])) this.ensureVisible();
    this.updateRuler();
  }

  flashWord(word) {
    word.classList.add("flash");
    setTimeout(() => word.classList.remove("flash"), 900);
  }

  setPlaying(playing) {
    this.playing = playing;
    this.sentenceEls[this.current]?.classList.toggle("paused", !playing);
    if (playing) {
      this.follow(false);
      this.hideBar();
    } else {
      this.chip.hidden = true;
      this.showBar();
    }
    this.ruler.classList.toggle("animate", playing);
    this.ruler.classList.toggle("reading", playing);
    this.updateRuler();
  }

  /* ---------- Scrolling ---------- */

  _isTall(el) {
    return !!el && el.getBoundingClientRect().height > this.scroller.clientHeight / 3;
  }

  _barHeight() {
    return this.reader.classList.contains("bar-hidden") ? 0 : this.topbar.offsetHeight;
  }

  // Keeps the current sentence (or word, for very long sentences) in
  // the middle third of the screen.
  ensureVisible(smooth = true) {
    if (!this.following) return;
    const sentence = this.sentenceEls[this.current];
    if (!sentence) return;
    const target = this.currentWord && this._isTall(sentence) ? this.currentWord : sentence;
    const box = this.scroller.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    const third = box.height / 3;
    const fits = r.height <= third;
    const inZone = fits
      ? r.top >= box.top + third && r.bottom <= box.top + 2 * third
      : r.top >= box.top + this._barHeight() && r.top <= box.top + third;
    if (inZone) return;
    const desired = fits ? box.top + box.height * 0.45 - r.height / 2 : box.top + box.height * 0.25;
    this.scroller.scrollTo({
      top: this.scroller.scrollTop + (r.top - desired),
      behavior: smooth && !reduceMotion.matches ? "smooth" : "auto",
    });
  }

  // Puts a sentence about a third of the way down, without animation.
  scrollToSentence(i) {
    const el = this.sentenceEls[i];
    if (!el) return;
    const box = this.scroller.getBoundingClientRect();
    this.scroller.scrollTop += el.getBoundingClientRect().top - (box.top + box.height * 0.3);
  }

  follow(smooth = true) {
    this.following = true;
    this.chip.hidden = true;
    this.ensureVisible(smooth);
  }

  _userScrolled() {
    if (this.playing && this.following) {
      this.following = false;
      this.chip.hidden = false;
    }
  }

  // Remembers which sentence is at the top so a layout change (size,
  // font, spacing) doesn't lose the reader's place.
  captureAnchor() {
    const els = this.sentenceEls;
    if (!els.length) return null;
    const top = this.scroller.getBoundingClientRect().top + this._barHeight();
    let lo = 0;
    let hi = els.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (els[mid].getBoundingClientRect().bottom < top) lo = mid + 1;
      else hi = mid;
    }
    return { i: lo, offset: els[lo].getBoundingClientRect().top - top };
  }

  restoreAnchor(anchor) {
    if (this.playing && this.current >= 0) {
      this.ensureVisible(false);
      this.updateRuler();
      return;
    }
    const el = anchor && this.sentenceEls[anchor.i];
    if (!el) return;
    const top = this.scroller.getBoundingClientRect().top + this._barHeight();
    this.scroller.scrollTop += el.getBoundingClientRect().top - top - anchor.offset;
    this.updateRuler();
  }

  /* ---------- Line focus ---------- */

  setRuler(on) {
    this.rulerOn = on;
    this.ruler.hidden = !on;
    this.updateRuler();
  }

  _lineHeight() {
    const cs = getComputedStyle(this.page);
    const lh = parseFloat(cs.lineHeight);
    return Number.isFinite(lh) ? lh : parseFloat(cs.fontSize) * 1.7;
  }

  updateRuler() {
    if (!this.rulerOn) return;
    const height = this.reader.clientHeight;
    const lh = this._lineHeight();
    const band = 2 * lh; // about two lines at full strength
    const base = this.reader.getBoundingClientRect().top;
    let top;
    let bottom;
    const sentence = this.sentenceEls[this.current];
    if (this.playing && sentence) {
      if (this.currentWord) {
        const r = this.currentWord.getBoundingClientRect();
        const c = (r.top + r.bottom) / 2 - base;
        top = c - band / 2;
        bottom = c + band / 2;
      } else {
        const rects = sentence.getClientRects();
        const first = rects[0];
        const last = rects[rects.length - 1];
        top = (first.top + first.bottom) / 2 - lh / 2 - base;
        bottom = (last.top + last.bottom) / 2 + lh / 2 - base;
        if (bottom - top < band) {
          const c = (top + bottom) / 2;
          top = c - band / 2;
          bottom = c + band / 2;
        }
      }
    } else {
      if (this.bandCenter === null) this.bandCenter = height * 0.4;
      top = this.bandCenter - band / 2;
      bottom = this.bandCenter + band / 2;
    }
    this.ruler.style.setProperty("--band-top", Math.max(0, top) + "px");
    this.ruler.style.setProperty("--band-bottom", Math.min(height, Math.max(0, bottom)) + "px");
  }

  moveBand(center) {
    const height = this.reader.clientHeight;
    this.bandCenter = Math.max(40, Math.min(height - 40, center));
    this.updateRuler();
  }

  // Arrow keys: move one line; scroll the text when the band nears an edge.
  moveBandBy(direction) {
    const lh = this._lineHeight();
    const height = this.reader.clientHeight;
    if (this.bandCenter === null) this.bandCenter = height * 0.4;
    const next = this.bandCenter + direction * lh;
    if (next < height * 0.2 || next > height * 0.8) this.scroller.scrollBy({ top: direction * lh });
    else this.moveBand(next);
  }

  /* ---------- Events ---------- */

  _bind() {
    const { scroller } = this;

    scroller.addEventListener("click", (e) => {
      const sel = window.getSelection?.();
      if (sel && !sel.isCollapsed && sel.toString().trim()) return; // selecting text
      if (e.target.closest?.("a")) return;
      if (this.rulerOn && !this.playing) this.moveBand(e.clientY - this.reader.getBoundingClientRect().top);
      const s = e.target.closest?.(".s");
      if (!s) {
        this.h.onTapEmpty?.();
        return;
      }
      const w = e.target.closest(".w");
      const wordIndex = w ? Array.prototype.indexOf.call(s.getElementsByClassName("w"), w) : -1;
      this.h.onTapSentence?.(Number(s.dataset.i), wordIndex, w);
    });

    // Manual scrolling while reading pauses auto-scroll.
    const user = () => this._userScrolled();
    scroller.addEventListener("wheel", user, { passive: true });
    scroller.addEventListener("touchmove", user, { passive: true });
    scroller.addEventListener("keydown", (e) => {
      if (["PageUp", "PageDown", "Home", "End", "ArrowUp", "ArrowDown"].includes(e.key)) user();
    });
    scroller.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.target === scroller && e.offsetX > scroller.clientWidth) user(); // scrollbar
    });

    // Top bar: hide on scroll down, show on scroll up or near the top.
    let lastY = 0;
    scroller.addEventListener("scroll", () => {
      const y = scroller.scrollTop;
      const dy = y - lastY;
      lastY = y;
      if (this.playing) return;
      if (y < 40 || dy < -6) this.showBar();
      else if (dy > 6) this.hideBar();
    }, { passive: true });

    scroller.addEventListener("scroll", () => {
      if (!this.rulerOn || !this.playing || this.frame) return;
      this.frame = requestAnimationFrame(() => {
        this.frame = 0;
        this.updateRuler();
      });
    }, { passive: true });

    this.chip.addEventListener("click", () => this.follow());

    // Ruler: follows the mouse on Mac, and a drag of its handle on touch.
    this.reader.addEventListener("pointermove", (e) => {
      if (!this.rulerOn || this.playing || e.pointerType !== "mouse" || !finePointer.matches) return;
      if (e.target.closest?.(".topbar, .player, .chip")) return;
      this.moveBand(e.clientY - this.reader.getBoundingClientRect().top);
    });

    let dragging = false;
    this.handle.addEventListener("pointerdown", (e) => {
      dragging = true;
      e.preventDefault();
      this.handle.setPointerCapture?.(e.pointerId);
    });
    this.handle.addEventListener("pointermove", (e) => {
      if (dragging) this.moveBand(e.clientY - this.reader.getBoundingClientRect().top);
    });
    const end = () => { dragging = false; };
    this.handle.addEventListener("pointerup", end);
    this.handle.addEventListener("pointercancel", end);

    window.addEventListener("resize", () => {
      this.updateRuler();
    });
  }
}
