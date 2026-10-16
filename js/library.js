// library.js: saved documents in IndexedDB.
// Each document: { id, title, text, createdAt, updatedAt, lastSentence }
// plus an optional source: { name, url } for articles from Wikipedia.

const DB_NAME = "easyread";
const DB_VERSION = 1;
const STORE = "docs";

let db = null;
let docs = [];
const listeners = new Set();

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(seed) {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB unavailable"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const store = req.result.createObjectStore(STORE, { keyPath: "id" });
      // First launch: add the welcome document once.
      if (e.oldVersion === 0 && seed) store.add(seed);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}

function store(mode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

async function write(fn) {
  if (!db) return; // memory-only mode
  try {
    await request(fn(store("readwrite")));
  } catch (err) {
    console.warn("EasyRead could not save to storage.", err);
  }
}

function emit() {
  listeners.forEach((fn) => fn(list()));
}

function uid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function newDoc(title, text, time = Date.now()) {
  return { id: uid(), title, text, createdAt: time, updatedAt: time, lastSentence: 0 };
}

export async function init(seed) {
  try {
    db = await openDb(seed);
    docs = await request(store("readonly").getAll());
  } catch (err) {
    // Private browsing or blocked storage: keep documents in memory.
    console.warn("EasyRead is using memory-only storage.", err);
    db = null;
    docs = seed ? [seed] : [];
  }
  return list();
}

export function list() {
  return docs.slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function get(id) {
  return docs.find((d) => d.id === id) || null;
}

export function findByText(text) {
  return docs.find((d) => d.text === text) || null;
}

export async function add(title, text, extra = {}) {
  const doc = { ...newDoc(title, text), ...extra };
  docs.push(doc);
  emit();
  await write((s) => s.put(doc));
  navigator.storage?.persist?.().catch(() => {});
  return doc;
}

// touch: move the document to the top of Recent.
export async function update(id, patch, { touch = true } = {}) {
  const i = docs.findIndex((d) => d.id === id);
  if (i === -1) return null;
  const doc = { ...docs[i], ...patch };
  if (touch) doc.updatedAt = Date.now();
  docs[i] = doc;
  emit();
  await write((s) => s.put(doc));
  return doc;
}

export async function remove(id) {
  docs = docs.filter((d) => d.id !== id);
  emit();
  await write((s) => s.delete(id));
}

export async function clear() {
  docs = [];
  emit();
  await write((s) => s.clear());
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
