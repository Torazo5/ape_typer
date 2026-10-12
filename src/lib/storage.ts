import type { KeyEvent, TestResult } from "./types";

const DB = "typetrace";
const STORE = "traces";
const DETAILED_TRACES = 50;

export type Trace = { id: string; result: TestResult; events: KeyEvent[] };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveTrace(result: TestResult, events: KeyEvent[]) {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put({ id: result.id, result, events } satisfies Trace);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  // Every result summary is kept; only the newest 50 keep their full keystroke trace.
  const slimmed = (await readTraces(db)).slice(DETAILED_TRACES).filter((record) => record.events.length);
  if (slimmed.length) {
    const transaction = db.transaction(STORE, "readwrite");
    for (const record of slimmed) transaction.objectStore(STORE).put({ ...record, events: [] } satisfies Trace);
  }
  db.close();
}

async function readTraces(db?: IDBDatabase): Promise<Trace[]> {
  const database = db ?? await openDb();
  const records = await new Promise<Trace[]>((resolve, reject) => {
    const request = database.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as Trace[]);
    request.onerror = () => reject(request.error);
  });
  if (!db) database.close();
  return records.sort((a, b) => b.result.createdAt.localeCompare(a.result.createdAt));
}

export async function getLocalResults() { return (await readTraces()).map((trace) => trace.result); }
export const getLocalTraces = () => readTraces();

export async function clearTraces() {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}
