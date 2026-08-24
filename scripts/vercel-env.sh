#!/usr/bin/env bash
# Push the environment variables from .env.local up to Vercel.
#
#   vercel login          # once, interactive
#   vercel link           # once, pick the swanlake-football-stars project
#   npm run vercel:env
#
# Secrets are read from .env.local and piped straight to Vercel, so nothing has
# to be pasted by hand. NEXT_PUBLIC_SITE_URL is overridden to the production
# origin — the QR must never point at localhost or a preview deployment.

set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo ".env.local not found — nothing to upload." >&2
  exit 1
fi

set -a; # shellcheck disable=SC1091
source .env.local; set +a

SITE_URL="${1:-https://swanlake-football-stars.vercel.app}"

push() {
  local key="$1" value="$2"
  for env in production preview development; do
    # Remove any existing value first so re-running is safe.
    vercel env rm "$key" "$env" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | vercel env add "$key" "$env" >/dev/null
  done
  echo "  ✓ $key"
}

echo "Pushing environment to Vercel (production, preview, development):"
push NEXT_PUBLIC_SUPABASE_URL      "$NEXT_PUBLIC_SUPABASE_URL"
push NEXT_PUBLIC_SUPABASE_ANON_KEY "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
push SUPABASE_SERVICE_ROLE_KEY     "$SUPABASE_SERVICE_ROLE_KEY"
push NEXT_PUBLIC_EVENT_SLUG        "$NEXT_PUBLIC_EVENT_SLUG"
push NEXT_PUBLIC_SITE_URL          "$SITE_URL"

echo
echo "Done. Redeploy so the new values take effect:"
echo "  vercel --prod"
