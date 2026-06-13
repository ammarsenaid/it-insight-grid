#!/usr/bin/env bash
set -euo pipefail

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
source_file="$root/src/lib/knowledge/attachments.ts"

storage_line=$(rg -n 'const storageDelete = await sb\.storage' "$source_file" | cut -d: -f1)
metadata_line=$(rg -n 'sb\.from\("knowledge_attachments"\)\.delete\(\)' "$source_file" | cut -d: -f1)

test -n "$storage_line"
test -n "$metadata_line"
test "$storage_line" -lt "$metadata_line"
rg -q 'if \(storageDelete\.error\)' "$source_file"
! rg -q 'pointer row is already gone' "$source_file"

printf 'Knowledge attachment deletion assertions passed.\n'
