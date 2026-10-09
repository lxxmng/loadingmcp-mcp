#!/usr/bin/env bash
# Smoke-test a running LoadingMCP server with the public demo key (no upstream API needed).
# Usage: scripts/smoke.sh [base-url]   (default http://localhost:3002)
set -euo pipefail
BASE="${1:-http://localhost:3002}"
KEY="${MCP_DEMO_API_KEY:-lmcp_demo_public}"

curl -fsS "$BASE/health" >/dev/null && echo "ok /health"

call() { # $1 = JSON-RPC body; prints the tool's text payload
  curl -fsS "$BASE/mcp" \
    -H "Authorization: Bearer $KEY" \
    -H 'content-type: application/json' \
    -H 'accept: application/json, text/event-stream' \
    -d "$1" | sed -n 's/^data: //p'
}

call '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -q '"plan_load"' && echo "ok tools/list"

out=$(call '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"suggest_containers","arguments":{"volumeM3":48,"weightKg":19000}}}')
echo "$out" | grep -q '1 x 40HC' && echo "ok suggest_containers"
echo "$out" | grep -q '76.35' && echo "ok 40HC internal volume = 76.35 m3"

call '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"plan_load","arguments":{"items":[{"id":"A","length":1200,"width":800,"height":1000,"weight":300,"quantity":40}]}}}' \
  | grep -q 'offline-preview' && echo "ok plan_load"

echo "smoke test passed"
