#!/bin/sh
# fix-migrations.sh
# Run this ONCE inside the api container to fix the P3009 blocked migration.
#
# Usage (from /backend directory):
#   docker compose -f docker-compose.yml -f docker-compose.dev.yml exec api sh fix-migrations.sh

set -e

echo "[1/2] Resolving failed migration 20260427000200_refresh_token_expires_at ..."
npx prisma migrate resolve \
  --rolled-back 20260427000200_refresh_token_expires_at \
  --schema prisma/schema.prisma

echo "[2/2] Deploying all pending migrations ..."
npx prisma migrate deploy --schema prisma/schema.prisma

echo "✅ Done. You can now run: npm run db:seed"
