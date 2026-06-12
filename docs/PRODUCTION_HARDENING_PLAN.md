# Production Hardening Plan

The hardening phase is divided into small milestones. Each milestone is completed
and validated independently so its diff remains reviewable.

## Milestone 1: Ticket Attachments Security Hardening

- Preserve and review the existing NUL-check/path-validation fix.
- Ensure attachment metadata paths are bound to their ticket.
- Keep storage visibility aligned with metadata visibility.
- Enforce the attachment-view permission at both read boundaries.
- Expand the transaction-backed QA script for authorization and path edge cases.
- Run static SQL checks plus the safe TypeScript/lint/build validations available
  locally. Do not connect to a database or execute the migration.

## Milestone 2: Client Attachment Failure Handling

- Review upload and delete ordering for orphaned objects and misleading success.
- Make the smallest client-side reliability fix supported by existing storage RLS.
- Add focused tests if a local test harness exists; otherwise add a deterministic
  static check and document the test gap.

## Milestone 3: Server Error Response Hardening

- Review SSR error handling for information disclosure and response consistency.
- Add focused tests around catastrophic 500 normalization where practical.
- Validate with type checking, linting, and a production build.

## Milestone 4: Production Readiness Baseline

- Review repository scripts and generated/build boundaries.
- Protect common local environment and private-key files from accidental commits.
- Record any remaining production blockers that cannot be safely resolved without
  database, network, Docker, deployment, or secret access.
- Run the complete safe local validation set and publish the next checkpoint.

## Milestone 5: Markdown Link Safety

- Restrict user-authored Markdown links to explicitly allowed protocols.
- Preserve normal relative, HTTPS, HTTP, email, and telephone links.
- Add executable renderer assertions using only the local Bun runtime.
- Keep chart styling and unrelated rich-text behavior outside this milestone.

## Review Gates

Stop for human review before any Docker command, database connection, migration
execution, `sudo`, network access, deployment, destructive Git action, or change
outside this repository.
