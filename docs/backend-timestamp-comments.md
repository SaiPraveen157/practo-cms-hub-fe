# Timestamp comments — frontend usage & exact backend requirements

This document describes how this repo handles **comments on videos** vs **comments on scripts**, what the **frontend already implements** for playback timestamps, and the **concrete backend work** required so timestamps persist and round-trip correctly.

---

## 1. Video workflow (Phase 4 — First Line Up, Phase 5 — First Cut)

### APIs in use

| Method | Path                            | Purpose                    |
| ------ | ------------------------------- | -------------------------- |
| `GET`  | `/api/videos/:videoId/comments` | List comments for a video. |
| `POST` | `/api/videos/:videoId/comments` | Create a comment.          |

**Client:** `lib/videos-api.ts` — `getVideoComments`, `addVideoComment`.  
**Normalization:** `lib/video-comment.ts` — `normalizeVideoComment`, `parseVideoCommentTimestampSeconds`.  
**Postman:** `postman/Practo CMS V2 — Complete (Part 1 + Part 2).postman_collection.json` — “Get Video Comments”, “Add Comment to Video” (should be updated to document `timestampSeconds`).

### Frontend shape today (`types/video.ts`)

```ts
export interface VideoComment {
  id: string
  content: string
  createdAt: string
  timestampSeconds?: number | null
  /** Integer file version (Video.version / package currentVersion / language currentVersion). */
  assetVersion?: number | null
  author?: { id: string; firstName: string; lastName: string; role: string }
}
```

### What the frontend sends (`POST` body)

`addVideoComment` / package / language video comment POST sends:

```json
{
  "content": "<required string>",
  "timestampSeconds": 90.5,
  "assetVersion": 2
}
```

- **`timestampSeconds`** — required (finite, ≥ 0).
- **`assetVersion`** — required integer ≥ 1, matching the current file version for that video row. The UI only shows comments for the active version; approvers cannot approve while the current version still has any timestamped thread comment (client-side gate). The server should persist `assetVersion` and return it on GET so version bumps (Agency re-upload) hide prior-version notes.

Same contract for Phase 6 (`/api/packages/videos/.../comments`) and Phase 7 (`/api/language-packages/videos/.../comments`).

### What the frontend accepts (`GET` / `POST` response comment objects)

Each comment in `comments[]` (and the `comment` object on create) is normalized with `parseVideoCommentTimestampSeconds`. The backend may use **any one** of these keys for the same value (float seconds); the client maps them to `timestampSeconds`:

| Key (accepted)      | Notes                                              |
| ------------------- | -------------------------------------------------- |
| `timestampSeconds`  | **Preferred** — matches `POST` body from this app. |
| `timestamp_seconds` | Snake case.                                        |
| `timestamp_sec`     | Short snake case.                                  |
| `timeStamp`         | Legacy / alternate camelCase.                      |
| `time_stamp`        | Snake case variant.                                |

If none are present or the value is not a finite number, the client **drops** the comment from the thread list and timeline markers (legacy rows without a time are not shown).

**File version on GET:** the API may return a nested object, e.g. `"video": { "version": 1 }`. `lib/video-comment.ts` maps that to `assetVersion` (and keeps `video.version` on the normalized object) so `filterVideoCommentsForAssetVersion` matches against `Video.version` / package `currentVersion` / language `currentVersion`. Flat `assetVersion` on the comment is still accepted if present.

### UI behavior today

- Video files use **`VideoPlayerTimeline`** (`components/VideoPlayerTimeline.tsx`): timeline markers, sorted list, seek-on-click, and “comment at current time” flow where applicable.
- Display uses **`formatVideoTimestamp`** (`lib/video-timestamp.ts`) — whole seconds (fractional seconds in the API are floored for the label unless you change that helper).

---

## 2. Script workflow (Phases 1–3) — different feature

| Method   | Path                                         | Purpose                                     |
| -------- | -------------------------------------------- | ------------------------------------------- |
| `GET`    | `/api/scripts/:scriptId/comments`            | Inline script comments / feedback stickers. |
| `POST`   | `/api/scripts/:scriptId/comments`            | Create (with document anchor).              |
| `PATCH`  | `/api/scripts/:scriptId/comments/:commentId` | Update.                                     |
| `DELETE` | `/api/scripts/:scriptId/comments/:commentId` | Delete.                                     |

**Client:** `lib/script-comments-api.ts`  
**Types:** `types/script.ts` — `ScriptComment` with optional `anchor` in **document** space (`plain_text_utf16` / `prosemirror_pos`), **not** video playback time.

**Schema:** `docs/database-schema.prisma` — `ScriptFeedbackSticker`, `Comment` on `Script`.

No change required for **video** timestamp comments on these routes.

---

## 3. Other “comments” on video approve/reject

- **`POST /api/videos/:videoId/approve`** — optional `comments` (string) on the **review record**, not the threaded `/comments` resource.
- **`POST /api/videos/:videoId/reject`** — required `comments` (string).

These remain separate from timestamped thread comments.

---

## 4. Exact backend changes required

The frontend requires a **single-point** playback time in seconds on create and only displays comments that have a valid timestamp. The backend must **persist** and **return** that value so mocks and production match.

### 4.1 Database

1. On the table/entity that stores **video comments** (one row per comment, scoped to `videoId` — or equivalent):
   - Add a nullable numeric column, e.g. **`timestamp_seconds`** `DOUBLE PRECISION` / `FLOAT` / `DECIMAL` (DB-specific), **nullable**.
2. **Semantics:** For new comments, the app always sends a timestamp; **`NULL` may remain for legacy rows** (the client hides those). Non-`NULL` = position in the video in **seconds**.

_(The frontend does **not** currently send or render `startSeconds` / `endSeconds` ranges. Adding ranges would be a separate API + UI contract.)_

### 4.2 `POST /api/videos/:videoId/comments`

1. **Accept** JSON:
   - `content` (string, required) — unchanged.
   - `timestampSeconds` (number, **required**) — float seconds ≥ 0; reject missing or negative values to match the client.
2. **Persist** `timestampSeconds` into `timestamp_seconds` (or your column name).
3. **Response** (e.g. 201): return the created comment object including:
   - `id`, `videoId`, `authorId`, `content`, `createdAt`, `author` (as today),
   - **`timestampSeconds`** (number | null) — **recommended** so it matches the request body and this repo’s primary key.
   - Alternatively return `timeStamp` or `timestamp_seconds` only if you document it; the frontend normalizer will still ingest those keys.

### 4.3 `GET /api/videos/:videoId/comments`

1. Include **`timestampSeconds`** on each item in `comments[]` when set (or one of the aliases listed in §1 — `timestampSeconds` is preferred).
2. Omit the field or send `null` when the comment has no playback anchor.

### 4.4 Validation (recommended)

- `timestampSeconds`: must be present, finite, and `>= 0`; optionally `<= knownDuration` if the server stores duration for that video.
- `content`: keep existing max length / non-empty rules.

### 4.5 Postman & docs

- Update the **Add Comment to Video** example body to include required `timestampSeconds`.
- Document the **GET** response shape for each comment including `timestampSeconds`.

---

## 5. Summary

| Area                                    | Frontend                                                                                             | Backend must                                                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Video thread `/api/videos/:id/comments` | Sends required `timestampSeconds` on POST; filters to timestamped rows client-side on GET; timeline UI only. | Require and store seconds for new comments; return `timestampSeconds` (or an accepted alias) on GET and POST. |
| Script `/api/scripts/:id/comments`      | Document anchors only.                                                                               | No change for video timestamps.                                                                                                   |
| Approve/reject `comments`               | Plain string on review.                                                                              | Unrelated to thread timestamps.                                                                                                   |

**Bottom line:** the server should **require `timestampSeconds` on POST** for video thread comments (Phases 4–7), **persist** it, and **return** it on GET/POST. Legacy rows without a timestamp are ignored in the UI until backfilled or migrated.
