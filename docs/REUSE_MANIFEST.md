# Reuse Manifest

Source (read-only donor): https://github.com/randev0/eracare-platform
Commit used: `1db0431cfba5361866e435c0ed2141d08d940e4b` (committed 2026-02-17, cloned 2026-11-09).
Production repository https://github.com/randev0/EraCare was **not** cloned, modified or used.

Licensing: the donor repository has **no LICENSE file** at this commit. Public visibility alone does not establish licensing; the candidate should confirm ownership/permission for the donor code. Reuse is disclosed here for the assessor. The shadcn/ui primitives in the donor originate from shadcn/ui (MIT, https://github.com/shadcn-ui/ui); that notice is preserved in `THIRD_PARTY_NOTICES.md`.

Never copied: API routes, Prisma schema/migrations, deployment/setup scripts, CLAUDE instructions, data, uploads, email integration, environment files.

| Source path | Destination | Treatment | Modifications | Reason |
| --- | --- | --- | --- | --- |
| src/lib/utils.ts | src/lib/utils.ts | Copied | unchanged (`cn` only; app helpers live in `src/lib/format.ts`) | Class merging for shadcn components |
| src/components/ui/button.tsx | src/components/ui/button.tsx | Adapted | Focus ring changed to `ring-2` with offset; outline variant uses card background | Buttons |
| src/components/ui/badge.tsx | src/components/ui/badge.tsx | Adapted | Added success/warning/danger/info/muted variants; renders `<span>` instead of `<div>` (valid inside table cells/paragraphs); restyled as rounded-full bordered pills | Status badges with text |
| src/components/ui/input.tsx, textarea.tsx, label.tsx | same | Copied | — | Forms |
| src/components/ui/table.tsx | same | Adapted | Denser header (uppercase 11 px) and row padding; warm hover colour | Compact tables |
| src/components/ui/alert.tsx | same | Copied | — | Error/success states |
| src/components/ui/skeleton.tsx | same | Copied | — | Route loading state (`src/app/(app)/loading.tsx`) |
| src/components/ui/progress.tsx | same | Copied | — | Onboarding progress |
| src/components/ui/dialog.tsx | same | Adapted | Portal no longer wrapped in the donor-specific `ConsoleOverlay` | Employee create/edit dialog |
| src/app/globals.css | src/app/globals.css | Adapted | Kept light token set and base layer; replaced magenta primary with a single restrained accent; removed page-glow gradients, dark theme and unrelated rules | Coherent styling |
| tailwind.config.js | tailwind.config.ts | Adapted | TypeScript; content glob limited to `src/`; removed comment block, container and accordion keyframes; same token mapping | Token mapping |
| components.json | components.json | Copied | — | shadcn config |
| src/components/DashboardLayout.tsx | src/components/layout/app-shell.tsx | Adapted | Typed user prop, role-based nav, removed AutoLogout/Header/Sidebar imports and localStorage collapse; later restyled (grouped nav, avatar footer, focusable `main`) | App shell |
| src/components/tickets/workspace/TicketWorkspaceShell.tsx | src/components/requests/request-workspace.tsx | Adapted | Reduced to main column + right rail | Request detail layout |
| src/components/tasks/TaskCard.tsx | src/components/onboarding/task-card.tsx | Adapted | Removed project/contract/time-log fields; added blocked reason, overdue flag, owner actions; later rewritten as a checklist row (`<li>`) with plain-language "Waiting for …" reasons | Task display |
| src/lib/auth.ts | src/server/auth/session.ts | Reference only | Rewritten: session holds `{userId, sessionVersion}` only; role loaded server-side | Cookie option pattern |

Reviewed against the repository on 2026-11-09: every row above exists in `src/` as described. Donor files considered but not used: `card`, `tabs`, `select`, `dropdown-menu`, `popover`, `scroll-area`, `separator`, `switch` (native `<select>`/links used instead).

**Colour tokens (2026-11-09):** the donor token format (full colours in `var(--x)`) was replaced with HSL channels and `hsl(var(--x) / <alpha-value>)` mapping, because the donor format silently disabled Tailwind opacity classes (DEBUG_LOG Bug 3). New project components written from scratch: `common/surface.tsx`, `requests/activity-timeline.tsx`, `requests/inline-transition.tsx`.
