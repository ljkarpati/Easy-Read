# EasyRead: build guide for Claude Code (v3)

> **Read this whole file before writing any code.** Build one phase at a time, show the user the result, and wait for their OK before starting the next phase.
>
> **Practice build.** Claude Code writes all of the code. If this ever becomes a Congressional App Challenge entry, all AI use must be disclosed, and AI can't be the entire technical development.

## Already built part of v1?

Start with a short audit. List what exists, delete everything in **Cut from v1** below, then continue from the first unfinished phase. Keep any icon the user already chose.

**Cut from v1:**
- Settings screen
- Custom tint and color picker
- Clear theme
- Lexend and System fonts
- Line-width control
- Spacing sliders
- "…" row menus
- Focus-mode tap toggle
- Three icon concepts
- All stretch goals

---

## 1. What we're building

**EasyRead** makes any text easier to read. You paste text and it appears in a dyslexia-friendly font, with read-aloud that highlights each sentence as it goes.

**Who it helps:** people with dyslexia and other reading difficulties, tired eyes, or reading in a second language.

**Where it runs:** for anyone who gets the link, with no account, no download and no cost. It runs in Safari on iPhone, iPad and Mac, in Chrome on Android, and in Chrome or Edge on Windows. It can also be installed to the Home Screen or Dock and works offline.

**Design principle: Apple-clean.**
- Every control must earn its place. If a feature isn't in this file, don't add it.
- Use sensible defaults over options, and white space over decoration.
- No emojis, no badges, no "tips" popups, no onboarding screens.

**Hard rules**
- **Free.** No paid services, no API keys, no accounts.
- **Private.** The user's text never leaves the device.
- The only network use after the first load is the one-time download of the Natural voice model, which sends no user text.
- **Simple stack.** Plain HTML, CSS and JavaScript, no frameworks, no build step, deployable as a static folder.
- **Honest.** Never claim to treat or cure dyslexia. Approved wording: "Makes reading more comfortable."

---

## 2. Working with the user

- The user is **new to coding** and uses a **Windows PC with PowerShell**.
  - Explain each step in one or two plain sentences.
  - Give copy-paste commands.
- **Ask before installing anything.** Free tools only. Node.js LTS is fine.
- **Testing on iPhone and iPad:** use the GitHub Pages HTTPS link. Plain `http://` addresses on the home Wi-Fi break offline mode and audio unlocking.
- **After each phase:**
  - Give at most three bullets on what changed.
  - Tell the user exactly what to try.
  - Commit.

---

## 3. File structure

```
easyread/
  index.html
  styles.css
  js/
    app.js           # boot + routing (Library ⇄ Reader)
    text.js          # paragraphs → sentences → words
    reader.js        # rendering, highlight, line focus, auto-scroll
    voice-device.js  # Web Speech engine
    voice-natural.js # Kokoro engine (main-thread side)
    kokoro.worker.js # Kokoro runs here, off the main thread
    settings.js      # theme, font, size, spacing, voice → localStorage
    library.js       # IndexedDB
    contrast.js      # WCAG contrast self-test (dev only)
  fonts/             # self-hosted .woff2
  icons/
  manifest.webmanifest
  sw.js
  README.md
```

Wrap every `localStorage` call in try/catch.

---

## 4. Screens

There are only two screens and one sheet.

### Library (home)

```
┌────────────────────────────┐
│ EasyRead               ＋  │  ← large title; + opens New sheet
│                            │
│ Science worksheet          │  ← title in reading font
│ Photosynthesis is how…  2m │  ← one-line preview, muted, time ago
│ ────────────────────────── │
│ Letter from school         │
│ Dear families, next…    1d │
│                            │
│ Your text stays on this    │  ← one muted footer line, nothing else
│ device.                    │
└────────────────────────────┘
```

- **Empty state:** centered "Paste something to read." with one big Paste button.
- **First launch:** the library holds one short "Welcome to EasyRead" document, five sentences or fewer.
- **Delete:** swipe left to delete on touch, with no extra confirmation because Undo appears as a toast. On Mac, right-click → Delete.
- **New sheet (＋):**
  - A full-height sheet with an autofocused text box (16px or larger, so iOS doesn't zoom in).
  - Two quiet pills: Paste and Open .txt.
  - Read at the top right, Apple's "Done" position.
  - Cancel at the top left.

### Reader

```
┌────────────────────────────┐
│ ‹                      Aa  │  ← fades away while reading/scrolling
│                            │
│   Text in OpenDyslexic,    │
│   left-aligned, calm       │
│   column.                  │
│  ▓ Current sentence ▓      │
│   Next lines…              │
│                            │
│           ( ▶︎ )            │  ← one round play button, bottom center
└────────────────────────────┘
```

- While playing, the play button grows into a pill: ⏮  ⏸  ⏭  1×.
  - The 1× cycles through 0.75 → 1 → 1.25 → 1.5.
  - Use a 250ms spring-like ease. Respect `prefers-reduced-motion`.
- **Taps:**
  - Tap a sentence to read from there.
  - While stopped, tap a word to hear just that word, slowly.
- **Top bar:** hides on scroll down or while playing, and shows on tap or scroll up.
- **Title:** tap the title to rename it. It appears small in the top bar once you scroll.
- **iPad and Mac (900px wide or more):** the library becomes a left sidebar, and the text column is centered.
- **Keyboard:**
  - `Space`: play or pause.
  - `←` / `→`: previous or next sentence.
  - `Esc`: close the sheet.

### "Aa" sheet (like Apple Books)

A bottom sheet on phone and a popover on iPad and Mac:

```
  ( A )  ( A )                     ← smaller / bigger text
  (Aa) (Aa) (Aa) (Aa)              ← Paper, Sky, Dark, Night swatches
  Font     [ Dyslexic | Standard ]
  Spacing  [ Normal   | Wide     ]
  Line focus                  (●)
  Voice                 Natural ›  ← pushes Voice list (section 6)
```

That's all of it. Changes preview live behind the sheet and are saved.

---

## 5. Look

### Reading text

The reading font is used for everything the user reads: document text, titles and previews.

**Fonts.** Self-host the `.woff2` files from Fontsource via npm, then copy them into `/fonts`. Check the package names first.

| Font option | Font | Weights | Notes |
|---|---|---|---|
| Dyslexic (default) | OpenDyslexic, `@fontsource/opendyslexic` | 400 for body, 700 for titles | OFL-1.1 license. The heavy-bottomed letters are the look the user wants. |
| Standard | Atkinson Hyperlegible, `@fontsource/atkinson-hyperlegible` | | |

Do not use Dyslexie. It's a paid font.

**Size**
- Defaults: 19px on phone and 21px on iPad and Mac.
- The A / A buttons step by 2px, from 15px to 33px.

**Spacing** (default Normal; Wide gives the airy Canvas-style look)

| | Letter spacing | Word spacing | Line height |
|---|---|---|---|
| Normal | 0 | 0 | 1.8 |
| Wide | 0.06em | 0.21em (3.5× letter) | 2.0 |

**Layout**
- Column width: `max-width: 60ch`. Left-aligned, never justified.
- Paragraph gap: 1em.
- No italics and no underlines in rendered text.
- Never disable pinch-zoom.

**Line focus.** A band about 2 lines tall stays at full strength and the rest dims to 35%.
- While reading aloud: it follows the spoken sentence.
- Otherwise: it follows a tap or drag, or the mouse.

### Themes

Each theme is a set of CSS custom properties. Every text/background pair must reach a contrast of **7:1 or more**. `contrast.js` asserts this in development.

| Theme | Background | Text | Sentence highlight | Current word |
|---|---|---|---|---|
| Paper (default light) | `#FBF5E9` | `#2B2620` | `rgba(245,196,81,.35)` | `rgba(245,196,81,.75)` + 2px underline |
| Sky | `#EAF2F8` | `#1E2A35` | `rgba(245,196,81,.38)` | same idea |
| Dark (default dark) | `#1C1C1E` | `#E5E5E7` | `rgba(245,196,81,.22)` | `rgba(245,196,81,.45)` |
| Night (warm, bedtime) | `#17140F` | `#D9CBB3` | `rgba(230,170,90,.20)` | `rgba(230,170,90,.42)` |

- **First launch:** follow the device's light or dark mode (Paper or Dark) until the user taps a swatch.
- **Toolbar:** update `<meta name="theme-color">` on every theme change.

### Interface

- **System font:** use `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif` for buttons and labels only.
- **Accent:** amber `#E9A93B` in light themes and `#F2C14E` in dark themes. It's used only for the play button, highlights and toggles.
- **Surfaces:**
  - Sheets and the player use translucent backgrounds with `backdrop-filter: blur(20px) saturate(1.4)`.
  - One soft shadow: `0 8px 30px rgba(0,0,0,.08)`.
- **Shapes:** corner radius 14px for sheets on the inner edge and full round for pills and the play button.
- **Icons:** line icons with a 1.75px stroke and round caps, drawn as inline SVG or copied from Lucide (ISC license). They should feel like SF Symbols.
- **Tap targets:** at least 44×44px.
- **Safe areas:** use `viewport-fit=cover` and `env(safe-area-inset-*)` throughout.
- **Restraint:** no gradients except the icon. No borders where spacing can do the job.

---

## 6. Voice: make it sound good

### Default voice: the Natural voice (Engine 2)

The user's priority is whatever sounds best, so the Natural voice is the default.

- **First press of play:**
  - Start speaking right away with the best device voice (Engine 1).
  - At the same moment, start downloading the Natural voice in the background. Show a thin progress ring around the play button, and no popup.
  - When the download finishes, switch to the Natural voice at the next sentence.
- After that, always use the Natural voice. It's cached and works offline.
- **Fall back** to the best device voice only if:
  - the model can't load,
  - the device is too slow (rule below), or
  - the user picks a device voice in the voice list.

### Text splitting (`text.js`)

1. Split the text into paragraphs, then sentences, then words, using `Intl.Segmenter` with a regex fallback.
2. Split any sentence over about 220 characters at commas.
3. Render each sentence as `<span class="s" data-i>` and each word as `<span class="w">` with character offsets.

### Engine 1: device voice (instant fallback)

This is used while the Natural voice downloads, if the Natural voice can't run, or if the user picks a device voice.

Use `speechSynthesis` with one utterance per sentence.

**Picking the best voice automatically**
1. Wait for `voiceschanged` before reading the voice list.
2. Throw out any voice whose name contains `undefined`. A known Edge bug sometimes returns broken Natural voice entries.
3. Throw out Apple novelty voices: Albert, Bad News, Bahh, Bells, Boing, Bubbles, Cellos, Good News, Jester, Organ, Superstar, Trinoids, Whisper, Wobble, Zarvox and similar.
   - Check the open list at github.com/HadrienGardeur/web-speech-recommended-voices. If its license allows, vendor its English JSON and use its quality ratings instead of name-matching.
4. Score what's left:
   - Premium names score highest, then Enhanced.
   - Then Edge's "Online (Natural)" voices (these need internet).
   - Then Google voices, then anything else.
   - Prefer en-US, then other en-* voices.
5. Pick the top score and remember the user's choice if they pick one themselves.

**Reading behavior**
- **Word highlight:** use boundary events (`name === "word"`, `charIndex`). If no word boundaries arrive in the first sentence, use sentence highlight for the rest of the session. Never fake word timing.
- **Pause:** cancel speech and remember the sentence; resume restarts that sentence. Don't rely on `pause()`.
- **Speed change:** restart the current sentence at the new speed.
- **iOS:** the first `speak()` must happen inside a tap handler. If nothing is heard after about 1 second, show the line "No sound? Check volume and the silent switch."

### Engine 2: Natural voice (the default)

This uses Kokoro through kokoro-js. It's free, the Apache-2.0 model runs 100% in the browser, it sounds close to human, and it sounds the same on every device.

**Loading**
- Start loading it the first time the user presses play, never when the app opens, so people who never use read-aloud don't download 86 MB.
- Load it with a dynamic `import()` of a pinned kokoro-js version from jsDelivr's `+esm` build.
- Model: `onnx-community/Kokoro-82M-v1.0-ONNX`, with `dtype: "q8"` and `device: "wasm"`. This is about 86 MB, downloaded once.
- Don't use WebGPU with q8; it's reported to sound garbled. Only use WebGPU if switching to fp32, which is far too large for phones, so skip WebGPU for now.
- **Off the main thread:** run all generation in `kokoro.worker.js` so the interface never freezes.

**Playing**
- **Voices:** offer two, the highest-graded American female voice and American male voice from the model card's list (check it; `af_heart` is usually the top female voice).
- **Streaming:** generate sentence by sentence.
- **Prefetch** the next two sentences while the current one plays.
- Play through one `AudioContext`, created inside the user's tap so iOS allows sound.
- **Pause and resume:** use `audioContext.suspend()` and `resume()`.
- **Speed:** pass `speed` to generate. Changing it throws away the prefetched audio and regenerates from the current sentence.
- **Highlight:** word-by-word highlighting matters for dyslexic readers, so make a real effort here.
  - Use word timestamps if the pinned kokoro-js version, or a timestamped Kokoro model variant, provides them.
  - If neither works, highlight whole sentences, and never fake word timing.

**Offline and fallback**
- Make sure the model and runtime files are cached (by transformers.js's cache or the service worker) so the Natural voice works in airplane mode after the first download.
- **Too slow:** if generating a sentence takes longer than playing it twice in a row, switch back to the device voice and show one line: "This device is too slow for the Natural voice."
- **Load failure:** also fall back to the device voice.

### Voice list (pushed from "Aa" → Voice)

```
NATURAL VOICE (on this device, works offline)
  Heart            ✓        ← default; progress ring while downloading
  Michael

DEVICE VOICES
  Best available
  Ava (Premium)
  Samantha
  …                         ← only good-quality voices for the user's language

Apple devices: get more voices in Settings → Accessibility →
Spoken Content → Voices.          ← one muted footer line, Apple devices only
```

- **Preview:** tapping a voice plays the sample "This is how I sound." Tapping again selects it.

### Shared reading behavior (both engines)

- Keep the screen awake while reading (Screen Wake Lock, where supported).
- Auto-scroll so the current sentence stays in the middle third of the screen.
- If the user scrolls manually, pause auto-scroll and show a small "Back to reading" chip.

---

## 7. Library (`library.js`)

Store documents in **IndexedDB** with a tiny hand-written helper. Each document has these fields: `{ id, title, text, createdAt, updatedAt, lastSentence }`.

- **Title:** the first line, or the first six words if there's no line break.
- **Resume:** reopening a document jumps to `lastSentence`.

---

## 8. Icon

If the user already picked an icon, keep it. Otherwise make one icon and show it on `icons/preview.html` at 1024, 180, 60 and 32px, on light and dark backgrounds. Revise only if the user asks.

**Design:**
- A cream, full-bleed background with a subtle vertical gradient from `#FBF6EC` to `#F2E8D5`.
- Three rounded horizontal bars in ink `#2E2A25`, like lines of text. Widths are about 560, 620 and 400 units on a 1024 canvas.
- The middle bar sits on a soft amber `#F5C451` rounded highlight band.
- Everything stays inside the central 80% circle.
- No letters, no hairlines. The background is opaque; iOS rounds the corners.

**Export:**
- `icon.svg`
- `favicon.svg`
- `favicon-32.png`
- `apple-touch-icon.png` (180)
- `icon-192.png`
- `icon-512.png`
- `icon-maskable-512.png`

Use `sharp`, or a canvas-based `export.html` as a fallback.

**Manifest:** `name: "EasyRead"`, `display: "standalone"`, with `background_color` and `theme_color` set to `#FBF5E9`.

---

## 9. Anyone with the link

The app is shared by link. Anyone who taps it, on any phone or computer, must get the whole app for free, with no account and no setup. Apply these rules from Phase 0 on.

### Hosting (free)
- Use GitHub Pages from a public repo named `easyread`, which gives the address `https://<username>.github.io/easyread/`.
- The free plan allows a site of up to 1 GB and about 100 GB of bandwidth a month.
- Keep the site itself (code, fonts and icons) under about 5 MB so it opens fast on cellular data.
- Never commit the Natural voice model to the repo.
  - Load it from Hugging Face, pinned to a revision, so its 86 MB downloads don't count against GitHub's bandwidth.
  - Load kokoro-js from jsDelivr, pinned to a version.
  - Both are free and need no keys.
  - If either is unreachable, the device voice takes over and the rest of the app still works.

### Paths (the #1 way sites break on GitHub Pages)
- The site lives in a subfolder (`/easyread/`), so every path must be relative: `./styles.css`, `./icons/…`, never `/styles.css`.
- The manifest's `start_url` and `scope` are both `"./"`. Register the service worker as `./sw.js`.
- All file and folder names must be lowercase. Windows ignores capital letters but GitHub Pages doesn't, so `Fonts/OpenDyslexic.woff2` works on the PC and breaks online.
- Add a `404.html` that sends people to `./`.

### No custom headers
GitHub Pages can't set custom headers, so multi-threaded WebAssembly isn't available.
- Run Kokoro single-threaded. In transformers.js that's `env.backends.onnx.wasm.numThreads = 1`; check the current setting name for the pinned version.
- Don't add coi-serviceworker or similar hacks. They conflict with our own service worker.

### Updates reach everyone
- Service worker caching:
  - `index.html` is network-first.
  - Everything else is cache-first, versioned by one `VERSION` constant that gets bumped on every release.
  - Delete old caches on activate.
- A new version applies the next time someone opens the app, with no "update available" popup.

### Every visitor gets their own private app
- Each person's library lives only in their own browser. Nobody sees anyone else's text, including the person who shared the link.
- Every new visitor starts with the Welcome document.

### Link preview
When the link is texted or posted, it should show a clean preview.
- Add Open Graph and Twitter card tags:
  - title: "EasyRead"
  - description: "Makes reading more comfortable. Free, private, works offline."
- Add a 1200×630 `og-image.png` showing the icon and the name on cream.
- `og:image` must be the full `https://` address.

### Browsers people will actually use
- Main browsers: Safari on iPhone, iPad and Mac, Chrome on Android, Edge and Chrome on Windows, and Firefox.
- In-app browsers (Instagram, TikTok, Snapchat, Messenger) can block read-aloud or offline mode.
  - If `speechSynthesis` is missing or an in-app browser is detected, show one quiet line under the play button: "For read-aloud, open in Safari or Chrome." Add a Copy link button.
  - Reading still works there.

---

## 10. Build phases

Check off **Done when** before moving on.

### Phase 0: setup
1. Check `node -v` and `git --version`.
2. Create the folders and run `git init`.
3. Start a local server with `npx serve .`.

**Done when:** a blank EasyRead page opens locally.

### Phase 1: reader core
1. Build the Library and the New sheet.
2. Build the Reader in OpenDyslexic with the Paper theme.
3. Add text splitting and the Welcome document.

**Done when:** pasted text appears in the dyslexia font in a calm column.

### Phase 1.5: online early
1. Set up a free GitHub account and a public repo named `easyread`.
2. Push the project and turn on GitHub Pages.
3. Give the user the HTTPS link to open on their phone.

**Done when:** it opens on the user's phone with fonts, styles and icons all loading, which proves the paths are relative and lowercase.

### Phase 2: "Aa" sheet
1. Add text size, the four themes plus the first-launch auto theme, font, spacing and line focus.
2. Save everything.
3. Make the contrast self-test pass.

**Done when:** every option previews live and survives a reload.

### Phase 3: device voice
1. Add best-voice selection, the play button and player pill, tap a sentence or word, speed, highlight, wake lock and auto-scroll.

**Done when:** read-aloud works on iPhone Safari and on Windows Edge or Chrome, and no novelty or broken voice can be picked.

### Phase 4: Natural voice (becomes the default)
1. Run Kokoro in a worker, with the download and progress ring, prefetching, pause, speed and both fallbacks.
2. Add the voice list.
3. Make the Natural voice the default, following the rule at the top of section 6.

**Done when:**
- The first press of play speaks instantly with the device voice, then switches to the Natural voice once it has downloaded.
- The Natural voice plays without gaps on the user's PC.
- It's tested on their iPhone.
- It works in airplane mode after downloading.

### Phase 5: library
1. Add IndexedDB, swipe to delete with Undo, rename and resume.
2. On wide screens, show the library as a sidebar.

**Done when:** documents survive closing the browser.

### Phase 6: app-ify and icon
1. Make the icon and export the files.
2. Add the manifest and service worker (app shell and fonts cached), safe areas and keyboard shortcuts.

**Done when:** "Add to Home Screen" shows the icon, opens full-screen and works offline.

### Phase 7: polish and test
1. Go screen by screen and remove anything that isn't in this file.
2. Fix spacing and alignment until it looks like an Apple app.
3. Run the checklist below.
4. Write the README: what the app does, who it helps, privacy, how to run it, and credits and licenses for OpenDyslexic, Atkinson Hyperlegible, Kokoro and Lucide.

---

## 11. Test checklist

- [ ] **Fresh phone test:** on a friend's phone that has never visited, over cellular data, the app opens, reads aloud and downloads the Natural voice.
- [ ] **Android Chrome:** reading, device voice, and the Natural voice (or its fallback).
- [ ] **In-app browser:** open the link from Instagram or Snapchat. Reading works, and the "open in Safari or Chrome" line appears if read-aloud is blocked.
- [ ] **Link preview:** text the link in iMessage. The preview shows the image and the title.
- [ ] **Updates:** push a small change. A phone that already installed the app gets it the next time it opens.
- [ ] **iPhone Safari:**
  - [ ] paste, device voice, Natural voice download and playback
  - [ ] pause and resume, speed change mid-sentence
  - [ ] Add to Home Screen, airplane mode
- [ ] **iPad Safari:** sidebar, the Aa popover, rotation.
- [ ] **Mac Safari:** keyboard shortcuts, Add to Dock.
- [ ] **Windows Edge and Chrome:**
  - [ ] Natural voices from Edge appear in Device voices
  - [ ] broken "undefined" voices are filtered out
- [ ] **Every theme:** contrast test passes, and the highlight is visible but the text stays readable.
- [ ] **VoiceOver:** all buttons are labeled, and focus order makes sense.
- [ ] **Accessibility settings:** reduced motion turns off animations, and 200% zoom has no sideways scrolling.
- [ ] **A 5,000-word paste:** smooth scrolling, and no stalls with either voice.
- [ ] **Nothing on screen that isn't described in this file.**
