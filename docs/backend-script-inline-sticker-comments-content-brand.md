# Backend: script inline sticker comments (full feature)

This document is the **single backend specification** for **anchored inline “sticker” comments** on scripts (TipTap `feedbackSticker` nodes + metadata stored separately from HTML). It reflects **all current frontend usage** (`lib/script-comments-api.ts`, `hooks/use-script-comments-remote-sync.ts`, Content/Brand reviewer, Medical Affairs script detail).

Adjust paths and names to match your API conventions.

---

## 1. Product summary

| Area | Behaviour |
|------|-----------|
| **What** | Per-span feedback: `body`, UTF-16 `anchor`, optional `contextSnippet`, `resolved`, `authorId`, timestamps. Same shape as `ScriptComment` in `types/script.ts`. |
| **Content/Brand** | **Create/edit/delete** inline comments only while script is **`CONTENT_BRAND_REVIEW`**. **`CONTENT_BRAND_APPROVAL`**: frontend is **approve-only** (no sticker UI, no comment sync). |
| **Medical Affairs** | **Create/edit/delete** inline comments only while script is **`MEDICAL_REVIEW`** (Agency revision review). Other stages: read-only or no sticker tools as per page. |
| **Agency POC** | **No** inline comment UI or sync on script pages (draft/production editing is plain rich text). |
| **Reject / approve (script)** | Overall text feedback still uses existing **`rejectScript`** / workflow; stickers are **additive** context. Content/Brand **first review** blocks **approve** in the UI until every sticker is **resolved** or removed (optional server guard). |

---

## 2. REST API — dedicated comments resource (required)

The frontend calls these routes via **`lib/script-comments-api.ts`**. Base path assumed: **`/api/scripts/:scriptId/comments`** (authenticated: `Authorization: Bearer <token>`).

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/scripts/:scriptId/comments` | List all inline comments for the script. |
| `POST` | `/api/scripts/:scriptId/comments` | Create one comment (client sends stable **`id`** UUID). |
| `PATCH` | `/api/scripts/:scriptId/comments/:commentId` | Partial update. |
| `DELETE` | `/api/scripts/:scriptId/comments/:commentId` | Delete one comment. |
| `PUT` (optional) | `/api/scripts/:scriptId/comments` | Replace full set (`comments` + optional `feedbackStickers` alias in body) — used only if you wire `putScriptComments`; the hook uses POST/PATCH/DELETE. |

### 2.1 `GET` — response shape

Must be JSON compatible with:

```ts
{ success: boolean; comments?: ScriptComment[]; feedbackStickers?: ScriptComment[] }
```

The client normalises with: `comments = raw.comments ?? raw.feedbackStickers ?? []`.

### 2.2 `POST` — create body (`ScriptCommentCreateBody`)

| Field | Required | Notes |
|-------|----------|--------|
| `id` | Yes | UUID from client (idempotent creates / sync). |
| `body` | Yes | Comment text. |
| `anchor` | Yes | `ScriptCommentAnchor`: `space` (`plain_text_utf16` \| `prosemirror_pos`), `startOffset`, `endOffset`; optional `contentVersion`. |
| `contextSnippet` | No | Quoted selection preview. |
| `resolved` | No | Default false / open. |

### 2.3 `PATCH` — body (`ScriptCommentPatchBody`)

Optional fields: `body`, `contextSnippet`, `resolved`, `anchor` (if anchor changes).

### 2.4 `POST` / `PATCH` — success (`ScriptCommentMutationResponse`)

```ts
{ success: boolean; comment?: ScriptComment }
```

### 2.5 HTTP status codes (recommended)

| Code | When |
|------|------|
| `200` / `201` | Success. |
| `400` | Validation, invalid anchor, duplicate id conflict policy, or **business rule** (e.g. comment not allowed at current `ScriptStatus`). |
| `401` | Unauthenticated. |
| `403` | Authenticated but role/stage forbids action. |
| `404` | Script or comment not found. |

---

## 3. Authorisation & script stage rules

Implement server-side checks so direct API calls cannot bypass the UI.

### 3.1 Who may **write** inline comments (POST/PATCH/DELETE)

| Role | Allowed stages (minimum product rules) |
|------|------------------------------------------|
| **`CONTENT_BRAND`** | **`CONTENT_BRAND_REVIEW`** only for sticker writes. **Not** `CONTENT_BRAND_APPROVAL` (frontend sends no writes). |
| **`MEDICAL_AFFAIRS`** | **`MEDICAL_REVIEW`** only for sticker writes (Agency revision under Medical review). |
| **`SUPER_ADMIN`** | Match product policy (often same as Brand or Medical for moderation). |

All other roles: **no** create/update/delete (403) unless you explicitly allow read-only **GET**.

### 3.2 Who may **read** (`GET`)

Any authenticated user who can load the script in **`GET /api/scripts/queue`** or script detail — or restrict to roles that see the script in the app (product decision).

---

## 4. Script queue / script payload parity (optional but useful)

**`lib/feedback-sticker-sync.ts`** merges from:

```ts
script.comments ?? script.feedbackStickers ?? []
```

If **`GET /api/scripts/queue`** (or script-by-id) already returns `comments` or `feedbackStickers` on each **`Script`**, the UI can hydrate before the dedicated `GET .../comments` returns. Recommended:

- Prefer **one source of truth** after migration: either embed in script payload **or** only the comments API — avoid conflicting updates.
- If both exist: define precedence (e.g. comments API wins on conflict).

**`PATCH /api/scripts/:id`** (`UpdateScriptBody`) may still accept `comments` / `feedbackStickers` in older designs; the current app **does not** rely on PATCH for sticker sync for Brand/Medical review flows — sync is via **§2**. Prefer **not** duplicating writes: **comments sub-API only** for mutations.

---

## 5. Workflow: approve & reject (existing script endpoints)

### 5.1 Reject (`rejectScript` — existing)

- Keep **`comments`** string for audit/email.
- Optional: attach **inline comment snapshot** or IDs to the rejection record / notification.

### 5.2 Approve — Content/Brand first review (`CONTENT_BRAND_REVIEW`)

**Frontend:** Approve disabled while any sticker has `resolved !== true`.

**Backend (recommended):** On **`POST .../approve`** (or your approve route), before state transition:

1. Load all inline comments for the script.
2. If any row has `resolved !== true` (treat missing as open), return **`400`** with a clear message, e.g.  
   `"Cannot approve while open inline comments exist; resolve or remove each thread first."`

### 5.3 Approve — Medical Affairs (`MEDICAL_REVIEW`)

**Frontend:** No pending-sticker gate today. **Optional** product rule: same guard as Brand if you require all threads resolved before Medical approves revision — document if implemented.

### 5.4 Approve — Content/Brand final (`CONTENT_BRAND_APPROVAL`)

No sticker writes from UI; no sticker-based approve guard.

---

## 6. Sync behaviour (what the client actually does)

**`use-script-comments-remote-sync.ts`**:

1. On mount (when `fetchEnabled`): **`GET .../comments`**. If `list.length > 0`, merges into UI and sets baseline.
2. On local map change (when `pushEnabled`): diff vs baseline → **`POST`** new ids, **`PATCH`** changed fields, **`DELETE`** removed ids.

**Frontend `fetchEnabled` / `pushEnabled` today:**

| Page | `fetchEnabled` | `pushEnabled` |
|------|------------------|-----------------|
| Content/Brand reviewer `[id]` | `canReview` (`CONTENT_BRAND_REVIEW`) | Same |
| Medical Affairs script `[id]` | Script **not** `DRAFT` | **`MEDICAL_REVIEW`** only |

Empty `GET` is normal; hook does not merge (no error).

---

## 7. Anchors & content revisions

- **Coordinate system:** `plain_text_utf16` offsets are what the editor sends; document and validate consistently.
- **After script `content` changes** (e.g. Agency resubmits): define whether anchors are **re-mapped**, **invalidated**, or **versioned** per script revision (`contentVersion` on anchor is available for future use).

---

## 8. Notifications & email (optional)

- On create/update/delete of inline comments, optionally notify **Medical Affairs** mapped IDs (and/or Agency) with a link to the script.
- On reject, optionally include a count of open inline threads or a digest.

---

## 9. Frontend mock (development / pre-backend)

Until **`NEXT_PUBLIC_MOCK_SCRIPT_COMMENTS=false`**, the client uses **`lib/script-comments-mock.ts`** (`sessionStorage` per tab). No server calls.

```bash
# Use real API when backend is ready:
NEXT_PUBLIC_MOCK_SCRIPT_COMMENTS=false
```

---

## 10. Testing checklist (backend)

- [ ] `GET /api/scripts/:id/comments` returns `{ success, comments }` (or `feedbackStickers`).
- [ ] `POST` with full `ScriptCommentCreateBody` persists and returns `comment`.
- [ ] `PATCH` updates `body`, `resolved`, `contextSnippet`, `anchor` as sent.
- [ ] `DELETE` removes comment; subsequent `GET` excludes it.
- [ ] **`CONTENT_BRAND`** cannot POST at `CONTENT_BRAND_APPROVAL` (403 or 400).
- [ ] **`MEDICAL_AFFAIRS`** can POST/PATCH/DELETE at `MEDICAL_REVIEW`; not at arbitrary stages (per policy).
- [ ] Non-authorised roles cannot mutate (403).
- [ ] Approve at `CONTENT_BRAND_REVIEW` with an open (`resolved !== true`) comment returns **400** if guard implemented.
- [ ] Queue/detail payloads stay consistent with comments API if both are used.

---

## 11. Frontend reference (implementation)

| File | Role |
|------|------|
| `lib/script-comments-api.ts` | HTTP client + mock switch |
| `lib/script-comments-mock.ts` | In-browser mock store |
| `lib/feedback-sticker-sync.ts` | `scriptCommentsListFromScript`, `recordFromCommentArray` |
| `hooks/use-script-comments-remote-sync.ts` | GET on load + diff push |
| `components/script-rich-text-editor.tsx` | `contentReadOnly`, sticker toolbar, sidebar, PM lock plugin |
| `app/(protected)/content-brand-reviewer/[id]/page.tsx` | Brand stickers + approve gate |
| `app/(protected)/medical-affairs-scripts/[id]/page.tsx` | Medical stickers at `MEDICAL_REVIEW` |
| `types/script.ts` | `ScriptComment`, `ScriptCommentAnchor`, wire types |

---

## 12. Out of scope / future

- Bulk import/export of comments.
- Real-time collaboration (WebSocket).
- Agency script pages re-enabling stickers (would need new `fetchEnabled`/`pushEnabled` rules and product sign-off).
