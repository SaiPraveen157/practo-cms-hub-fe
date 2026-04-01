/**
 * Persists agency “submit final package” wizard state (including File blobs)
 * per scriptId. Uses IndexedDB so page refresh keeps uploads + metadata.
 */

export type DraftVideoMeta = {
  title: string
  description: string
  tags: string[]
  /** Uncommitted text in the tag field (comma-separated counts toward tags). */
  tagDraft?: string
}

export type DraftShortSlot = {
  id: string
  meta: DraftVideoMeta
  file: File | null
}

export type PackageSubmitDraftV1 = {
  v: 1
  savedAt: number
  wizardStep: number
  scriptExpanded: boolean
  longVideoMeta: DraftVideoMeta
  longFile: File | null
  shortSlots: DraftShortSlot[]
  longThumbnailFile: File | null
  shortThumbnailBySlotId: Record<string, File | null>
}

/** One deliverable in the unified videos step (type chosen before upload). */
export type DraftPackageVideoSlot = {
  id: string
  videoType: "LONG_FORM" | "SHORT_FORM"
  meta: DraftVideoMeta
  file: File | null
  /**
   * Thumbnails for this video (Phase 6 supports multiple, reviewed individually).
   * Legacy single-thumbnail drafts may still populate `thumbnailFile`.
   */
  thumbnailFiles: File[]
  /** @deprecated legacy single-thumbnail draft field */
  thumbnailFile?: File | null
}

export type PackageSubmitDraftV2 = {
  v: 2
  savedAt: number
  wizardStep: number
  scriptExpanded: boolean
  /** Display name for the package (POST /api/packages `name`). Optional in stored drafts for backward compatibility. */
  packageName?: string
  videoSlots: DraftPackageVideoSlot[]
}

export type PackageSubmitDraftAny = PackageSubmitDraftV1 | PackageSubmitDraftV2

type StoredRow = (PackageSubmitDraftV1 | PackageSubmitDraftV2) & {
  scriptId: string
}

const DB_NAME = "practo-cms-hub"
const DB_VERSION = 1
const STORE = "packageSubmitDrafts"

export type DraftStorageErrorCode =
  | "INDEXEDDB_UNAVAILABLE"
  | "QUOTA_EXCEEDED"
  | "READ_FAILED"
  | "WRITE_FAILED"
  | "CLEAR_FAILED"

export type LoadDraftResult =
  | { ok: true; draft: PackageSubmitDraftAny | null }
  | { ok: false; draft: null; code: DraftStorageErrorCode; detail?: string }

export type SaveDraftResult =
  | { ok: true }
  | { ok: false; code: DraftStorageErrorCode; detail?: string }

export type ClearDraftResult =
  | { ok: true }
  | { ok: false; code: DraftStorageErrorCode; detail?: string }

function classifyDbError(e: unknown): DraftStorageErrorCode {
  const name =
    e instanceof DOMException
      ? e.name
      : e && typeof e === "object" && "name" in e
        ? String((e as { name: string }).name)
        : ""
  if (name === "QuotaExceededError") return "QUOTA_EXCEEDED"
  return "WRITE_FAILED"
}

/** Copy for UI toasts (Sonner). */
export function userMessageForLoadDraftFailure(): {
  title: string
  description: string
} {
  return {
    title: "Could not load saved draft",
    description:
      "We couldn’t read saved progress from this browser. Continue here or re-upload files if anything looks missing after a refresh.",
  }
}

export function userMessageForSaveDraftFailure(
  code: DraftStorageErrorCode
): { title: string; description: string } {
  switch (code) {
    case "QUOTA_EXCEEDED":
      return {
        title: "Auto-save failed — storage full",
        description:
          "The browser can’t store more data for this site. Try smaller videos, free disk space, or clear site data for this app. Keep this tab open until you submit.",
      }
    case "INDEXEDDB_UNAVAILABLE":
      return {
        title: "Auto-save isn’t available",
        description:
          "This browser or profile doesn’t allow local draft storage. Don’t refresh until you submit, or uploads may be lost.",
      }
    default:
      return {
        title: "Could not auto-save draft",
        description:
          "Something went wrong writing to browser storage. Your work is still in this tab; avoid refreshing until you submit.",
      }
  }
}

export function userMessageForClearDraftFailure(): {
  title: string
  description: string
} {
  return {
    title: "Local draft copy may still be on this device",
    description:
      "The package was submitted successfully. If you like, clear this site’s data in browser settings to remove the old draft.",
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "scriptId" })
      }
    }
  })
}

export async function loadPackageSubmitDraft(
  scriptId: string
): Promise<LoadDraftResult> {
  if (typeof indexedDB === "undefined" || !scriptId) {
    return { ok: true, draft: null }
  }
  try {
    const db = await openDb()
    const draft = await new Promise<PackageSubmitDraftAny | null>(
      (resolve, reject) => {
        const tx = db.transaction(STORE, "readonly")
        const store = tx.objectStore(STORE)
        const r = store.get(scriptId)
        r.onerror = () => reject(r.error)
        r.onsuccess = () => {
          const row = r.result as StoredRow | undefined
          if (!row?.v || (row.v !== 1 && row.v !== 2)) {
            resolve(null)
            return
          }
          const { scriptId: _sid, ...rest } = row
          resolve(rest as PackageSubmitDraftAny)
        }
      }
    )
    return { ok: true, draft }
  } catch (e) {
    return {
      ok: false,
      draft: null,
      code: "READ_FAILED",
      detail: e instanceof Error ? e.message : undefined,
    }
  }
}

export type PackageSubmitDraftSavePayload = Omit<
  PackageSubmitDraftV2,
  "savedAt" | "v"
>

export async function savePackageSubmitDraft(
       scriptId: string,
       draft: PackageSubmitDraftSavePayload
): Promise<SaveDraftResult> {
  if (typeof indexedDB === "undefined" || !scriptId) {
    return { ok: false, code: "INDEXEDDB_UNAVAILABLE" }
  }
  try {
    const db = await openDb()
    const row: StoredRow = {
      v: 2,
      savedAt: Date.now(),
      ...draft,
      scriptId,
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error("tx aborted"))
      tx.objectStore(STORE).put(row)
    })
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      code: classifyDbError(e),
      detail: e instanceof Error ? e.message : undefined,
    }
  }
}

export async function clearPackageSubmitDraft(
  scriptId: string
): Promise<ClearDraftResult> {
  if (typeof indexedDB === "undefined" || !scriptId) {
    return { ok: false, code: "INDEXEDDB_UNAVAILABLE" }
  }
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite")
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error("tx aborted"))
      tx.objectStore(STORE).delete(scriptId)
    })
    return { ok: true }
  } catch (e) {
    return {
      ok: false,
      code: "CLEAR_FAILED",
      detail: e instanceof Error ? e.message : undefined,
    }
  }
}

/** IDB may return Blob instead of File; uploads need a File (name/type). */
export function normalizeRestoredFile(
  value: unknown,
  fallbackName: string
): File | null {
  if (value == null) return null
  if (value instanceof File) return value
  if (value instanceof Blob) {
    return new File([value], fallbackName, {
      type: value.type || "application/octet-stream",
    })
  }
  return null
}

function packageSubmitDraftHasUsefulStateV1(d: PackageSubmitDraftV1): boolean {
  return (
    d.wizardStep > 0 ||
    Boolean(d.longVideoMeta.title.trim()) ||
    Boolean(d.longVideoMeta.description.trim()) ||
    d.longVideoMeta.tags.length > 0 ||
    Boolean(d.longVideoMeta.tagDraft?.trim()) ||
    d.longFile != null ||
    d.shortSlots.length > 0 ||
    d.longThumbnailFile != null ||
    Object.keys(d.shortThumbnailBySlotId).length > 0 ||
    d.shortSlots.some(
      (s) => s.file != null || Boolean(s.meta.tagDraft?.trim())
    )
  )
}

export function packageSubmitDraftHasUsefulState(
  d: PackageSubmitDraftAny
): boolean {
  if (d.v === 2) {
    return (
      d.wizardStep > 0 ||
      d.videoSlots.some(
        (s) =>
          s.file != null ||
          (Array.isArray(s.thumbnailFiles) && s.thumbnailFiles.length > 0) ||
          s.thumbnailFile != null ||
          Boolean(s.meta.title.trim()) ||
          Boolean(s.meta.description.trim()) ||
          s.meta.tags.length > 0 ||
          Boolean(s.meta.tagDraft?.trim())
      )
    )
  }
  return packageSubmitDraftHasUsefulStateV1(d)
}

/** Migrate legacy wizard draft (separate long/short steps) to unified video slots. */
export function migratePackageSubmitDraftV1ToV2Slots(
  d: PackageSubmitDraftV1
): DraftPackageVideoSlot[] {
  const longId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `slot-long-${Date.now()}`
  const longMeta = d.longVideoMeta ?? {
    title: "",
    description: "",
    tags: [] as string[],
  }
  const shortList = Array.isArray(d.shortSlots) ? d.shortSlots : []
  const thumbMap =
    d.shortThumbnailBySlotId && typeof d.shortThumbnailBySlotId === "object"
      ? d.shortThumbnailBySlotId
      : {}
  const slots: DraftPackageVideoSlot[] = [
    {
      id: longId,
      videoType: "LONG_FORM",
      meta: longMeta,
      file: d.longFile ?? null,
      thumbnailFiles: d.longThumbnailFile ? [d.longThumbnailFile] : [],
      thumbnailFile: d.longThumbnailFile ?? null,
    },
  ]
  for (const s of shortList) {
    if (!s?.id) continue
    slots.push({
      id: s.id,
      videoType: "SHORT_FORM",
      meta: s.meta ?? { title: "", description: "", tags: [] },
      file: s.file ?? null,
      thumbnailFiles: thumbMap[s.id] ? [thumbMap[s.id]!] : [],
      thumbnailFile: thumbMap[s.id] ?? null,
    })
  }
  return slots
}
