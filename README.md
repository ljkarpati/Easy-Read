# EasyRead

EasyRead makes reading more comfortable. Paste, type or open some text, and EasyRead shows it in a calm, dyslexia-friendly layout. It can read the text aloud and light up each sentence (and each word, where the browser allows) as it goes.

## Who it helps

People with dyslexia and other reading difficulties, and anyone with tired eyes or reading in a second language. It is made for students, parents and older adults.

## What it does

- **Calm reading layout.** Cream background, left-aligned text, about 62 characters per line, generous line and letter spacing.
- **Read aloud.** Uses the voices already on your device. Tap a sentence to jump there while reading. When stopped, tap a word to hear just that word.
- **Look options (Aa).** Five themes plus Auto and a custom tint, three reading fonts (Lexend, Atkinson Hyperlegible, OpenDyslexic) or the system font, text size, spacing, line width and a reading ruler.
- **Focus mode.** Tap an empty space to hide the buttons.
- **Library.** Your texts are saved on the device and reopen where you left off.
- **Works offline** after the first visit, and installs with Add to Home Screen (iPhone and iPad) or Add to Dock (Mac).

## Privacy

Your text never leaves this device. EasyRead has no accounts, no analytics, no tracking and no server. Texts are stored in the browser's own storage on your device.

Some browsers (Chrome and Edge) offer extra "online" voices that send text to Google or Microsoft to be spoken. EasyRead hides them unless you turn on **Settings → Online voices**.

## Install it on a phone, tablet or Mac

1. Open the app's link in **Safari** (iPhone, iPad, Mac) or **Chrome / Edge** (Windows).
2. iPhone and iPad: tap the Share button, then **Add to Home Screen**. Mac: **File → Add to Dock**. Chrome or Edge: click the install icon in the address bar.

Safari can clear a website's storage if you don't open it for a week or so. Adding EasyRead to your Home Screen or Dock keeps your library safe.

## Run it on your computer

You need the free [Node.js LTS](https://nodejs.org) and [Git](https://git-scm.com). In PowerShell:

```powershell
git clone https://github.com/ljkarpati/Easy-Read.git
cd Easy-Read
npx serve .
```

Then open http://localhost:3000.

## How it's built

Plain HTML, CSS and JavaScript, with no frameworks and no build step. The folder works as-is on any static host, such as GitHub Pages.

| File | What it does |
|---|---|
| `index.html` | The single page with every screen |
| `styles.css` | Layout and the five themes |
| `js/app.js` | Starts the app and moves between screens |
| `js/text.js` | Splits text into paragraphs, sentences and words |
| `js/reader.js` | The reading view, ruler and focus mode |
| `js/speech.js` | The read-aloud engine |
| `js/settings.js` | Look settings, saved on the device |
| `js/library.js` | Saved texts (IndexedDB) |
| `js/contrast.js` | Contrast checks for themes and custom tints |
| `sw.js` | Offline support. Bump `VERSION` whenever a file changes. |

The `icons/preview.html` page shows the three icon concepts. Concept A is in use.

This is a practice build. Claude Code wrote the code.

## Credits and licenses

- **Lexend** by the Lexend Project Authors, SIL Open Font License 1.1 (`fonts/LICENSE-Lexend.txt`).
- **Atkinson Hyperlegible** by the Braille Institute of America, SIL Open Font License 1.1 (`fonts/LICENSE-AtkinsonHyperlegible.txt`).
- **OpenDyslexic** by Abbie Gonzalez, SIL Open Font License 1.1 (`fonts/LICENSE-OpenDyslexic.txt`).
- Fonts packaged by [Fontsource](https://fontsource.org).
- Interface icons from [Lucide](https://lucide.dev), ISC license.
- The app icon was drawn for EasyRead.

EasyRead makes reading more comfortable. It is not a treatment for dyslexia.
