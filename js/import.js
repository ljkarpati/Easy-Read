// import.js: turns photos, PDFs and Word documents into plain text.
// Everything runs on this device. The text-recognition (OCR) and PDF
// libraries live in /vendor and load only the first time they are needed.

const ROOT = new URL("../", import.meta.url);
const at = (path) => new URL(path, ROOT).href;

export const OCR_FIRST_DOWNLOAD = "about 7 MB";

export class Cancelled extends Error {
  constructor() {
    super("Cancelled");
  }
}

/* ---------- What kind of file is this? ---------- */

export function kindOf(file) {
  const name = (file.name || "").toLowerCase();
  const type = file.type || "";
  if (type.startsWith("image/") || /\.(jpe?g|png|heic|heif|webp|gif|bmp|tiff?)$/.test(name)) return "image";
  if (type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx") || type.includes("wordprocessingml")) return "docx";
  if (type.startsWith("text/") || /\.(txt|text|md)$/.test(name)) return "text";
  return null;
}

export function titleFromFile(file) {
  return (file.name || "").replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").trim();
}

/* ---------- Plain text files ---------- */

export async function readTextFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes); // older Windows files
  }
}

/* ---------- Word documents (.docx) ---------- */

// A .docx is a zip file. This reads one entry using the browser's
// built-in decompression, so no zip library is needed.
async function unzipEntry(bytes, wanted) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("Not a zip file");
  const count = view.getUint16(end + 10, true);
  let ptr = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  for (let n = 0; n < count && view.getUint32(ptr, true) === 0x02014b50; n++) {
    const method = view.getUint16(ptr + 10, true);
    const size = view.getUint32(ptr + 20, true);
    const nameLength = view.getUint16(ptr + 28, true);
    const extraLength = view.getUint16(ptr + 30, true);
    const commentLength = view.getUint16(ptr + 32, true);
    const local = view.getUint32(ptr + 42, true);
    const name = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLength));
    if (name === wanted) {
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + size);
      if (method === 0) return decoder.decode(data);
      if (method === 8) {
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Response(stream).text();
      }
      throw new Error("Unsupported zip compression");
    }
    ptr += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${wanted} not found`);
}

export async function readDocx(file) {
  const xml = await unzipEntry(new Uint8Array(await file.arrayBuffer()), "word/document.xml");
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const paragraphs = [];
  const walk = (node, out) => {
    for (const child of node.childNodes) {
      if (child.nodeType !== 1) continue;
      const name = child.localName;
      if (name === "p") {
        const parts = [];
        walk(child, parts);
        const text = parts.join("").replace(/[ \t]+/g, " ").trim();
        if (text) paragraphs.push(text);
      } else if (name === "t") {
        out.push(child.textContent);
      } else if (name === "tab") {
        out.push(" ");
      } else if (name === "br" || name === "cr") {
        out.push("\n");
      } else {
        walk(child, out);
      }
    }
  };
  walk(doc.documentElement, []);
  return paragraphs.join("\n\n");
}

/* ---------- Text recognition (photos and scanned pages) ---------- */

let ocrWorker = null;
let ocrProgress = null;

async function getOcrWorker() {
  if (!ocrWorker) {
    ocrWorker = (async () => {
      const { default: Tesseract } = await import("../vendor/tesseract/tesseract.esm.min.js");
      return Tesseract.createWorker("eng", 1, {
        workerPath: at("vendor/tesseract/worker.min.js"),
        corePath: at("vendor/tesseract/core/"),
        langPath: at("vendor/tesseract/lang"),
        workerBlobURL: false,
        logger: (m) => ocrProgress?.(m),
      });
    })();
    ocrWorker.catch(() => {
      ocrWorker = null;
    });
  }
  return ocrWorker;
}

export async function cancelOcr() {
  const pending = ocrWorker;
  ocrWorker = null;
  if (pending) {
    try {
      (await pending).terminate();
    } catch {
      // It never started; nothing to stop.
    }
  }
}

// Shrinks big phone photos (12+ megapixels) so recognition is quick,
// and applies the photo's rotation.
async function preparePhoto(source) {
  let image;
  try {
    image = await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not open the photo"));
      img.src = URL.createObjectURL(source);
    });
  }
  const max = 2400;
  const scale = Math.min(1, max / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close?.();
  return canvas;
}

function canvasBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

// Fixes the usual OCR line-wrap leftovers.
export function cleanOcrText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")          // re-join hyphenated words
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line || /[\p{L}\p{N}]{2,}/u.test(line)) // drop stray specks
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// onProgress({ stage: "prepare" | "read", progress: 0..1 })
export async function recognize(source, onProgress, isCancelled = () => false) {
  const canvas = source instanceof HTMLCanvasElement ? source : await preparePhoto(source);
  if (isCancelled()) throw new Cancelled();
  ocrProgress = (m) => {
    const reading = m.status === "recognizing text";
    onProgress?.({ stage: reading ? "read" : "prepare", progress: m.progress || 0 });
  };
  onProgress?.({ stage: "prepare", progress: 0 });
  try {
    const worker = await getOcrWorker();
    if (isCancelled()) throw new Cancelled();
    const { data } = await worker.recognize(await canvasBlob(canvas));
    if (isCancelled()) throw new Cancelled();
    return cleanOcrText(data.text || "");
  } finally {
    ocrProgress = null;
  }
}

/* ---------- PDF ---------- */

let pdfLib = null;

function loadPdfLib() {
  if (!pdfLib) {
    pdfLib = import("../vendor/pdfjs/pdf.min.mjs").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = at("vendor/pdfjs/pdf.worker.min.mjs");
      return lib;
    });
    pdfLib.catch(() => {
      pdfLib = null;
    });
  }
  return pdfLib;
}

// The normal gap between lines: a low percentile, because short
// paragraphs mean many of the gaps are paragraph gaps.
function usualGap(values) {
  if (!values.length) return 0;
  const s = values.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.25)];
}

// Rebuilds lines from the PDF's text pieces, and puts a blank line
// where the gap between lines is bigger than usual (a new paragraph).
function pageText(items) {
  const lines = [];
  let line = { text: "", y: null };
  const flush = () => {
    const text = line.text.replace(/\s+/g, " ").trim();
    if (text && !/^\d{1,4}$/.test(text)) lines.push({ text, y: line.y }); // skip bare page numbers
    line = { text: "", y: null };
  };
  for (const item of items) {
    if (typeof item.str !== "string") continue;
    if (line.y === null && item.str.trim()) line.y = item.transform[5];
    line.text += item.str;
    if (item.hasEOL) flush();
  }
  flush();
  const gaps = [];
  for (let i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
  const usual = usualGap(gaps.filter((g) => g > 0));
  return lines
    .map((l, i) => {
      if (!i) return l.text;
      const gap = lines[i - 1].y - l.y;
      const newParagraph = usual && (gap > usual * 1.45 || gap < 0);
      return (newParagraph ? "\n\n" : "\n") + l.text;
    })
    .join("");
}

// Returns { text, scanned }. A scanned PDF (pictures of pages) has
// almost no text inside, so its pages are read with OCR instead.
// onProgress({ stage: "open" | "read", page, pages, progress })
export async function readPdf(file, onProgress, isCancelled = () => false) {
  onProgress?.({ stage: "open", page: 0, pages: 0, progress: 0 });
  const lib = await loadPdfLib();
  const task = lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    wasmUrl: at("vendor/pdfjs/wasm/"),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await task.promise;

  try {
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      if (isCancelled()) throw new Cancelled();
      const page = await pdf.getPage(n);
      pages.push(pageText((await page.getTextContent()).items));
      onProgress?.({ stage: "open", page: n, pages: pdf.numPages, progress: n / pdf.numPages });
    }
    const text = pages.filter(Boolean).join("\n\n").replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2");
    const letters = (text.match(/\p{L}/gu) || []).length;
    if (letters >= 30 * pdf.numPages || letters > 400) return { text, scanned: false };

    // Scanned: draw each page and read it.
    const read = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      if (isCancelled()) throw new Cancelled();
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(3, 2000 / base.width) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      read.push(await recognize(canvas, (p) => onProgress?.({ ...p, page: n, pages: pdf.numPages }), isCancelled));
    }
    return { text: read.filter(Boolean).join("\n\n"), scanned: true };
  } finally {
    task.destroy();
  }
}
