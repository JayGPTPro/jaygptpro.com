#!/usr/bin/env bash
# Runs every Content Desk test against a throwaway local Postgres. Nothing touches Supabase.
#   content-desk/tests/run.sh
# Needs postgres 16 (brew install postgresql@16) and deno.
#
# 1. The live path: schema.sql as it was before migration 5, then migrate-5 twice.
# 2. The rebuild path: schema.sql alone (it carries every migration).
# On both, guards_test.sql checks the writer rules. Then the Deno tests run the real
# desk-agent and go-clicks handlers against the first database.
#
# DESK_MIGRATION=/path/to/changed.sql runs the live path with another migration file,
# to watch a test fail when its rule is taken out.
# DESK_CLIENT=/path/to/desk.py also runs Chandler's client against the real handler over HTTP.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESK="$(dirname "$HERE")"
MIG="${DESK_MIGRATION:-$DESK/supabase/migrate-5-agent.sql}"
TMP="$(mktemp -d)"
free_port() { python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }
PORT="$(free_port)"
SERVER=""
cleanup() {
  if [ -n "$SERVER" ]; then kill "$SERVER" 2>/dev/null || true; fi
  pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

export LC_ALL=C  # macOS: postgres refuses to start without a valid locale
initdb -U postgres --auth=trust -E UTF8 --locale=C -D "$TMP/data" >/dev/null
pg_ctl -D "$TMP/data" -l "$TMP/log" -o "-p $PORT -k $TMP -c listen_addresses=127.0.0.1" -w start >/dev/null || { cat "$TMP/log"; exit 1; }

psql_quiet() { PGOPTIONS='-c client_min_messages=warning' psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres "$@" >/dev/null; }
run_checks() { psql -X -q -v ON_ERROR_STOP=1 -h 127.0.0.1 -p "$PORT" -U postgres -d "$1" -f "$HERE/guards_test.sql" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'; }

psql_quiet -d postgres -c "create database desk_live" -c "create database desk_fresh"

echo "== live path: schema before migration 5, then $(basename "$MIG") twice"
sed '/===== migration 5/,$d' "$DESK/supabase/schema.sql" > "$TMP/schema-before-5.sql"
psql_quiet -d desk_live -f "$HERE/supabase-stubs.sql" -f "$TMP/schema-before-5.sql"
psql_quiet -d desk_live -f "$MIG"
psql_quiet -d desk_live -f "$MIG"
run_checks desk_live

echo "== rebuild path: schema.sql alone"
psql_quiet -d desk_fresh -f "$HERE/supabase-stubs.sql" -f "$DESK/supabase/schema.sql"
run_checks desk_fresh

echo "== edge functions against the live-path database"
DESK_TEST_DB_URL="postgres://postgres@127.0.0.1:$PORT/desk_live" \
  deno test --quiet --permit-no-files --allow-net --allow-env --allow-read "$DESK/supabase/functions"

[ -n "${DESK_CLIENT:-}" ] || exit 0
echo "== Chandler's client ($(basename "$DESK_CLIENT")) against the real handler"
WEB="$(free_port)"
TOKEN="client-test-token-0123456789-0123456789"
DB="postgres://postgres@127.0.0.1:$PORT/desk_live" PORT="$WEB" TOKEN="$TOKEN" \
  deno run --quiet --allow-net --allow-env --allow-read --allow-sys "$HERE/serve_agent.ts" > "$TMP/agent.log" 2>&1 &
SERVER=$!
disown "$SERVER"  # stopped in cleanup; no "Terminated" line
for _ in $(seq 1 50); do grep -q listening "$TMP/agent.log" 2>/dev/null && break; sleep 0.2; done
POST_ID=22222222-2222-2222-2222-222222222222
psql_quiet -d desk_live -c "truncate public.posts cascade" \
  -c "insert into public.posts (id, title, stage, status, author) values ('$POST_ID', 'Ready post', 'ready', 'approved', 'denisa@example.com')"
client() { DESK_AGENT_URL="http://127.0.0.1:$WEB" DESK_AGENT_TOKEN="$TOKEN" python3 "$DESK_CLIENT" "$@" 2>&1; }
posts() { psql -X -tA -h 127.0.0.1 -p "$PORT" -U postgres -d desk_live -c "$1"; }
expect() { if printf '%s' "$2" | grep -qF -- "$3"; then echo "  ok: $1"; else echo "  FAIL: $1"; echo "$2"; exit 1; fi; }
expect "a dry run says so" "$(client add-idea --title 'From the client')" "DRY RUN, nothing written"
expect "and writes nothing" "$(posts "select count(*) from public.posts where title = 'From the client'")" "0"
expect "--apply writes the idea" "$(client add-idea --title 'From the client' --apply)" "Added: idea \"From the client\" [idea/waiting]"
expect "signed as Chandler" "$(posts "select author from public.posts where title = 'From the client'")" "chandler@agent.jaygptpro.com"
expect "a channel version" "$(client add-version $POST_ID --channel linkedin --body 'LinkedIn text' --headline Hook --apply)" "Added: linkedin v1 on \"Ready post\""
expect "show has it" "$(client show $POST_ID)" "--- linkedin v1 by Chandler ---"
expect "cap counts the new idea" "$(client cap)" "Open ideas: 1 / 7 (room for 6)"
expect "the Desk's no comes through" "$(client add-version $POST_ID --channel x --body ' ' --apply || true)" "The Desk said no (400): body is required"
expect "a wrong token is refused" "$(DESK_AGENT_URL="http://127.0.0.1:$WEB" DESK_AGENT_TOKEN=wrong python3 "$DESK_CLIENT" cap 2>&1 || true)" "(401)"
