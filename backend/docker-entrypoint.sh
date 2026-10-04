#!/bin/sh
# Start the API. By default this first brings the database schema up to date, so a deploy that
# adds a column cannot start serving code that expects it before it exists.
# Set RUN_MIGRATIONS=false to skip (used by the CI smoke test, which has no database).
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying database migrations..."
  alembic upgrade head
fi

# `exec` makes uvicorn the main process, so the platform's stop signal reaches it and it shuts
# down cleanly. --proxy-headers: behind a host's load balancer the app must trust the forwarded
# scheme/address (HTTPS), or it would think every request is plain HTTP. '*' is acceptable here
# because the container is only reachable through the platform's own proxy.
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --proxy-headers \
  --forwarded-allow-ips='*'
