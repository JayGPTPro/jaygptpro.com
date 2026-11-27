// Content Desk agent endpoint, deployed to the "jaygptpro-team" project (NOT the challenge project)
// with --no-verify-jwt: it checks its own secret header instead of a user's sign-in.
// Lives outside supabase/functions on purpose, like desk-ai.
//
// Secrets: DESK_AGENT_TOKEN (set by Jay, at least 32 characters). SUPABASE_DB_URL is provided
// to every edge function by the platform.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.4";
import { handle } from "./handler.ts";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2 });

Deno.serve((req) => handle(req, { token: Deno.env.get("DESK_AGENT_TOKEN") ?? "", sql }));
