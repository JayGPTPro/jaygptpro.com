// Serves the real desk-agent handler on localhost for tests/run.sh, so Chandler's client can be
// tested end to end against it. Env: DB (postgres url), PORT, TOKEN.
import postgres from "npm:postgres@3.4.4";
import { handle } from "../supabase/functions/desk-agent/handler.ts";

const sql = postgres(Deno.env.get("DB")!, { prepare: false, max: 2, onnotice: () => {} });
Deno.serve(
  { port: Number(Deno.env.get("PORT")), hostname: "127.0.0.1", onListen: () => console.log("listening") },
  (req) => handle(req, { token: Deno.env.get("TOKEN")!, sql }),
);
