#!/bin/sh
set -e
sleep 2
RESPONSE=$(wget -qO- --post-data= \
  --header="Authorization: Bearer $CRON_SECRET" \
  http://web:3000/api/cron/execute-due)
echo "execute-due: $RESPONSE" >&2
