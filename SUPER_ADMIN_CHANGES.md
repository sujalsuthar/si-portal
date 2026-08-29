# Super Admin Changes Log

This file tracks all Super Admin–requested changes for the SI Portal. Future Super Admin requests should be appended here with date, status, and notes.

**Last updated:** 2026-08-29

---

## 1. Sessions — Add Session trainer dropdown

| Status | Done |
|--------|------|
| **Request** | Remove "Myself" option; show team member names only when scheduling sessions. |
| **Changed** | `frontend/src/pages/sessions/SessionsList.tsx` — Schedule Session, Full Week Session, and Edit Session now require selecting a team member from the faculty list. |
| **Notes** | Super Admin must pick an instructor/mentor explicitly; empty trainer is no longer allowed. |

---

## 2. Exams — Question Bank / Paper creation

| Status | Done |
|--------|------|
| **Request** | Fix paper creation panel; Super Admin creates multiple papers freely; when creating an exam, attach an existing paper only. |
| **Changed** | |
| | **Backend:** `backend/src/modules/exams/exams.controller.ts` — Paper library (`GET/POST /exams/papers/library`), attach endpoint (`POST /exams/:id/papers/from-library`), library exam hidden from normal exam list. |
| | **Frontend:** `frontend/src/pages/exams/QuestionBank.tsx` — Right panel defaults to "Save to Library", lists saved papers, optional "Attach to Exam". |
| | **Frontend:** `frontend/src/pages/exams/ExamDetail.tsx` — "+ From paper library" to attach saved papers when building an exam. |
| **Notes** | Papers are stored in a hidden library exam (`__PAPER_LIBRARY__`). Super Admin builds papers in Question Bank anytime; exam creation only attaches/copies from library. |

---

## 3. Tasks — Batch filter & assignment

| Status | Done |
|--------|------|
| **Request** | Add batch filter on task list; remove Whole Batch / Interns option; show active batches only when assigning. |
| **Changed** | `frontend/src/pages/tasks/TasksList.tsx` — Batch filter dropdown on list; assign modal shows active batches only and always assigns to whole batch. |
| **Notes** | Backend already supported `batchId` query on `GET /tasks`. Intern-only assignment UI removed per spec. |

---

## 4. Performance — Batches → Manage Courses

| Status | Done |
|--------|------|
| **Request** | "Manage Courses" should open a popup instead of redirecting to another page. |
| **Changed** | `frontend/src/pages/batches/BatchesList.tsx` — `ManageCoursesModal` popup with course list and Add Course form. |
| **Notes** | No navigation to `/people/courses` from Batches page anymore. |

---

## 5. Performance — Community → Parents

| Status | Done |
|--------|------|
| **Request** | Search parents by student name; remove Add Parent option. |
| **Changed** | |
| | **Backend:** `backend/src/modules/parents/parents.controller.ts` — search matches linked student first/last name and student code. |
| | **Frontend:** `frontend/src/pages/students/ParentsList.tsx` — search placeholder updated; Add Parent hidden for Super Admin (Academic Admin retains create access). |
| **Notes** | Super Admin can view/edit parent details but not create new parent accounts from this screen. |

---

## 6. Performance — Team

| Status | Done |
|--------|------|
| **Request** | Remove Add Team Member; remove Assigned Batches field; show only students under team member. |
| **Changed** | `frontend/src/pages/students/FacultyList.tsx` — removed Add Team Member button; detail modal shows "Students Under This Team Member" (mentored students only). |
| **Notes** | Assigned batches section removed from Super Admin team detail view. |

---

## 7. Performance — Behaviour

| Status | Done |
|--------|------|
| **Request** | Add batch filter; remove Status column from table. |
| **Changed** | |
| | **Backend:** `backend/src/modules/behaviour/behaviour.controller.ts` — `batchId` query filter. |
| | **Frontend:** `frontend/src/pages/performance/BehaviourTab.tsx` — batch filter dropdown; Status (authorization) column removed. |
| **Notes** | Authorize action remains in the actions column for pending negative events. |

---

## 8. Performance — Presentations

| Status | Done |
|--------|------|
| **Request** | Add Batch column; add batch filter. |
| **Changed** | |
| | **Backend:** `backend/src/modules/presentations/presentations.controller.ts` — includes `batch` and student `currentBatch` in list response. |
| | **Frontend:** `frontend/src/pages/performance/PresentationsTab.tsx` — Batch column and batch filter dropdown. |
| **Notes** | Filter uses presentation `batchId` when set, otherwise falls back to student's current batch name. |

---

## 9. Projects — One group of 4 students

| Status | Done |
|--------|------|
| **Request** | One project per batch = one group of 4 students; show students with GitHub link and weekly report details. |
| **Changed** | |
| | **Backend:** `backend/src/modules/projects/projects.controller.ts` — auto-create group on project create; max 1 group per project; max members = `groupSize` (default 4). |
| | **Frontend:** `frontend/src/pages/projects/ProjectDetail.tsx` — single-group layout; GitHub link and weekly progress emphasized; no multi-group UI. |
| **Notes** | Existing projects with multiple groups are unchanged in DB; new API blocks adding a second group. |

---

## 10. Settings — Profile & Password → Sessions

| Status | Done |
|--------|------|
| **Request** | Show only the current logged-in session, not all sessions. |
| **Changed** | |
| | **Backend:** `backend/src/modules/auth/auth.service.ts` — login/refresh returns `sessionId`. |
| | **Frontend:** `frontend/src/lib/api.ts`, `frontend/src/auth/AuthContext.tsx` — store `sessionId` in localStorage. |
| | **Frontend:** `frontend/src/pages/settings/ProfilePasswordTab.tsx` — "Current Session" card shows only this browser's session. |
| **Notes** | Multi-session revoke UI removed for Super Admin profile view. |

---

## 11. Settings — Duplicate Monitoring (documentation)

| Status | Documented (no code change) |
|--------|----------------------------|
| **Purpose** | **Duplicate Monitoring** scans the database for *soft* duplicate records that hard constraints do not block. It groups: students sharing a phone number, team members sharing a phone, parents sharing a phone, and students sharing the same name + date of birth. Super Admin uses this to review possible duplicate enrolments or data-entry mistakes before merging or correcting records. |
| **Location** | Settings → Duplicate Monitoring (`frontend/src/pages/settings/DuplicatesTab.tsx`, API `GET /settings/duplicates`). |

---

## 12. Settings — Organisation (documentation)

| Status | Documented (no code change) |
|--------|----------------------------|
| **Purpose** | **Organisation** is the institute-wide configuration hub for Super Admin (and partially Academic Admin): **Institution** profile (name, contact, intern manager), **Holidays** calendar, **Notification Templates** for system messages, and **Breach Register** (Super Admin only) for logging data/security breach incidents. |
| **Location** | Settings → Organisation (`frontend/src/pages/settings/OrganisationTab.tsx`). |

---

## Additional observations (not in original list)

| Item | Status | Notes |
|------|--------|-------|
| Sessions Edit modal already listed team members only (no Myself) | Noted | No change needed on edit flow. |
| Academic Admin retains Add Parent | By design | Only Super Admin loses create button on Parents screen. |
| Paper library requires at least one active batch in DB | Noted | First library save auto-creates hidden library exam tied to first active batch. |

---

## Pending / future Super Admin requests

_Add new rows below as requests arrive._

| # | Area | Request | Status |
|---|------|---------|--------|
| 13 | Nav | Remove Search from sidebar (dashboard only) | Done |
| 14 | Projects | Separate Student Projects and Intern Projects views | Done |
| 15 | Search / Parents | Admin dashboard search finds parents by linked student name | Done |
| 16 | Nav | Replace Search page with Account Management (deactivate students/team) | Done |
| 17 | Certificates | Fix false "Fill in all fields" when student typed but not selected | Done |
| 18 | Interns | Rename "Promote to Intern" → "Add to Intern" | Done |
| 19 | Presentations | Auto-set batch on schedule; show batch in table | Done |
| 20 | Parents | Filter exam marks by batch in parent detail view | Done |
| 21 | Batches | Bulk add students + editable timetable on batch detail | Done |
| 22 | Tasks | Submission status updates immediately after evaluation | Done |
| 23 | Dashboard | Academic Admin week calendar on dashboard | Done |
| 24 | Dashboard | Remove Action Center panel for Super Admin / Academic Admin | Done |
| 25 | Parents | Remove Add Parent for admin roles; search by student name | Done |
| 26 | Batches | Edit timetable from batches list and batch detail | Done |
