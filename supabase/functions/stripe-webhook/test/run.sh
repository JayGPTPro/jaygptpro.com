#!/usr/bin/env bash
# Runs the REAL webhook handler against an in-memory database.
# Covers the launch-day cases: returning customer, Stripe replay, welcome-send failure,
# a swapped payment link, and that Donna's evergreen path still works.
#   ./run.sh          test the current index.ts
#   ./run.sh HEAD     test the committed version instead (should fail: proves the tests bite)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
SRC=../index.ts
if [ "${1:-}" != "" ]; then
  git -C ../../../.. show "$1:supabase/functions/stripe-webhook/index.ts" > .orig.ts
  SRC=.orig.ts
fi
sed -e 's|import "jsr:@supabase/functions-js/edge-runtime.d.ts";||' \
    -e 's|import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";|import { createClient } from "./stub_supabase.ts";\ntype SupabaseClient = any;|' \
    -e 's|import Stripe from "https://esm.sh/stripe@17?target=deno";|import Stripe from "./stub_stripe.ts";|' \
    "$SRC" > index.ts
deno run --allow-net --allow-env --no-check run_test.ts
