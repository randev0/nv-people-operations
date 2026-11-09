# Worklog

## 2026-11-09

- Working directory: new repo `nv-people-operations` (cloud workspace, synced into `NEXT-VENTURES/nv-people-operations` on the candidate's computer). Separate from any EraCare checkout.
- Inputs: `Claude_HRIS_Build_Pack.md` present; assessment PDF not present → pack used as spec.
- Donor review: cloned `randev0/eracare-platform` read-only at `1db0431`. Resolved donor versions: next 16.1.1, react 19.2.3, prisma/@prisma/client 5.22.0, zod 4.3.5, iron-session 8.0.4, bcryptjs 3.0.3, tailwindcss 3.4.1, @anthropic-ai/sdk 0.74.0, typescript 5.9.3. Donor has no LICENSE file. `dialog/select/dropdown-menu` import `@/components/ConsoleOverlay` (must be removed when adapting). Donor lists both `tailwindcss@3` and `@tailwindcss/postcss@4` but `postcss.config.js` uses the v3 plugin; only v3 will be used.
- Environment finding: `npm view next version` → `403 on a server you do not have access to`; agent proxy status shows `connect_rejected ... registry.npmjs.org:443`. Same 403 from the VM on the candidate's computer. GitHub clone over HTTPS works. PostgreSQL 16 server binaries are available in the cloud workspace. This is an environment/egress restriction, not an application bug; reported to candidate as a blocker.
- Phase 1 (partial, pre-install): wrote `prisma/schema.prisma`, pure modules (`state-machine.ts`, `dates.ts`, `dependencies.ts`), `permissions.ts`, `errors.ts`. Unit tests use Node's built-in `node:test` runner via the globally available `tsx` (no registry access needed): `tsx --test tests/unit/*.test.ts` → 19 pass, 0 fail. Decision: keep `node:test` for unit/integration tests (removes Vitest from the dependency set).
