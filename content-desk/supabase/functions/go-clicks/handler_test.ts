// The source-link logger: the real handler, its real insert against the local Postgres from
// content-desk/tests/run.sh (DESK_TEST_DB_URL), and the /go/ pages it serves.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { handle, pgInsert, SOURCES } from "./handler.ts";

const DB = Deno.env.get("DESK_TEST_DB_URL");
const sql = DB ? postgres(DB, { prepare: false, max: 2, onnotice: () => {} }) : (null as never);
const dbTest = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name: `go-clicks: ${name}`, ignore: !DB, sanitizeOps: false, sanitizeResources: false, fn });

const BROWSER = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
function beacon(body: unknown, ua = BROWSER, ip = "203.0.113.7") {
  return new Request("http://x/", {
    method: "POST",
    headers: { "content-type": "text/plain", "user-agent": ua, "x-forwarded-for": `${ip}, 10.0.0.1` },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

dbTest("a click from a /go/ page lands in go_clicks with its source", async () => {
  await sql`truncate public.go_clicks`;
  const deps = { salt: "salt", insert: pgInsert(sql) };
  const res = await handle(beacon({ s: "ig", r: "https://www.instagram.com/p/abc?utm=1", p: 0 }), deps);
  assertEquals(res.status, 200);
  await handle(beacon({ s: "TT", r: "", p: 1 }, "facebookexternalhit/1.1"), deps);
  const rows = await sql`select src, ref_domain, is_bot, is_repeat, visitor_hash from public.go_clicks order by id`;
  assertEquals(rows.map((r) => [r.src, r.ref_domain, r.is_bot, r.is_repeat]), [
    ["ig", "instagram.com", false, false],
    ["tt", null, true, true],
  ]);
  assertMatch(rows[0].visitor_hash, /^[0-9a-f]{16}$/);
});

dbTest("hiring codes and unknown sources are refused and write nothing", async () => {
  await sql`truncate public.go_clicks`;
  const deps = { salt: "salt", insert: pgInsert(sql) };
  for (const s of ["whatsapp-group", "join-jaygpt", "jaygpt-community", "ai-alerts", "zz-test", "", "tiktok"]) {
    assertEquals((await handle(beacon({ s }), deps)).status, 404, s);
  }
  assertEquals(Number((await sql`select count(*) as n from public.go_clicks`)[0].n), 0);
});

dbTest("close the test connection", async () => {
  await sql.end();
});

Deno.test("go-clicks: the visitor hash changes with the day and never holds the address", async () => {
  const rows: Array<{ visitor_hash: string | null }> = [];
  const at = (d: string) => ({ salt: "salt", insert: async (r: { visitor_hash: string | null }) => void rows.push(r), now: () => new Date(d) });
  await handle(beacon({ s: "yt" }), at("2026-11-26T08:00:00Z"));
  await handle(beacon({ s: "yt" }), at("2026-11-26T20:00:00Z"));
  await handle(beacon({ s: "yt" }), at("2026-11-27T08:00:00Z"));
  assertEquals(rows[0].visitor_hash, rows[1].visitor_hash);
  assert(rows[0].visitor_hash !== rows[2].visitor_hash);
  assert(!JSON.stringify(rows).includes("203.0.113.7"));
});

Deno.test("go-clicks: a tap inside the LinkedIn, X or Instagram app is a person; preview fetchers are bots", async () => {
  const seen: Array<{ is_bot: boolean }> = [];
  const deps = { salt: "s", insert: async (r: { is_bot: boolean }) => void seen.push(r) };
  const people = [
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.1",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.70",
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 Instagram 350.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/480.0]",
  ];
  const bots = ["LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)", "Twitterbot/1.0",
    "WhatsApp/2.24.21.80 A", "TelegramBot (like TwitterBot)", "facebookexternalhit/1.1", "Slackbot-LinkExpanding 1.0", "curl/8.4.0"];
  for (const ua of [...people, ...bots]) await handle(beacon({ s: "li" }, ua), deps);
  assertEquals(seen.map((r) => r.is_bot), [...people.map(() => false), ...bots.map(() => true)]);
});

Deno.test("go-clicks: bad bodies, other methods, and a failed write", async () => {
  const deps = { salt: "s", insert: async () => {} };
  assertEquals((await handle(beacon("not json"), deps)).status, 400);
  assertEquals((await handle(new Request("http://x/"), deps)).status, 405);
  assertEquals((await handle(new Request("http://x/", { method: "OPTIONS" }), deps)).status, 204);
  const broken = { salt: "s", insert: () => Promise.reject(new Error("db down")) };
  assertEquals((await handle(beacon({ s: "li" }), broken)).status, 500);
});

// The pages and the function must agree: one page per source, each sending its own code to
// this function (not the hiring logger) and the visitor to the current English invite.
const GO = new URL("../../../../go/", import.meta.url);
const INVITE = "https://chat.whatsapp.com/Gm2pNDTmvjJLLsMLI8gxaR";
const LOGGER = "https://sjdcvjunibwxkwqzjitw.supabase.co/functions/v1/go-clicks";

Deno.test("go-clicks: every source has a page, and every page logs its own source here", async () => {
  const dirs: string[] = [];
  for await (const e of Deno.readDir(GO)) if (e.isDirectory) dirs.push(e.name);
  assertEquals(dirs.sort(), [...SOURCES].sort());
  for (const src of dirs) {
    const html = await Deno.readTextFile(new URL(`${src}/index.html`, GO));
    assert(html.includes(`s:"${src}"`), `${src}: sends its own code`);
    assert(html.includes(`D="${INVITE}"`) && html.includes(`url=${INVITE}"`) && html.includes(`href="${INVITE}"`), `${src}: goes to the current invite`);
    assert(html.includes(`U="${LOGGER}"`), `${src}: logs to go-clicks`);
    assert(!html.includes("hiring-links") && !html.includes("ILX65"), `${src}: nothing from the hiring links or the old invite`);
    assert(html.includes('name="robots" content="noindex, nofollow"'), `${src}: kept out of search`);
  }
});
