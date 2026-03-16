# Practo CMS Hub V2 — Frontend API Guide

**Base URL:** `http://164.52.204.34:5001`
**All endpoints require:** `Authorization: Bearer <token>` header (except Login)

---

## Authentication

### Login
```
POST /api/auth/login
Body: { "email": "...", "password": "..." }
```
Response includes `token` (JWT) and `permissions[]` — store the token and use it in every subsequent request.

### Get Current User
```
GET /api/auth/me
```

### Change Password
```
POST /api/auth/change-password
Body: { "currentPassword": "...", "newPassword": "..." }
```

---

## Script Status States

Scripts move through 7 states in a fixed order:

| # | Status | Meaning |
|---|--------|---------|
| 1 | `DRAFT` | Medical Affairs is writing / editing |
| 2 | `CONTENT_BRAND_REVIEW` | Content/Brand is reviewing |
| 3 | `AGENCY_PRODUCTION` | Agency POC is refining / producing |
| 4 | `MEDICAL_REVIEW` | Medical Affairs reviewing Agency's revised script |
| 5 | `CONTENT_BRAND_APPROVAL` | Content/Brand doing final approval check |
| 6 | `CONTENT_APPROVER_REVIEW` | Content Approver about to lock |
| 7 | `LOCKED` | Script locked — ready for production |

### Flow Diagram

```
DRAFT
  ──(Medical Affairs submits)──► CONTENT_BRAND_REVIEW
                                      │
                          ┌───────────┴───────────┐
                    (approves)               (rejects)
                          │                       │
                          ▼                       ▼
               AGENCY_PRODUCTION              DRAFT (back)
                          │
              (Agency submits revision)
                          │
                          ▼
                   MEDICAL_REVIEW
                          │
                ┌─────────┴─────────┐
           (approves)          (rejects)
                │                   │
                ▼                   ▼
  CONTENT_BRAND_APPROVAL    AGENCY_PRODUCTION (back)
                │
           (approves)
                │
                ▼
  CONTENT_APPROVER_REVIEW
                │
            (locks)
                │
                ▼
             LOCKED
                │
    (Super Admin unlocks — emergency only)
                │
                ▼
  CONTENT_APPROVER_REVIEW (back)
```

---

## Role-Based Visibility

Each role only sees scripts in certain states:

| Role | Sees scripts in |
|------|----------------|
| `MEDICAL_AFFAIRS` | `DRAFT`, `MEDICAL_REVIEW` |
| `CONTENT_BRAND` | `CONTENT_BRAND_REVIEW`, `CONTENT_BRAND_APPROVAL` |
| `AGENCY_POC` | `AGENCY_PRODUCTION`, `LOCKED` |
| `CONTENT_APPROVER` | `CONTENT_APPROVER_REVIEW` |
| `SUPER_ADMIN` | All states |

Use `GET /api/scripts/queue` — it auto-filters by the logged-in user's role.

---

## Scripts API

### List All Scripts (with filters + search)
```
GET /api/scripts
Query params (all optional):
  status  = DRAFT | CONTENT_BRAND_REVIEW | AGENCY_PRODUCTION |
             MEDICAL_REVIEW | CONTENT_BRAND_APPROVAL |
             CONTENT_APPROVER_REVIEW | LOCKED
  q       = search keyword (searches title, insight, content)
  title   = filter by exact title match (case-insensitive contains)
  page    = 1 (default)
  limit   = 20 (default, max 100)
```
Response:
```json
{
  "success": true,
  "scripts": [ ... ],
  "total": 50,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

### Get Single Script
```
GET /api/scripts/:id
```

### Create Script (Medical Affairs only)
```
POST /api/scripts
Body: { "title": "...", "insight": "...", "content": "..." }
```
- `content` is required; `title` and `insight` are optional.

### Update Script (DRAFT or AGENCY_PRODUCTION only)
```
PATCH /api/scripts/:id
Body: { "title": "...", "content": "...", "insight": "...", "summary": "...", "tags": [] }
```

### Get Script Review History
```
GET /api/scripts/:id/reviews
```
Returns all approve/reject decisions with reviewer details and comments.

---

## Review Queue

### Get My Queue (role-filtered)
```
GET /api/scripts/queue
```
Response:
```json
{
  "success": true,
  "available": [ ... ],   // scripts waiting for this user's action
  "myReviews": [ ... ],   // scripts this user already acted on at current stage
  "total": 10
}
```

### Get My Approved Scripts
```
GET /api/scripts/my-reviews?decision=APPROVED&page=1&limit=20
```

### Get My Rejected Scripts
```
GET /api/scripts/my-reviews?decision=REJECTED&page=1&limit=20
```
Both return the same shape as List Scripts, ordered by most recent review first.

---

## Workflow Actions

All workflow endpoints return:
```json
{ "success": true, "message": "...", "script": { ...updatedScript } }
```
On failure:
```json
{ "success": false, "message": "reason" }
```

### Submit Script — Medical Affairs
```
POST /api/scripts/:id/submit
```
Moves: `DRAFT → CONTENT_BRAND_REVIEW`

### Approve Script — Content/Brand or Medical Affairs
```
POST /api/scripts/:id/approve
Body: { "comments": "Approval reason (required)" }
```
Moves depending on current status:
- `CONTENT_BRAND_REVIEW → AGENCY_PRODUCTION` (by Content/Brand)
- `MEDICAL_REVIEW → CONTENT_BRAND_APPROVAL` (by Medical Affairs)
- `CONTENT_BRAND_APPROVAL → CONTENT_APPROVER_REVIEW` (by Content/Brand)

### Reject Script — Content/Brand or Medical Affairs
```
POST /api/scripts/:id/reject
Body: { "comments": "Rejection reason (required)" }
```
Moves depending on current status:
- `CONTENT_BRAND_REVIEW → DRAFT` (by Content/Brand)
- `MEDICAL_REVIEW → AGENCY_PRODUCTION` (by Medical Affairs)

### Submit Revised Script — Agency POC
```
POST /api/scripts/:id/submit-revision
Body: { "content": "revised script content (required)" }
```
Moves: `AGENCY_PRODUCTION → MEDICAL_REVIEW`

### Lock Script — Content Approver
```
POST /api/scripts/:id/lock
```
Moves: `CONTENT_APPROVER_REVIEW → LOCKED`

### Unlock Script — Super Admin only (emergency)
```
POST /api/scripts/:id/unlock
```
Moves: `LOCKED → CONTENT_APPROVER_REVIEW`

---

## Users (Super Admin only)

```
GET    /api/users              — List all users (page, limit)
GET    /api/users/:id          — Get user by ID
POST   /api/users              — Create user { firstName, lastName, email, password, role }
PATCH  /api/users/:id/role     — Update role { role }
PATCH  /api/users/:id/status   — Toggle active/inactive { status: "ACTIVE" | "INACTIVE" }
GET    /api/users/me           — Get own profile
```

### Available Roles
```
SUPER_ADMIN
MEDICAL_AFFAIRS
CONTENT_BRAND
AGENCY_POC
CONTENT_APPROVER
```

---

## Notifications

```
GET   /api/notifications              — Get my notifications (page, limit)
GET   /api/notifications/unread-count — Get unread count
PATCH /api/notifications/:id/read     — Mark one as read
PATCH /api/notifications/read-all     — Mark all as read
```

---

## Medical Affairs Fan-out Emails

Medical Affairs users can register multiple email addresses so all of them get notified on every workflow action.

```
GET    /api/scripts/medical-affairs-emails         — List my fan-out emails
POST   /api/scripts/medical-affairs-emails         — Add email { email }
DELETE /api/scripts/medical-affairs-emails/:emailId — Remove email
```

---

## Audit Logs (Super Admin only)

```
GET /api/audit-logs                    — All logs
GET /api/audit-logs?entityId=:scriptId — Logs for a specific script
GET /api/audit-logs?userId=:userId     — Logs for a specific user
```

---

## Health Check

```
GET /health   → { "status": "healthy" }
```

---

## Script Object Shape

Every script endpoint returns a script object like this:

```json
{
  "id": "uuid",
  "version": 1,
  "title": "Script Title",
  "insight": "Background insight...",
  "content": "Full script content...",
  "status": "DRAFT",
  "summary": null,
  "tags": [],
  "createdById": "uuid",
  "lockedById": null,
  "lockedAt": null,
  "assignedReviewerId": null,
  "assignedAt": null,
  "createdAt": "2026-03-13T10:00:00.000Z",
  "updatedAt": "2026-03-13T10:00:00.000Z",
  "createdBy": { "id": "...", "firstName": "...", "lastName": "...", "email": "..." },
  "lockedBy": null,
  "assignedReviewer": null,
  "reviews": [
    {
      "id": "uuid",
      "reviewerType": "CONTENT_BRAND",
      "decision": "APPROVED",
      "comments": "Looks good.",
      "stageAtReview": "CONTENT_BRAND_REVIEW",
      "reviewedAt": "2026-03-13T11:00:00.000Z",
      "reviewer": { "id": "...", "firstName": "...", "lastName": "...", "role": "CONTENT_BRAND" }
    }
  ]
}
```

---

## Quick Tips

- Always check `success: true/false` in every response before reading data.
- The `permissions[]` array returned at login tells you exactly what the logged-in user can do — use it to show/hide buttons.
- `GET /api/scripts/queue` is the primary feed for the review dashboard — use `available[]` for the main list and `myReviews[]` for the "already actioned" tab.
- Both `approve` and `reject` require a non-empty `comments` field.
