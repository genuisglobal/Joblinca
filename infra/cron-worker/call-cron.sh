#!/bin/sh
# Calls a Joblinca cron API route with Bearer auth.
# Usage: call-cron.sh /api/cron/job-cleanup

# crond doesn't inherit container env vars — source them
if [ -f /app/.env.cron ]; then
  . /app/.env.cron
fi

ROUTE="$1"

if [ -z "$APP_URL" ]; then
  echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] ERROR: APP_URL is not set"
  exit 1
fi

if [ -z "$CRON_SECRET" ]; then
  echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] ERROR: CRON_SECRET is not set"
  exit 1
fi

URL="${APP_URL}${ROUTE}"
echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] Calling ${ROUTE}..."

HTTP_CODE=$(curl -s -o /tmp/cron-response.json -w "%{http_code}" \
  --max-time 120 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "$URL")

if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] OK ${HTTP_CODE} ${ROUTE}"
else
  echo "[$(date -u '+%Y-%m-%d %H:%M:%S UTC')] FAIL ${HTTP_CODE} ${ROUTE}"
  cat /tmp/cron-response.json 2>/dev/null
  echo ""
fi
