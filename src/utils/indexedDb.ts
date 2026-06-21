export interface OfflineJournal {
  id: string;
  blob: Blob;
  mimeType: string;
  createdAt: string;
}

const DB_NAME = "yapsite_db";
const STORE_NAME = "offline_journals";
const DB_VERSION = 1;

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("IndexedDB is only available in the browser"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

export async function saveOfflineJournal(blob: Blob, mimeType: string): Promise<OfflineJournal> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    const journal: OfflineJournal = {
      id: `offline-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      blob,
      mimeType,
      createdAt: new Date().toISOString(),
    };

    const request = store.add(journal);

    request.onsuccess = () => resolve(journal);
    request.onerror = () => reject(request.error);
  });
}

export async function getOfflineJournals(): Promise<OfflineJournal[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error("Failed to read from IndexedDB:", error);
    return [];
  }
}

export async function deleteOfflineJournal(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
