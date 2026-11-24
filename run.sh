#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ ! -f .dev.vars ]]; then
  echo '.env.example faylini .dev.vars ga nusxalang va haqiqiy auth sozlamalarini kiriting.'
  exit 1
fi
npm ci
npm run build
npx wrangler d1 migrations apply DB --local
exec npx wrangler dev --port 8787
