import { captureLookSession, type LookSession } from "./session";
import { validateLookPhoto } from "./photo";
import {
  LookStorageError,
  MAX_WORN_LOOKS,
  MAX_LOOK_ITEMS,
  type WornLook,
  type WornLookInput,
  type WornLookPatch,
} from "./types";

const DB_NAME = "wardrobe_worn_looks";
const STORE = "looks";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const WORN_LOOKS_CHANGED = "wardrobe:worn-looks-changed";
export function normalizeLookStorageError(error: unknown): LookStorageError {
  if (error instanceof LookStorageError) return error;
  return new LookStorageError(
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "QuotaExceededError"
      ? "quota-exceeded"
      : "storage-unavailable",
  );
}
function metadata(input: Pick<WornLookInput, "name" | "itemIds">) {
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.trim().length > 100
  )
    throw new LookStorageError("invalid-name");
  if (
    !Array.isArray(input.itemIds) ||
    input.itemIds.length > MAX_LOOK_ITEMS ||
    input.itemIds.some((id) => typeof id !== "string" || !uuid.test(id))
  )
    throw new LookStorageError("invalid-items");
  return {
    name: input.name.trim(),
    itemIds: Array.from(new Set(input.itemIds.map((id) => id.toLowerCase()))),
  };
}
function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    return Promise.reject(new LookStorageError("storage-unavailable"));
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    let blocked = false;
    try {
      request = indexedDB.open(DB_NAME, 1);
    } catch (error) {
      reject(normalizeLookStorageError(error));
      return;
    }
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, {
        keyPath: ["ownerId", "id"],
      });
      store.createIndex("ownerId", "ownerId");
    };
    request.onerror = () => reject(normalizeLookStorageError(request.error));
    request.onblocked = () => {
      blocked = true;
      reject(new LookStorageError("storage-unavailable"));
    };
    request.onsuccess = () => {
      if (blocked) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
async function transaction<T>(
  scope: LookSession,
  mode: IDBTransactionMode,
  work: (
    store: IDBObjectStore,
    done: (value: T) => void,
    fail: (error: unknown) => void,
  ) => void,
): Promise<T> {
  const db = await openDb();
  try {
    scope.assert();
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      let value: T;
      let hasValue = false;
      let failure: unknown;
      const fail = (error: unknown) => {
        failure = error;
        try {
          tx.abort();
        } catch {
          reject(normalizeLookStorageError(error));
        }
      };
      const abort = () => fail(new LookStorageError("session-changed"));
      scope.signal.addEventListener("abort", abort, { once: true });
      const cleanup = () => scope.signal.removeEventListener("abort", abort);
      tx.oncomplete = () => {
        cleanup();
        try {
          scope.assert();
          if (!hasValue) throw new LookStorageError("storage-unavailable");
          resolve(value);
        } catch (error) {
          reject(normalizeLookStorageError(error));
        }
      };
      tx.onabort = () => {
        cleanup();
        reject(normalizeLookStorageError(failure ?? tx.error));
      };
      tx.onerror = () => {
        failure ??= tx.error;
      };
      try {
        work(
          tx.objectStore(STORE),
          (result) => {
            value = result;
            hasValue = true;
          },
          fail,
        );
      } catch (error) {
        fail(error);
      }
    });
  } finally {
    db.close();
  }
}
function notify(owner: string) {
  if (typeof window !== "undefined")
    window.dispatchEvent(
      new CustomEvent(WORN_LOOKS_CHANGED, { detail: owner }),
    );
}
function validRecord(row: WornLook, owner: string): boolean {
  try {
    metadata(row);
  } catch {
    return false;
  }
  return (
    row.schemaVersion === 1 &&
    row.ownerId === owner &&
    typeof row.id === "string" &&
    uuid.test(row.id) &&
    Number.isFinite(row.createdAt) &&
    row.photoBlob instanceof Blob &&
    row.photoBlob.size > 0
  );
}
export async function listWornLooks(
  ownerId?: string | null,
): Promise<WornLook[]> {
  const scope = captureLookSession(ownerId);
  try {
    return await transaction<WornLook[]>(
      scope,
      "readonly",
      (store, done, fail) => {
        const request = store.index("ownerId").getAll(scope.ownerId);
        request.onerror = () => fail(request.error);
        request.onsuccess = () => {
          const rows = request.result as WornLook[];
          if (rows.some((row) => !validRecord(row, scope.ownerId)))
            return fail(new LookStorageError("invalid-record"));
          done(
            rows.sort(
              (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id),
            ),
          );
        };
      },
    );
  } catch (error) {
    throw normalizeLookStorageError(error);
  } finally {
    scope.dispose();
  }
}
export async function createWornLook(
  input: WornLookInput,
  ownerId?: string | null,
): Promise<WornLook> {
  const scope = captureLookSession(ownerId);
  try {
    const data = metadata(input);
    await validateLookPhoto(input.photoBlob, scope.signal);
    scope.assert();
    const record: WornLook = {
      ...data,
      photoBlob: input.photoBlob,
      id: crypto.randomUUID(),
      ownerId: scope.ownerId,
      createdAt: Date.now(),
      schemaVersion: 1,
    };
    const saved = await transaction<WornLook>(
      scope,
      "readwrite",
      (store, done, fail) => {
        const count = store.index("ownerId").count(scope.ownerId);
        count.onerror = () => fail(count.error);
        count.onsuccess = () => {
          try {
            scope.assert();
            if (count.result >= MAX_WORN_LOOKS)
              return fail(new LookStorageError("limit-reached"));
            const write = store.add(record);
            write.onerror = () => fail(write.error);
            write.onsuccess = () => done(record);
          } catch (error) {
            fail(error);
          }
        };
      },
    );
    notify(scope.ownerId);
    return saved;
  } catch (error) {
    throw normalizeLookStorageError(error);
  } finally {
    scope.dispose();
  }
}
export async function updateWornLook(
  id: string,
  patch: WornLookPatch,
  ownerId?: string | null,
): Promise<WornLook> {
  const scope = captureLookSession(ownerId);
  try {
    if (patch.photoBlob !== undefined)
      await validateLookPhoto(patch.photoBlob, scope.signal);
    scope.assert();
    const saved = await transaction<WornLook>(
      scope,
      "readwrite",
      (store, done, fail) => {
        const read = store.get([scope.ownerId, id]);
        read.onerror = () => fail(read.error);
        read.onsuccess = () => {
          try {
            scope.assert();
            const existing = read.result as WornLook | undefined;
            if (!existing) return fail(new LookStorageError("not-found"));
            if (!validRecord(existing, scope.ownerId))
              return fail(new LookStorageError("invalid-record"));
            const changed: WornLook = {
              ...existing,
              ...metadata({
                name: patch.name ?? existing.name,
                itemIds: patch.itemIds ?? existing.itemIds,
              }),
              photoBlob: patch.photoBlob ?? existing.photoBlob,
            };
            const write = store.put(changed);
            write.onerror = () => fail(write.error);
            write.onsuccess = () => done(changed);
          } catch (error) {
            fail(error);
          }
        };
      },
    );
    notify(scope.ownerId);
    return saved;
  } catch (error) {
    throw normalizeLookStorageError(error);
  } finally {
    scope.dispose();
  }
}
export async function deleteWornLook(
  id: string,
  ownerId?: string | null,
): Promise<void> {
  const scope = captureLookSession(ownerId);
  try {
    await transaction<void>(scope, "readwrite", (store, done, fail) => {
      const read = store.get([scope.ownerId, id]);
      read.onerror = () => fail(read.error);
      read.onsuccess = () => {
        try {
          scope.assert();
          if (!read.result) return fail(new LookStorageError("not-found"));
          const request = store.delete([scope.ownerId, id]);
          request.onerror = () => fail(request.error);
          request.onsuccess = () => done(undefined);
        } catch (error) {
          fail(error);
        }
      };
    });
    notify(scope.ownerId);
  } catch (error) {
    throw normalizeLookStorageError(error);
  } finally {
    scope.dispose();
  }
}
