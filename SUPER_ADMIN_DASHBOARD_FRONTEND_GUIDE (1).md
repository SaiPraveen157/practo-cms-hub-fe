# Super Admin Dashboard — Frontend Integration Guide

**Branch:** `feature/sticker-brand-approver-write`
**Base URL:** `http://164.52.204.34:5001/api`
**Auth:** Bearer token required. Login: `admin@practo.com` / `Admin@123`
**Permission:** All endpoints require `view_analytics` permission (Super Admin only). Other roles get 403.

---

## Table of Contents

1. [Overview API](#1-overview-api)
2. [Overdue Items API](#2-overdue-items-api)
3. [Team Performance API](#3-team-performance-api)
4. [Script Timeline API](#4-script-timeline-api)
5. [Rejection Report API](#5-rejection-report-api)
6. [Pipeline Metrics API](#6-pipeline-metrics-api)
7. [Content Listing API](#7-content-listing-api)
8. [User Management APIs](#8-user-management-apis)
9. [Error Reference](#9-error-reference)
10. [Edge Cases & Tips](#10-edge-cases--tips)

---

## 1. Overview API

**Use for:** Dashboard landing page — all counts in one call.

```
GET /api/admin/overview
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "scripts": {
    "total": 9,
    "byStatus": {
      "draft": 1,
      "contentBrandReview": 0,
      "agencyProduction": 1,
      "medicalReview": 0,
      "contentBrandApproval": 0,
      "contentApproverReview": 1,
      "locked": 6
    },
    "overdue": 0
  },
  "videos": {
    "firstLineUp": {
      "total": 6,
      "awaitingUpload": 3,
      "medicalReview": 0,
      "brandReview": 1,
      "approved": 2,
      "overdue": 0
    },
    "firstCut": {
      "total": 2,
      "awaitingUpload": 0,
      "medicalReview": 0,
      "brandReview": 0,
      "approved": 2,
      "overdue": 0
    }
  },
  "packages": {
    "total": 2,
    "medicalReview": 0,
    "brandReview": 0,
    "awaitingApprover": 0,
    "approved": 2,
    "overdue": 0
  },
  "languagePackages": {
    "total": 4,
    "brandReview": 0,
    "awaitingApprover": 0,
    "approved": 4,
    "withdrawn": 0
  },
  "users": { "total": 5, "active": 5 },
  "activity": { "reviewsToday": 59, "actionsToday": 114 },
  "overdue": { "scripts": 0, "videos": 0, "packages": 0, "total": 0 },
  "notifications": { "unread": 128 }
}
```

**Frontend can build:**
- Phase-wise pipeline chart (`scripts.byStatus`)
- Overdue alert banner (`overdue.total > 0` → show red badge)
- Video progress cards (FLU/FC counts)
- Package + language status cards
- User count widget
- Today's activity counter
- Notification badge

---

## 2. Overdue Items API

**Use for:** "What's stuck?" — click on overdue badge to see the list.

```
GET /api/admin/overdue
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "type": "script",
      "id": "abc-123",
      "title": "Diabetes Guide",
      "stage": "MEDICAL_REVIEW",
      "stageLabel": "Medical Review",
      "owner": "Medical Affairs",
      "hoursOverdue": 4,
      "hoursElapsed": 28,
      "tatLimit": 24,
      "assignedAt": "2026-04-14T10:00:00Z"
    },
    {
      "type": "video",
      "id": "def-456",
      "title": "First Line Up — Heart Health",
      "phase": "FIRST_LINE_UP",
      "stage": "CONTENT_BRAND_REVIEW",
      "stageLabel": "Brand Review",
      "owner": "Content/Brand",
      "hoursOverdue": 6,
      "hoursElapsed": 30,
      "tatLimit": 24,
      "assignedAt": "2026-04-14T08:00:00Z"
    },
    {
      "type": "languageBatch",
      "id": "pkg-789",
      "title": "3 Language Package(s) — Diabetes Guide",
      "stage": "LANG_BATCH_OVERDUE",
      "stageLabel": "Language Package Review (batched)",
      "owner": "Content/Brand",
      "hoursOverdue": 2,
      "hoursElapsed": 38,
      "tatLimit": 36,
      "pendingLanguages": 3
    }
  ],
  "total": 3
}
```

**Notes:**
- Sorted by `hoursOverdue` descending (most urgent first)
- `type` can be: `script`, `video`, `package`, `languageBatch`
- `tatLimit` varies per stage: scripts=12h or 24h, videos=24h, lang batch=36h
- Empty `items[]` = nothing overdue (good state)

---

## 3. Team Performance API

**Use for:** Per-user performance cards — who's fast, who's slow, who rejects most.

```
GET /api/admin/team-performance?period=week
Authorization: Bearer <admin-token>
```

**Query params:** `period` = `today` | `week` | `month` (default: `week`)

**Response:**
```json
{
  "success": true,
  "users": [
    {
      "id": "user-id",
      "name": "Content Brand",
      "role": "CONTENT_BRAND",
      "email": "brand@practo.com",
      "period": "week",
      "totalReviews": 39,
      "scriptReviews": 31,
      "videoReviews": 4,
      "packageReviews": 4,
      "approvals": 20,
      "rejections": 11,
      "rejectionRate": 35,
      "avgResponseHours": 4.2,
      "pendingNow": 0
    }
  ],
  "period": "week"
}
```

**Notes:**
- Sorted by `totalReviews` descending (most active first)
- `rejectionRate` is a percentage (0-100)
- `avgResponseHours` can be `null` if user has no reviews with timing data
- `pendingNow` = items currently waiting for this user's role
- Agency POC shows 0 reviews (they submit revisions, not reviews)

---

## 4. Script Timeline API

**Use for:** Click on any script → see its full journey from creation to current state.

```
GET /api/admin/script-timeline/:scriptId
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "scriptId": "abc-123",
  "title": "Diabetes Guide",
  "currentStatus": "LOCKED",
  "currentVersion": 2,
  "totalDays": 2.5,
  "totalSteps": 8,
  "createdBy": "Medical Affairs",
  "lockedBy": "Content Approver",
  "lockedAt": "2026-04-16T04:36:24.035Z",
  "timeline": [
    {
      "action": "SUBMIT_SCRIPT",
      "by": "Medical Affairs",
      "role": "MEDICAL_AFFAIRS",
      "at": "2026-04-14T10:00:00Z",
      "oldStatus": "DRAFT",
      "newStatus": "CONTENT_BRAND_REVIEW",
      "comments": null,
      "durationHours": null
    },
    {
      "action": "REJECT_SCRIPT",
      "by": "Content Brand",
      "role": "CONTENT_BRAND",
      "at": "2026-04-15T09:00:00Z",
      "oldStatus": "CONTENT_BRAND_REVIEW",
      "newStatus": "DRAFT",
      "comments": "Fix dosage section",
      "durationHours": 23
    }
  ],
  "videos": [
    { "id": "vid-1", "phase": "FIRST_LINE_UP", "status": "APPROVED", "version": 1 }
  ],
  "packages": [
    { "id": "pkg-1", "name": "Diabetes Package", "videoCount": 1, "videoStatuses": ["APPROVED"] }
  ]
}
```

**Notes:**
- `timeline` is chronological (oldest first)
- `durationHours` = time between this step and the previous step (null for first step)
- `comments` comes from the linked ScriptReview (rejection/approval reason)
- `videos` and `packages` show current state of related Phase 4-7 content
- 404 if scriptId doesn't exist

---

## 5. Rejection Report API

**Use for:** Quality insight — which scripts get rejected most, by whom, at which stage.

```
GET /api/admin/rejection-report?period=month
Authorization: Bearer <admin-token>
```

**Query params:** `period` = `week` | `month` | `all` (default: `month`)

**Response:**
```json
{
  "success": true,
  "period": "all",
  "summary": {
    "totalRejections": 16,
    "uniqueScriptsRejected": 9,
    "avgRejectionsPerScript": 1.8,
    "byRole": {
      "CONTENT_BRAND": 11,
      "CONTENT_APPROVER": 5
    },
    "byStage": {
      "CONTENT_BRAND_REVIEW": 6,
      "CONTENT_APPROVER_REVIEW": 5,
      "CONTENT_BRAND_APPROVAL": 5
    }
  },
  "scripts": [
    {
      "scriptId": "abc-123",
      "title": "test",
      "currentStatus": "CONTENT_APPROVER_REVIEW",
      "currentVersion": 8,
      "rejections": 7,
      "rejectedBy": ["CONTENT_APPROVER", "CONTENT_BRAND", "CONTENT_BRAND", "..."],
      "stages": ["CONTENT_APPROVER_REVIEW", "CONTENT_BRAND_APPROVAL", "..."],
      "lastRejectionReason": "fix",
      "lastRejectedAt": "2026-04-16T09:06:27.817Z"
    }
  ]
}
```

**Notes:**
- `scripts` array sorted by most rejected first
- `rejectedBy` and `stages` are parallel arrays — index 0 of both = first rejection
- `summary.byRole` shows which role rejects most (useful for management insights)
- `summary.byStage` shows which stage has most rejections

---

## 6. Pipeline Metrics API

**Use for:** Funnel chart — how content flows from creation to final delivery.

```
GET /api/admin/pipeline?period=month
Authorization: Bearer <admin-token>
```

**Query params:** `period` = `week` | `month` | `all` (default: `month`)

**Response:**
```json
{
  "success": true,
  "period": "all",
  "funnel": {
    "scriptsCreated": 9,
    "submittedToBrand": 31,
    "approvedToAgency": 8,
    "submittedToMedical": 17,
    "approvedToBrandFinal": 17,
    "approvedToApprover": 12,
    "locked": 6,
    "fluUploaded": 6,
    "fluApproved": 2,
    "fcUploaded": 2,
    "fcApproved": 2,
    "packageCreated": 2,
    "packageApproved": 2,
    "langCreated": 4,
    "langApproved": 4
  },
  "conversionRates": {
    "createdToLocked": 67,
    "lockedToFluApproved": 33,
    "fluToFcApproved": 100,
    "fcToPackageApproved": 100,
    "overallCreatedToPackage": 22
  }
}
```

**Notes:**
- `submittedToBrand` can be > `scriptsCreated` because a script can be submitted multiple times (reject → resubmit cycle)
- `conversionRates` are percentages (0-100)
- `overallCreatedToPackage` = how many scripts made it all the way through (the key metric)

**Render as:** Funnel chart or stepped bar chart.

---

## 7. Content Listing API

**Use for:** "All Content" table — one flat list of everything across all phases with search and filters.

```
GET /api/admin/content?search=diabetes&phase=FINAL_PACKAGE&status=APPROVED&specialty=ENDOCRINOLOGY&language=HINDI&type=LONG_FORM&packageName=Diabetes&page=1&limit=20&sort=newest
Authorization: Bearer <admin-token>
```

**All query params are optional:**

| Param | Type | Options |
|-------|------|---------|
| `search` | string | Search in title, doctor name, package name |
| `status` | string | Any status from any phase (e.g. `LOCKED`, `MEDICAL_REVIEW`, `APPROVED`) |
| `phase` | string | `SCRIPT` \| `FIRST_LINE_UP` \| `FIRST_CUT` \| `FINAL_PACKAGE` \| `LANGUAGE_PACKAGE` |
| `specialty` | string | `ENDOCRINOLOGY`, `CARDIOLOGY`, etc. (Phase 6 only) |
| `language` | string | `HINDI`, `BENGALI`, `TAMIL`, etc. (Phase 7 only) |
| `type` | string | `LONG_FORM` \| `SHORT_FORM` (Phase 6 only) |
| `packageName` | string | Filter by package name (Phase 6+7) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `sort` | string | `newest` \| `oldest` \| `title` (default: `newest`) |

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "id": "abc-123",
      "contentType": "packageVideo",
      "phase": "FINAL_PACKAGE",
      "phaseLabel": "Final Package (Phase 6)",
      "title": "Diabetes Care",
      "status": "APPROVED",
      "statusLabel": "Approved",
      "version": 1,
      "doctorName": "Dr Sharma",
      "specialty": "ENDOCRINOLOGY",
      "language": null,
      "assetType": "LONG_FORM",
      "packageName": "Diabetes Package",
      "fileUrl": "https://...",
      "createdBy": null,
      "createdAt": "2026-04-16T04:55:56.813Z",
      "updatedAt": "2026-04-16T04:55:57.061Z",
      "videoTrackStatus": "APPROVED",
      "metadataTrackStatus": "APPROVED"
    }
  ],
  "total": 23,
  "page": 1,
  "limit": 20,
  "totalPages": 2,
  "filterOptions": {
    "phases": ["SCRIPT", "FIRST_LINE_UP", "FIRST_CUT", "FINAL_PACKAGE", "LANGUAGE_PACKAGE"],
    "statuses": ["AGENCY_PRODUCTION", "APPROVED", "CONTENT_BRAND_REVIEW", "DRAFT", "LOCKED"],
    "specialties": ["ENDOCRINOLOGY"],
    "languages": ["BENGALI", "HINDI"],
    "assetTypes": ["LONG_FORM", "SHORT_FORM"]
  }
}
```

**Notes:**
- `contentType` can be: `script`, `video`, `packageVideo`, `languageVideo`
- `filterOptions` is populated from current data — use it to populate dropdown menus dynamically
- `doctorName`, `specialty`, `language`, `assetType` are null for phases that don't have them
- `videoTrackStatus` + `metadataTrackStatus` only present on Phase 6 `packageVideo` items
- `fileUrl` is null for scripts (scripts are text, not files)

**Status badge colors (suggestion):**

| Status | Color |
|--------|-------|
| DRAFT | Gray |
| CONTENT_BRAND_REVIEW | Yellow |
| AGENCY_PRODUCTION | Blue |
| MEDICAL_REVIEW | Orange |
| CONTENT_BRAND_APPROVAL | Yellow |
| CONTENT_APPROVER_REVIEW | Purple |
| LOCKED | Green |
| APPROVED | Green |
| AGENCY_UPLOAD_PENDING | Gray |
| BRAND_VIDEO_REVIEW | Yellow |
| AWAITING_APPROVER | Purple |
| WITHDRAWN | Red |
| BRAND_REVIEW | Yellow |

---

## 8. User Management APIs

### 8a. List all users
```
GET /api/users?role=CONTENT_BRAND&status=ACTIVE&search=John&page=1&limit=20&sort=createdAt&order=DESC
```

### 8b. Create user
```
POST /api/users
{ "firstName": "New", "lastName": "User", "email": "new@practo.com", "password": "Admin@123", "role": "MEDICAL_AFFAIRS" }
```
Roles: `SUPER_ADMIN`, `MEDICAL_AFFAIRS`, `CONTENT_BRAND`, `AGENCY_POC`, `CONTENT_APPROVER`

### 8c. Edit user (NEW)
```
PATCH /api/users/:userId
{ "firstName": "Updated", "lastName": "Name", "email": "updated@practo.com" }
```
All fields optional. Email uniqueness validated.

### 8d. Reset password (NEW)
```
POST /api/users/:userId/reset-password
{ "newPassword": "NewPass@123" }
```
Minimum 6 characters. No old password required (admin override).

### 8e. Toggle status
```
POST /api/users/toggle-status
{ "userId": "user-id-here" }
```

### 8f. Update role
```
POST /api/users/update-role
{ "userId": "user-id-here", "role": "CONTENT_BRAND" }
```

### 8g. Force move workflow (emergency)
```
POST /api/users/force-move-workflow
{ "contentId": "script-id", "targetStage": "LOCKED" }
```
Stages: `DRAFT`, `CONTENT_BRAND_REVIEW`, `AGENCY_PRODUCTION`, `MEDICAL_REVIEW`, `CONTENT_BRAND_APPROVAL`, `CONTENT_APPROVER_REVIEW`, `LOCKED`

### 8h. Unlock script (emergency)
```
POST /api/users/unlock-content
{ "contentId": "script-id" }
```
Moves LOCKED → CONTENT_APPROVER_REVIEW.

---

## 9. Error Reference

| Status | Message | When |
|--------|---------|------|
| 401 | `Unauthorized` | Missing or invalid token |
| 403 | `Access denied. You do not have the required permission` | Non-admin role trying admin endpoints |
| 404 | `Script not found` | Invalid scriptId in timeline |
| 400 | `Email already in use by another user` | Edit user with duplicate email |
| 400 | `Password must be at least 6 characters` | Reset with short password |
| 400 | `firstName, lastName, email, password, and role are required` | Create user with missing fields |
| 400 | `Invalid role` | Create user with unknown role |
| 500 | Server error | Check server logs |

---

## 10. Edge Cases & Tips

### Content API

- **No results?** `filterOptions` still returns available values from ALL data. Frontend can show "No results for this filter" while still populating other dropdowns.
- **Combined filters:** All filters are AND — `phase=SCRIPT&status=LOCKED` = only locked scripts.
- **Smart phase filtering:** When you use `specialty`, `type`, or `packageName` filters, scripts and videos (Phase 1-5) are automatically excluded — those phases don't have these fields. Same for `language` filter — only Phase 7 items are returned. No need to also pass `phase=FINAL_PACKAGE` when filtering by specialty.
- **Search is case-insensitive** and matches partial text: `search=dia` matches "Diabetes Guide".
- **Pagination:** `total` is the unfiltered count after filters. Use `totalPages` for pagination UI.

### Team Performance

- **Agency POC always shows 0 reviews** — they submit revisions, not reviews. Don't show "0 reviews" as a problem for Agency.
- **avgResponseHours can be negative** in test data (because we script-test faster than real time). In production this will always be positive.
- **pendingNow is per-role, not per-user** — if 3 scripts are at MEDICAL_REVIEW, all Medical users show pendingNow=3.

### Pipeline

- **submittedToBrand > scriptsCreated** is normal — reject → resubmit creates multiple submit events for the same script.
- **conversionRates can be > 100%** for intermediate stages (same reason).
- **overallCreatedToPackage** is the most meaningful metric — "what % of scripts made it to final delivery".

### Overdue

- **Empty = good** — nothing stuck.
- **DRAFT scripts:** Only overdue if previously rejected (12h TAT). First-time DRAFT scripts have no deadline.
- **Language batch:** Shows as one item with `pendingLanguages` count, not individual language entries.

### Script Timeline

- **duration between steps:** `durationHours` on each timeline entry shows how long that step took. Useful for identifying bottlenecks.
- **reviews with comments:** If the action was APPROVE or REJECT, `comments` field contains the reviewer's reason.
- **videos/packages:** Included to show full lifecycle — script → lock → video → package.

### User Management

- **Cannot delete users** — deactivate instead (toggle status). Audit trail is preserved.
- **Email change:** Validated for uniqueness. If email is taken, returns 400.
- **Force move workflow:** Use with caution — skips all guards and validation. Only for emergencies.
- **Unlock:** Only works on LOCKED scripts → moves to CONTENT_APPROVER_REVIEW.

---

*Questions? Ask backend team before building assumptions.*
