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
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESK="$(dirname "$HERE")"
MIG="${DESK_MIGRATION:-$DESK/supabase/migrate-5-agent.sql}"
TMP="$(mktemp -d)"
PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"
cleanup() { pg_ctl -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"; }
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
