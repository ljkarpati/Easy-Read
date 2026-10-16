# EasyRead: build guide for Claude Code

> **Read this whole file before writing any code.** Build one phase at a time, show the user the result, and wait for their OK before starting the next phase.
>
> **Practice build.** Claude Code writes all of the code. If this ever becomes a Congressional App Challenge entry, all AI use must be disclosed, and AI can't be the entire technical development.

---

## 1. What we're building

**EasyRead** makes any text easier to read. You paste, type or open some text. EasyRead shows it in a calm, dyslexia-friendly layout and can read it aloud, highlighting each sentence (and each word where the browser allows) as it goes.

**Who it helps:** people with dyslexia and other reading difficulties, plus anyone with tired eyes or reading in a second language. It's for students, parents and older adults.

**Where it runs:** in Safari on iPhone, iPad and Mac, and in Chrome or Edge on Windows. It installs with "Add to Home Screen" or "Add to Dock" and works offline after the first visit.

**Hard rules**
- **Free.** No paid services, no API keys, no accounts and no sign-in.
- **Private.** All text stays on the device. No analytics, no tracking and no server.
- **Simple stack.** Plain HTML, CSS and JavaScript with no frameworks and no build step. The folder works as-is when uploaded to any static host.
- **Honest.** The app must never claim to treat or cure dyslexia. Approved wording: "Makes reading more comfortable."
- **Looks premium.** Minimal, calm and Apple-like. Every screen should look like it belongs on an iPhone.

---

## 2. Working with the user

- The user is **new to coding** and uses a **Windows PC with PowerShell**.
  - Explain each step in one or two plain sentences.
  - Give copy-paste commands for PowerShell.
- **Ask before installing anything.** Only free tools are allowed.
- **Prerequisites to check in Phase 0:** `node -v` and `git --version`.
  - If Node.js is missing, ask the user to install the free **Node.js LTS** from nodejs.org. Node is only used for a local test server and for exporting icon PNGs.
- **Testing on iPhone and iPad:** a plain `http://` address on the home Wi-Fi is not secure, so offline mode and the camera won't work there.
  - Deploy to **GitHub Pages** (free, HTTPS) early and test on real devices from that link.
- **After each phase:**
  - Summarize what changed in three bullets or fewer.
  - Tell the user exactly what to click or try.
  - Commit with a clear message.

---

## 3. File structure

```
easyread/
  index.html              # single page, all screens
  styles.css
  js/
    app.js                # boot, routing between screens
    text.js               # splitting text into paragraphs, sentences, words
    reader.js             # rendering the reading view, ruler, focus mode
    speech.js             # read-aloud engine
    settings.js           # themes, fonts, spacing; saved to localStorage
    library.js            # saved documents in IndexedDB
    contrast.js           # WCAG contrast math for themes and custom tint
  fonts/                  # self-hosted .woff2 files (needed offline)
  icons/                  # icon.svg + exported PNGs
  manifest.webmanifest
  sw.js                   # service worker for offline
  README.md
```

Wrap every `localStorage` call in try/catch, and make the app still work if storage is blocked.

---

## 4. Layout (phone first, then iPad and Mac)

### Home screen

```
┌────────────────────────────┐
│ EasyRead               ⚙︎  │  ← large bold title, Apple style
│                            │
│ ┌────────────────────────┐ │
│ │ Paste or type text…    │ │  ← big rounded text box, min 16px
│ │                        │ │     (16px stops iOS zooming in)
│ └────────────────────────┘ │
│  [ Paste ]  [ Open file ]  │  ← secondary pill buttons
│                            │
│  [        Read it  →     ] │  ← primary button, full width
│                            │
│  Recent                    │
│  ▸ Science worksheet   2m  │  ← rows: title + time ago
│  ▸ Letter from school  1d  │
└────────────────────────────┘
```

- **Paste** uses the Clipboard API. If permission is denied, focus the text box and say "Press and hold to paste."
- **Open file** accepts `.txt` in Phase 1. PDF and photo-of-a-page come later as stretch goals.
- On first launch, Recent contains one sample document called "Welcome to EasyRead." It explains the features in very short sentences.

### Reader screen

```
┌────────────────────────────┐
│ ‹ Library   Title      Aa  │  ← thin top bar; Aa opens Look sheet
│                            │
│   Lorem ipsum text in a    │
│   calm column, left-       │
│   aligned, never justified.│
│  ▓▓ Current sentence is ▓▓ │  ← soft highlight while reading aloud
│  ▓▓ highlighted.        ▓▓ │
│   Next lines…              │
│                            │
│   ╭────────────────────╮   │
│   │  ⏮    ▶︎    ⏭   1.0× │   │  ← floating pill player, bottom
│   ╰────────────────────╯   │     respects safe-area inset
└────────────────────────────┘
```

**Taps and clicks**
- Tap a sentence to start reading from there.
- While stopped, tap a single word to hear just that word, slowly.
- Tap empty space to enter **Focus mode**, which fades the top bar and player away. Tap again to bring them back.

**iPad and Mac (900px wide or more)**
- The library becomes a left sidebar.
- The text stays in a centered column with wide margins.
- The Look sheet becomes a popover instead of a bottom sheet.

**Mac keyboard shortcuts**
- `Space`: play or pause.
- `←` / `→`: previous or next sentence.
- `+` / `-`: text size.
- `Esc`: close the sheet.

### "Aa" Look sheet (bottom sheet on phone)

```
Theme     ( Auto ) ( Paper ) ( Clear ) ( Sky ) ( Dusk ) ( Night ) ( + )
Font      [ Lexend | Atkinson | OpenDyslexic | System ]
Size      A  ───────●─────  A
Spacing   [ Normal | Comfortable | Wide ]      ← preset; "Custom" reveals sliders
Line width[ Narrow | Medium | Wide ]
Ruler     ( toggle )
Voice     [ picker ]   Speed  ──●──
```

- Preview changes live behind the sheet.
- Save the settings to `localStorage`.

### Settings (⚙︎)

- **About:** one paragraph.
- **Privacy:** "Your text never leaves this device."
- **Better voices:** a tip about enhanced voices on Apple devices (Settings → Accessibility → Spoken Content → Voices).
- **Reset:** reset all settings.
- **Delete:** delete all saved documents, with a confirmation.

---

## 5. Look and feel

### Reading defaults (based on the British Dyslexia Association style guide)

- **Background:** dark text on a light, **not pure white**, background. The default theme is **Paper**, a cream background.
- **Line spacing:** 1.7 by default, adjustable from 1.5 to 2.2.
- **Line length:** about 62 characters (`max-width: 62ch`). Narrow = 50ch, Wide = 72ch.
- **Alignment:** left-aligned, never justified.
- **Emphasis:** no italics and no underlines; use bold for emphasis.
- **Spacing presets:**

  | Preset | Letter spacing | Word spacing |
  |---|---|---|
  | Normal | 0 | 0 |
  | Comfortable | 0.04em | 0.14em |
  | Wide | 0.08em | 0.28em |

  The default is **Comfortable**. In Custom, word spacing always equals **3.5 × letter spacing**.
- **Paragraph gap:** 1.2em.
- **Text size:** 20px on phone and 22px on iPad and Mac by default. The slider runs from 16 to 34px.
- **Zoom:** never disable pinch-zoom.

### Themes

Store each theme as CSS custom properties on `:root[data-theme=…]`. Every text/background pair must reach a WCAG contrast of **at least 7:1**. Add a small self-test in `contrast.js` that logs a warning if any theme falls below that.

| Theme | Background | Text | Sentence highlight | Use |
|---|---|---|---|---|
| Paper (default) | `#FBF5E9` | `#2B2620` | `rgba(245,196,81,.38)` | everyday |
| Clear | `#F7F7F4` | `#26262A` | `rgba(120,170,255,.28)` | people who prefer white-ish |
| Sky | `#EAF2F8` | `#1E2A35` | `rgba(245,196,81,.40)` | soft blue |
| Dusk | `#1F2023` | `#E6E2DA` | `rgba(245,196,81,.24)` | dark mode, not pure black |
| Night | `#17140F` | `#D9CBB3` | `rgba(230,170,90,.22)` | bedtime, warm and dim |

**Auto:** follows the system. Light mode uses Paper and dark mode uses Dusk, through `prefers-color-scheme`. This is the first-launch setting.

**"+" Custom tint:** the user picks any background color.
- Pick dark or light text automatically, whichever has the better contrast.
- Show a small warning if contrast is under 7:1.
- Block anything under 4.5:1.
- Avoid suggesting green or red/pink tints, since they're hard for color-blind users.

Update `<meta name="theme-color">` to match the theme so Safari's toolbar blends in.

The current **word** while speaking gets a stronger tint plus a 2px rounded underline in the theme's accent.

### App interface (everything that isn't the reading text)

- **Font:** `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`.
  - Optional nice touch: on iOS, set the root size with `font: -apple-system-body` so the app follows the phone's text-size setting.
- **Accent color:** warm amber `#E9A93B` in light themes and `#F2C14E` in dark themes.
  - Primary buttons use ink-colored text on amber. Check the contrast.
- **Shapes and depth:**
  - Corner radius: 12px for cards, 20px for sheets, full round for pills.
  - Shadows are soft and large: `0 8px 30px rgba(0,0,0,.08)`.
  - Sheets and the player use `backdrop-filter: blur(20px)` over a translucent background.
- **Tap targets:** at least 44×44px.
- **Icons:** simple line icons with a 1.75px stroke and round caps. Draw them inline as SVG, or copy the few you need from Lucide (free, ISC license).
- **Motion:** 200–250ms ease-out. Turn animations off under `prefers-reduced-motion`.
- **Layout:** use `viewport-fit=cover` and `env(safe-area-inset-*)` so nothing hides under the iPhone notch or home bar.
- **Restraint:** no emojis in the interface. White space is the design.

### Reading fonts

Self-host the reading fonts as `.woff2` in `/fonts` so they work offline. Download them with npm from Fontsource, then copy the files over:
- `@fontsource/lexend` is the default.
- `@fontsource/atkinson-hyperlegible`
- `@fontsource/opendyslexic` (OFL-1.1 license)

Check each package name before installing. **System** uses the device font.

Use `font-display: swap`, and load each font only when the user selects it, except the default.

---

## 6. Read-aloud engine (`speech.js`)

Use the browser's built-in `speechSynthesis`. It's free, works offline and needs no key.

**Splitting text (`text.js`)**
1. Split the text into paragraphs (on blank lines), then sentences, then words.
2. Use `Intl.Segmenter` (granularity `sentence` and `word`), with a regex fallback.
3. Split any sentence over about 220 characters at commas or semicolons, because long utterances can stall in some browsers.
4. Render each sentence as `<span class="s" data-i>` and each word as `<span class="w" data-start data-end>`. The data attributes hold character offsets within the sentence.

**Speaking**
- Speak **one utterance per sentence**. When one ends, start the next. This keeps the sentence highlight reliable in every browser.
- **Word highlight:** listen for `boundary` events where `name === "word"`, and use `charIndex` to find the matching word span.
  - If no word boundary has arrived about 1.2 seconds into a sentence, use sentence-only highlighting for the rest of the session.
  - Never fake word timing.
- **Pause:** cancel speech and remember the sentence index, because `pause()` and `resume()` are unreliable on some browsers. Resume restarts that sentence.
- **Speed:** 0.6× to 1.6×, default 1.0×. Changing the speed while reading restarts the current sentence at the new rate.
- **Voices:** load them asynchronously and listen for `voiceschanged`.
  - Show voices that match the document's language, sorted with "Enhanced", "Premium" or "Natural" voices first.
  - Remember the user's choice.
- **iOS:** the first `speak()` must happen directly inside a tap handler.
  - If nothing plays after about 1 second, show the hint "No sound? Check the volume and the silent switch."
- **Screen and scrolling:**
  - Keep the screen awake while reading, using the Screen Wake Lock API where supported, and release it when reading stops.
  - Auto-scroll so the current sentence stays in the middle third of the screen, with smooth scrolling unless reduced motion is on.
  - If the user scrolls manually while reading, stop auto-scrolling until they press a "Back to reading" chip.

### Reading ruler

When the ruler is on, keep a band about 2.2 lines tall at full strength and dim the text above and below it to 35% opacity.
- **While reading aloud:** the band follows the current sentence.
- **Otherwise:** the band follows a tap or drag on touch screens, and the mouse or arrow keys on Mac.

---

## 7. Library (`library.js`)

Store documents in **IndexedDB** with a tiny hand-written helper, not a library. Each document has these fields: `{ id, title, text, createdAt, updatedAt, lastSentence }`.

- **Title:** the first line, or the first six words if there's no line break. Users can rename it.
- **Resume:** reopening a document scrolls to `lastSentence`.
- **Row menu:** each row has a "…" menu with Rename and Delete. Delete asks for confirmation.

---

## 8. App icon (Claude Code makes this)

### Step 1: make three concepts

Make **three concepts** as 1024×1024 SVGs and show them together on a preview page called `icons/preview.html`. Show each one at 1024, 180, 60 and 32px, on light and dark backgrounds. Ask the user to pick one.

**A. Highlighted line (recommended)**
- A cream background with a subtle vertical gradient from `#FBF6EC` to `#F2E8D5`.
- Three horizontal rounded bars in ink `#2E2A25`, like lines of text. Widths are about 560, 620 and 400 units; the last one is shorter, like a paragraph ending.
- The bars are left-aligned as a group, and the group is centered.
- The middle bar sits on a soft amber `#F5C451` rounded highlight band.
- No letters and no other details.

**B. Lowercase "a"**
- A single lowercase **a** in Lexend Medium, ink on cream.
- A short amber rounded underline beneath it.

**C. Ruler**
- The same three lines as A.
- The top and bottom lines are faded to 30% opacity; the middle line is at full strength. This shows the reading ruler.

### Rules for all three

- Keep all artwork inside the central 80% circle, the "maskable safe zone."
- The background must be full-bleed and opaque. iOS rounds the corners itself.
- No text other than concept B's single letter, and no thin hairlines (they vanish at small sizes).

### Step 2: export the chosen icon

Export these files into `/icons`. Use the `sharp` npm package, or as a fallback a tiny `export.html` that draws the SVG to a canvas and downloads the PNGs.
- `icon.svg` (master)
- `favicon.svg`
- `favicon-32.png`
- `apple-touch-icon.png` (180×180)
- `icon-192.png`
- `icon-512.png`
- `icon-maskable-512.png` (artwork scaled to about 80%)

Link them in `index.html` and in `manifest.webmanifest`. The manifest uses `name: "EasyRead"`, `display: "standalone"`, and `background_color` and `theme_color` set to `#FBF5E9`.

---

## 9. Build phases

Check off each phase's **Done when** items before moving on.

### Phase 0: setup
1. Check for Node and Git.
2. Create the folder structure and README.
3. Run `git init`.
4. Start a local server with `npx serve .` and show the user how to open it.

**Done when:** a blank page titled EasyRead opens at the local address.

### Phase 1: reader core
1. Build the Home screen: text box, Paste, Open `.txt`, Read it.
2. Build the Reader screen with Paper theme defaults and the Lexend font.
3. Add text splitting, the sample document and the Back button.

**Done when:** pasted text shows in the calm reading layout, and long text stays left-aligned at about 62 characters per line.

### Phase 1.5: put it online early
1. Walk the user through a free GitHub account and a **public** repo.
2. Push the project.
3. Turn on GitHub Pages and give them the `https://…github.io/…` link to open on their phone.

Netlify Drop is a free backup option.

**Done when:** the app opens on the user's phone from that link.

### Phase 2: Look sheet
1. Add all themes, Auto mode and custom tint with contrast checking.
2. Add the fonts, size, spacing presets and custom sliders, and line width.
3. Add the reading ruler and Focus mode.
4. Save settings to localStorage.

**Done when:**
- Every option updates live.
- Settings survive a reload.
- The contrast self-test passes.

### Phase 3: read aloud
1. Build everything in section 6: the player pill, tap a sentence, tap a word, speed and voice.
2. Add wake lock, auto-scroll and the "Back to reading" chip.

**Done when:**
- Reading works on iPhone Safari and on Chrome or Edge on Windows.
- Sentence highlight always works.
- Word highlight works wherever the browser supports it.

### Phase 4: library
1. Add IndexedDB saving and the Recent list.
2. Add rename, delete and resume position.
3. On wide screens, show the library as a sidebar.

**Done when:** documents are still there after closing and reopening the browser.

### Phase 5: app-ify and icon
1. Make the three icon concepts, the user picks one, then export the files (section 8).
2. Add the manifest and a service worker that caches the app shell and fonts.
3. Make sure the app works offline after the first visit.
4. Add safe-area padding and the Mac keyboard shortcuts.

**Done when:**
- "Add to Home Screen" on iPhone shows the icon and opens full-screen.
- Airplane mode still works after the first visit.

### Phase 6: polish and test
1. Run the test checklist below on every device available.
2. Fix anything that looks cramped, misaligned or janky.
3. Write the README: what the app does, who it helps, privacy, how to run it, and credits and licenses for the fonts and icons.

### Stretch goals (only if Phases 0–6 are done)
- **Scan a page:** `<input type="file" accept="image/*" capture="environment">`, then run OCR in the browser with **Tesseract.js** (free).
  - Show progress, and let the user fix the recognized text before reading.
  - The language data downloads on first use, so say that.
- **PDF import:** with **pdf.js** (free).
- **Spanish:** Spanish interface text, with Spanish voices chosen automatically when the document language is Spanish.
- **Definitions:** tap a word, then "Define." Fetch the meaning from the free Dictionary API (dictionaryapi.dev), and show "Needs internet" when offline.

---

## 10. Test checklist

- [ ] **iPhone Safari:**
  - [ ] paste, read aloud, pause and resume, change speed mid-sentence
  - [ ] silent-switch hint
  - [ ] Add to Home Screen
  - [ ] airplane mode
- [ ] **iPad Safari:** sidebar layout, the Look popover, rotation.
- [ ] **Mac Safari:** keyboard shortcuts, Add to Dock.
- [ ] **Windows Chrome or Edge:** read aloud, voices load, install prompt.
- [ ] **Every theme:**
  - [ ] the contrast self-test passes
  - [ ] the highlight is visible but text stays readable
- [ ] **VoiceOver:** every button has a label, and focus order makes sense.
- [ ] **Accessibility settings:** reduced motion turns off animations, and 200% browser zoom still works with no sideways scrolling.
- [ ] **A 5,000-word paste:** scrolling stays smooth and reading doesn't stall.
- [ ] **No network requests at all** after the first load, except optional stretch features.
