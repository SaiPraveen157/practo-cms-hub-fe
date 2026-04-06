# Phase 7 — Language Packages
## Frontend Integration Guide

> **For:** Frontend developers starting Phase 7 screens  
> **Backend base URL (example):** `http://164.52.204.34:5001`  
> **Auth:** Every endpoint requires `Authorization: Bearer <JWT>`  
> **API prefix:** `/api/language-packages`  
> **Companion:** Import `Phase7_Language_Packages_Postman.json`.

### Where these files live (same place as Phase 6)

All of the following sit at the **workspace / repository root** (the folder that contains `Phase6_Final_Package_Postman.json`), **not** inside `practo-cms-be`:

| File | Purpose |
|------|---------|
| `Phase6_Final_Package_Postman.json` | Phase 6 API collection |
| `Phase6_Frontend_Integration_Guide.md` | Phase 6 frontend doc |
| `Phase7_Language_Packages_Postman.json` | Phase 7 API collection |
| `Phase7_Frontend_Integration_Guide.md` | This document |

Backend implementation path (reference only): `practo-cms-be/src/modules/language-packages/`.

---

## Table of contents

1. [What Phase 7 is](#1-what-phase-7-is)
2. [How it differs from Phase 6](#2-how-it-differs-from-phase-6)
3. [Data model (what the UI shows)](#3-data-model-what-the-ui-shows)
4. [Enums the frontend must use](#4-enums-the-frontend-must-use)
5. [State machine (per language video)](#5-state-machine-per-language-video)
6. [Roles & permissions](#6-roles--permissions)
7. [Thumbnail rules](#7-thumbnail-rules)
8. [Standard response shapes](#8-standard-response-shapes)
9. [API reference (every endpoint)](#9-api-reference-every-endpoint)
10. [Suggested UI flows](#10-suggested-ui-flows)
11. [Errors you will see](#11-errors-you-will-see)
12. [FAQ](#12-faq)

---

## 1. What Phase 7 is

After Phase 6 (English final package), the Agency uploads **localized** video packages: one **language package** per language for a given script. Each package is a **container** (`LanguagePackage`) with one or more **language videos** (`LanguageVideo`).

- **No Medical Affairs** in Phase 7.  
- **Single track** per video: Brand reviews everything (file + metadata + thumbnails), then Content Approver gives final sign-off.  
- Script must be **`LOCKED`** before any language package can be created.

---

## 2. How it differs from Phase 6

| Topic | Phase 6 (Final package) | Phase 7 (Language packages) |
|--------|-------------------------|---------------------------|
| Medical Affairs | Yes (video track) | **No** |
| Parallel tracks | Video + metadata tracks | **Single combined review** |
| Video statuses | `MEDICAL_REVIEW`, `BRAND_VIDEO_REVIEW`, etc. | `BRAND_REVIEW` → `AWAITING_APPROVER` → `APPROVED` / `WITHDRAWN` |
| Thumbnails | Required min 1 for English package videos | **Optional** — zero thumbnails is valid |
| Content Approver | Approve only at end | Same: **approve only** at `AWAITING_APPROVER` |
| Withdraw | Super Admin only (Phase 6 videos) | **Super Admin only** for language videos |

---

## 3. Data model (what the UI shows)

```
LanguagePackage
  id, scriptId, name, language (PackageLanguage), stage (LANGUAGE_PACKAGE_STAGE)
  uploadedBy, createdAt, updatedAt
  videos[] → LanguageVideo

LanguageVideo
  id, packageId, status (LanguageVideoStatus), currentVersion
  uploadedBy, createdAt, updatedAt
  assets[]     → latest snapshot first (API returns newest asset in nested include)
  reviews[]    → recent review history (limited in list responses)

LanguageAsset (versioned row per resubmit)
  fileUrl, fileName, fileType, fileSize (may be string if BigInt serialized)
  title, description, tags[]
  version
  thumbnails[] → LanguageThumbnail

LanguageThumbnail
  id, fileUrl, fileName, status (PENDING | APPROVED | REJECTED), comment, version
```

**Versioning:** `currentVersion` on `LanguageVideo` matches the **current** `LanguageAsset.version`. Resubmitting video or metadata creates a **new** asset row with `version + 1` and resets thumbnails on that asset as needed (see service).

---

## 4. Enums the frontend must use

**`PackageLanguage`** (create package / display):

`ENGLISH`, `HINDI`, `TAMIL`, `TELUGU`, `KANNADA`, `MALAYALAM`, `MARATHI`

**`LanguageVideoStatus`**:

| Value | Meaning |
|--------|---------|
| `BRAND_REVIEW` | Brand (or Super Admin) must review; Agency may resubmit after rejection |
| `AWAITING_APPROVER` | Brand approved; Content Approver (or Super Admin) must final-approve |
| `APPROVED` | Final approval done |
| `WITHDRAWN` | Super Admin withdrew the video |

**Thumbnail review body:** `status` is string `"APPROVED"` or `"REJECTED"`.

---

## 5. State machine (per language video)

```
Agency creates package + first video (or adds video)
              │
              ▼
       BRAND_REVIEW  ◄────────────────────────────┐
              │                                   │
              │  Brand/Super Admin:               │
              │  • Optional: review each thumb   │
              │  • Approve → AWAITING_APPROVER    │
              │  • Reject → stays BRAND_REVIEW    │
              │                                   │
              ▼                                   │
    AWAITING_APPROVER                             │
              │                                   │
              │  Content Approver or Super Admin: │
              │  • Approve → APPROVED             │
              │  • Reject → NOT ALLOWED           │
              │                                   │
              ▼                                   │
         APPROVED                                   │
                                                  │
Agency: resubmit-video / resubmit-metadata ───────┘
  (only while status is BRAND_REVIEW)

Super Admin: PATCH withdraw → WITHDRAWN (from any non-WITHDRAWN state)
```

---

## 6. Roles & permissions

Permissions are enforced with `submit_package`, `review_package`, `approve_package`, `view_content` (same permission keys as Phase 6 packages).

| Role | Phase 7 capabilities |
|------|----------------------|
| **AGENCY_POC** | `upload-url`, create package, add video, update package name, resubmit video/metadata |
| **CONTENT_BRAND** | Queue (`BRAND_REVIEW`), thumbnail review, approve/reject video at `BRAND_REVIEW` |
| **CONTENT_APPROVER** | Queue (`AWAITING_APPROVER`), **approve only** |
| **SUPER_ADMIN** | All of the above where permitted by route; **only** role that can **withdraw**; can approve at `BRAND_REVIEW` or `AWAITING_APPROVER`; can reject at `BRAND_REVIEW` |
| **MEDICAL_AFFAIRS** | **Not involved** — approve/reject/thumbnail APIs return business-rule errors |

**Queue behaviour:**

- **Brand:** videos in `BRAND_REVIEW` only.  
- **Content Approver:** videos in `AWAITING_APPROVER` only.  
- **Super Admin:** both of the above.  
- **Agency / Medical:** typically **empty** list (no matching status filter).

---

## 7. Thumbnail rules

1. Thumbnails are **optional** for Phase 7. If there are **no** thumbnails, Brand can approve without thumbnail steps.  
2. If there **are** thumbnails, **every** one must be `APPROVED` or `REJECTED` before Brand’s **approve video** succeeds.  
3. If **any** thumbnail is `REJECTED`, approve is blocked with an error telling Brand to **reject the video** so Agency can fix and resubmit.  
4. Rejecting a thumbnail requires a **non-empty `comment`**.  
5. Thumbnail review is only allowed while the parent video is in **`BRAND_REVIEW`**.

---

## 8. Standard response shapes

**Success (single write / read with `data`):**

```json
{ "success": true, "data": { ... } }
```

**Success (create package — note `data` is the full package with nested videos):**

HTTP **201** — same `{ "success": true, "data": ... }` pattern.

**Failure:**

```json
{ "success": false, "message": "Human-readable error" }
```

**HTTP status hints (typical):**

| Status | When |
|--------|------|
| 200 | OK |
| 201 | Created (new package / new video) |
| 400 | Validation or business rule |
| 401 | Missing/invalid JWT |
| 403 | Authenticated but missing permission |
| 404 | Package/video/thumbnail not found |
| 422 | Script exists but not `LOCKED` (create package) |
| 500 | Unexpected server error |

**Upload URL success:**

```json
{
  "success": true,
  "uploadUrl": "...",
  "key": "...",
  "fileUrl": "...",
  "expiresIn": 3600
}
```

---

## 9. API reference (every endpoint)

Base path: **`/api/language-packages`**

### 9.1 `POST /upload-url`

**Permission:** `submit_package`  
**Body:**

```json
{
  "fileName": "video.mp4",
  "fileType": "video/mp4",
  "assetType": "video"
}
```

`assetType` optional: use `"thumbnail"` to store under thumbnail folder; otherwise treated as video.

**Responses:** `200` + presigned fields; `400` if `fileName` / `fileType` missing; `500` on storage errors.

---

### 9.2 `POST /` — Create language package + first video

**Permission:** `submit_package`  
**Body:**

```json
{
  "scriptId": "uuid",
  "name": "Hindi — Heart campaign",
  "language": "HINDI",
  "video": {
    "fileUrl": "https://...",
    "fileName": "hindi-main.mp4",
    "fileType": "video/mp4",
    "fileSize": 1048576,
    "title": "Localized title",
    "description": "Optional",
    "tags": ["tag1"],
    "thumbnails": [
      { "fileUrl": "https://...", "fileName": "thumb1.jpg", "fileType": "image/jpeg" }
    ]
  }
}
```

**Success:** `201`, `data` = package with `script`, `videos` (nested assets/thumbnails/reviews).  
**Errors:** `404` script not found; `422` script not `LOCKED`; `400` validation.

---

### 9.3 `POST /:id/videos` — Add another video to package

**Permission:** `submit_package`  
**Body:** `{ "video": { ... same shape as create ... } }`  
**Success:** `201`, `data` = new `LanguageVideo` with includes.  
**Errors:** `404` package not found.

---

### 9.4 `PATCH /:id` — Rename package

**Permission:** `submit_package`  
**Body:** `{ "name": "New name" }`  
**Success:** `200`, `data` = updated package row.  
**Errors:** `400` / `404`.

---

### 9.5 `POST /videos/:videoId/resubmit-video`

**Permission:** `submit_package`  
**Body:** `{ "fileUrl", "fileName", "fileType?", "fileSize?" }`  
**When:** Video must be `BRAND_REVIEW`. Increments version; copies prior thumbnails as new `PENDING` rows on new asset.  
**Errors:** `400` if wrong stage or role.

---

### 9.6 `POST /videos/:videoId/resubmit-metadata`

**Permission:** `submit_package`  
**Body:** `{ "title?", "description?", "tags?", "thumbnails?" }`  
**When:** `BRAND_REVIEW` only. New asset row keeps previous video file; metadata/thumbnails updated per body.  
**Errors:** `400` if wrong stage.

---

### 9.7 `POST /videos/:videoId/approve`

**Permission:** `review_package` **or** `approve_package` (Brand uses `review_package`; Approver uses `approve_package`)

**Body:** `{ "overallComments": "optional string" }` — optional for Brand; allowed for Approver.

**Behaviour:**

- **Brand / Super Admin** at `BRAND_REVIEW` → `AWAITING_APPROVER` (if thumbnail gate passes).  
- **Content Approver / Super Admin** at `AWAITING_APPROVER` → `APPROVED`.  
- **Super Admin** at `APPROVED` / `WITHDRAWN` → error.

**Errors:** `400` with messages like wrong stage, Medical not involved, Agency cannot approve, thumbnail pending/rejected, etc.

---

### 9.8 `POST /videos/:videoId/reject`

**Permission:** `review_package`  
**Body:**

```json
{
  "overallComments": "Required non-empty string",
  "itemFeedback": [
    {
      "field": "title",
      "hasIssue": true,
      "comment": "Fix spelling",
      "videoAssetId": "optional",
      "thumbnailId": "optional"
    }
  ]
}
```

**Controller:** returns `400` if `overallComments` is missing/blank.  
**Who:** Brand or Super Admin at `BRAND_REVIEW` only. Content Approver **cannot** reject.  
**Result:** Stays `BRAND_REVIEW`; review + optional `itemFeedback` rows created.

---

### 9.9 `PATCH /thumbnails/:thumbnailId/review`

**Permission:** `review_package`  
**Body:** `{ "status": "APPROVED" | "REJECTED", "comment": "required if REJECTED" }`  
**Success:** `200`, `data` = updated thumbnail.  
**Errors:** `400` wrong role/stage/missing comment; `404` not found.

---

### 9.10 `PATCH /videos/:videoId/withdraw`

**Permission:** `review_package` **or** `approve_package` (route allows either; **business rule**: only **Super Admin** succeeds)  
**Body:** none  
**Success:** `200`, `data` = video with `WITHDRAWN`.  
**Errors:** `400` if not Super Admin or already withdrawn.

---

### 9.11 `GET /script/:scriptId`

**Permission:** any of `view_content`, `submit_package`, `review_package`, `approve_package`  
**Success:** `200`, `data` = array of packages with nested videos.

---

### 9.12 `GET /:id`

**Success:** `200`, `data` = one package with videos.  
**Errors:** `404`.

---

### 9.13 `GET /videos/:videoId`

**Success:** `200`, `data` = video + `package` summary + assets/reviews.  
**Errors:** `404`.

---

### 9.14 `GET /videos/:videoId/versions`

**Success:** `200`, `data` = array of all `LanguageAsset` versions (newest first in DB order by service), each with thumbnails.

---

### 9.15 `GET /queue`

**Permission:** `submit_package` | `review_package` | `approve_package`  
**Success:** `200`, `data` = array of videos visible to this role’s queue (see §6).

---

### 9.16 `GET /stats`

**Permission:** `view_content` | `review_package` | `approve_package`  
**Success:** `200`, `data` = object map, e.g. `{ "BRAND_REVIEW": 3, "AWAITING_APPROVER": 1, "APPROVED": 10 }` (keys are status strings; counts are numbers).

---

## 10. Suggested UI flows

**Agency**

1. Pick `LOCKED` script → list packages via `GET /script/:scriptId` (or empty → create).  
2. `POST /upload-url` → PUT file to storage → `POST /` with `fileUrl` / `fileName` / optional thumbnails.  
3. After Brand rejection, show feedback from latest `reviews` / `itemFeedback`; call `resubmit-video` or `resubmit-metadata`.

**Brand**

1. `GET /queue` → list `BRAND_REVIEW` videos.  
2. Detail: `GET /videos/:videoId` → show file + metadata + thumbnails.  
3. For each thumbnail: `PATCH .../thumbnails/:id/review`.  
4. Approve: `POST .../videos/:videoId/approve` or reject with `overallComments`.

**Content Approver**

1. `GET /queue` → `AWAITING_APPROVER`.  
2. `POST .../approve` only (no reject).

**Super Admin**

- Same as Brand + Approver where applicable; **Withdraw** action → `PATCH .../withdraw`.

---

## 11. Errors you will see

Typical `message` values (not exhaustive):

- `Script not found`  
- `Script must be LOCKED before creating language packages`  
- `Language package not found` / `Language video not found` / `Thumbnail not found`  
- `Medical Affairs is not involved in Phase 7 language packages`  
- `Agency cannot approve language videos`  
- `Content Approver cannot reject language videos — approve only`  
- `Cannot approve — N thumbnail(s) have not been reviewed yet`  
- `Cannot approve — N thumbnail(s) are rejected. Reject the video so Agency can fix them`  
- `Only Super Admin can withdraw a language video`  
- `A comment is required when rejecting a thumbnail`  
- `Thumbnails can only be reviewed at BRAND_REVIEW stage`  
- Resubmit: `Cannot resubmit — video must be at BRAND_REVIEW stage`

Map these to toasts / inline form errors; keep `success === false` as the primary check.

---

## 12. FAQ

**Q: Can we create two Hindi packages for the same script?**  
A: The schema does not enforce a unique `(scriptId, language)` at DB level; product-wise you should avoid duplicates in the UI and optionally add a server check later.

**Q: Does the backend auto-open Phase 7?**  
A: Phase 7 is a **workflow stage** on the script/product side; language APIs are available when the script is `LOCKED`. Align with PM on when to show Phase 7 navigation (e.g. after Phase 6 completion).

**Q: Are approve comments required?**  
A: `overallComments` on **approve** is optional. On **reject**, `overallComments` is **required**.

**Q: BigInt `fileSize` in JSON?**  
A: May arrive as a string in some serializers; parse safely in the UI if needed.

---

*Last updated: 2026-04-02 — aligned with `practo-cms-be` Phase 7 module (`language-packages.routes.ts`, `language-packages.service.ts`, `language-packages.helpers.ts`).*
