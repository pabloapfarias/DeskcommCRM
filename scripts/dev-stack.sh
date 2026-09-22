#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"

if [ ! -f .env ]; then
  echo ".env não encontrado em $ROOT_DIR" >&2
  exit 1
fi

if [ ! -x node_modules/.bin/next ] || [ ! -x node_modules/.bin/tsx ]; then
  echo "Dependências ausentes. Execute: pnpm install --frozen-lockfile" >&2
  exit 1
fi

exec docker compose \
  -f docker-compose.prod.yml \
  -f docker-compose.supabase-network.yml \
  -f docker-compose.dev.yml \
  up -d --build --no-deps app worker
