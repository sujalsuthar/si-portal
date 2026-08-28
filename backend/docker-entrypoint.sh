#!/bin/sh
set -e

echo "Applying database migrations..."
npx prisma migrate deploy

if [ "$SEED_ON_START" = "true" ]; then
  echo "Seeding demo data..."
  npx prisma db seed || echo "Seed skipped (already applied or failed non-fatally)."
fi

exec "$@"
