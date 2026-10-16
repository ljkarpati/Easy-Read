# EasyRead

EasyRead makes reading more comfortable. Take a photo of a page, open a PDF or Word file, look up a topic, or paste some text, and EasyRead shows it in a calm, dyslexia-friendly layout. It can read the text aloud and light up each sentence (and each word, where the browser allows) as it goes.

## Who it helps

People with dyslexia and other reading difficulties, and anyone with tired eyes or reading in a second language. It is made for students, parents and older adults.

## What it does

- **No typing needed.**
  - **Scan a page:** take a photo of a printed page and EasyRead reads the words from it on your device. You can check the text and add more pages before reading. The first scan downloads the text reader (about 7 MB); after that it works offline.
  - **Open file:** PDFs (including scanned ones), Word documents (.docx), text files and photos.
  - **Look up:** search Wikipedia, in Simple English by default, and open an article without the reference lists. Pasting a Wikipedia link works too.
- **Calm reading layout.** Cream background, left-aligned text, about 62 characters per line, generous line and letter spacing.
- **Read aloud.** Uses the voices already on your device. Tap a sentence to jump there while reading. When stopped, tap a word to hear just that word. The voice quality depends on the device: on iPhone, iPad and Mac, a free Premium or Enhanced voice sounds far more natural, and EasyRead shows how to get one when only a basic voice is installed.
- **Look options (Aa).** Five themes plus Auto and a custom tint, three reading fonts (Lexend, Atkinson Hyperlegible, OpenDyslexic) or the system font, text size, spacing, line width and a reading ruler.
- **Dyslexia mode.** One switch (under Aa, or in Settings) turns the whole app, buttons and menus included, into OpenDyslexic with extra-wide spacing. Turning it off brings back your previous font and spacing.
- **Focus mode.** Tap an empty space to hide the buttons.
- **Library.** Your texts are saved on the device and reopen where you left off.
- **Works offline** after the first visit, and installs with Add to Home Screen (iPhone and iPad) or Add to Dock (Mac).

## Privacy

Your text never leaves this device. EasyRead has no accounts, no analytics, no tracking and no server. Texts are stored in the browser's own storage on your device. Scanning photos and opening files happen on the device too.

**Look up** is the one exception: it sends your search words to Wikipedia to find articles. Other websites can't be opened from a link, because browsers block apps from reading other sites' pages. For those, copy the text and tap Paste.

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
| `js/import.js` | Photos (text recognition), PDFs, Word and text files |
| `js/lookup.js` | Wikipedia search and articles |
| `vendor/` | Tesseract.js and pdf.js, loaded only when first needed |
| `sw.js` | Offline support. Bump `VERSION` whenever a file changes. |

The `icons/preview.html` page shows the three icon concepts. Concept A is in use.

This is a practice build. Claude Code wrote the code.

## Credits and licenses

- **Lexend** by the Lexend Project Authors, SIL Open Font License 1.1 (`fonts/LICENSE-Lexend.txt`).
- **Atkinson Hyperlegible** by the Braille Institute of America, SIL Open Font License 1.1 (`fonts/LICENSE-AtkinsonHyperlegible.txt`).
- **OpenDyslexic** by Abbie Gonzalez, SIL Open Font License 1.1 (`fonts/LICENSE-OpenDyslexic.txt`).
- Fonts packaged by [Fontsource](https://fontsource.org).
- Interface icons from [Lucide](https://lucide.dev), ISC license.
- Text recognition by [Tesseract.js](https://github.com/naptha/tesseract.js), Apache License 2.0 (`vendor/tesseract/LICENSE.md`), with English data from Tesseract (Apache License 2.0).
- PDF reading by [pdf.js](https://mozilla.github.io/pdf.js/) from Mozilla, Apache License 2.0 (`vendor/pdfjs/LICENSE`).
- Articles from [Wikipedia](https://www.wikipedia.org), shared under CC BY-SA 4.0. Each article shows a link back to its source.
- The app icon was drawn for EasyRead.

EasyRead makes reading more comfortable. It is not a treatment for dyslexia.
