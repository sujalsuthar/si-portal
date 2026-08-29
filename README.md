# SI Portal — v4.1

*(Formerly named "Student Academic Management Portal" / SAMP through v3.2 — renamed to SI Portal in v3.3.
Historical changelog sections below keep their original SAMP-era names since that's what the product was
called at the time.)*

A full-stack, role-based student academic management portal. Built in nine passes: an initial build from
`Student_Academic_Management_Portal_Requirements.docx`, extended to align with the more detailed
`SAMP_2.0_URS_FRS_v2.0_FINAL.docx` specification and a set of explicit client-requested changes (see
**SAMP 2.0 changes** below), a v2.5 pass closing a self-identified gap list, a v3.0 pass closing every
remaining gap surfaced by a full, code-verified re-audit against the source document (see **SAMP 3.0 changes**),
a v3.1 design pass adding a light/dark theme system, WCAG-checked color contrast, and further accessibility
and mobile-responsiveness work (see **SAMP 3.1 changes**), a v3.2 pass closing gaps from a second independent
re-audit (see **SAMP 3.2 changes**), the v3.3 rename to SI Portal (see **SI Portal 3.3 changes**), a v3.5
pass adding an institute-wide announcement Feed and fully customizable, role-based chart dashboards (see
**SI Portal 3.5 changes**), a v4.0 pass closing every issue and required change listed in a full
screen-by-screen reviewer document across all five roles (see **SI Portal 4.0 changes**), and a v4.1 pass
closing a further round of client-requested refinements across Super Admin, Admin and Team/Faculty
(see **SI Portal 4.1 changes**).

**Stack:** Node.js/Express/TypeScript + PostgreSQL (Prisma ORM) on the backend, React/TypeScript/Vite/Tailwind
on the frontend, containerized with Docker Compose.

## Roles

Seven roles are modelled (the SAMP 2.0 spec's six, plus `MANAGEMENT` carried over from the original build for
institute-wide reporting, which the newer spec doesn't separately define but doesn't conflict with either):

`SUPER_ADMIN`, `MANAGEMENT`, `ACADEMIC_ADMIN` ("Admin"), `FACULTY` (labelled **Team** everywhere in the
interface — the database/API name stays `FACULTY` for stability, only the display label changed), `ACCOUNTS`
(new — finance-only, separated from academic authority), `STUDENT`, `PARENT`.

## What's implemented

All 8 phases from the original spec's roadmap (Foundation, Classroom Operations, Exams, Performance,
Development, Certificates, Analytics, Integrations), plus these SAMP 2.0 modules layered on top:

| Module | Notes |
|---|---|
| Fees & Receipts | Fee structures, accounts, instalments, payments, PDF receipts with an HMAC integrity code, reversals, refund/write-off approval, public receipt verification, reconciliation view |
| Projects | Batch projects, auto-numbered groups, one-group-per-student-per-project constraint, group/individual grading, feeds into the composite score |
| Internships | Promotion/demotion, a dynamic ("working under") mentor with full reassignment history, ratings isolated from academic aggregates, a summarised development view for the intern, leave requests + approval, automatic work-stop when a rating falls below a configurable threshold until a staff review lifts it |
| Action Centre | Unified request/approval queue (batch transfer, password reset, academic/result queries, behaviour challenges, fee/attendance queries) — requester can never approve their own request |
| Backup | Manual on-demand database snapshot (Super Admin only, downloads logged) and a per-batch "final backup" export once a batch passes its configured retention age, before any future retention job would remove it |
| MFA | TOTP two-factor authentication available to and enforceable for **every** role (not just admin-like ones), with backup codes, a forced-setup gate on first login when required, and required on password changes once enabled |

## SAMP 2.0 changes (explicit client requests applied)

| # | Request | What changed |
|---|---|---|
| 1 | Answer keys: don't just hide them, remove the feature entirely | The "Download Answer Key" action and the `correctAnswer` field are gone from every API response and every screen, for every role — including staff browsing the question bank. The field remains in the database only as inert storage. |
| 2 | Add exam and project as Student of the Month criteria | Composite score now includes a weighted `projectWeight` component (from grades recorded in the new Projects module) alongside the existing exam weight. |
| 3 | Team's batch view should show only their own, not all; remove "My Batches" section | Batches/Attendance/Performance etc. were already scoped to a Team member's assigned batches; no separate "My Batches" page was added, and the "Faculty" label was renamed to "Team" throughout. |
| 4 | Super Admin should have full (not view-only) access to Fees | `ROLE_GROUPS.FEE_FULL` includes `SUPER_ADMIN`, `ACADEMIC_ADMIN` and `ACCOUNTS`; a Super-Admin-or-Admin-initiated refund/write-off self-approves, since they already hold full authority. |
| 5 | At the batch retention mark, offer a final backup before deletion/archive; change the mark to 2 years | `ScoringConfig.batchRetentionYears` (default 2, configurable in Settings). A batch past that age exposes a "Final Backup Before Archive" button that exports every record tied to the batch as a durable file before any retention job would touch it. |
| 6 | MFA for all roles, not just privileged ones | TOTP setup/enable/disable is available to every role; `Settings → Default Parameters` lets Super Admin/Management choose which roles must set it up, defaulting to all seven. |
| 7 | Students shouldn't see their assignment points | Task/submission responses returned to a `STUDENT` caller always have `pointsAwarded` scrubbed to `null`; staff and the evaluation flow are unaffected. |
| 8 | Monitor/avoid duplicate records | Hard duplicates (email, enrolment code, employee code) are prevented by database unique constraints. `Settings → Duplicate Monitoring` (Super Admin) scans for the softer cases those constraints can't catch — a shared phone number, or a shared name + date of birth — for manual review. |
| 9 | Intern performance threshold (freeze work pending review), leave approval, dynamic mentor | A rating below `internPerformanceThreshold` (default 50, configurable) freezes the intern's ability to submit task work until a Super Admin/Admin explicitly resumes it after review. `InternLeaveRequest` covers leave + approval. Mentor assignment is changeable at any time via "Reassign Mentor", with every change kept in `InternMentorHistory`. |
| 10 | Password-change verifier for every role | Changing a password always requires the current password, for all seven roles via the same endpoint; if MFA is enabled on the account, a live authentication code is required too. |

## SAMP 2.5 changes (gap-closing pass)

| Area | What changed |
|---|---|
| Coursework fairness | Tasks carry an optional grace period (hours) and a per-late-day deduction rate; evaluation automatically reduces the awarded points based on how late a submission was, floored at zero. Resubmissions preserve the previous attempt in `TaskSubmissionVersion` instead of overwriting it. |
| Account security | Repeated failed logins lock an account for a configurable window (`ScoringConfig.loginLockoutThreshold`/`loginLockoutMinutes`, default 6 attempts / 15 minutes). Every user can view and revoke their own active sessions under `Settings → Profile & Password`. |
| Data protection | `ConsentRecord` captures and withdraws data-processing/parental consent per student (visible on the Student profile page). Students and parents can raise `DATA_ACCESS_REQUEST`/`DATA_ERASURE_REQUEST`/`DATA_CORRECTION_REQUEST` requests through the existing Action Centre queue. |
| Behaviour integrity | Behaviour point entries are clamped to a ±5 scale and require a reason of at least 20 characters, so points can't be recorded without a substantive note. |
| Notifications | An optional quiet-hours window (`ScoringConfig.quietHoursStart/End`) suppresses non-in-app notification channels (email/SMS/WhatsApp) overnight; in-app notifications are never suppressed. |
| Recognition | A read-only "Batch of the Year" ranking (`GET /student-of-month/batch-of-year`) averages composite scores across each batch's active students for a given year. |
| Certificates & navigation | The certificates list now shows Course and Batch columns (Status moved to an inline badge) with a single consolidated action menu per row. The standalone "Development" section was removed per spec (UR-SET-08); Self-Assessment and Certifications tracking are now tabs inside Performance. |

## SAMP 3.0 changes (full document re-audit, gap closure)

A second, independent, code-verified audit against the source document (not a self-report) found that the
v2.5 pass's own items all held up, but a set of must-have requirements had never been implemented in any
pass. Every one of them is closed here.

| Area | What changed |
|---|---|
| Coursework formula fix | The v2.5 late-deduction formula was wrong — it applied a compounding percentage instead of the spec's flat `max(0, raw − days_overdue × rate)`. Fixed and verified against the document's own worked example (raw 8, 3 days late, rate 0.25 → 7.25). `TaskSubmission.pointsAwarded` is now a float to hold the result. |
| Exams | An exam now carries one or more named `Paper`s (e.g. Theory + Practical). Question types are restricted to MCQ and Long Answer (`TRUE_FALSE`/`SHORT_ANSWER` retired, existing data migrated). MCQ answers are auto-marked against the stored key on student submission (`POST /exams/:id/answers`); Long Answer responses are marked by staff against a per-question rubric (`Question.rubric`) and combined with the MCQ score before scaling to 100. A published grade can only be corrected by a Super Admin. |
| Attendance & sessions | `Session.subject` was removed (folded into the now-mandatory `description`); session types now match the spec's vocabulary (`LECTURE`/`PRACTICE`/`EXAM_THEORY`/`EXAM_PRACTICAL`/`TASK`, existing data migrated). `LeaveRecord` (with approval) neutralises the attendance-percentage denominator for its date range. Lecture/practice attended hours are reported per student. A weekly timetable can be replaced in one call; a `TimetableSlot` may carry an online-meeting link only on the Sunday slot. The correction window is configurable (`ScoringConfig.attendanceCorrectionWindowHours`), same-day absence alerts are consolidated to one message per student, and unmatched biometric scans can be logged to a manual-resolution exception queue (`AttendanceExceptionRecord`) independent of any specific terminal. |
| Certificates | `POST /certificates/bulk` issues to every active student in a batch who clears an eligibility check (attendance threshold, no open high/critical support case), skipping the rest with a stated reason; a `GET /bulk/eligibility` preview shows the same check before committing. `GET /:id/image` adds a "Download Image" action (SVG — a real image format, kept dependency-free rather than adding a raster-rendering library). |
| Backup & restore | Snapshots are AES-256-GCM encrypted at rest (`BACKUP_ENCRYPTION_KEY`) and decrypted on download/restore so they stay usable; an automatic nightly backup runs on a configurable cron schedule (`BACKUP_SCHEDULE_CRON`); an optional second copy is written to `BACKUP_OFFSITE_DIR` (point it at a mounted network share or cloud-sync folder for real offsite replication). `POST /:id/restore` (Super Admin, requires a typed confirmation phrase) restores a snapshot in place. |
| Audit log integrity | Every `AuditLog` row now carries a `entryHash` chained from the previous row's hash (`previousHash`), computed with a canonical (key-order-independent) serialization so it survives the JSONB round-trip. `GET /audit-logs/integrity-check` (Super Admin) recomputes the chain and reports any break, and records a daily `AuditChainAnchor` checkpoint. Rows predating this feature are tagged `legacy-*` and excluded from verification rather than reported as false breaks. |
| Settings | Added an institution profile (name/address/contact, shown on certificates/receipts), a holiday/academic calendar, and editable per-category/channel notification templates (`{{title}}`/`{{message}}` placeholders) that `notify()` uses in place of hardcoded copy when configured. |
| Data protection | Approving a `DATA_ACCESS_REQUEST` now automatically generates a machine-readable (JSON) export of the student's records (`DataExportRecord`), downloadable by the requester or staff. A retention/anonymisation sweep runs daily but only acts when `ScoringConfig.retentionAutoAnonymizeEnabled` is explicitly turned on (default off, so no deployment silently alters data); it anonymises archived students past the retention window. A Super-Admin-only breach register (`BreachRecord`) tracks title, affected count, and detection/containment/notification dates. |
| Security hardening | Password minimum raised to 12 characters plus a local common-password denylist (chosen over a live breach-database API so validation never depends on outbound network access being available at deploy time). Refresh tokens carry a `familyId`; reuse of an already-rotated-away token revokes every token in that family, the standard defence against a stolen/replayed refresh token. Login and public-verification routes get their own tighter rate limiters ahead of the general API limit. |

## SAMP 3.1 changes (light/dark theme, accessibility, mobile)

| Area | What changed |
|---|---|
| Theme system | A light theme (cream/tan surfaces, `#FE7F2D` orange as the primary accent) and a dark theme (black/navy surfaces, `#1C4D8D` blue as the primary accent, `#8FABD4` as a secondary accent) are both driven by CSS custom properties, redefined under a `.dark` class toggled by `ThemeToggle` in the header. Preference is persisted (`localStorage`) and defaults to the OS's `prefers-color-scheme`; the theme is applied before first paint to avoid a flash of the wrong theme. Every existing `brand-*` Tailwind class automatically follows the active theme with no per-component changes needed, via `rgb(var(--color-brand-600) / <alpha-value>)`-style color definitions in `tailwind.config.js`. |
| Contrast, checked not assumed | Every text/background pairing introduced or touched in this pass was checked against the WCAG 2.1 relative-luminance formula, not eyeballed: primary-button text switches between near-black (light theme) and near-white (dark theme) because the same orange/blue accent needs opposite-lightness text to clear 4.5:1 in each theme (`text-brand-ink`); destructive/status link text (`text-red-600 dark:text-red-400`, `text-emerald-700 dark:text-emerald-400`, `text-amber-700 dark:text-amber-400`) was bumped from Tailwind's default 500/600 shades, which fail AA against white, to shades that pass in both themes. Verified visually with real rendered screenshots (Playwright, both themes, desktop and mobile viewports), not just computed. |
| Accessibility | `Modal` now has `role="dialog"`/`aria-modal`/`aria-labelledby`, traps focus with Tab/Shift+Tab, closes on Escape and on backdrop click, and restores focus to the triggering element on close. `Layout` has a "Skip to main content" link, a labelled `<nav>`, and a focus target on `<main>`. Interactive icon-only controls (menu, notifications, theme toggle, modal close) all have `aria-label`s. Every focusable control gets a visible `focus-visible` ring. `prefers-reduced-motion` disables transitions/animations for users who've asked the OS for that. |
| Mobile | The existing collapsible sidebar (already present) was kept and its touch targets enlarged to ≥44px; buttons, inputs and nav links across the shared primitives were raised to the same minimum tap-target height. Verified at a 390×844 mobile viewport: the slide-out nav, forms, and cards all reflow to a single column with no horizontal overflow (tables already scroll independently via `overflow-x-auto`). |

**Scope note — what this does *not* include:** the SAMP 2.0 document also describes things that are
infrastructure or organisational process, not application code this session could produce: real ZKTeco
biometric terminal integration (an ADMS receiver stub would need actual hardware to test against), a Redis
session-revocation layer, PAdES-signed PDF certificates (receipts/certificates here use an HMAC integrity code,
which is explicitly *not* the same guarantee as a third-party-verifiable digital signature — see
`backend/src/lib/integrity.ts`), a full third-party WCAG 2.2 AA audit and penetration testing (the SAMP 3.1 pass
checked real contrast ratios and added real semantics/keyboard support, but that is not the same thing as a
certified accessibility audit — no screen-reader testing across NVDA/JAWS/VoiceOver was performed), English/
Hindi/Gujarati localisation, progressive-web-app packaging, and a phased VPS migration runbook. The architecture
doesn't block adding any of these later.

Two v3.0 backend features also have a working API but no dedicated frontend screen yet, since they're low-
frequency admin actions rather than everyday workflows: the weekly timetable bulk-replace endpoint
(`PUT /batches/:id/timetable`) and the biometric-scan exception queue (`GET/POST /attendance/exceptions`). Both
are reachable today via the API and are natural next additions to the Batches and Attendance screens.

## SAMP 3.2 changes (independent fresh re-audit, gap closure)

The same source document was re-audited a third time, deliberately from scratch rather than trusting the v3.0
self-report — a background agent re-read the requirements cover-to-cover and independently re-verified every
prior fix against the current code. Everything from v3.0 held up (formula fix, exam papers/rubric marking,
attendance/session overhaul, hash-chained audit log, backups, settings, security hardening, all re-verified with
no regressions); this pass closes the genuine gaps the fresh read found.

| Area | What changed |
|---|---|
| Governance (RBAC) | The document's core fix — Super Admin as sole authority over master-record creation — had regressed: Academic Admin could still create Students, Courses, Faculty and Batches, reactivate Faculty, and revoke Certificates via the shared `ADMIN_LIKE` role group. All six of those endpoints (and their frontend "+ Add"/"Revoke" buttons) are now `SUPER_ADMIN`-only. **Deliberate, unchanged exception:** Super Admin retains *full* fee-section access (approve/reject refunds and write-offs) per the client's explicit SAMP 2.0 instruction overriding the document's own view-only default for that section — Academic Admin's fee self-approval loophole is closed, but Super Admin's grant stands. |
| Self-approval gaps | Action Centre's `PATCH /:id/resolve` was missing the same "you can't act on your own request" guard already present on `/approve` and `/reject` — fixed. |
| Composite score formula | The behaviour-index term used `70 + points` with no scaling at all; it's now the spec's asymmetric scale — a positive net adds `×3` per point, a negative net subtracts `×6` per point (misconduct weighs twice as heavily), matching the document's worked example (net +2 → 76). The coursework term was averaging submission *status* (evaluated/submitted/late) as a heuristic instead of actual marks; it now sums `pointsAwarded` over each task's max points, a real marks average. |
| Student of the Month / Batch of the Year | Added a `StudentCompositeSnapshot` per student per period so "Most Improved" compares against *every* student's own prior-period score, not just past award winners (a non-winner could never be considered before). Added a 60%-attendance qualification floor and a composite → attendance → coursework → earlier-enrolment-date tie-break. Batch of the Year now requires ≥80% of a batch's scheduled sessions for the year to have actually been conducted before it's eligible to win. |
| Certificate eligibility | Added the third mandatory condition — the student's batch must be marked `COMPLETED` — alongside the existing attendance-threshold and no-open-case checks. |
| Batch archival guard | `PATCH /batches/:id/archive` now blocks when any active student in the batch has an outstanding fee balance or an open Action Centre request; Super Admin may override with a required, audited reason. |
| Behaviour-concern auto-detection | The `BEHAVIOUR_CONCERN` intervention trigger existed in the schema but no code ever produced it. `POST /interventions/auto-detect` now opens a case when a student has 3+ authorized negative behaviour points within the current calendar month. |
| Data protection enforcement | Consent records existed as pure CRUD with nothing checking them. Enrolling a student now requires `dataProcessingConsent: { granted: true, noticeVersion }` in the same request — refuse consent, no student account. Withdrawing (or explicitly refusing) DATA_PROCESSING consent sets `Student.dataProcessingSuspended`, which the attendance bulk-mark endpoints check and skip for — the same lever a future controller can check before writing other records for that student. |
| Action Centre SLA | Added a `RequestSla` per-type target-response-hours config (Super Admin sets it, defaults to 48h) and a computed `slaBreached`/`hoursOpen` on every listed/fetched request, surfaced as a red "SLA breached" badge in the UI. |
| Notification preference centre | Added `NotificationPreference` (per-user, per-category, in-app/email toggle) with `GET/PUT /notifications/preferences` and a "Manage preferences" panel on the Notifications page; `notify()` now checks it before creating a notification or sending an email. |
| Fee overdue reminders | A new daily job (`runFeeOverdueReminders`, 8am cron, also triggerable on demand via `POST /fees/overdue-reminders/run`) marks past-due pending instalments `OVERDUE` and reminds the student and parents once per day. |
| Grading scale | `gradeLetterFor()` returned generic A+/A/B/C/D/E/F; it now returns the document's named bands (Outstanding/Excellent/Very good/Good/Satisfactory/Pass/Not yet passed), alongside a new `gradePointFor()` for the matching 10/9/8/7/6/5/0 point scale. Exam percentages are now rounded to 2 decimals at every point they're computed, per C6.3. |
| Receipt numbering | Replaced the random-suffix receipt number with a real gapless sequence — a `ReceiptSequence` counter per financial year, atomically incremented, producing the document's `CO-R-YYYY-NNNNNN` format. |
| Project group integrity | "One group per student per project" was only an app-level check-then-create (a real race between two concurrent requests could still double-enroll a student). `ProjectMember` now carries a denormalized `projectId` with a real `@@unique([projectId, studentId])` database constraint as the actual guarantee. |
| **Deployment fix (not in the source document, found during this pass's own build verification)** | The compiled production build (`npm run build && npm start`, and the Docker image, which run the exact same commands) never actually resolves the codebase's `@/*` path-alias imports — `node dist/server.js` crashed immediately with `Cannot find module '@/app'`. This had never been caught because every earlier smoke test in this project's history ran the TypeScript dev server (`tsx`, which resolves aliases natively) rather than the compiled artifact Docker actually ships. Fixed by adding `tsc-alias` as a build step (`tsc && tsc-alias && prisma generate`), which rewrites the compiled `@/*` requires to relative paths. Verified by rebuilding from a clean `dist/`, starting the compiled server directly, and confirming it now boots and serves requests. |

**Scope note:** as with prior passes, the following remain intentionally out of scope for the reasons given in the
SAMP 3.1 section above (they need real infrastructure or a certified third-party process, not more application
code): real biometric hardware, Redis, PAdES signatures, a certified WCAG/pentest audit, i18n, PWA packaging, and
a phased VPS migration runbook.

## SI Portal 3.3 changes (rename + re-verification of the SAMP 2.0 client requests)

The product is renamed from "Student Academic Management Portal" / SAMP to **SI Portal**, effective this version.
This is a naming change only — no functionality, schema, or role model changed because of the rename. Alongside
the rename, the client's ten SAMP 2.0 line items were re-sent verbatim and independently re-verified against the
current code (not re-implemented from scratch, since all ten were already confirmed done across the SAMP 2.0,
2.5, and 3.0 passes, and the 3.2 pass had just closed the one regression among them — Academic Admin's fee
self-approval loophole). All ten still hold:

| # | Item | Status |
|---|---|---|
| 1 | a6.5 M07 — exam answer keys removed entirely, not merely hidden | ✅ confirmed — no `answerKey`/`correctOption` field is ever serialized to any role |
| 2 | a6.7 F04 — exam and project scores count toward Student of the Month | ✅ confirmed — `examWeight`/`projectWeight` are live terms in the composite formula |
| 3 | b2.1 — "My Batch(es)" section removed from the Team/Faculty navigation | ✅ confirmed — no such section exists in the frontend |
| 4 | c2.3 — Super Admin has full (not view-only) fee-section access | ✅ confirmed, and the Academic Admin self-approval loophole flagged in the 3.2 audit is now closed — Super Admin's full access is untouched |
| 5 | c10.1 — batch archival retention window is 2 years (not 7), with a final-backup action before deletion | ✅ confirmed — `retentionYears` defaults to 2, and `FINAL_BACKUP` runs before archive |
| 6 | c-security — MFA available and enforceable for every role | ✅ confirmed — `mfaRequiredRoles` defaults to all seven roles |
| 7 | extra 1 — students cannot see their assignment points | ✅ confirmed — `pointsAwarded` is nulled out of every task response served to a Student |
| 8 | extra 2 — duplicate-data monitoring | ✅ confirmed — the duplicate-detection sweep in Settings is in place |
| 9 | extra 3 — intern performance threshold (auto work-stop), leave approval, dynamic mentor ("working under") | ✅ confirmed — all three are live in the Interns module |
| 10 | extra 4 — password-change requires verifying the current password, for every role including Student and Parent | ✅ confirmed — `changePassword()` is one shared auth-service function used by all roles |

**What actually changed in code for the rename:**

| Area | What changed |
|---|---|
| User-facing branding | Login page heading, sidebar logo text, browser tab title, and the public certificate-verification page subtitle now read "SI Portal". |
| Generated documents | The default institution name shown on generated certificates and receipts (Settings → Institution Profile) is now "SI Portal"; the receipt PDF footer text was updated to match. |
| MFA | The TOTP issuer name shown inside authenticator apps (Google Authenticator, Authy, etc.) changed from "SAMP Portal" to "SI Portal". |
| Certificate & student-code numbering | The generated certificate-number and demo student-code prefix changed from `SAMP-` to `SI-` (e.g. `SI-2026-AB12CD34`), in both the live certificate-issuing code and the seed data. |
| Demo data | The seeded email domain changed from `@samp.edu` to `@siportal.edu` across every seeded account (Super Admin, Management, Academic Admin, Accounts, Team, Students, Parents) — see the updated **Demo accounts** table below. |
| Backend log line | The server's startup log message now reads "SI Portal API listening...". |

**Deliberately left unrenamed (internal identifiers, not user-visible branding):** the npm package names
(`samp-backend`/`samp-frontend`), the Postgres database/role/credentials (`samp_db`/`samp_user`/`samp_password`
in `docker-compose.yml` and the `.env` files), and the frontend's `localStorage` keys (`samp_auth`, `samp-theme`).
None of these are ever seen by an end user of the deployed app, and renaming them would only add risk (re-creating
database roles, invalidating existing `.env` files) for zero visible benefit. Historical changelog section
headers above ("SAMP 2.0 changes" through "SAMP 3.2 changes") also keep their original names, since that's what
each pass was actually called at the time — renaming history would make the changelog less accurate, not more.

## SI Portal 3.5 changes (Feed + customizable role-based chart dashboards)

Two features, requested directly by the client, on top of everything above.

### 1. Feed — institute-wide/batch-scoped announcements

A new `Feed` nav item (visible to every role) lists announcement posts, pinned posts first. Only Super Admin,
Academic Admin, and Team (Faculty) can post; students and parents are read-only, exactly as specified.

| Area | Detail |
|---|---|
| Who can post | `SUPER_ADMIN`, `ACADEMIC_ADMIN`, `FACULTY` only (`POST /feed`, `PATCH /feed/:id`, `DELETE /feed/:id`) — every other role gets a 403. |
| Audience scoping | A post targets either **institute-wide** (`batchId: null`, Super Admin/Academic Admin only) or **one specific batch**. Team members must scope every post to one of their own assigned batches — they can't broadcast institute-wide. |
| Who can see what | Students see institute-wide posts plus their own batch's; parents see institute-wide plus their linked children's batch(es); Team sees institute-wide plus their own assigned batches; Super Admin/Management/Academic Admin/Accounts see everything. |
| Moderation | Super Admin/Academic Admin can pin/unpin any post (`PATCH /feed/:id/pin`) to keep it at the top; a post's own author (or Super Admin) can edit or delete it. |
| Notifications | Publishing a post notifies every student in scope (and their parents) via the existing notification system — respecting each recipient's own notification preferences from the 3.2 preference centre, and tagged under a new `ANNOUNCEMENT` category so it can be filtered/opted out of independently of other categories. |

### 2. Customizable, role-based chart dashboards

Every role's Dashboard now has a "Charts" section, populated from a per-role catalog of real chart widgets
(`recharts`, already a dependency, now actually wired up) — not mock data. A "Customize" panel lets each user
individually choose which of their role's available charts to show; the choice is saved server-side per user
(`DashboardPreference`), so it persists across devices and sessions. Charts adapt automatically to light/dark
theme (colors are read live from the same CSS variables the rest of the UI uses).

| Role | Widgets available (a `GET /dashboard/widgets/catalog` call lists these; defaults pre-selected are a curated subset) |
|---|---|
| **Super Admin / Management** | Student growth trend, certificates issued trend, fee collection trend, batch performance comparison (avg. composite score per batch), top & bottom performing students, faculty activity (sessions conducted), institute-wide attendance trend, batches by status, students requiring attention by severity, fees collected vs outstanding. This is deliberately the broadest catalog — covering growth, marketing/business (fee trends), performance, faculty activity, and institutional health in one place, as requested. |
| **Academic Admin** | Sessions conducted trend, student attendance trend, task completion trend, batch performance — a strictly narrower set than Super Admin's (no fee/revenue or faculty-HR widgets), matching "restricted other than Super Admin." |
| **Team (Faculty)** | My sessions conducted, my batches' attendance trend, my batches' task completion trend, my students' performance distribution — all scoped to the faculty member's own assigned batches only. |
| **Parent** | Per-child attendance, task completion, exam performance, and behaviour-points trends — multi-line charts (one line per child) when a parent has more than one linked student, so data for children other than their own never appears. |
| **Student** | My attendance trend, my task completion trend, my exam performance trend, my composite-score trend (the last one is a direct payoff of the `StudentCompositeSnapshot` table built in the 3.2 pass). |

The widget catalog and data endpoints (`GET /dashboard/widgets/catalog`, `GET /dashboard/widgets/data?keys=...`,
`GET`/`PUT /dashboard/preferences`) validate every requested widget key against the caller's role server-side —
a user can never fetch or save a widget outside their own role's catalog, even by calling the API directly.

**Scope note:** the widget catalog above is a solid, real (non-stub) starting set covering every category the
client named — it is intentionally not exhaustive. The registry (`backend/src/lib/dashboardWidgets.ts`) is
structured so adding another widget later is a small, self-contained addition (one entry with a `fetch()`
function), not a redesign.

## SI Portal 4.0 changes (full reviewer issue log, all five roles)

A reviewer walked every screen of Super Admin, Admin, Team/Faculty, Student and Parent and produced a
consolidated issue log with a required change against each item. This pass implements every item that had a
stated resolution, leaves untouched everything already marked "Done"/"No changes required", and does **not**
guess on the handful of items the log itself left open (listed at the bottom of this section).

**Navigation & access**
- The "People" top-level menu is gone; Students, Parents and Team now live under **Performance → Community**
  (a Batches tab was added to the same hub). Nav items and their underlying routes are now driven by one
  shared role-group source (`frontend/src/lib/navRoles.ts`), closing a "hidden from nav but reachable by
  direct URL" gap on Fees, Backup, Certificates, Reports and Performance/Projects — each now 403s in the UI
  itself, not just the API, for a role that shouldn't see it.
- Academic Admin's Fees access was removed entirely (Super Admin and Accounts only); Backup access was
  extended to Academic Admin (previously Super Admin-only) on both the route and every backend endpoint
  except Restore, which stays Super-Admin-only as the one genuinely destructive action in that module.

**Dashboards**
- Super Admin/Management: replaced four stat cards (Avg Attendance, Avg Exam Score, Task Completion,
  Requiring Attention) with a weekly calendar (alternating Navy/Red day colouring) and two "which batches
  meet on which coloured day" cards.
- Student: "Upcoming Exams" became "Upcoming Session(s)"; the Action Center panel was removed from the
  student dashboard.
- Parent: added a "Scheduled Sessions of the Week" section covering every linked child's batch.

**Batches**
- Students can now be bulk-added to a batch (existing students via multi-select, or a genuinely new student
  created directly into that batch — the standalone "Add Student" entry point moved here after Community's
  Students list lost its own create button, so account creation is still possible, just relocated). The
  batch-level "Team" card (assigned mentor) was removed. Each batch now has a ranking dashboard scoring every
  active student by composite score.

**Community → Students / Parents / Team**
- Students: profile is now Super Admin/Academic Admin-editable in place; the standalone "Add Student" button
  is gone (see Batches above); the list gained a batch filter; the profile page is reorganised into four
  sections (Details, Parent Details, Performance Overview, Academic Timeline) and the old "Leave Record"
  section was removed.
- Parents: the account form and profile now capture alternate phone, contact email, current/permanent
  address and occupation; a parent's detail view shows each linked child's composite score and recent exam
  history (moved here from the student's own profile, per the log's reorganisation) rather than duplicating it
  on both screens.
- Team: the "Batches" count column was removed from the list; only Super Admin can open a team member's full
  detail (login info, batch assignments, mentored students) — a Team/Faculty member's own row is text, not a
  link, for anyone else.

**Sessions**
- A session's date/time and every other field can now be edited (an "Edit" action exists both from the list
  and the session detail page), a "Trainer" (faculty) selector was added to create/edit, and a new "Full Week
  Session" action schedules a whole week (Mon–Sun, per-day toggle/time/topic) for a batch in one submission
  (`POST /sessions/bulk`). Session Type options now read as Session — Theory/Practical/Task and
  Exam — Theory/Practical, matching the required category names exactly (the underlying enum values were
  already correct; only the labels were renamed).

**Exams**
- The Course field was removed from Create Exam (it was already optional server-side).
- Question Bank is now a two-pane workspace: the question list on the left, a "Build a Paper" panel on the
  right that assembles selected questions into a new or existing exam's paper under a custom name (satisfying
  "Add Paper" for both fresh and existing exams). The Subject field was removed from Add Question (now
  optional, defaulted server-side); new-question marks default to 1 for MCQ / 10 for Long Answer by type.
- Exam Detail dropped the Grades/marks panel entirely, gained an "Edit Exam" action (title/subject/date/
  duration/pass marks) making the whole exam editable, and gained a "Remove Paper" action that wasn't there
  before.
- **Mark-sheet approval workflow** (new): a teacher enters marks and submits a mark sheet
  (`POST /exams/:id/marksheet/submit`) rather than publishing directly; Admin (Super Admin/Academic Admin)
  reviews pending mark sheets (`GET /exams/marksheets/pending`) and either accepts — which publishes to
  students/parents (`PATCH /exams/:id/marksheet/accept`) — or rejects with a reason, sending it back to the
  teacher for revision (`PATCH /exams/:id/marksheet/reject`). Exam/Grade status gained `REJECTED` states for
  this. Marks entry lives on a new dedicated Mark Sheet page (`/exams/:id/marksheet`), separate from Exam
  Detail's paper/question management.

**Tasks**
- Assign Task/Task list now supports adjusting the due date (and any other field) after assignment via an
  Edit action. The Student and Parent task tables drop the Batch column and show a Status column
  (Completed/Not Submitted/Late, computed server-side from that user's/child's submission) instead of the
  staff-only Submissions count.

**Projects (Intern Projects)**
- Projects require an intern-eligible batch (at least one student with `internStatus` set) and the module is
  labelled "Intern Projects" throughout. Groups can now be removed (blocked if marks are already recorded,
  unless explicitly forced), given a custom name (defaulting to the project's own name), and assigned a leader
  by Super Admin/Admin — manually or at random — with the option to reassign afterwards. Close/Reopen Grading
  is now gated to Super Admin, Academic Admin, and the batch's assigned mentor Faculty only (previously any
  staff role). Group members can update their group's GitHub link directly without recreating the group, and
  can log week-by-week progress notes (Week 1, Week 2, …) visible on the project detail page.

**Reports**
- Team Report, Certification Report and Certificate Verification Report were removed from the Reports screen
  and their backend endpoints deleted; Faculty access to `/reports` (route, nav and API) remains blocked, as
  it already was.

**Backup**
- Automatic backups now default to a daily 23:59 schedule (`BACKUP_SCHEDULE_CRON`, previously 2 AM) —
  configurable, never disabled by default.

**Settings**
- Active Sessions was already server-side scoped to the caller, but a real cross-account leak existed on the
  client: the query cache was never cleared on login/logout, so a browser that signed in as a second account
  could briefly render the previous account's cached session list. Fixed by clearing the whole React Query
  cache on every login/logout and scoping the sessions query key by user id as a second layer of defence.
- Users → Reset Password now offers a genuine custom-password option (`POST /users/:id/reset-password` takes
  an optional `customPassword`, validated against the existing password policy) alongside the original
  generated-temp-password flow, which forces a change on next login as before.
- Parent Settings replaces the Change Password block with a "Contact" section listing the mentor/assigned
  faculty (name, email, phone) for each linked child (`GET /parents/me/faculty-contacts`).

**Performance**
- The Certifications tab is gone everywhere (Performance hub for every role, and the Student nav's separate
  Certificates section — both were flagged as possibly duplicate removals and both are in fact removed). A
  student's Performance page now opens on an Overview tab summarising Behaviour/Presentations/Self-Assessment/
  Marks at a glance, with click-through to each. The Behaviour tab dropped the Net Points/Events/Categories
  summary cards for a student's own view; staff recording behaviour now choose Students or Interns before
  filtering/recording (`?studentType=`, threaded through `/behaviour` and `/students`). Self-Assessment was
  redesigned into a Topic/Platform(optional)/Link "Approval Request" (Admin/Staff approve or reject); the
  academic composite-score formula's confidence-rating term was **not** changed — it simply now tolerates
  older rated entries alongside newer unrated Approval Requests, exactly preserving prior scoring behaviour.
- "Student of the Month" is "Intern of the Month" everywhere in the UI; award computation and its leaderboard
  are now scored only from students with `internStatus` set.

**Certificates**
- The public verify endpoint (`GET /verify/:certificateNumber`) already returned only limited fields (name,
  title, status, dates — no internal IDs) and was already rate-limited; this pass adds abuse logging on every
  failed lookup, completing the recommended "Option A" from three the log offered (keep public QR verification
  working, but harden it) — chosen because public QR verification is itself an original, explicit product
  requirement, not something to remove.

**Fees (Parent)**
- Parent's Fees section now shows an "Instalment Schedule" table with a colour-coded Status badge
  (Pending/Paid/Overdue) per instalment, so a parent can identify outstanding payments at a glance — Student's
  Fees section was left untouched, since the log itself marked that item "no specific change finalised; to be
  confirmed" rather than giving a resolution.

**Action Centre**
- "Behaviour Challenge" was removed from the Student Raise Request type list; "Data Access Request" and
  "Data Erasure Request" were removed from both Student's and Parent's lists (enforced server-side, not just
  in the dropdown) — Parent retains Fee Query, Attendance Query, General and Data Correction Request exactly
  as specified.

**New: Personal Calendar (Faculty)**
- A private month-view calendar at `/calendar` (Faculty-only in the nav) with full add/edit/delete of personal
  events (title, time range, notes), plus a read-only overlay of the faculty member's own assigned sessions —
  all `GET/POST/PATCH/DELETE /calendar/events` calls are scoped to the caller; no role can read another
  user's calendar.

**New: Intern dashboard**
- A promoted intern's "Interns" page is now a dashboard (mirroring the Student dashboard's stat-card style)
  showing their mentor's Rating band and comment plus their own task list — reusing the existing
  ratings/development-view and tasks endpoints rather than adding new ones.

**Left open (the source document itself gave no resolvable direction — not guessed at)**
- **Student Settings — "Remove" and "Change Password" together:** the reviewer's own note for this item was
  flagged in the source document as brief/incomplete, with an explicit request to confirm the exact
  requirement before implementing anything. No change was made to Student's Change Password block pending
  that confirmation (Parent's equivalent item, which *was* fully specified, is implemented above).

## SI Portal 4.1 changes (client-requested refinements, Super Admin/Admin/Team)

**Super Admin**
- **Audit Log** — coverage broadened: exam creation and the full mark-sheet workflow (submit/accept/reject),
  task creation, submission and evaluation, and every login attempt (success, failure, MFA, and lockout) now
  write an audit entry, alongside the modules already covered from 4.0. The Audit Log tab gained a
  **Details** expander per row showing the before/after JSON, and the entity-type filter now also lists
  `Task`, `TaskSubmission`, `Exam`, `FeedPost` and `BackupRecord`.
- **Dashboard** — Action Center removed for Super Admin (it already only showed pending items other roles
  raise; Super Admin manages those directly through Action Centre itself).
- **Exams — Mark Sheet** — the grade-letter/percentage-band badge (A+/A/B…) is removed from the per-student
  row; only marks and percentage are shown. Staff can now **Edit Marks** on an already-graded row (routes
  through the existing correction endpoint, so PUBLISHED grades still require an Admin-level reason).
- **Tasks — Task Detail** — fixed a backend bug where `GET /tasks/:id` never included the submitting
  student's name (the frontend column was already there; the relation just wasn't queried). Evaluated
  submissions can now be re-opened and their points/feedback **edited**.
- **Interns** — Super Admin can now, from a single intern's page: **Assign Task** (to that intern only) and
  **Assign Project** (adds them to a project's group, or creates one), and **Deactivate/Reactivate** the
  intern's account. A new institute-wide **Intern Manager** setting (Settings → Organisation) designates one
  Faculty who oversees all interns; the existing per-intern mentor is relabelled **Task Mentor** to
  distinguish the two roles (label-only — the underlying reassignable-mentor mechanism from 4.0 is unchanged).
- **Projects** — the page is now batch-first: **All Batches → a batch's Projects → a project's Groups**,
  matching the requested navigation. Project:Group stays a one-to-many relationship as it already was in
  4.0 (a "single project = single group" default is a workflow choice, not a schema constraint, per
  confirmation). Group marks can now be **edited** after first being recorded, not just entered once.
- **Performance** — Student detail view gained a **Marks History (all exams)** list and a **Monthly
  Performance History** grid (12-month average %, computed on demand from published grades — built fresh
  rather than reusing the Intern-of-the-Month snapshot table, since that table is intern-only since 4.0).
  Batches already gained bulk student add in 4.0; treated as already satisfying this request.
- **Parents** — the Parent Detail view (Community → Parents) is now editable in place (name, phone, email,
  address, occupation) for Super Admin/Academic Admin.
- **Team** — no leftover "assign batch to team member" UI was found (already fully removed in 4.0).
  Behaviour events and Presentation scores can now be **edited** after being recorded. Intern of the Month
  awards can be manually overridden (new "Edit" action next to each award, for correcting the computed
  winner). "Requiring Attention" (Interventions) and Self-Assessment approvals were already re-decidable
  from 4.0 — Self-Assessment's Approve/Reject can now be re-opened after a decision via a new **Edit** link.
- **Backup** — the automatic daily 23:59 backup (set up in 4.0) now displays its **next scheduled run** time
  on the Backup page.
- **Settings** — Super Admin can now create **Admin** (Academic Admin) and **Team Member** accounts directly
  from Settings → Users, in addition to the existing Team/Parent creation flows elsewhere in the app.

**Admin (Academic Admin)**
- Confirmed unchanged from 4.0: full access except batch/student creation, which stays Super-Admin-only.
  Admin retains schedule editing, daily management tasks, and every other operational action.

**Team / Faculty**
- **Feed** — Team (and Admin) can now attach an image or file to a Feed post, not just text.
- **Tasks** — assigning a task now offers **"Interns Only"** as an alternative to "Whole Batch", with an
  intern checklist scoped to the selected batch, so a task can target just the batch's interns.
- **Certificate verification** — left unchanged (public, no login) per explicit confirmation that this
  matches the already-decided 4.0 approach (Option A) and no further hardening was requested beyond it.
- **Projects** — Team members are still restricted to Intern Projects (a batch must have intern students),
  but Super Admin/Academic Admin can now create a normal (non-intern) project for any batch — the
  intern-only check now only applies when the creator is Faculty.
- **Reports** — a new admin-only **Intern Report** (batch, mentor, status, latest rating) is available from
  the Reports page. Team members, who don't have Reports access, instead get a **Download Intern Report**
  button directly on the Interns page, scoped to their own mentored interns.

## Architecture

```
/backend    Express + TypeScript API, Prisma ORM, PostgreSQL
/frontend   React + TypeScript + Vite + Tailwind SPA
docker-compose.yml   postgres + backend + frontend (nginx), production-ready
```

Key backend design points:
- **RBAC**: enforced via middleware (`src/middleware/auth.ts`) plus data-level scoping (`src/utils/scope.ts`)
  so Team members only see their assigned batches/interns and parents only see linked children.
- **Audit trail**: grade changes, attendance corrections, batch transfers, behaviour authorization, certificate
  issuance/revocation, fee refunds/reversals, intern promotions/demotions/ratings, MFA changes, and role changes
  are all written to an append-only `AuditLog` table (`src/lib/audit.ts`).
- **Composite performance score**: configurable weights (`Settings → Default Parameters`) computed in
  `src/lib/scoring.ts`, used for dashboards, Student of the Month, and intervention triggers — explicitly
  guidance-only, never the sole basis for disciplinary decisions.
- **Certificates & receipts**: unique numbers, an HMAC-based integrity code the server can re-check, and QR
  codes linking to public verification pages that work without login.

## Local development (without Docker)

Requirements: Node.js 20+, PostgreSQL 14+.

```bash
# 1. Backend
cd backend
cp .env.example .env        # edit DATABASE_URL etc. if needed
npm install
npx prisma migrate deploy   # applies all migrations
npm run prisma:seed         # loads demo data (optional but recommended)
npm run dev                 # http://localhost:4000

# 2. Frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

The Vite dev server proxies `/api` and `/uploads` to `http://localhost:4000` (see `frontend/vite.config.ts`), so
no CORS configuration is needed in development. `pg_dump` (part of the `postgresql-client` package) must be on
`PATH` for the Backup module's "Run Backup Now" action to work outside Docker.

## Deploying with Docker Compose (recommended for local demo)

```bash
cp .env.example .env
# Edit .env: set real JWT_ACCESS_SECRET / JWT_REFRESH_SECRET / RECEIPT_HMAC_SECRET (long random strings), and
# set SEED_ON_START=true if you want the demo dataset loaded automatically on first boot.

docker compose up -d --build
```

- Frontend: http://localhost:8080
- Backend API: http://localhost:4000/api
- Postgres: localhost:5432 (exposed for convenience; remove the `ports:` mapping in `docker-compose.yml` for a
  production deployment where the database shouldn't be reachable from outside the Docker network)

The backend container runs `prisma migrate deploy` automatically on startup before the server starts
(`backend/docker-entrypoint.sh`), so schema migrations are applied on every deploy without a manual step. The
backend image includes `postgresql-client` so the Backup module's `pg_dump`-based snapshot works out of the box.

To seed the demo dataset into an already-running stack instead of on startup:

```bash
docker compose exec backend npx prisma db seed
```

> **Note on this environment:** the sandbox this was built in could not start a Docker daemon (no permission to
> adjust container ulimits), so `docker compose up` itself could not be executed here. The Dockerfiles,
> entrypoint, and compose file were written and reviewed carefully, and the same application code was verified
> end-to-end against a real PostgreSQL instance outside of Docker — migrations (applied from a clean database),
> seed, login (including the MFA challenge and backup flows), and API calls across every role all confirmed
> working — plus clean production builds of both the backend and frontend. Please run
> `docker compose up -d --build` in your own environment as the final verification step before going live.

## Demo accounts

After seeding (`npm run prisma:seed` or `SEED_ON_START=true`), every account shares the password set in
`SEED_ADMIN_PASSWORD` (default `ChangeMe123!`). None has MFA enabled by default — enable it per-account under
`Settings → Profile & Password` to try that flow.

| Role | Email |
|---|---|
| Super Admin | `admin@siportal.edu`, `sujal.suthar@siportal.edu` |
| Management | `management@siportal.edu` |
| Academic Admin | `academic.admin@siportal.edu`, `sagar.patel@siportal.edu` |
| Accounts | `accounts@siportal.edu` |
| Team | `priya.faculty@`, `arjun.faculty@`, `neha.faculty@`, `subham.shah@`, `krish.solanki@` (all `@siportal.edu`) |
| Student | `aarav.kumar@student.siportal.edu` (and 9 more — see seed output; the 2nd student is a seeded Intern) |
| Parent | `parent.aarav@siportal.edu` (and 9 more) |

**Change these credentials (or disable the seeded accounts) before any real/production use.**

## Security notes

- Passwords hashed with bcrypt (cost 12); JWT access + rotating refresh tokens (refresh tokens hashed at rest).
- TOTP-based MFA available to every role, with bcrypt-hashed one-time backup codes; enabling MFA makes it
  mandatory on subsequent logins and on password changes.
- New accounts (student/Team/parent) are provisioned with a random temporary password and
  `mustChangePassword: true`, enforced by a forced-onboarding gate in the frontend.
- File uploads are type- and size-restricted (`backend/src/middleware/upload.ts`).
- Rate limiting, Helmet security headers, and CORS restricted to `WEB_URL` are enabled by default.
- Public certificate and receipt verification expose only the minimum fields (name/course/dates/status, or
  validity/date/amount) — never contact info or internal notes.
- Answer keys are never returned by any API response to any role.

## Team demo link (live)

| | URL |
|---|---|
| **App (share with team)** | https://si-portal-rosy.vercel.app |
| **API** | https://si-portal-api.onrender.com/api |
| **Health check** | https://si-portal-api.onrender.com/health |
| **GitHub** | https://github.com/sujalsuthar/si-portal |

**Demo login:** `admin@siportal.edu` / `ChangeMe123!`

### Auto-deploy (push → live)

Every push to **`main`** on GitHub automatically:

1. **Vercel** rebuilds the frontend (Git integration + root [`vercel.json`](vercel.json))
2. **Render** rebuilds the backend from [`render.yaml`](render.yaml) (`backend/` Docker service)

No Render CLI needed. Redeploy usually finishes in 1–3 minutes. After changes, hard-refresh the browser (`Ctrl+Shift+R`).

Optional: add a Render **Deploy Hook** URL as GitHub secret `RENDER_DEPLOY_HOOK` if you ever disable Render auto-deploy — see [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

## Deploy: Backend on Render + Frontend on Vercel

### Prerequisites

1. **GitHub account** — repo pushed to GitHub (Render connects via GitHub).
2. **Render account** — sign up at [render.com](https://render.com) (use **Continue with GitHub**).
3. **Vercel account** — already logged in via CLI (`vercel whoami`).

### Step 1 — Push code to GitHub

```bash
cd rd-claude-deployable-code-modules-bw7p2c
git init
git add .
git commit -m "SI Portal: ready for Render + Vercel deploy"
```

Create a new repo on GitHub (empty, no README), then:

```bash
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

Or install GitHub CLI and run `gh auth login`, then `gh repo create si-portal --private --source=. --push`.

### Step 2 — Log in to Render (first time)

1. Open [https://dashboard.render.com](https://dashboard.render.com)
2. Click **Get Started** or **Sign In**
3. Choose **Continue with GitHub** and authorize Render
4. You only need to do this once in the browser — there is no Render CLI required

### Step 3 — Deploy backend (Render Blueprint)

1. Render Dashboard → **New +** → **Blueprint**
2. Connect your GitHub repo
3. Render reads [`render.yaml`](render.yaml) and creates:
   - **PostgreSQL** (`si-portal-db`, free tier)
   - **Web Service** (`si-portal-api`, Docker, root dir `backend`)
4. When prompted, set these env vars (Blueprint may leave them blank):
   - `WEB_URL` = your Vercel URL (set after Step 4, e.g. `https://your-app.vercel.app`)
   - `APP_URL` = your Render API URL (e.g. `https://si-portal-api.onrender.com`)
5. Wait for deploy to finish (first boot runs migrations + seed because `SEED_ON_START=true`)
6. Test: open `https://YOUR-SERVICE.onrender.com/health` — should return `{"status":"ok",...}`

**Demo login after seed:** `admin@siportal.edu` / `ChangeMe123!`

### Step 4 — Deploy frontend (Vercel)

From the repo root:

```bash
cd frontend
vercel --prod
```

When asked:

| Prompt | Answer |
|--------|--------|
| Set up and deploy? | Yes |
| Which scope? | Your account |
| Link to existing project? | No (first time) or Yes (redeploy) |
| Project name | e.g. `si-portal` |
| Directory | `./` (you are already in `frontend`) |

**Environment variable** (Vercel Dashboard → Project → Settings → Environment Variables):

| Name | Value |
|------|--------|
| `VITE_API_URL` | `https://YOUR-SERVICE.onrender.com/api` |

Redeploy after adding the variable:

```bash
vercel --prod
```

Or set it during deploy:

```bash
vercel env add VITE_API_URL production
# paste: https://YOUR-SERVICE.onrender.com/api
vercel --prod
```

### Step 5 — Link Render CORS to Vercel

In **Render** → `si-portal-api` → **Environment**:

- `WEB_URL` = `https://your-app.vercel.app` (exact Vercel URL, no trailing slash)
- `APP_URL` = `https://your-service.onrender.com`

Click **Save Changes** → Render redeploys automatically.

### Step 6 — Verify

1. Open Vercel URL → login as Super Admin
2. Run smoke (optional): `API_URL=https://YOUR-SERVICE.onrender.com/api npx tsx scripts/smoke.ts` from `backend/`
3. Change demo passwords before any real use

### Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS errors in browser | Set `WEB_URL` on Render to match Vercel URL exactly |
| 502 on Render free tier | Service may be sleeping — wait ~30s after first request |
| Login 401 | Confirm `SEED_ON_START=true` ran; check Render logs for seed output |
| API 404 from Vercel | Confirm `VITE_API_URL` ends with `/api` and frontend was rebuilt |

## What's intentionally out of scope

Per the specs' own MVP-first and phased-rollout guidance, and per the scope note above: online payment gateway
integration (the fee module supports gateway-mode payments in its data model but doesn't integrate a live
provider), real biometric/ZKTeco hardware integration, an LMS/content library, video session integration,
AI-assisted question generation, placement/alumni modules, native mobile apps, Redis-backed session revocation,
PAdES digital signatures, WCAG/penetration-test audits, and multi-language localisation. The data model and
module structure were designed so these can be added without reworking existing code.
