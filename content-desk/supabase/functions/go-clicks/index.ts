// Source-link click logger, deployed to the "jaygptpro-team" project (NOT the challenge project)
// with --no-verify-jwt: the /go/ pages send a beacon without any key.
// No secret to set: the visitor hash salt falls back to the database URL, which is secret.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import postgres from "npm:postgres@3.4.4";
import { handle, pgInsert } from "./handler.ts";

const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
const sql = postgres(dbUrl, { prepare: false, max: 2 });
const salt = Deno.env.get("GO_CLICKS_SALT") || dbUrl;

Deno.serve((req) => handle(req, { salt, insert: pgInsert(sql) }));
