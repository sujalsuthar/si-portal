# Student & Parent Role Changes Log

This file tracks changes from `STUDENT.txt` and `PARENT.txt` plus global nav updates requested in the same session.

**Last updated:** 2026-08-29

---

## Global nav & shared

| Item | Status | Notes |
|------|--------|-------|
| Calendar for all users | Done | Nav + route open to all roles; backend overlays batch sessions for Faculty, Student, Parent |
| Library nav (staff only) | Done | `/library` page lists saved exam papers; link to Question Bank |
| Remove Search from sidebar | Done | Dashboard global search retained; deep links still work |
| MCQ default 1 mark / Long 10 marks | Done | Frontend + backend defaults; seed + migration normalize existing demo questions |

---

## STUDENT.txt

| # | Area | Request | Status | Files |
|---|------|---------|--------|-------|
| 1 | Dashboard | Remove Action Centre card | Done | `Dashboard.tsx` |
| 2 | Sidebar | Remove Exams | Done | `navRoles.ts`, `Layout.tsx`, `App.tsx` |
| 3 | Sidebar | Remove Interns | Done | `navRoles.ts`, `Layout.tsx`, `App.tsx` |
| 4 | Performance | Single Overview with inline expandable sections (Behaviour, Presentations, Self-Assessment, Marks) | Done | `PerformanceHub.tsx`, `StudentPerformanceOverview.tsx` |
| 5 | Performance | Marks history: all batch exams + Given/Not Given status | Done | `grades.controller.ts` (`GET /grades/me/exam-roster`), `StudentPerformanceOverview.tsx` |
| 6 | Performance | Remove Self-Confidence / Actual Performance / Gap from self-assessment | Done | `SelfAssessmentTab.tsx` (`hideCompareCards`) |
| 7 | Tasks | Google Drive link | Done | `InstitutionProfile.googleDriveUrl`, `OrganisationTab.tsx`, `TasksList.tsx` |
| 8 | Projects | Own batch project only (skip batch picker) | Done | `ProjectsList.tsx` |
| 9 | Projects | Deadline field | Done | `schema.prisma`, `projects.controller.ts`, create form + `ProjectDetail.tsx` |
| 10 | Action Centre | Column order Type → Subject → Raised → Status; no Actions column | Done | `ActionCentrePage.tsx` |
| 11 | Settings | Remove Change Password card | Done | `ProfilePasswordTab.tsx` |

---

## PARENT.txt

| # | Area | Request | Status | Files |
|---|------|---------|--------|-------|
| 1 | Dashboard | Sessions prominent (week calendar); compact child cards | Done | `Dashboard.tsx` (`ParentDashboard`, `WeekCalendar` readOnly) |
| 2 | Dashboard | Monthly performance graph on main dashboard | Done | `ParentChildMonthlyChart` in `Dashboard.tsx` |
| 3 | Student detail | Remove ACTIVE badge | Done | `StudentDetail.tsx` |
| 4 | Student detail | Remove Consent & Data Protection | Done | `StudentDetail.tsx` |
| 5 | Student detail | Remove monthly performance (moved to dashboard) | Done | `StudentDetail.tsx` |
| 6 | Student detail | Parent details: name, 2 phones, permanent address | Done | `StudentDetail.tsx` (from auth profile) |
| 7 | Student detail | Student details: Name, ID, Batch, DOB, Gender, Phone, Current Address only | Done | `StudentDetail.tsx` |
| 8 | Tasks | View only, not clickable | Done | `TasksList.tsx` |
| 9 | Settings Contact | Name + phone only; faculty + team members | Done | `parents.controller.ts`, `ProfilePasswordTab.tsx` |
| 10 | Settings | Remove 2FA for parent | Done | `ProfilePasswordTab.tsx` |

---

## Backend API additions

| Endpoint / field | Purpose |
|------------------|---------|
| `GET /grades/me/exam-roster` | Student batch exam participation (Given / Not Given) |
| `GET /calendar/events` | Session overlay for Student + Parent roles |
| `GET /parents/me/faculty-contacts` | Extended with institute contact + active team phone list |
| `Project.deadline` | Project submission deadline |
| `InstitutionProfile.googleDriveUrl` | Configurable Google Drive link for student tasks |

---

## Pending / future

_Add new rows below as requests arrive._

| # | Area | Request | Status |
|---|------|---------|--------|
| | | | |
