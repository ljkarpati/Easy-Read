# EasyRead

EasyRead makes reading more comfortable. Paste some text and it appears in a dyslexia-friendly font, with read-aloud that highlights each sentence as it goes.

It is for people with dyslexia and other reading difficulties, tired eyes, or reading in a second language.

**Open it:** https://ljkarpati.github.io/Easy-Read/

## Privacy

Your text stays on this device. There are no accounts, no tracking and no server. Each person's library lives only in their own browser.

## Status

Being rebuilt to the v3 guide in `CLAUDE.md`, one phase at a time. Phases 1 to 3 (Library, New sheet, Reader, the Aa sheet and read-aloud with the device's voices) are done.

## Run it on your computer

You need the free [Node.js LTS](https://nodejs.org) and [Git](https://git-scm.com). In PowerShell:

```powershell
git clone https://github.com/ljkarpati/Easy-Read.git
cd Easy-Read
npx serve .
```

Then open http://localhost:3000.

Plain HTML, CSS and JavaScript, with no frameworks and no build step. This is a practice build: Claude Code wrote the code.

## Credits and licenses

- **OpenDyslexic** by Abbie Gonzalez, SIL Open Font License 1.1 (`fonts/license-opendyslexic.txt`).
- **Atkinson Hyperlegible** by the Braille Institute of America, SIL Open Font License 1.1 (`fonts/license-atkinson-hyperlegible.txt`).
- Fonts packaged by [Fontsource](https://fontsource.org).
- Interface icons from [Lucide](https://lucide.dev), ISC license.
- Voice quality ratings and filter lists from [Readium Speech](https://github.com/readium/speech) (based on Hadrien Gardeur's web-speech-recommended-voices), BSD 3-Clause license (`voices/license.txt`).

EasyRead makes reading more comfortable. It is not a treatment for dyslexia.
