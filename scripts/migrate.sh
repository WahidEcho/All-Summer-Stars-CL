#!/usr/bin/env bash
# Apply every migration in order against the Supabase database.
#
#   npm run migrate
#
# Reads SUPABASE_DB_URL from .env.local. Use the session-pooler connection
# string (aws-1-<region>.pooler.supabase.com:5432) — the direct db.<ref> host is
# IPv6-only and will not resolve on most networks.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  # shellcheck disable=SC1091
  set -a; source .env.local; set +a
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "SUPABASE_DB_URL is not set (see .env.example)" >&2
  exit 1
fi

for file in supabase/migrations/*.sql; do
  echo "→ applying $(basename "$file")"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$file"
done

echo "✓ migrations applied"
