# Repository Engineering Rules

These rules apply to every change in this repository.

## Safety Boundaries

- Work only inside this repository.
- Do not use `sudo`, Docker, network access, deployment commands, database
  connections, or migration execution without explicit human review.
- Do not read `.env` files, credentials, secrets, private keys, or similarly
  sensitive local configuration.
- Do not use destructive Git commands. Preserve unrelated and pre-existing
  working-tree changes.
- SQL under `supabase/pending/` is staged for later manual review and apply.
  Static inspection is allowed; applying or testing it against a database is not.

## Change Discipline

- Keep each change limited to one production-hardening milestone.
- Inspect the relevant implementation, authorization rules, and callers before
  editing.
- Prefer the smallest fix that closes the identified failure mode.
- Add or update focused tests or static QA assertions with every behavior change.
- Repair validation failures caused by the milestone before starting another.
- Update `docs/PRODUCTION_HARDENING_STATUS.md` after every milestone.
- Do not edit generated files such as `src/routeTree.gen.ts` by hand.
- Preserve the TanStack Start file-routing conventions in `src/routes/README.md`.

## Safe Local Validation

- Use repository-local tools and already-installed dependencies only.
- Safe default checks are `bun run lint`, `bunx tsc --noEmit`, and
  `bun run build` when they do not require network or external services.
- SQL validation is limited to static review unless a human explicitly approves
  database access and migration execution.
- Never run formatting across the whole repository for a scoped milestone; format
  only touched files when needed.

## Security Expectations

- Enforce authorization at the data boundary, not only in the UI.
- Keep storage-object authorization consistent with metadata-row authorization.
- Validate identifiers and object paths structurally before casts or lookups.
- Bind cross-resource identifiers with constraints or policy checks where the
  relationship is security-relevant.
- Avoid exposing internal error details, credentials, or private object URLs.
