# Mobile Responsiveness — SI Portal

**Last updated:** 2026-08-29

This document tracks responsive work applied across the SI Portal frontend. **Desktop/laptop appearance is preserved at `lg` (1024px) and above** — mobile-only styles use `max-lg:` or `@media (max-width: 1023px)`.

---

## Global foundation

| File | Changes |
|------|---------|
| `frontend/src/index.css` | `overflow-x: clip` on root; `.form-grid`, `.form-grid-3`, `.filter-row`, `.calendar-scroll`; tighter table padding on mobile; contained table overflow |
| `frontend/src/components/Layout.tsx` | Mobile sidebar close button; hamburger toggle; `max-w-[85vw]` drawer; header overflow fixes; role label on mobile |
| `frontend/src/components/ui.tsx` | `Table` — desktop table at `lg+`, card rows below `lg`; `Modal` — bottom sheet on mobile, original centered scroll at `lg+`; `PageHeader` — full-width actions only below `lg` |
| `frontend/src/components/DashboardCharts.tsx` | Chart containers `min-w-0` for Recharts overflow prevention |

---

## Pages updated

- **Dashboard** — Week calendar: list view on mobile, 7-column grid on desktop; action/transfer rows stack on narrow screens
- **Calendar** — Month grid in horizontal scroll container (`calendar-scroll`) on small screens
- **Sessions** — Full Week modal: responsive form grid; day rows stack on mobile
- **Tasks, Behaviour, Presentations** — Batch filters full-width on mobile
- **Question Bank** — Sticky panel disabled on mobile; responsive search + form grids
- **Students, Parents, Team, Users, Audit** — Search inputs `w-full sm:w-56/64`
- **Student Detail** — Performance stats and marks history stack/wrap on mobile
- **Notifications** — Preference grid scrolls; notification rows stack title/date
- **Forms/modals** — 30+ modals updated via `.form-grid` / `.form-grid-3` across People, Tasks, Settings, Fees, Interns, Exams, etc.

---

## Table behavior

- **Desktop (`lg+`, 1024px+):** Unchanged full data table (matches pre-responsive design)
- **Mobile/tablet (`<lg`):** Each row renders as a card with labeled fields — all columns preserved, no data removed

---

## Breakpoints used

Tailwind defaults only: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px

---

## Not changed (by design)

- Colors, typography scale, branding, component library
- Desktop layout at 1025px+ (same sidebar + content shell)
- Business logic, API calls, role-based routing
