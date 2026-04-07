# Phase 6 — Final Package Delivery
## Frontend Integration Guide (Per-Video Independent Review Flow)

> **For:** Frontend Developer
> **Backend Base URL:** `http://164.52.204.34:5001`
> **Auth:** All endpoints require `Authorization: Bearer <token>` header
> **This document covers:** Every API endpoint, every possible response, business rules, state machine, role permissions, error handling, and UI hints.

---

## Table of Contents

1. [What is Phase 6?](#1-what-is-phase-6)
2. [Package Structure](#2-package-structure)
3. [Roles & Permissions](#3-roles--permissions)
4. [Per-Video State Machine](#4-per-video-state-machine)
5. [Parallel Tracks Explained](#5-parallel-tracks-explained)
6. [Thumbnail Review Flow](#6-thumbnail-review-flow)
7. [Response Objects](#7-response-objects)
8. [API Endpoints](#8-api-endpoints)
   - [POST /upload-url](#81-post-apipackagesupload-url)
   - [POST / — Create Package + First Video](#82-post-apipackages--create-package--first-video)
   - [POST /:id/videos — Add Video](#83-post-apipackagesidvideos--add-video)
   - [PATCH /:id — Update Package Name](#84-patch-apipackagesid--update-package-name)
   - [POST /videos/:videoId/resubmit-video](#85-post-apipackagesvideosvideoIdresubmit-video)
   - [POST /videos/:videoId/resubmit-metadata](#86-post-apipackagesvideosvideoIdresubmit-metadata)
   - [POST /videos/:videoId/approve](#87-post-apipackagesvideosvideoIdapprove)
   - [POST /videos/:videoId/reject](#88-post-apipackagesvideosvideoIdreject)
   - [PATCH /videos/:videoId/withdraw](#89-patch-apipackagesvideosvideoIdwithdraw)
   - [PATCH /thumbnails/:thumbnailId/review](#810-patch-apipackagesthumbnailsthumbnailIdreview)
   - [GET /:id](#811-get-apipackagesid)
   - [GET /script/:scriptId](#812-get-apipackagesscriptscriptid)
   - [GET /videos/:videoId](#813-get-apipackagesvideosvideoId)
   - [GET /videos/:videoId/versions](#814-get-apipackagesvideosvideoIdversions)
   - [GET /queue](#815-get-apipackagesqueue)
   - [GET /stats](#816-get-apipackagesstats)
   - [GET /my-reviews](#817-get-apipackagesmy-reviews)
9. [Complete Workflow Walkthrough](#9-complete-workflow-walkthrough)
10. [Validation Rules](#10-validation-rules)
11. [All Possible Error Responses](#11-all-possible-error-responses)
12. [UI Rendering Logic by Role](#12-ui-rendering-logic-by-role)
13. [Edge Cases & FAQ](#13-edge-cases--faq)

---

## 1. What is Phase 6?

Phase 6 is the **Final Package Delivery** stage. After the script is locked (Phase 3) and the First Cut video is approved (Phase 5), the Agency submits a **deliverable package** of final videos.

**Key design:** The package is just a named container. Every video inside has its **own completely independent review flow**. Videos don't wait for each other.

**Each video goes through:**
```
MEDICAL_REVIEW → BRAND_VIDEO_REVIEW → AWAITING_APPROVER → APPROVED
```

**Phase 7 triggers automatically** when **at least 1 video** in the package reaches `APPROVED`. This is fully backend-driven — the frontend does not need to call anything to trigger it.

> **Important — what is NOT in Phase 6:**
> - No package-level status, version, or track fields (those are per-video only)
> - No `isSelected` on thumbnails (replaced by `status: PENDING/APPROVED/REJECTED`)
> - Agency POC **cannot withdraw** a video (Super Admin only)
> - Content Approver **cannot reject** a video (approve only)
> - Videos never start in `DRAFT` — they go straight to `MEDICAL_REVIEW` when submitted

---

## 2. Package Structure

```
FinalPackage  (container — just a name, no status)
  ├── name: "Heart Attack Awareness Package"
  │
  ├── PackageVideo 1  (LONG_FORM — has its own independent flow)
  │     ├── status: MEDICAL_REVIEW
  │     ├── videoTrackStatus: PENDING        ← Medical Affairs reviews this
  │     ├── metadataTrackStatus: PENDING     ← Brand reviews this
  │     ├── currentVersion: 1
  │     └── PackageAsset (v1 snapshot)
  │           ├── fileUrl, fileName, fileType, fileSize
  │           ├── title, description, tags
  │           └── thumbnails: [
  │                 { id, fileUrl, fileName, status: PENDING, comment: null },
  │                 { id, fileUrl, fileName, status: PENDING, comment: null }
  │               ]
  │
  └── PackageVideo 2  (SHORT_FORM — completely independent from Video 1)
        ├── status: MEDICAL_REVIEW
        ├── videoTrackStatus: PENDING
        ├── metadataTrackStatus: PENDING
        └── PackageAsset (v1 snapshot)
              └── thumbnails: [
                    { id, fileUrl, status: PENDING, comment: null }
                  ]
```

**Critical rules:**
| Item | Rule |
|------|------|
| Package | Only 1 per script. No status/version at package level. |
| Videos per package | No minimum enforced at creation. Agency adds one-by-one. |
| Video types | `LONG_FORM` or `SHORT_FORM` |
| Thumbnails per video | Min 1, no maximum |
| Thumbnail status | `PENDING` / `APPROVED` / `REJECTED` (not isSelected) |
| Video review | Each video flows independently — no coupling |
| Phase 7 trigger | First video to reach `APPROVED` triggers Phase 7 |

---

## 3. Roles & Permissions

| Role | What they do in Phase 6 |
|------|------------------------|
| `AGENCY_POC` | Create package, add videos, resubmit video file, resubmit metadata |
| `MEDICAL_AFFAIRS` | At `MEDICAL_REVIEW`: approve/reject **video track** |
| `CONTENT_BRAND` | At `MEDICAL_REVIEW`: review each thumbnail + approve/reject **metadata track**. At `BRAND_VIDEO_REVIEW`: approve/reject video quality |
| `CONTENT_APPROVER` | At `AWAITING_APPROVER`: **approve only** (no rejection) |
| `SUPER_ADMIN` | Can act at any stage. Only role that can **withdraw** a video. |

---

## 4. Per-Video State Machine

```
Agency creates package + submits video
              │
              ▼
       MEDICAL_REVIEW  ◄───────────────────────────────────────────┐
              │                                                      │
              │  Two parallel tracks run simultaneously:             │
              │                                                      │
              ├── Track A (Video)                                    │
              │   videoTrackStatus: PENDING                          │
              │   Medical Affairs → approve or reject                │
              │   PENDING → APPROVED or REJECTED                     │
              │                                                      │
              └── Track B (Metadata)                                 │
                  metadataTrackStatus: PENDING                       │
                  Brand → review each thumbnail individually,        │
                          then approve or reject                     │
                  PENDING → APPROVED or REJECTED                     │
                                                                     │
 When BOTH tracks APPROVED:                                          │
              │                                                      │
              ▼                                                      │
     BRAND_VIDEO_REVIEW  (Brand reviews overall video quality)       │
              │                                                      │
              ├── Brand REJECTS → back to MEDICAL_REVIEW ───────────┘
              │   (video track → REJECTED, metadata track unchanged)
              │
              ├── Brand APPROVES
              │
              ▼
     AWAITING_APPROVER  (Content Approver final sign-off)
              │
              └── Content Approver APPROVES (cannot reject)
                        │
                        ▼
                    APPROVED  ← Phase 7 auto-triggers here
                              if this is the first APPROVED in package

     WITHDRAWN  ← Super Admin only, from any stage
```

**Status transitions:**

| From | Who | Action | To | Track change |
|------|-----|--------|----|--------------|
| `MEDICAL_REVIEW` | Medical Affairs | approve | `MEDICAL_REVIEW` (waits for metadata) OR `BRAND_VIDEO_REVIEW` if both done | videoTrack → APPROVED |
| `MEDICAL_REVIEW` | Content Brand | approve | `MEDICAL_REVIEW` (waits for video) OR `BRAND_VIDEO_REVIEW` if both done | metadataTrack → APPROVED |
| `MEDICAL_REVIEW` | Medical Affairs | reject | `MEDICAL_REVIEW` | videoTrack → REJECTED |
| `MEDICAL_REVIEW` | Content Brand | reject | `MEDICAL_REVIEW` | metadataTrack → REJECTED |
| `BRAND_VIDEO_REVIEW` | Content Brand | approve | `AWAITING_APPROVER` | unchanged |
| `BRAND_VIDEO_REVIEW` | Content Brand | reject | `MEDICAL_REVIEW` | videoTrack → REJECTED, metadataTrack **unchanged** |
| `AWAITING_APPROVER` | Content Approver | approve | `APPROVED` | unchanged |
| any active stage | Super Admin | withdraw | `WITHDRAWN` | — |

---

## 5. Parallel Tracks Explained

At `MEDICAL_REVIEW`, two reviewers work **simultaneously and independently**:

```
MEDICAL_REVIEW stage (per video)
        │
        ├── Medical Affairs reviews VIDEO FILE
        │   → PATCH /thumbnails/:id/review not involved
        │   → POST /videos/:videoId/approve  (approves video track)
        │   → POST /videos/:videoId/reject   (rejects video track only)
        │
        └── Content Brand reviews METADATA + THUMBNAILS
            → PATCH /thumbnails/:id/review  (review each thumbnail first)
            → POST /videos/:videoId/approve  (approve metadata track — all thumbnails must be reviewed)
            → POST /videos/:videoId/reject   (reject metadata track only)
```

**Track independence rules:**
- Rejecting video track does **not** affect metadata track status
- Rejecting metadata track does **not** affect video track status
- Agency can fix only the rejected track (resubmit-video OR resubmit-metadata)
- The approved track stays as-is — Agency cannot touch it

---

## 6. Thumbnail Review Flow

Thumbnails are reviewed **individually** by Brand before Brand can approve the metadata track.

**Step-by-step:**
1. Brand reviews each thumbnail → `PATCH /api/packages/thumbnails/:thumbnailId/review`
2. Sets `status: APPROVED` or `REJECTED` (with required comment if rejected)
3. Once ALL thumbnails on the current version are reviewed (none PENDING):
   - If ALL are APPROVED → Brand can call approve (metadata track approved)
   - If ANY are REJECTED → Brand calls reject (metadata track rejected, Agency must resubmit)

**Rules:**
- `REJECTED` requires a comment — Brand must explain what's wrong
- `APPROVED` comment is optional
- Thumbnails can only be reviewed at `MEDICAL_REVIEW` stage
- Even 1 rejected thumbnail = Brand must reject the metadata track

---

## 7. Response Objects

### Package Object
```json
{
  "success": true,
  "package": {
    "id": "pkg-uuid",
    "name": "Heart Attack Awareness Package",
    "scriptId": "script-uuid",
    "language": "ENGLISH",
    "stage": "FINAL_PACKAGE_STAGE",
    "uploadedById": "user-uuid",
    "createdAt": "2026-03-27T10:00:00.000Z",
    "updatedAt": "2026-03-27T10:00:00.000Z",
    "videos": [
      {
        "id": "video-uuid",
        "packageId": "pkg-uuid",
        "type": "LONG_FORM",
        "status": "MEDICAL_REVIEW",
        "videoTrackStatus": "PENDING",
        "metadataTrackStatus": "PENDING",
        "currentVersion": 1,
        "uploadedById": "user-uuid",
        "lockedById": null,
        "lockedAt": null,
        "assignedAt": "2026-03-27T10:00:00.000Z",
        "createdAt": "2026-03-27T10:00:00.000Z",
        "updatedAt": "2026-03-27T10:00:00.000Z",
        "assets": [
          {
            "id": "asset-uuid",
            "packageVideoId": "video-uuid",
            "type": "LONG_FORM",
            "fileUrl": "http://164.52.204.34:9002/practo-hub-videos-v2/uuid-long.mp4",
            "fileName": "long-form.mp4",
            "fileType": "video/mp4",
            "fileSize": 52428800,
            "title": "Understanding Heart Attack — Full Documentary",
            "description": "A comprehensive 10-minute documentary...",
            "tags": ["heart-attack", "cardiology"],
            "order": 1,
            "version": 1,
            "createdAt": "2026-03-27T10:00:00.000Z",
            "thumbnails": [
              {
                "id": "thumb-uuid-1",
                "assetId": "asset-uuid",
                "fileUrl": "http://164.52.204.34:9002/.../thumb1.jpg",
                "fileName": "thumb1.jpg",
                "fileType": "image/jpeg",
                "fileSize": 204800,
                "status": "PENDING",
                "comment": null,
                "version": 1,
                "createdAt": "2026-03-27T10:00:00.000Z"
              },
              {
                "id": "thumb-uuid-2",
                "assetId": "asset-uuid",
                "fileUrl": "http://164.52.204.34:9002/.../thumb2.jpg",
                "fileName": "thumb2.jpg",
                "status": "APPROVED",
                "comment": null,
                "version": 1,
                "createdAt": "2026-03-27T10:00:00.000Z"
              }
            ]
          }
        ],
        "reviews": [
          {
            "id": "review-uuid",
            "packageVideoId": "video-uuid",
            "reviewerId": "user-uuid",
            "reviewerType": "MEDICAL_AFFAIRS",
            "decision": "APPROVED",
            "overallComments": "Video meets medical accuracy standards.",
            "trackReviewed": "VIDEO_TRACK",
            "stageAtReview": "MEDICAL_REVIEW",
            "reviewedAt": "2026-03-27T11:00:00.000Z",
            "itemFeedback": []
          }
        ]
      }
    ],
    "uploadedBy": {
      "id": "user-uuid",
      "firstName": "Agency",
      "lastName": "POC"
    }
  }
}
```

### Video Object (standalone — returned by /videos/:videoId endpoints)
```json
{
  "success": true,
  "video": {
    "id": "video-uuid",
    "packageId": "pkg-uuid",
    "type": "SHORT_FORM",
    "status": "BRAND_VIDEO_REVIEW",
    "videoTrackStatus": "APPROVED",
    "metadataTrackStatus": "APPROVED",
    "currentVersion": 2,
    "assets": [ ...version snapshots... ],
    "reviews": [ ...all review records... ]
  }
}
```

**Key field reference:**

| Field | Type | Description |
|-------|------|-------------|
| `status` | enum | Per-video workflow stage |
| `videoTrackStatus` | enum | `PENDING` / `APPROVED` / `REJECTED` |
| `metadataTrackStatus` | enum | `PENDING` / `APPROVED` / `REJECTED` |
| `currentVersion` | number | Increments every Agency resubmit |
| `assets` | array | All version snapshots (filter by `version === currentVersion` for current) |
| `thumbnails[].status` | enum | `PENDING` / `APPROVED` / `REJECTED` |
| `thumbnails[].comment` | string\|null | Brand's comment (required on REJECTED) |
| `reviews` | array | All review decisions per video |
| `trackReviewed` | string | `VIDEO_TRACK` / `METADATA_TRACK` / `BOTH` |
| `stageAtReview` | string | Stage at the time of review |

---

## 8. API Endpoints

### 8.1 POST /api/packages/upload-url

Get a presigned S3 URL to upload a video or thumbnail directly to storage.

**Auth:** Agency POC

**Request:**
```json
{
  "fileName": "long-form.mp4",
  "fileType": "video/mp4",
  "assetType": "video"
}
```

| Field | Required | Values |
|-------|----------|--------|
| `fileName` | ✅ | any string |
| `fileType` | ✅ | MIME type string |
| `assetType` | optional | `"video"` (default) or `"thumbnail"` |

**Response 200:**
```json
{
  "success": true,
  "uploadUrl": "https://minio.../presigned-upload-url",
  "fileUrl": "http://164.52.204.34:9002/practo-hub-videos-v2/uuid-long-form.mp4",
  "key": "uuid-long-form.mp4"
}
```

**UI Flow:**
1. Call this endpoint → get `uploadUrl` + `fileUrl`
2. PUT the file binary directly to `uploadUrl` (no auth header needed)
3. Store `fileUrl` — use it when creating/resubmitting

---

### 8.2 POST /api/packages — Create Package + First Video

Agency creates the package container and submits the first video in a single call.

**Auth:** Agency POC

**Request:**
```json
{
  "scriptId": "script-uuid",
  "name": "Heart Attack Awareness Package",
  "video": {
    "type": "LONG_FORM",
    "fileUrl": "http://.../long-form.mp4",
    "fileName": "long-form.mp4",
    "fileType": "video/mp4",
    "fileSize": 52428800,
    "title": "Understanding Heart Attack — Full Documentary",
    "description": "A comprehensive 10-minute documentary...",
    "tags": ["heart-attack", "cardiology"],
    "thumbnails": [
      { "fileUrl": "http://.../thumb1.jpg", "fileName": "thumb1.jpg", "fileType": "image/jpeg", "fileSize": 204800 },
      { "fileUrl": "http://.../thumb2.jpg", "fileName": "thumb2.jpg", "fileType": "image/jpeg", "fileSize": 204800 }
    ]
  }
}
```

| Field | Required | Rule |
|-------|----------|------|
| `scriptId` | ✅ | Script must be `LOCKED` and First Cut video approved |
| `name` | ✅ | Package name |
| `video` | ✅ | Single video object (not an array) |
| `video.type` | ✅ | `LONG_FORM` or `SHORT_FORM` |
| `video.fileUrl` | ✅ | S3 URL from upload-url endpoint |
| `video.fileName` | ✅ | |
| `video.thumbnails` | ✅ | Array, min 1 thumbnail |
| `video.title` | optional | Per-video title |
| `video.description` | optional | Per-video description |
| `video.tags` | optional | Array of strings |

**Response 201:**
```json
{
  "success": true,
  "message": "Package created and video submitted for review",
  "package": { ...package object with videos array... }
}
```

The first video will immediately be at `MEDICAL_REVIEW` with both tracks `PENDING`.

**Errors:**
```json
{ "success": false, "message": "Package name is required" }
{ "success": false, "message": "fileUrl is required for video" }
{ "success": false, "message": "fileName is required for video" }
{ "success": false, "message": "At least 1 thumbnail is required per video" }
{ "success": false, "message": "fileUrl is required for all thumbnails" }
{ "success": false, "message": "fileName is required for all thumbnails" }
{ "success": false, "message": "Cannot create package — script is not yet locked (current: DRAFT)" }
{ "success": false, "message": "Cannot create package — First Cut video has not been approved yet (Phase 5 incomplete)" }
{ "success": false, "message": "A package already exists for this script. Use 'Add Video' to add more videos." }
```

---

### 8.3 POST /api/packages/:id/videos — Add Video

Agency adds another video to an existing package. Each added video immediately starts its own independent review flow.

**Auth:** Agency POC

**Request:**
```json
{
  "type": "SHORT_FORM",
  "fileUrl": "http://.../short.mp4",
  "fileName": "short-form.mp4",
  "fileType": "video/mp4",
  "fileSize": 10485760,
  "title": "Heart Attack — 60 Seconds",
  "description": "Quick reel on warning signs.",
  "tags": ["reel", "awareness"],
  "thumbnails": [
    { "fileUrl": "http://.../thumb-short.jpg", "fileName": "thumb-short.jpg", "fileType": "image/jpeg" }
  ]
}
```

> Same field rules as video object in create endpoint.

**Response 201:**
```json
{
  "success": true,
  "message": "Video added to package and submitted for review",
  "video": { ...video object... }
}
```

The new video is independently at `MEDICAL_REVIEW` — it doesn't affect other videos in the package.

**Errors:**
```json
{ "success": false, "message": "Package not found" }
{ "success": false, "message": "fileUrl is required for video" }
{ "success": false, "message": "At least 1 thumbnail is required per video" }
```

---

### 8.4 PATCH /api/packages/:id — Update Package Name

Agency can rename the package at any time.

**Auth:** Agency POC

**Request:**
```json
{ "name": "Heart Attack Awareness Campaign — Final" }
```

**Response 200:**
```json
{
  "success": true,
  "message": "Package name updated",
  "package": { ...package object... }
}
```

**Errors:**
```json
{ "success": false, "message": "Package name is required" }
{ "success": false, "message": "Package not found" }
```

---

### 8.5 POST /api/packages/videos/:videoId/resubmit-video

Agency submits a new video file after the **video track** was rejected. Metadata (title, description, tags) and thumbnails from the current version are **automatically copied** — Agency does not re-send them.

**Auth:** Agency POC

**Request:**
```json
{
  "fileUrl": "http://.../long-form-v2.mp4",
  "fileName": "long-form-v2.mp4",
  "fileType": "video/mp4",
  "fileSize": 52428800
}
```

| Field | Required |
|-------|----------|
| `fileUrl` | ✅ |
| `fileName` | ✅ |
| `fileType` | optional |
| `fileSize` | optional |

> Do NOT include title, description, tags, or thumbnails — they are automatically carried over.

**Response 200:**
```json
{
  "success": true,
  "message": "Video file resubmitted for review",
  "video": { ...video object with incremented currentVersion... }
}
```

After this call:
- `videoTrackStatus` → `PENDING` (metadata track **unchanged**)
- `currentVersion` increments
- New asset ID assigned — **update stored asset IDs from response**
- **Thumbnails are automatically copied from the previous version** with their existing `APPROVED`/`REJECTED` status preserved. Brand does **not** need to re-review thumbnails that were already approved. Only the video file is new.

**Errors:**
```json
{ "success": false, "message": "fileUrl is required" }
{ "success": false, "message": "fileName is required" }
{ "success": false, "message": "Video not found" }
{ "success": false, "message": "Cannot resubmit video file — video track is not rejected (current: PENDING)" }
```

---

### 8.6 POST /api/packages/videos/:videoId/resubmit-metadata

Agency submits new metadata + thumbnails after the **metadata track** was rejected. The video file is **automatically copied** from the current version.

**Auth:** Agency POC

**Request:**
```json
{
  "title": "Understanding Heart Attack — Full Documentary (Revised)",
  "description": "Comprehensive guide. Consult your doctor. #PractoHealth",
  "tags": ["heart-attack", "cardiology", "PractoHealth"],
  "thumbnails": [
    { "fileUrl": "http://.../thumb-new-1.jpg", "fileName": "thumb-new-1.jpg", "fileType": "image/jpeg" },
    { "fileUrl": "http://.../thumb-new-2.jpg", "fileName": "thumb-new-2.jpg", "fileType": "image/jpeg" }
  ]
}
```

| Field | Required | Rule |
|-------|----------|------|
| `title` | ✅ | |
| `description` | ✅ | |
| `tags` | optional | array |
| `thumbnails` | ✅ | Min 1 — all fresh thumbnails start as PENDING |

> Do NOT include fileUrl or fileName — the video file is carried over automatically.

**Response 200:**
```json
{
  "success": true,
  "message": "Metadata resubmitted for review",
  "video": { ...video object with incremented currentVersion... }
}
```

After this call:
- `metadataTrackStatus` → `PENDING` (video track **unchanged**)
- `currentVersion` increments
- All new thumbnails start with `status: PENDING` — Brand must re-review all thumbnails from scratch
- New asset ID and thumbnail IDs assigned — **update stored IDs from response**

**Errors:**
```json
{ "success": false, "message": "title is required" }
{ "success": false, "message": "description is required" }
{ "success": false, "message": "At least 1 thumbnail is required" }
{ "success": false, "message": "Video not found" }
{ "success": false, "message": "Cannot resubmit metadata — metadata track is not rejected (current: APPROVED)" }
```

---

### 8.7 POST /api/packages/videos/:videoId/approve

Approve a video. The action taken depends on your role and the video's current stage.

**Auth:** Medical Affairs, Content Brand, Content Approver, Super Admin

**Request:**
```json
{
  "comments": "Everything looks good."
}
```

> `comments` is optional for all roles.

**What happens by role:**

| Role | Video status | Track approved | Next video status |
|------|-------------|----------------|-------------------|
| `MEDICAL_AFFAIRS` | `MEDICAL_REVIEW` | `VIDEO_TRACK` → APPROVED | stays `MEDICAL_REVIEW` OR → `BRAND_VIDEO_REVIEW` if metadata also done |
| `CONTENT_BRAND` | `MEDICAL_REVIEW` | `METADATA_TRACK` → APPROVED (all thumbnails must be reviewed first) | stays `MEDICAL_REVIEW` OR → `BRAND_VIDEO_REVIEW` if video also done |
| `CONTENT_BRAND` | `BRAND_VIDEO_REVIEW` | `VIDEO_TRACK` → APPROVED (full quality review) | → `AWAITING_APPROVER` |
| `CONTENT_APPROVER` | `AWAITING_APPROVER` | Both (final sign-off) | → `APPROVED` |
| `SUPER_ADMIN` | any | Same as the appropriate role for that stage | same transitions |

**Brand approving metadata: prerequisite**

Before Brand can approve the metadata track (`MEDICAL_REVIEW` stage), **all thumbnails must be individually reviewed** via `PATCH /api/packages/thumbnails/:thumbnailId/review`. If any thumbnail is still `PENDING`, the approve call will fail:
```json
{ "success": false, "message": "Cannot approve metadata — 2 thumbnail(s) have not been reviewed yet. Review each thumbnail before approving." }
```

If any thumbnail is `REJECTED`, the approve call will fail:
```json
{ "success": false, "message": "Cannot approve metadata — 1 thumbnail(s) are rejected. Reject the metadata track so Agency can fix them." }
```

**Response 200:**
```json
{
  "success": true,
  "message": "Video approved",
  "video": { ...video object with updated status and track statuses... }
}
```

**Errors:**
```json
{ "success": false, "message": "Video not found" }
{ "success": false, "message": "Medical Affairs has already approved the video track for this submission cycle" }
{ "success": false, "message": "Brand has already approved the metadata track for this submission cycle" }
{ "success": false, "message": "Cannot approve metadata — 2 thumbnail(s) have not been reviewed yet. Review each thumbnail before approving." }
{ "success": false, "message": "Cannot approve metadata — 1 thumbnail(s) are rejected. Reject the metadata track so Agency can fix them." }
{ "success": false, "message": "Role CONTENT_APPROVER cannot approve video at stage MEDICAL_REVIEW" }
{ "success": false, "message": "Role MEDICAL_AFFAIRS cannot approve video at stage BRAND_VIDEO_REVIEW" }
```

---

### 8.8 POST /api/packages/videos/:videoId/reject

Reject a video. Track affected depends on role and stage.

**Auth:** Medical Affairs, Content Brand (NOT Content Approver — approve only)

**Request:**
```json
{
  "overallComments": "Several issues found — see item feedback.",
  "itemFeedback": [
    {
      "videoAssetId": "asset-uuid",
      "field": "VIDEO",
      "hasIssue": true,
      "comment": "Color grading is off — must match brand palette"
    },
    {
      "videoAssetId": "asset-uuid",
      "field": "TITLE",
      "hasIssue": true,
      "comment": "Title too long for social media (max 60 chars)"
    },
    {
      "videoAssetId": "asset-uuid",
      "field": "TAGS",
      "hasIssue": false
    }
  ]
}
```

**itemFeedback fields:**

| Field | Type | Rule |
|-------|------|------|
| `videoAssetId` | string (optional) | ID of the asset version being commented on |
| `thumbnailId` | string (optional) | For thumbnail-specific feedback |
| `field` | string ✅ | `VIDEO` / `TITLE` / `DESCRIPTION` / `TAGS` / `THUMBNAIL` |
| `hasIssue` | boolean ✅ | `true` if this field has a problem |
| `comment` | string (optional) | Required on **at least 1 item** across the array |

**Who can reject at which stage and which track is affected:**

| Role | Video status | Track affected | Video goes to |
|------|-------------|----------------|---------------|
| `MEDICAL_AFFAIRS` | `MEDICAL_REVIEW` | `videoTrackStatus` → REJECTED | stays `MEDICAL_REVIEW` |
| `CONTENT_BRAND` | `MEDICAL_REVIEW` | `metadataTrackStatus` → REJECTED | stays `MEDICAL_REVIEW` |
| `CONTENT_BRAND` | `BRAND_VIDEO_REVIEW` | `videoTrackStatus` → REJECTED | → `MEDICAL_REVIEW` |
| `CONTENT_APPROVER` | any | ❌ **Cannot reject** | — |

> Note: When Brand rejects at `BRAND_VIDEO_REVIEW`, the video goes back to `MEDICAL_REVIEW` but `metadataTrackStatus` stays `APPROVED` — metadata does NOT reset.

**Response 200:**
```json
{
  "success": true,
  "message": "Video rejected",
  "video": { ...video object with updated status and track statuses... }
}
```

**Errors:**
```json
{ "success": false, "message": "At least one item must have a rejection comment" }
{ "success": false, "message": "Video not found" }
{ "success": false, "message": "Cannot reject video at stage: AWAITING_APPROVER" }
{ "success": false, "message": "Role CONTENT_APPROVER cannot reject video at stage MEDICAL_REVIEW" }
{ "success": false, "message": "itemFeedback is required" }
```

---

### 8.9 PATCH /api/packages/videos/:videoId/withdraw

Withdraw a video. **Super Admin only.** Can be done at any active stage.

**Auth:** Super Admin only

**Request:** No body needed.

**Response 200:**
```json
{
  "success": true,
  "message": "Video withdrawn",
  "video": { ...video object with status: "WITHDRAWN"... }
}
```

**Errors:**
```json
{ "success": false, "message": "Only Super Admin can withdraw a video" }
{ "success": false, "message": "Video not found" }
{ "success": false, "message": "Video is already withdrawn" }
```

---

### 8.10 PATCH /api/packages/thumbnails/:thumbnailId/review

Brand reviews a single thumbnail — approve or reject with optional/required comment.

**Auth:** Content Brand, Super Admin

**Request (approve):**
```json
{
  "status": "APPROVED",
  "comment": "Looks great!"
}
```

**Request (reject — comment required):**
```json
{
  "status": "REJECTED",
  "comment": "Thumbnail colors don't match brand palette. Please use #0066CC blue."
}
```

| Field | Required | Values |
|-------|----------|--------|
| `status` | ✅ | `APPROVED` or `REJECTED` |
| `comment` | Required when `REJECTED`, optional when `APPROVED` | string |

**Response 200:**
```json
{
  "success": true,
  "thumbnail": {
    "id": "thumb-uuid",
    "assetId": "asset-uuid",
    "fileUrl": "http://164.52.204.34:9002/.../thumb1.jpg",
    "fileName": "thumb1.jpg",
    "status": "REJECTED",
    "comment": "Thumbnail colors don't match brand palette.",
    "version": 1,
    "createdAt": "2026-03-27T10:00:00.000Z"
  }
}
```

**Errors:**
```json
{ "success": false, "message": "Only Brand/Content team can review thumbnails" }
{ "success": false, "message": "A comment is required when rejecting a thumbnail" }
{ "success": false, "message": "Thumbnail not found" }
{ "success": false, "message": "Thumbnails can only be reviewed at MEDICAL_REVIEW stage (current: BRAND_VIDEO_REVIEW)" }
```

---

### 8.11 GET /api/packages/:id

Get the full package with all videos, assets, thumbnails, and reviews.

**Auth:** Any authenticated user

**Response 200:**
```json
{
  "success": true,
  "package": { ...full package object with videos array... }
}
```

**Errors:**
```json
{ "success": false, "message": "Package not found" }
```

---

### 8.12 GET /api/packages/script/:scriptId

Get the package for a specific script.

**Auth:** Any authenticated user

**Response 200:**
```json
{
  "success": true,
  "package": { ...package object... }
}
```

**Errors:**
```json
{ "success": false, "message": "No package found for this script" }
```

---

### 8.13 GET /api/packages/videos/:videoId

Get a single video with all its assets, thumbnails, and reviews.

**Auth:** Any authenticated user

**Response 200:**
```json
{
  "success": true,
  "video": { ...video object... }
}
```

**Errors:**
```json
{ "success": false, "message": "Video not found" }
```

---

### 8.14 GET /api/packages/videos/:videoId/versions

Get all version snapshots for a video (version history).

**Auth:** Any authenticated user

**Response 200:**
```json
{
  "success": true,
  "videoId": "video-uuid",
  "currentVersion": 3,
  "totalVersions": 3,
  "versions": [
    {
      "version": 1,
      "asset": {
        "id": "asset-uuid-v1",
        "fileUrl": "http://.../long-form-v1.mp4",
        "title": "Understanding Heart Attack",
        "thumbnails": [ ...v1 thumbnails... ]
      },
      "reviews": [ ...reviews made during v1... ]
    },
    {
      "version": 2,
      "asset": { ...v2 asset with updated video file... },
      "reviews": []
    }
  ]
}
```

---

### 8.15 GET /api/packages/queue

Get videos in the current user's review queue.

**Auth:** Any authenticated user

**Response 200:**
```json
{
  "success": true,
  "total": 5,
  "videos": [ ...array of video objects... ]
}
```

**Queue filtering by role:**

| Role | Sees |
|------|------|
| `AGENCY_POC` | Their own submitted videos (all statuses) |
| `MEDICAL_AFFAIRS` | Videos at `MEDICAL_REVIEW` where `videoTrackStatus = PENDING` |
| `CONTENT_BRAND` | Videos at `MEDICAL_REVIEW` where `metadataTrackStatus = PENDING` + all `BRAND_VIDEO_REVIEW` videos |
| `CONTENT_APPROVER` | Videos at `AWAITING_APPROVER` |
| `SUPER_ADMIN` | All videos |

---

### 8.16 GET /api/packages/stats

Get video counts by status.

**Auth:** Any authenticated user

**Response 200:**
```json
{
  "success": true,
  "stats": {
    "total": 20,
    "byStatus": {
      "MEDICAL_REVIEW": 5,
      "BRAND_VIDEO_REVIEW": 3,
      "AWAITING_APPROVER": 2,
      "APPROVED": 8,
      "WITHDRAWN": 2
    }
  }
}
```

---

### 8.17 GET /api/packages/my-reviews

Get videos previously reviewed by the current user.

**Auth:** Medical Affairs, Content Brand, Content Approver

**Query params:**
| Param | Required | Values |
|-------|----------|--------|
| `decision` | ✅ | `APPROVED` or `REJECTED` |
| `page` | optional | default 1 |
| `limit` | optional | default 20 |

**Example:** `GET /api/packages/my-reviews?decision=APPROVED&page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "total": 12,
  "page": 1,
  "limit": 20,
  "videos": [ ...array of video objects... ]
}
```

---

## 9. Complete Workflow Walkthrough

### Step 1 — Agency creates package and submits first video

```
1. Upload video file:
   POST /api/packages/upload-url  { fileName: "long.mp4", fileType: "video/mp4", assetType: "video" }
   → store fileUrl

2. Upload thumbnails (repeat for each):
   POST /api/packages/upload-url  { fileName: "thumb1.jpg", fileType: "image/jpeg", assetType: "thumbnail" }
   → store fileUrl

3. Create package + first video:
   POST /api/packages  { scriptId, name, video: { type, fileUrl, fileName, thumbnails: [...], title, description, tags } }
   → store packageId, videoId, assetId, thumbnailIds

First video is now at: MEDICAL_REVIEW | videoTrack: PENDING | metadataTrack: PENDING
```

### Step 2 — Agency adds more videos (any time)

```
POST /api/packages/:packageId/videos  { type, fileUrl, fileName, thumbnails, title, description, tags }
→ New video immediately starts its own MEDICAL_REVIEW flow independently
```

### Step 3 — MEDICAL_REVIEW (two parallel reviewers, per video)

```
Medical Affairs (video track):
  GET /api/packages/queue             → sees videos with videoTrackStatus=PENDING
  GET /api/packages/videos/:videoId   → reviews video file
  POST /api/packages/videos/:videoId/approve  { comments }  → videoTrack: APPROVED
  OR
  POST /api/packages/videos/:videoId/reject   { itemFeedback: [{ field: "VIDEO", hasIssue: true, comment: "..." }] }

Content Brand (metadata track):
  GET /api/packages/queue             → sees videos with metadataTrackStatus=PENDING
  GET /api/packages/videos/:videoId   → reviews title/desc/tags/thumbnails

  First: review each thumbnail individually:
    PATCH /api/packages/thumbnails/:thumbId/review  { status: "APPROVED" }
    PATCH /api/packages/thumbnails/:thumbId/review  { status: "REJECTED", comment: "..." }

  Then, if all thumbnails approved:
    POST /api/packages/videos/:videoId/approve  { comments }  → metadataTrack: APPROVED

  Or if any thumbnail rejected:
    POST /api/packages/videos/:videoId/reject   { itemFeedback: [{ field: "THUMBNAIL", hasIssue: true, comment: "..." }] }
                                                                 → metadataTrack: REJECTED

When BOTH tracks approved → video automatically moves to BRAND_VIDEO_REVIEW
```

### Step 4A — Video track rejected → Agency resubmits video file

```
Agency sees videoTrackStatus = REJECTED (metadataTrackStatus untouched)
  Upload new video file: POST /api/packages/upload-url
  POST /api/packages/videos/:videoId/resubmit-video  { fileUrl, fileName }
  → videoTrackStatus: PENDING, currentVersion increments, metadata/thumbnails auto-copied
  → Medical Affairs reviews again
```

### Step 4B — Metadata track rejected → Agency resubmits metadata

```
Agency sees metadataTrackStatus = REJECTED (videoTrackStatus untouched)
  Upload new thumbnails: POST /api/packages/upload-url (for each)
  POST /api/packages/videos/:videoId/resubmit-metadata  { title, description, tags, thumbnails: [...] }
  → metadataTrackStatus: PENDING, currentVersion increments, video file auto-copied
  → Brand reviews thumbnails + metadata again
```

### Step 5 — BRAND_VIDEO_REVIEW

```
Content Brand:
  GET /api/packages/queue             → sees BRAND_VIDEO_REVIEW videos
  GET /api/packages/videos/:videoId   → reviews full video + selected thumbnails
  POST /api/packages/videos/:videoId/approve  → video moves to AWAITING_APPROVER
  OR
  POST /api/packages/videos/:videoId/reject   → video goes back to MEDICAL_REVIEW
    (videoTrack: REJECTED, metadataTrack stays APPROVED)
    → Agency resubmits video file only → Medical reviews → both tracks approved again → back to BRAND_VIDEO_REVIEW
```

### Step 6 — AWAITING_APPROVER

```
Content Approver:
  GET /api/packages/queue             → sees AWAITING_APPROVER videos
  GET /api/packages/videos/:videoId   → reviews everything
  POST /api/packages/videos/:videoId/approve  → video: APPROVED
    If this is the first APPROVED video in the package → Phase 7 auto-triggers!

  ❌ Content Approver CANNOT reject at this stage.
```

---

## 10. Validation Rules

### Thumbnail review before metadata approval
| Condition | Can Brand approve metadata? |
|-----------|----------------------------|
| All thumbnails `APPROVED` | ✅ Yes |
| Any thumbnail `PENDING` | ❌ No — review all first |
| Any thumbnail `REJECTED` | ❌ No — must reject metadata track |

### Track independence
| Scenario | Video track | Metadata track |
|----------|-------------|----------------|
| Medical rejects at MEDICAL_REVIEW | → REJECTED | Unchanged |
| Brand rejects metadata at MEDICAL_REVIEW | Unchanged | → REJECTED |
| Brand rejects at BRAND_VIDEO_REVIEW | → REJECTED | Stays APPROVED |
| Agency resubmits video file | → PENDING | Unchanged |
| Agency resubmits metadata | Unchanged | → PENDING |

### Rejection comment rule
- `itemFeedback` array is required and must not be empty
- **At least 1 item** must have a non-empty `comment`
- `overallComments` is optional

### Who can do what
| Action | AGENCY | MEDICAL | BRAND | APPROVER | SUPER ADMIN |
|--------|--------|---------|-------|----------|-------------|
| Create package | ✅ | ❌ | ❌ | ❌ | ❌ |
| Add video | ✅ | ❌ | ❌ | ❌ | ❌ |
| Rename package | ✅ | ❌ | ❌ | ❌ | ❌ |
| Review thumbnail | ❌ | ❌ | ✅ | ❌ | ✅ |
| Approve (video track) | ❌ | ✅ | ❌ | ❌ | ✅ |
| Approve (metadata track) | ❌ | ❌ | ✅ | ❌ | ✅ |
| Approve (brand video quality) | ❌ | ❌ | ✅ | ❌ | ✅ |
| Final approve | ❌ | ❌ | ❌ | ✅ | ✅ |
| Reject | ❌ | ✅ | ✅ | ❌ | ✅ |
| Withdraw | ❌ | ❌ | ❌ | ❌ | ✅ only |
| Resubmit video | ✅ | ❌ | ❌ | ❌ | ✅ |
| Resubmit metadata | ✅ | ❌ | ❌ | ❌ | ✅ |

---

## 11. All Possible Error Responses

**HTTP Status Code mapping:**
| Code | When |
|------|------|
| 400 | Validation error (missing field, wrong state, business rule violation) |
| 401 | No token or invalid token |
| 403 | Valid token but wrong role/permission |
| 404 | Resource not found |
| 500 | Unexpected server error |

```json
{ "success": false, "message": "Unauthorized" }                                                      // 401
{ "success": false, "message": "Forbidden — insufficient permissions" }                               // 403
{ "success": false, "message": "Package not found" }                                                 // 404
{ "success": false, "message": "Video not found" }                                                   // 404
{ "success": false, "message": "Thumbnail not found" }                                               // 404
{ "success": false, "message": "No package found for this script" }                                  // 404

// Create package
{ "success": false, "message": "Package name is required" }
{ "success": false, "message": "fileUrl is required for video" }
{ "success": false, "message": "fileName is required for video" }
{ "success": false, "message": "At least 1 thumbnail is required per video" }
{ "success": false, "message": "fileUrl is required for all thumbnails" }
{ "success": false, "message": "fileName is required for all thumbnails" }
{ "success": false, "message": "Cannot create package — script is not yet locked (current: DRAFT)" }
{ "success": false, "message": "Cannot create package — First Cut video has not been approved yet (Phase 5 incomplete)" }
{ "success": false, "message": "A package already exists for this script. Use 'Add Video' to add more videos." }

// Resubmit
{ "success": false, "message": "fileUrl is required" }
{ "success": false, "message": "fileName is required" }
{ "success": false, "message": "title is required" }
{ "success": false, "message": "description is required" }
{ "success": false, "message": "At least 1 thumbnail is required" }
{ "success": false, "message": "Cannot resubmit video file — video track is not rejected (current: PENDING)" }
{ "success": false, "message": "Cannot resubmit metadata — metadata track is not rejected (current: APPROVED)" }

// Approve
{ "success": false, "message": "Medical Affairs has already approved the video track for this submission cycle" }
{ "success": false, "message": "Brand has already approved the metadata track for this submission cycle" }
{ "success": false, "message": "Cannot approve metadata — 2 thumbnail(s) have not been reviewed yet. Review each thumbnail before approving." }
{ "success": false, "message": "Cannot approve metadata — 1 thumbnail(s) are rejected. Reject the metadata track so Agency can fix them." }
{ "success": false, "message": "Role CONTENT_APPROVER cannot approve video at stage MEDICAL_REVIEW" }
{ "success": false, "message": "Role MEDICAL_AFFAIRS cannot approve video at stage BRAND_VIDEO_REVIEW" }

// Reject
{ "success": false, "message": "At least one item must have a rejection comment" }
{ "success": false, "message": "Cannot reject video at stage: AWAITING_APPROVER" }
{ "success": false, "message": "Role CONTENT_APPROVER cannot reject video at stage MEDICAL_REVIEW" }

// Thumbnail review
{ "success": false, "message": "Only Brand/Content team can review thumbnails" }
{ "success": false, "message": "A comment is required when rejecting a thumbnail" }
{ "success": false, "message": "Thumbnails can only be reviewed at MEDICAL_REVIEW stage (current: BRAND_VIDEO_REVIEW)" }

// Withdraw
{ "success": false, "message": "Only Super Admin can withdraw a video" }
{ "success": false, "message": "Video is already withdrawn" }
```

---

## 12. UI Rendering Logic by Role

### Agency POC — Video Card

```javascript
function renderVideoCard(video) {
  const { status, videoTrackStatus, metadataTrackStatus } = video;

  if (status === 'MEDICAL_REVIEW') {
    // Show track status badges
    showBadge('Video Track', videoTrackStatus);       // PENDING/APPROVED/REJECTED
    showBadge('Metadata Track', metadataTrackStatus); // PENDING/APPROVED/REJECTED

    if (videoTrackStatus === 'REJECTED') {
      showFeedback(getVideoTrackFeedback(video.reviews));
      showButton('Resubmit Video File');   // → POST /videos/:id/resubmit-video
    }
    if (metadataTrackStatus === 'REJECTED') {
      showFeedback(getMetadataTrackFeedback(video.reviews));
      showButton('Resubmit Metadata');     // → POST /videos/:id/resubmit-metadata
    }
  }

  if (status === 'BRAND_VIDEO_REVIEW') {
    showStatus('Brand Reviewing Video Quality — Both tracks approved');
  }

  if (status === 'AWAITING_APPROVER') {
    showStatus('Waiting for Content Approver final approval');
  }

  if (status === 'APPROVED') {
    showStatus('Approved ✅');
  }

  if (status === 'WITHDRAWN') {
    showStatus('Withdrawn');
  }
}
```

### Medical Affairs — Queue + Review

```javascript
// Queue: only videos with videoTrackStatus=PENDING at MEDICAL_REVIEW
// Detail view: show video file player only

function renderMedicalView(video) {
  const currentAsset = video.assets.find(a => a.version === video.currentVersion);

  showVideoPlayer(currentAsset.fileUrl);
  showMeta({ title: currentAsset.title, description: currentAsset.description });

  showButton('Approve Video Track');   // → POST /videos/:id/approve  { comments }
  showButton('Reject Video Track');    // → POST /videos/:id/reject  { itemFeedback with field: VIDEO }

  // After approve: check if video moved to BRAND_VIDEO_REVIEW
  // If still at MEDICAL_REVIEW → "Waiting for Brand to approve metadata"
}
```

### Content Brand — MEDICAL_REVIEW stage

```javascript
// Queue: videos with metadataTrackStatus=PENDING at MEDICAL_REVIEW
// Detail view: show metadata + thumbnail review panel

function renderBrandMetadataView(video) {
  const currentAsset = video.assets.find(a => a.version === video.currentVersion);
  const thumbnails = currentAsset.thumbnails;

  // Show metadata
  showField('Title', currentAsset.title);
  showField('Description', currentAsset.description);
  showField('Tags', currentAsset.tags);

  // Show thumbnail review panel (review each individually)
  thumbnails.forEach(thumb => {
    showThumbnail(thumb);
    showBadge(thumb.status);           // PENDING / APPROVED / REJECTED
    if (thumb.status === 'REJECTED') showComment(thumb.comment);

    if (thumb.status === 'PENDING') {
      showButton('Approve Thumbnail');  // → PATCH /thumbnails/:thumbId/review  { status: "APPROVED" }
      showButton('Reject Thumbnail');   // → PATCH /thumbnails/:thumbId/review  { status: "REJECTED", comment: "..." }
    }
  });

  const allReviewed = thumbnails.every(t => t.status !== 'PENDING');
  const anyRejected = thumbnails.some(t => t.status === 'REJECTED');

  if (allReviewed && !anyRejected) {
    showButton('Approve Metadata Track');  // → POST /videos/:id/approve
  }
  if (anyRejected || allReviewed) {
    showButton('Reject Metadata Track');   // → POST /videos/:id/reject
  }
}
```

### Content Brand — BRAND_VIDEO_REVIEW stage

```javascript
// Queue: all videos at BRAND_VIDEO_REVIEW
// Detail: show video + approved thumbnails (for context)

function renderBrandVideoView(video) {
  const currentAsset = video.assets.find(a => a.version === video.currentVersion);
  const approvedThumbs = currentAsset.thumbnails.filter(t => t.status === 'APPROVED');

  showVideoPlayer(currentAsset.fileUrl);
  showApprovedThumbnails(approvedThumbs);
  showMeta({ title: currentAsset.title, description: currentAsset.description, tags: currentAsset.tags });

  showButton('Approve Video Quality');  // → POST /videos/:id/approve
  showButton('Reject Video Quality');   // → POST /videos/:id/reject   { itemFeedback: [{ field: "VIDEO", ... }] }
}
```

### Content Approver — AWAITING_APPROVER stage

```javascript
// Queue: all videos at AWAITING_APPROVER
// Detail: show everything — video, all approved thumbnails, all metadata

function renderApproverView(video) {
  const currentAsset = video.assets.find(a => a.version === video.currentVersion);
  const approvedThumbs = currentAsset.thumbnails.filter(t => t.status === 'APPROVED');

  showVideoPlayer(currentAsset.fileUrl);
  showApprovedThumbnails(approvedThumbs);
  showMeta({ title: currentAsset.title, description: currentAsset.description, tags: currentAsset.tags });
  showAllReviews(video.reviews);  // show Medical + Brand review history

  // APPROVE ONLY — no reject button
  showButton('Final Approve');    // → POST /videos/:id/approve
  // No reject button
}
```

### Thumbnail status badge

```javascript
function thumbnailBadge(status) {
  return {
    PENDING:  { color: 'yellow', label: 'Pending Review' },
    APPROVED: { color: 'green',  label: 'Approved' },
    REJECTED: { color: 'red',    label: 'Rejected' }
  }[status];
}
```

### Video status badge

```javascript
function videoBadge(status) {
  return {
    MEDICAL_REVIEW:    { color: 'blue',   label: 'Medical & Brand Review' },
    BRAND_VIDEO_REVIEW:{ color: 'purple', label: 'Brand Quality Review' },
    AWAITING_APPROVER: { color: 'orange', label: 'Awaiting Final Approval' },
    APPROVED:          { color: 'green',  label: 'Approved ✅' },
    WITHDRAWN:         { color: 'gray',   label: 'Withdrawn' }
  }[status];
}
```

### Getting current version's asset

```javascript
// Always filter by currentVersion to show the latest submission:
const currentAsset = video.assets.find(a => a.version === video.currentVersion);

// For version history tab:
const allVersions = video.assets.sort((a, b) => a.version - b.version);
```

### Grouping review feedback for Agency display

```javascript
// Show Agency what needs to be fixed:
function getTrackFeedback(reviews, track) {
  return reviews
    .filter(r => r.trackReviewed === track && r.decision === 'REJECTED')
    .flatMap(r => r.itemFeedback)
    .filter(f => f.hasIssue && f.comment)
    .map(f => ({ field: f.field, comment: f.comment }));
}

const videoFeedback    = getTrackFeedback(video.reviews, 'VIDEO_TRACK');
const metadataFeedback = getTrackFeedback(video.reviews, 'METADATA_TRACK');
```

---

---

## 13. Edge Cases & FAQ

This section covers every tricky scenario the frontend needs to handle correctly.

---

### Q1: Both video track AND metadata track are rejected at the same time. What does Agency see?

Both tracks are independent — they can both be `REJECTED` simultaneously.

```
videoTrackStatus:    REJECTED  ← Medical Affairs rejected it
metadataTrackStatus: REJECTED  ← Brand rejected it
status:              MEDICAL_REVIEW
```

**Agency UI must show both resubmit options at the same time:**
- "Resubmit Video File" button (fixes video track)
- "Resubmit Metadata" button (fixes metadata track)

**Can Agency fix both simultaneously?** Yes — they are completely independent. Agency can:
1. Fix video file → `resubmit-video` → videoTrack becomes PENDING, metadataTrack stays REJECTED
2. Then fix metadata → `resubmit-metadata` → metadataTrack becomes PENDING

Or in any order. Each resubmit only touches its own track.

**Important:** Agency can only resubmit a track when that track is `REJECTED`. They cannot resubmit a track that is `PENDING` or `APPROVED`.

---

### Q2: Can Agency resubmit when the track is PENDING (under review)?

**No.** Resubmit is only allowed when the track is `REJECTED`. If the track is `PENDING`, it means a reviewer is currently working on it — Agency must wait.

```
videoTrackStatus: PENDING → resubmit-video will return 400 error
metadataTrackStatus: PENDING → resubmit-metadata will return 400 error
```

---

### Q3: Medical Affairs approved the video track. Metadata track is still PENDING. What does each party see?

```
status:              MEDICAL_REVIEW
videoTrackStatus:    APPROVED   ← Medical done
metadataTrackStatus: PENDING    ← Brand still reviewing
```

- **Medical Affairs queue:** This video disappears from their queue (videoTrack is no longer PENDING)
- **Brand queue:** This video stays in their queue (metadataTrack is still PENDING)
- **Agency:** Shows "Video Track ✅ Approved / Metadata Track 🕐 Under Review"
- **Video does NOT advance** — must wait for both

---

### Q4: Brand approved the metadata track at MEDICAL_REVIEW. Video track is still PENDING.

```
status:              MEDICAL_REVIEW
videoTrackStatus:    PENDING    ← Medical still reviewing
metadataTrackStatus: APPROVED   ← Brand done
```

- **Brand queue (MEDICAL_REVIEW):** This video disappears from Brand's MEDICAL_REVIEW queue (metadataTrack is no longer PENDING)
- **Medical Affairs queue:** Video still in their queue
- **Video does NOT advance** — waits for Medical to approve video track
- **Brand still in BRAND_VIDEO_REVIEW queue:** No — this video is still at MEDICAL_REVIEW. Brand will get it again only after both tracks are done and video moves to BRAND_VIDEO_REVIEW.

---

### Q5: When exactly does the video move from MEDICAL_REVIEW to BRAND_VIDEO_REVIEW?

The transition happens **automatically on the approval that completes both tracks**:

- Medical approves video track → checks if metadataTrack is already APPROVED
  - If yes → immediately moves to BRAND_VIDEO_REVIEW in the same API call
  - If no → stays at MEDICAL_REVIEW
- Brand approves metadata track → checks if videoTrack is already APPROVED
  - If yes → immediately moves to BRAND_VIDEO_REVIEW in the same API call
  - If no → stays at MEDICAL_REVIEW

The response from the approve call will reflect the new status. No polling needed.

---

### Q6: Brand rejected video quality at BRAND_VIDEO_REVIEW. What exactly resets?

```
Before:
  status:              BRAND_VIDEO_REVIEW
  videoTrackStatus:    APPROVED
  metadataTrackStatus: APPROVED

After Brand rejects:
  status:              MEDICAL_REVIEW  ← goes back
  videoTrackStatus:    REJECTED        ← only this changes
  metadataTrackStatus: APPROVED        ← stays APPROVED, unchanged
```

**Agency only needs to fix the video file** — metadata is still approved and locked.
**Brand does NOT need to re-review metadata** — it stays APPROVED.
**After Agency resubmits video file:**
- `videoTrackStatus` → `PENDING` (metadata stays APPROVED)
- Medical Affairs reviews video again
- When Medical approves → both tracks APPROVED again → video immediately moves back to BRAND_VIDEO_REVIEW
- Brand reviews video quality again

---

### Q7: Can Content Approver reject a video?

**No.** Content Approver can ONLY approve at `AWAITING_APPROVER`. There is no reject button for Content Approver in Phase 6.

If the Content Approver has concerns, they must communicate offline and the Super Admin can withdraw the video if needed.

```
POST /api/packages/videos/:videoId/reject
→ { "success": false, "message": "Cannot reject video at stage: AWAITING_APPROVER" }
```

---

### Q8: Can Agency POC withdraw a video?

**No.** Only `SUPER_ADMIN` can withdraw a video. The withdraw endpoint returns a 400 error for any other role:
```json
{ "success": false, "message": "Only Super Admin can withdraw a video" }
```

---

### Q9: What is `WITHDRAWN` status? Can the video come back?

`WITHDRAWN` is a **terminal state**. Once a video is withdrawn by Super Admin, it cannot be reactivated. There is no "un-withdraw" endpoint.

The video remains in the package's `videos` array with `status: WITHDRAWN` for audit purposes.

If the Agency needs to submit a new version of a withdrawn video, they must add a completely new video via `POST /api/packages/:id/videos`.

---

### Q10: Can there be multiple packages for the same script?

**No.** Only 1 package is allowed per script. If you try to create a second package:
```json
{ "success": false, "message": "A package already exists for this script. Use 'Add Video' to add more videos." }
```

Use `POST /api/packages/:id/videos` to add more videos to the existing package.

---

### Q11: Can Agency add videos to the package at any time? Even while other videos are being reviewed?

**Yes.** Each video is independent. Agency can add a new video (`POST /api/packages/:id/videos`) at any time — even while other videos in the same package are at `BRAND_VIDEO_REVIEW` or `AWAITING_APPROVER`. The new video immediately starts its own `MEDICAL_REVIEW` flow without affecting others.

---

### Q12: How do I get the current version's asset? The `assets` array has multiple items.

The `assets` array contains **all historical version snapshots** for a video. Always filter by `currentVersion`:

```javascript
const currentAsset = video.assets.find(a => a.version === video.currentVersion);
```

For the version history tab, show all versions sorted:
```javascript
const history = video.assets.sort((a, b) => a.version - b.version);
```

---

### Q13: What fields are valid in `itemFeedback` by role and stage?

| Who rejects | At stage | Valid `field` values |
|-------------|----------|---------------------|
| Medical Affairs | `MEDICAL_REVIEW` | `"VIDEO"` |
| Content Brand | `MEDICAL_REVIEW` (metadata track) | `"TITLE"`, `"DESCRIPTION"`, `"TAGS"`, `"THUMBNAIL"` |
| Content Brand | `BRAND_VIDEO_REVIEW` | `"VIDEO"` |

> You can send any combination of fields in `itemFeedback`, but at least 1 must have `hasIssue: true` and a non-empty `comment`.

---

### Q14: Brand reviewed some thumbnails but not all. Can they still approve or reject the metadata track?

**Approve:** No — all thumbnails must be reviewed (none `PENDING`) before Brand can approve the metadata track.

**Reject:** Yes — Brand can reject the metadata track even if some thumbnails are still `PENDING`. A rejection does not require all thumbnails to be reviewed first.

---

### Q15: Brand reviewed all thumbnails. 3 are APPROVED, 2 are REJECTED. What can Brand do?

Brand **cannot approve** the metadata track — any `REJECTED` thumbnail blocks approval.

Brand must **reject the metadata track** so Agency can fix the rejected thumbnails and resubmit.

```
POST /api/packages/videos/:videoId/approve
→ { "success": false, "message": "Cannot approve metadata — 2 thumbnail(s) are rejected. Reject the metadata track so Agency can fix them." }
```

---

### Q16: When Agency resubmits video file, do thumbnails get reset?

**No.** Thumbnails are **automatically copied** from the current version with their `APPROVED`/`REJECTED` status preserved.

This means:
- If Brand had already approved some thumbnails → they stay `APPROVED` on the new version
- Brand does NOT need to re-review thumbnails when only the video file changed
- Brand only needs to review the video quality (at `BRAND_VIDEO_REVIEW`) after Medical re-approves

---

### Q17: When Agency resubmits metadata, do thumbnails get reset?

**Yes.** All thumbnails submitted in `resubmit-metadata` start fresh with `status: PENDING`.

This is because the Agency is submitting entirely new thumbnails. Brand must review each new thumbnail before they can approve the metadata track again.

---

### Q18: Can a reviewer approve/reject the same track twice in one submission cycle?

**No.** The backend prevents duplicate reviews in the same submission cycle.

```json
{ "success": false, "message": "Medical Affairs has already approved the video track for this submission cycle" }
{ "success": false, "message": "Brand has already approved the metadata track for this submission cycle" }
```

A new "cycle" begins when Agency resubmits (video or metadata). After resubmit, reviewers can act again.

---

### Q19: Can Super Admin approve/reject at any stage?

**Yes.** Super Admin can:
- Approve video track at `MEDICAL_REVIEW` (same as Medical Affairs)
- Approve metadata track at `MEDICAL_REVIEW` (same as Brand)
- Reject either track at `MEDICAL_REVIEW` (same as respective role)
- Approve video quality at `BRAND_VIDEO_REVIEW` (same as Brand)
- Reject at `BRAND_VIDEO_REVIEW` (same as Brand)
- Give final approval at `AWAITING_APPROVER` (same as Content Approver)
- Withdraw at any stage (only Super Admin can do this)
- Review thumbnails (same as Brand)

---

### Q20: What triggers Phase 7? Does the frontend need to do anything?

Phase 7 is triggered **automatically by the backend** the moment the first video in a package reaches `APPROVED` status (Content Approver approves at `AWAITING_APPROVER`).

The frontend does not call any endpoint to trigger Phase 7. It's handled server-side via an event/notification queue.

From the frontend perspective, once you see `video.status === 'APPROVED'` on any video in the package, Phase 7 has been triggered.

---

### Q21: Package name — when and who can update it?

- Only `AGENCY_POC` can update the package name
- Can be updated at **any time** (no restriction based on video statuses)
- `PATCH /api/packages/:id` with `{ "name": "New Package Name" }`

---

### Q22: Does the `DRAFT` status appear for videos?

**No.** `DRAFT` is in the database enum but is not used for `PackageVideo`. Videos go directly to `MEDICAL_REVIEW` when submitted. You will never see `status: "DRAFT"` on a video returned from the API.

---

### Q23: What does the queue return — packages or videos?

The queue (`GET /api/packages/queue`) returns **videos**, not packages. Since each video has its own independent flow, the queue is video-centric. Each item in the `videos` array is a full video object (with assets, thumbnails, reviews).

---

### Q24: Multiple videos in same package at different stages — example

This is completely normal and expected:

```
Package: "Heart Attack Campaign"
  ├── Video 1 (LONG_FORM)  → status: APPROVED ✅  ← Phase 7 already triggered!
  ├── Video 2 (SHORT_FORM) → status: AWAITING_APPROVER 🟠
  ├── Video 3 (SHORT_FORM) → status: BRAND_VIDEO_REVIEW 🟣
  └── Video 4 (SHORT_FORM) → status: MEDICAL_REVIEW 🔵 (videoTrack: REJECTED)
```

Each video is completely independent. Phase 7 is already triggered because Video 1 is APPROVED.

---

### Q25: `currentVersion` — when does it increment?

`currentVersion` increments every time Agency calls either:
- `POST /videos/:videoId/resubmit-video` → version + 1
- `POST /videos/:videoId/resubmit-metadata` → version + 1

Starting version is always `1`. If Agency resubmits video file twice and metadata once, `currentVersion` will be `4`.

Each version creates a new `PackageAsset` record in the `assets` array. Always show the one matching `currentVersion`.

---

*Last updated: 2026-03-27 — Phase 6 fully redesigned: per-video independent review, parallel tracks, thumbnail-by-thumbnail review, Content Approver approve-only, Super Admin withdraw-only*
