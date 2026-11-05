import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.4";
import { type Decision, handle } from "./handler.ts";

// Talks to Postgres directly (SUPABASE_DB_URL is provided to every edge function), so the two
// tables can create themselves: nobody has to run SQL by hand for this feature.
const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });

let ready: Promise<unknown> | null = null;
function ensureTables() {
  ready ||= sql.begin(async (tx) => {
    await tx`CREATE TABLE IF NOT EXISTS archive_reactions (
      post text NOT NULL, visitor text NOT NULL, emoji text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (post, visitor))`;
    await tx`CREATE TABLE IF NOT EXISTS archive_decisions (
      post text PRIMARY KEY, decision text NOT NULL CHECK (decision IN ('hide', 'show')),
      updated_at timestamptz NOT NULL DEFAULT now())`;
    // reached only through this function; keep the public REST API off them
    await tx`ALTER TABLE archive_reactions ENABLE ROW LEVEL SECURITY`;
    await tx`ALTER TABLE archive_decisions ENABLE ROW LEVEL SECURITY`;
  }).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

Deno.serve(async (req) => {
  await ensureTables();
  return handle(req, {
    reactions: () => sql`SELECT post, emoji, count(*)::int AS n FROM archive_reactions GROUP BY post, emoji` as never,
    decisions: () => sql`SELECT post, decision FROM archive_decisions` as never,
    visitorCount: async (visitor) => (await sql`SELECT count(*)::int AS n FROM archive_reactions WHERE visitor = ${visitor}`)[0].n,
    setReaction: async (post, visitor, emoji) => {
      if (emoji === null) await sql`DELETE FROM archive_reactions WHERE post = ${post} AND visitor = ${visitor}`;
      else {
        await sql`INSERT INTO archive_reactions (post, visitor, emoji) VALUES (${post}, ${visitor}, ${emoji})
          ON CONFLICT (post, visitor) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now()`;
      }
    },
    setDecision: async (post, decision: Decision | null) => {
      if (decision === null) await sql`DELETE FROM archive_decisions WHERE post = ${post}`;
      else {
        await sql`INSERT INTO archive_decisions (post, decision) VALUES (${post}, ${decision})
          ON CONFLICT (post) DO UPDATE SET decision = EXCLUDED.decision, updated_at = now()`;
      }
    },
  });
});
