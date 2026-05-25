#!/bin/sh
set -e
sleep 2
RESPONSE=$(wget -qO- --post-data= \
  --header="Authorization: Bearer $CRON_SECRET" \
  http://web:3000/api/cron/plan-month)
echo "plan-month: $RESPONSE" >&2
