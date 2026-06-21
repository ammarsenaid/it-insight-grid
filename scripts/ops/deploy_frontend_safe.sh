#!/usr/bin/env bash
set -Eeuo pipefail

readonly expected_root="/opt/it-knowledge-center/app"
readonly local_base_url="http://127.0.0.1:3000"
readonly service_name="itkc-frontend"

section() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  printf '\nERROR: deployment failed at line %s: %s\n' "$1" "$2" >&2
  exit "$exit_code"
}

trap 'on_error "$LINENO" "$BASH_COMMAND"' ERR

section "Deployment preflight"

[[ "$(pwd -P)" == "$expected_root" ]] ||
  fail "Run this script from $expected_root."

[[ "$(git rev-parse --show-toplevel)" == "$expected_root" ]] ||
  fail "The current directory is not the expected Git repository."

[[ "$(git branch --show-current)" == "main" ]] ||
  fail "Frontend deployments must run from the main branch."

[[ -z "$(git status --porcelain --untracked-files=normal)" ]] ||
  fail "The working tree must be clean before deployment."

[[ -n "${PUBLIC_BASE_URL:-}" ]] ||
  fail "Set PUBLIC_BASE_URL to the production frontend origin (for example, https://itkc.example.com)."

case "$PUBLIC_BASE_URL" in
  http://* | https://*) ;;
  *) fail "PUBLIC_BASE_URL must start with http:// or https://." ;;
esac

readonly public_base_url="${PUBLIC_BASE_URL%/}"

section "Synchronize deployment source"
git fetch origin main

local_head=$(git rev-parse HEAD)
origin_head=$(git rev-parse refs/remotes/origin/main)
[[ "$local_head" == "$origin_head" ]] ||
  fail "Local HEAD ($local_head) does not equal origin/main ($origin_head)."

section "Verify prohibited files are absent"
risky_files=(
  "src/integrations/supabase/auth-attacher.ts"
  "src/integrations/supabase/auth-middleware.ts"
  "src/integrations/supabase/client.server.ts"
  "src/integrations/supabase/types.ts"
  "supabase/config.toml"
  "src/lib/page-visibility.ts"
)

for file in "${risky_files[@]}"; do
  [[ ! -e "$file" ]] || fail "Risky Lovable file must be absent: $file"
done

section "Run production checks"
scripts/qa/production_hardening_admin_roles.sh
git diff --check
bunx tsc --noEmit

section "Build and restart frontend"
bun run build
sudo systemctl restart "$service_name"

section "Verify restarted frontend"
sleep 5
systemctl is-active "$service_name"

check_url() {
  local label=$1
  local url=$2

  printf 'Checking %s: %s\n' "$label" "$url"
  curl \
    --fail \
    --silent \
    --show-error \
    --location \
    --max-time 20 \
    --retry 3 \
    --retry-delay 2 \
    --output /dev/null \
    "$url"
}

fetch_html() {
  local label=$1
  local url=$2
  local output_file=$3

  printf 'Fetching %s HTML: %s\n' "$label" "$url"
  curl \
    --fail \
    --silent \
    --show-error \
    --location \
    --max-time 20 \
    --retry 3 \
    --retry-delay 2 \
    --output "$output_file" \
    "$url"
}

extract_asset_references() {
  local html_file=$1
  local -n output=$2

  mapfile -t output < <(
    grep -aEo '/assets/[A-Za-z0-9._/-]+\.(js|css)(\?[^"'"'"'<>[:space:]]*)?' "$html_file" |
      sed 's/?[^?]*$//' |
      sort -u
  )
}

verify_local_assets() {
  local -n assets=$1

  (( ${#assets[@]} > 0 )) ||
    fail "Local frontend HTML did not reference any JavaScript or CSS assets."

  for asset in "${assets[@]}"; do
    local asset_path="dist/client/${asset#/}"
    [[ -f "$asset_path" ]] || fail "Referenced local asset is missing: $asset_path"
    printf 'Found local asset: %s\n' "$asset_path"
  done
}

verify_public_assets() {
  local -n assets=$1

  (( ${#assets[@]} > 0 )) ||
    fail "Public frontend HTML did not reference any JavaScript or CSS assets."

  for asset in "${assets[@]}"; do
    check_url "public asset" "$public_base_url$asset"
  done
}

check_url "local root" "$local_base_url/"
check_url "local admin roles" "$local_base_url/admin/roles"
check_url "public root" "$public_base_url/"
check_url "public admin roles" "$public_base_url/admin/roles"

section "Verify HTML asset references"
local_html_file=$(mktemp)
public_html_file=$(mktemp)
trap 'rm -f "$local_html_file" "$public_html_file"' EXIT

fetch_html "local root" "$local_base_url/" "$local_html_file"
fetch_html "public root" "$public_base_url/" "$public_html_file"

local_assets=()
public_assets=()
extract_asset_references "$local_html_file" local_assets
extract_asset_references "$public_html_file" public_assets

verify_local_assets local_assets
verify_public_assets public_assets

section "Deployment successful"
printf 'Frontend build, restart, route checks, %d local asset checks, and %d public asset checks passed.\n' \
  "${#local_assets[@]}" "${#public_assets[@]}"
