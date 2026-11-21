#!/bin/bash
set -euo pipefail
if [ ! -f /data/events.json ]; then
  mkdir -p /data
  printf '%s\n' '{"events":{},"signups":{}}' > /data/events.json
fi
node index.js --deploy
exec node index.js
