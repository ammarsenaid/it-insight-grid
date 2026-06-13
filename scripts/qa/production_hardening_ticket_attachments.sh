#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
sql="$root/supabase/pending/20260611020000_ticket_attachments.sql"
dbqa="$root/supabase/pending/20260611020000_ticket_attachments.qa.sql"
frontend="$root/src/lib/service-desk/attachments.ts"
status="$root/docs/PRODUCTION_HARDENING_STATUS.md"

python3 - "$sql" "$dbqa" "$frontend" "$status" <<'PY'
from pathlib import Path
import sys

sql = Path(sys.argv[1]).read_text(encoding="utf-8")
qa = Path(sys.argv[2]).read_text(encoding="utf-8")
frontend = Path(sys.argv[3]).read_text(encoding="utf-8")
status = Path(sys.argv[4]).read_text(encoding="utf-8")

def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(f"ASSERTION FAILED: {message}")

require(
    "unique (id, ticket_id)" in sql,
    "ticket_comments must expose the composite referenced key",
)
require(
    sql.index("drop constraint if exists ticket_attachments_comment_ticket_fkey")
    < sql.index("drop constraint if exists ticket_comments_id_ticket_id_key"),
    "dependent attachment foreign key must be dropped before the referenced key",
)
require(
    "foreign key (comment_id, ticket_id)" in sql
    and "references public.ticket_comments(id, ticket_id)" in sql,
    "ticket attachments must bind comment_id and ticket_id together",
)
require(
    "on delete set null (comment_id)" in sql,
    "comment deletion must preserve the attachment ticket binding",
)
require(
    "ticket_attachments_storage_path_matches_ticket" in sql
    and "split_part(storage_path, '/', 1) = ticket_id::text" in sql,
    "metadata storage paths must remain bound to ticket_id",
)
require(
    "metadata.ticket_id::text = split_part(name, '/', 1)" in sql,
    "storage reads must remain aligned with metadata ticket paths",
)

for expected in (
    "Valid same-ticket comment attachment was not accepted",
    "Ticket-only attachment with null comment_id was not accepted",
    "Cross-ticket comment attachment INSERT MUST be rejected",
    "Cross-ticket comment attachment UPDATE MUST be rejected",
    "Deleting a comment MUST preserve its attachment with null comment_id",
    "Requester leaked internal metadata",
    "Requester leaked internal storage object",
    "Uploader could not delete metadata",
):
    require(expected in qa, f"attachment QA must include: {expected}")

require(
    "comment_id" in frontend and "ticket_id" in frontend,
    "frontend attachment mapping must retain ticket and comment identifiers",
)
require(
    "## Milestone 17 - Comment Attachment Ticket Binding" in status,
    "P06 milestone must exist in hardening status document",
)

print("Ticket attachment binding assertions passed.")
PY
