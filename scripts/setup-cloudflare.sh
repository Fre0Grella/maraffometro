#!/usr/bin/env bash
# One-time setup of everything Maraffometro needs on Cloudflare and GitHub.
# Safe to run again: it reuses what already exists.
#
#   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
#   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
#   bash scripts/setup-cloudflare.sh
#
# Anything not in the environment is asked for. It then:
#   1. creates the D1 database and writes its id into backend/wrangler.jsonc
#   2. creates the Pages project and writes its URL into backend/wrangler.jsonc
#   3. stores the secrets in the GitHub repository and turns deploys on
#   4. offers to commit and push, which triggers the first deploy
#
# Needs: node, npm deps installed (npm ci), curl, and gh signed in.
set -euo pipefail
cd "$(dirname "$0")/.."

DB_NAME="maraffometro-db"
PAGES_PROJECT="maraffometro"
WRANGLER_CONFIG="backend/wrangler.jsonc"

ask() { # name, prompt, secret?
  local name="$1" prompt="$2" secret="${3:-}"
  if [ -z "${!name:-}" ]; then
    if [ -n "$secret" ]; then read -rsp "$prompt: " "$name"; echo; else read -rp "$prompt: " "$name"; fi
  fi
  export "$name"
}

ask CLOUDFLARE_API_TOKEN "Cloudflare API token" secret
ask CLOUDFLARE_ACCOUNT_ID "Cloudflare account id"
ask GOOGLE_CLIENT_ID "Google OAuth client id"
ask GOOGLE_CLIENT_SECRET "Google OAuth client secret" secret

cf() { # method, path, [json body]
  curl -sS -X "$1" "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}$2" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" ${3:+--data "$3"}
}
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);const v=($1);if(v===undefined||v===null)process.exit(1);console.log(v)})"; }

echo "→ D1 database"
DB_ID="$(cd backend && npx wrangler d1 list --json 2>/dev/null | json "j.find(d=>d.name==='$DB_NAME')?.uuid" || true)"
if [ -z "$DB_ID" ]; then
  (cd backend && npx wrangler d1 create "$DB_NAME" >/dev/null)
  DB_ID="$(cd backend && npx wrangler d1 list --json | json "j.find(d=>d.name==='$DB_NAME')?.uuid")"
fi
echo "  $DB_NAME = $DB_ID"

echo "→ Pages project"
if ! cf GET "/pages/projects/$PAGES_PROJECT" | json "j.success ? 1 : undefined" >/dev/null; then
  cf POST "/pages/projects" "{\"name\":\"$PAGES_PROJECT\",\"production_branch\":\"main\"}" | json "j.success ? 1 : (console.error(JSON.stringify(j.errors)), undefined)" >/dev/null \
    || { echo "  could not create the Pages project"; exit 1; }
fi
# pages.dev names are global: if "maraffometro" was taken, Cloudflare picked another.
SUBDOMAIN="$(cf GET "/pages/projects/$PAGES_PROJECT" | json "j.result.subdomain")"
FRONTEND_URL="https://$SUBDOMAIN"
echo "  $FRONTEND_URL"

echo "→ $WRANGLER_CONFIG"
node -e '
  const fs = require("fs");
  const [file, dbId, url] = process.argv.slice(1);
  let s = fs.readFileSync(file, "utf8");
  // Only the production (top-level) entries, which come before "env".
  const [top, rest] = [s.slice(0, s.indexOf("\"env\"")), s.slice(s.indexOf("\"env\""))];
  const patched = top
    .replace(/"database_id": "[^"]*"/, `"database_id": "${dbId}"`)
    .replace(/"FRONTEND_URL": "[^"]*"/, `"FRONTEND_URL": "${url}"`);
  fs.writeFileSync(file, patched + rest);
' "$WRANGLER_CONFIG" "$DB_ID" "$FRONTEND_URL"

echo "→ GitHub secrets"
JWT_SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("base64url"))')"
for name in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  printf '%s' "${!name}" | gh secret set "$name"
done
# Keep an existing JWT secret: replacing it signs everyone out.
if ! gh secret list | grep -q '^JWT_SECRET'; then printf '%s' "$JWT_SECRET" | gh secret set JWT_SECRET; fi
gh variable set DEPLOY_ENABLED --body true

cat <<EOF

Done. In the Google Cloud console, the OAuth client needs these
"Authorized redirect URIs":

  $FRONTEND_URL/auth/google
  http://localhost:5173/auth/google

EOF

if ! git diff --quiet -- "$WRANGLER_CONFIG"; then
  read -rp "Commit and push $WRANGLER_CONFIG to deploy now? [y/N] " yn
  if [ "$yn" = "y" ] || [ "$yn" = "Y" ]; then
    git add "$WRANGLER_CONFIG"
    git commit -m "chore(deploy): point to the Cloudflare resources"
    git push
    echo "Pushed: the deploy runs in GitHub Actions."
  fi
else
  echo "Nothing to commit. Re-run the workflow to deploy: gh workflow run ci.yml"
fi
