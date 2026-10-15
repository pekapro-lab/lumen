#!/bin/sh
set -eu
cd /workspace
# :8081 is QA-only — a revive must never inherit a stale built-output preview.
node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
# Preview-only: if the platform did not inject XAI_API_KEY, reuse the workspace
# Grok session so Imagine can reach the API. Deployed apps get the key from the
# platform and never run this script.
if [ -z "${XAI_API_KEY:-}" ] && [ -f /root/.grok/auth.json ]; then
  XAI_API_KEY=$(python3 -c 'import json,sys; p="/root/.grok/auth.json"
try:
 d=json.load(open(p)); k=(next(iter(d.values())).get("key") or "").strip(); print(k)
except Exception:
 print("")')
  if [ -n "$XAI_API_KEY" ]; then
    export XAI_API_KEY
  fi
fi
npm run dev >>/tmp/app-startup.log 2>&1 &
