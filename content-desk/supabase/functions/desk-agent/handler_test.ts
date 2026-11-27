// Runs the REAL handler against a real Postgres that has the Desk schema and migrations 5, 6 and 7
// (content-desk/tests/run.sh builds one and sets DESK_TEST_DB_URL). No database mock: the
// writer rules under test are the triggers and policies themselves.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { AGENT_EMAIL, asMember, handle } from "./handler.ts";

const DB = Deno.env.get("DESK_TEST_DB_URL");
const TOKEN = "t".repeat(40);
const test = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name: `desk-agent: ${name}`, ignore: !DB, sanitizeOps: false, sanitizeResources: false, fn });

const sql = DB ? postgres(DB, { prepare: false, max: 4, onnotice: () => {} }) : (null as never);
const POST = "00000000-0000-0000-0000-0000000000"; // + 2 hex digits

async function reset() {
  await sql`truncate public.posts cascade`;
  await sql`insert into public.team_members (email, name, role) values
    ('jay@example.com', 'Jay', 'owner'), ('denisa@example.com', 'Denisa', 'writer'),
    (${AGENT_EMAIL}, 'Chandler', 'writer')
    on conflict (email) do update set active = true, role = excluded.role`;
}
// a post as the database owner would insert it (no trigger limits), with ages in days
async function post(id: string, stage: string, status: string, o: { title?: string; daysOld?: number; author?: string; pinned?: string; expires?: string; kind?: string } = {}) {
  const at = new Date(Date.now() - (o.daysOld ?? 0) * 86400000);
  await sql`insert into public.posts (id, title, stage, status, author, created_at, updated_at, pinned_date, expires_on, kind)
    values (${POST + id}, ${o.title ?? `post ${id}`}, ${stage}, ${status}, ${o.author ?? "denisa@example.com"}, ${at}, ${at}, ${o.pinned ?? null}, ${o.expires ?? null}, ${o.kind ?? "text"})`;
}
function call(body: unknown, token = TOKEN, deps: { email?: string } = {}) {
  const req = new Request("http://x/", {
    method: "POST",
    headers: { "x-desk-agent-token": token, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return handle(req, { token: TOKEN, sql, ...deps });
}
async function ok(body: unknown) {
  const res = await call(body);
  const j = await res.json();
  assertEquals(res.status, 200, JSON.stringify(j));
  return j;
}
async function refused(body: unknown, status: number, pattern: RegExp) {
  const res = await call(body);
  const j = await res.json();
  assertEquals(res.status, status, JSON.stringify(j));
  assertMatch(j.error, pattern);
  return j;
}
const count = async (q: string) => Number((await sql.unsafe(q))[0].n);

// ---------- the door ----------
test("no token, a wrong token, or an unset secret are all refused", async () => {
  assertEquals((await call({ action: "list" }, "")).status, 401);
  assertEquals((await call({ action: "list" }, "x".repeat(40))).status, 401);
  const empty = await handle(new Request("http://x/", { method: "POST", headers: { "x-desk-agent-token": "" }, body: "{}" }), { token: "", sql });
  assertEquals(empty.status, 503);
  assertEquals((await handle(new Request("http://x/"), { token: TOKEN, sql })).status, 405);
});

test("a body that is not a JSON object, or an unknown action, is a 400", async () => {
  await refused("not json", 400, /JSON object/);
  await refused([1, 2], 400, /JSON object/);
  await refused({ action: "approve" }, 400, /Unknown action/);
});

test("a member who is no longer active is refused everything", async () => {
  await reset();
  await sql`update public.team_members set active = false where email = ${AGENT_EMAIL}`;
  await refused({ action: "list" }, 403, /not an active member/);
  await refused({ action: "add_idea", title: "x" }, 403, /not an active member/);
  await sql`update public.team_members set active = true where email = ${AGENT_EMAIL}`;
});

test("the session really is a writer: a trigger refuses an approval inside it", async () => {
  await reset();
  await post("d1", "draft", "waiting");
  let error = "";
  try {
    await asMember(sql, AGENT_EMAIL, async (tx) => {
      const [r] = await tx`select current_user as u, public.desk_email() as e`;
      assertEquals([r.u, r.e], ["authenticated", AGENT_EMAIL]);
      await tx`update public.posts set status = 'approved' where id = ${POST + "d1"}`;
    });
  } catch (e) {
    error = (e as Error).message;
  }
  assertMatch(error, /Only the owner/);
  assertEquals(await count(`select count(*) as n from public.posts where status = 'approved'`), 0);
});

// ---------- reads ----------
test("list: live posts newest first, rejected and old published only with all", async () => {
  await reset();
  await post("01", "idea", "waiting", { daysOld: 2 });
  await post("02", "draft", "waiting", { daysOld: 1 });
  await post("03", "idea", "rejected", { daysOld: 1 });
  await post("04", "published", "approved", { daysOld: 30 });
  await post("05", "ready", "approved", { daysOld: 0, author: AGENT_EMAIL });
  await sql`insert into public.versions (post_id, channel, n, body, author) values
    (${POST + "05"}, 'whatsapp', 1, 'wa', 'denisa@example.com'), (${POST + "05"}, 'linkedin', 1, 'li', ${AGENT_EMAIL})`;
  const j = await ok({ action: "list" });
  assertEquals(j.posts.map((p: { id: string }) => p.id.slice(-2)), ["05", "02", "01"]);
  const p5 = j.posts[0];
  assertEquals([p5.author, p5.mine, p5.channels, p5.age_days], ["Chandler", true, ["linkedin", "whatsapp"], 0]);
  assertEquals(j.posts[2].age_days, 2);
  assertEquals((await ok({ action: "list", all: true })).count, 5);
  assertEquals((await ok({ action: "list", stage: "idea" })).posts.length, 1);
  await refused({ action: "list", stage: "review" }, 400, /stage must be one of/);
});

test("list expires only ideas whose end date passed, and names them; nothing else ever expires", async () => {
  await reset();
  await post("01", "idea", "waiting", { daysOld: 1, title: "Black Friday deals", expires: "2020-11-27" });
  await post("02", "idea", "waiting", { daysOld: 300, title: "Old, no end date" });
  await post("03", "idea", "approved", { daysOld: 1, title: "Jay said yes, date passed", expires: "2020-01-01" });
  await post("04", "idea", "waiting", { daysOld: 1, title: "Ends in the future", expires: "2099-01-01" });
  await post("05", "draft", "waiting", { daysOld: 1, title: "A draft, date passed", expires: "2020-01-01" });
  const j = await ok({ action: "list" });
  assertEquals(j.expired.map((e: { title: string }) => e.title), ["Black Friday deals", "Jay said yes, date passed"]);
  assertEquals(j.posts.map((p: { id: string }) => p.id.slice(-2)).sort(), ["02", "04", "05"]);
  const [gone] = await sql`select status, skip_reason from public.posts where id = ${POST + "01"}`;
  assertEquals([gone.status, gone.skip_reason], ["rejected", "expired"]);
  assertEquals(j.posts.find((p: { id: string }) => p.id === POST + "04").expires_on, "2099-01-01");
});

test("queue: what waits on Jay, oldest first, and Ready posts without a date", async () => {
  await reset();
  await post("01", "idea", "waiting", { daysOld: 1 });
  await post("02", "final", "waiting", { daysOld: 4 });
  await post("03", "draft", "changes", { daysOld: 2 });
  await post("04", "ready", "approved", { daysOld: 2 });
  await post("05", "ready", "approved", { daysOld: 2, pinned: "2099-01-01" });
  const j = await ok({ action: "queue" });
  assertEquals(j.waiting.map((p: { id: string }) => p.id.slice(-2)), ["02", "01"]);
  assertEquals(j.oldest_waiting_days, 4);
  assertEquals(j.ready_without_date.map((p: { id: string }) => p.id.slice(-2)), ["04"]);
});

test("show: the post, every version and only the open notes", async () => {
  await reset();
  await post("01", "final", "waiting", { title: "The post" });
  await sql`insert into public.versions (post_id, channel, n, body, author) values
    (${POST + "01"}, 'whatsapp', 1, 'v1', 'denisa@example.com'), (${POST + "01"}, 'whatsapp', 2, 'v2', 'denisa@example.com')`;
  await sql`insert into public.notes (post_id, body, status, author) values
    (${POST + "01"}, 'open one', 'open', 'jay@example.com'), (${POST + "01"}, 'fixed one', 'closed', 'jay@example.com')`;
  const j = await ok({ action: "show", post_id: POST + "01" });
  assertEquals(j.post.title, "The post");
  assertEquals(j.versions.map((v: { n: number }) => v.n), [1, 2]);
  assertEquals(j.open_notes.map((n: { body: string }) => n.body), ["open one"]);
  await refused({ action: "show", post_id: POST + "99" }, 404, /No post/);
  await refused({ action: "show", post_id: "nope" }, 400, /uuid/);
});

// ---------- ideas ----------
test("add_idea: Chandler's idea lands in the ideas column, waiting for Jay", async () => {
  await reset();
  const j = await ok({ action: "add_idea", title: "  A new idea  ", idea: "why", category: "news", score: 8, covered_before: "no", news_date: "2026-11-25" });
  assertEquals([j.post.stage, j.post.status, j.post.author, j.post.title], ["idea", "waiting", AGENT_EMAIL, "A new idea"]);
  const [row] = await sql`select category, score, covered_before, news_date::text as d from public.posts where id = ${j.post.id}`;
  assertEquals([row.category, row.score, row.covered_before, row.d], ["news", 8, "no", "2026-11-25"]);
});

test("add_idea dry run checks everything and writes nothing", async () => {
  await reset();
  await post("01", "idea", "waiting", { daysOld: 1, expires: "2020-01-01" });
  const j = await ok({ action: "add_idea", title: "Try me", dry_run: true });
  assertEquals([j.dry_run, j.post.status, j.expired.length], [true, "waiting", 1]);
  assertEquals(await count(`select count(*) as n from public.posts where title = 'Try me'`), 0);
  // the expiry inside the dry run is rolled back too
  assertEquals(await count(`select count(*) as n from public.posts where status = 'rejected'`), 0);
});

test("no cap: add_idea works with 30 open ideas, and the cap action is gone", async () => {
  await reset();
  for (let i = 10; i < 40; i++) await post(`${i}`, "idea", "waiting", { daysOld: 1 });
  const j = await ok({ action: "add_idea", title: "the 31st idea" });
  assertEquals([j.post.stage, j.open_ideas, j.cap], ["idea", undefined, undefined]);
  assertEquals(await count(`select count(*) as n from public.posts where stage = 'idea' and status <> 'rejected'`), 31);
  await refused({ action: "cap" }, 400, /Unknown action/);
});

test("expires_on: add_idea sets it, update changes and clears it, a bad date is a 400", async () => {
  await reset();
  const j = await ok({ action: "add_idea", title: "Black Friday prompt", expires_on: "2099-11-28" });
  assertEquals(j.post.expires_on, "2099-11-28");
  const u = await ok({ action: "update", post_id: j.post.id, expires_on: "2099-12-01" });
  assertEquals(u.post.expires_on, "2099-12-01");
  assertEquals((await ok({ action: "update", post_id: j.post.id, expires_on: null })).post.expires_on, null);
  await refused({ action: "update", post_id: j.post.id, expires_on: "28.11.2099" }, 400, /date/);
  await refused({ action: "update", post_id: j.post.id }, 400, /expires_on/);
  await refused({ action: "update", post_id: j.post.id, title: "x" }, 400, /Unknown field/);
  await refused({ action: "add_idea", title: "y", expires_on: "soon" }, 400, /date/);
  // the end date passes: the next call takes it
  await sql`update public.posts set expires_on = '2020-01-01' where id = ${j.post.id}`;
  assertEquals((await ok({ action: "queue" })).expired.map((e: { id: string }) => e.id), [j.post.id]);
});


test("add_idea: same open title again is refused (safe to retry), bad input is a 400", async () => {
  await reset();
  await ok({ action: "add_idea", title: "Retry me" });
  await refused({ action: "add_idea", title: "retry ME" }, 409, /already exists/);
  await refused({ action: "add_idea" }, 400, /title is required/);
  await refused({ action: "add_idea", title: "x", score: 11 }, 400, /score/);
  await refused({ action: "add_idea", title: "x", category: "memes" }, 400, /category/);
  await refused({ action: "add_idea", title: "x", news_date: "26.11.2026" }, 400, /date/);
});

// ---------- channel versions ----------
test("add_version numbers each channel on its own and signs it as Chandler", async () => {
  await reset();
  await post("01", "ready", "approved");
  await sql`insert into public.versions (post_id, channel, n, body, author) values (${POST + "01"}, 'whatsapp', 3, 'wa', 'denisa@example.com')`;
  const a = await ok({ action: "add_version", post_id: POST + "01", channel: "linkedin", body: "li one\n", headlines: ["Hook"], sources: ["https://example.com/a"] });
  const b = await ok({ action: "add_version", post_id: POST + "01", channel: "linkedin", body: "li two" });
  const c = await ok({ action: "add_version", post_id: POST + "01", channel: "whatsapp_he", body: "עיבוד לקבוצה" });
  assertEquals([a.version.n, b.version.n, c.version.n], [1, 2, 1]);
  assertEquals(a.version.author, AGENT_EMAIL);
  const [row] = await sql`select body, headlines, sources from public.versions where id = ${a.version.id}`;
  assertEquals(row.body, "li one");
  assertEquals(row.headlines, [{ en: "Hook" }]);
  assertEquals(row.sources, [{ url: "https://example.com/a", label: "example.com", official: false }]);
});

test("add_version on a published post adds an adaptation and leaves the post alone", async () => {
  await reset();
  await post("01", "published", "approved", { daysOld: 1 });
  const before = (await sql`select updated_at from public.posts where id = ${POST + "01"}`)[0].updated_at;
  await ok({ action: "add_version", post_id: POST + "01", channel: "threads", body: "short one" });
  const after = (await sql`select updated_at, stage from public.posts where id = ${POST + "01"}`)[0];
  assertEquals([after.updated_at.getTime(), after.stage], [before.getTime(), "published"]);
});

test("an email version keeps subject lines and preview texts apart", async () => {
  await reset();
  await post("01", "final", "waiting");
  const j = await ok({ action: "add_version", post_id: POST + "01", channel: "email", body: "<p>hi</p>", headlines: ["Subject"], previews: ["Preview"] });
  const [row] = await sql`select headlines from public.versions where id = ${j.version.id}`;
  assertEquals(row.headlines, [{ en: "Subject" }, { en: "Preview", kind: "preview" }]);
  await refused({ action: "add_version", post_id: POST + "01", channel: "x", body: "b", previews: ["p"] }, 400, /email only/);
});

test("an email version marks the post 'also an email', like the board, but never a published post", async () => {
  await reset();
  await post("01", "final", "waiting");
  await post("02", "published", "approved", { daysOld: 1 });
  await ok({ action: "add_version", post_id: POST + "01", channel: "email", body: "<p>a</p>" });
  await ok({ action: "add_version", post_id: POST + "02", channel: "email", body: "<p>b</p>" });
  const rows = await sql`select id, email_too from public.posts order by id`;
  assertEquals(rows.map((r) => r.email_too), [true, false]);
});

test("the same text again is refused, so a retry never adds a twin version", async () => {
  await reset();
  await post("01", "ready", "approved");
  await ok({ action: "add_version", post_id: POST + "01", channel: "x", body: "Same text" });
  await refused({ action: "add_version", post_id: POST + "01", channel: "x", body: "Same text\n\n" }, 409, /v1\) already has exactly this text/);
  await ok({ action: "add_version", post_id: POST + "01", channel: "threads", body: "Same text" });
  assertEquals(await count(`select count(*) as n from public.versions`), 2);
});

test("add_version refuses the WhatsApp post itself, unknown channels, ideas, rejected and missing posts", async () => {
  await reset();
  await post("01", "draft", "waiting");
  await post("02", "idea", "approved");
  await post("03", "draft", "rejected");
  await refused({ action: "add_version", post_id: POST + "01", channel: "whatsapp", body: "b" }, 400, /written on the board/);
  await refused({ action: "add_version", post_id: POST + "01", channel: "snapchat", body: "b" }, 400, /channel must be one of/);
  await refused({ action: "add_version", post_id: POST + "02", channel: "x", body: "b" }, 409, /still an idea/);
  await refused({ action: "add_version", post_id: POST + "03", channel: "x", body: "b" }, 409, /rejected/);
  await refused({ action: "add_version", post_id: POST + "99", channel: "x", body: "b" }, 404, /No post/);
  await refused({ action: "add_version", post_id: POST + "01", channel: "x", body: "  " }, 400, /body is required/);
  await refused({ action: "add_version", post_id: POST + "01", channel: "x", body: "b", sources: ["javascript:alert(1)"] }, 400, /not a link/);
  assertEquals(await count(`select count(*) as n from public.versions`), 0);
});

test("a dry run sent as text, a misspelled field or a field of another action is refused, never written", async () => {
  await reset();
  await post("01", "final", "waiting");
  await refused({ action: "add_idea", title: "I meant a dry run", dry_run: "true" }, 400, /dry_run must be true or false/);
  await refused({ action: "add_idea", title: "I meant a dry run", dryrun: true }, 400, /Unknown field for add_idea: dryrun/);
  await refused({ action: "add_version", post_id: POST + "01", channel: "x", body: "b", dry_run: 1 }, 400, /dry_run/);
  await refused({ action: "list", status: "waiting" }, 400, /Unknown field for list: status/);
  assertEquals(await count(`select count(*) as n from public.posts where title = 'I meant a dry run'`), 0);
  assertEquals(await count(`select count(*) as n from public.versions`), 0);
});

test("a link that only looks like one is a 400, not a database error", async () => {
  await reset();
  await post("01", "final", "waiting");
  await refused({ action: "add_version", post_id: POST + "01", channel: "x", body: "b", sources: ["https://example.com:abc/"] }, 400, /not a link/);
});

test("add_version dry run writes nothing", async () => {
  await reset();
  await post("01", "final", "waiting");
  const j = await ok({ action: "add_version", post_id: POST + "01", channel: "facebook", body: "fb", dry_run: true });
  assert(j.dry_run && j.version.n === 1);
  assertEquals(await count(`select count(*) as n from public.versions`), 0);
});

// ---------- reels (migration 6) ----------
const REEL = { hook_a: "Stop asking AI for answers", hook_b: "Your ChatGPT is guessing", cta: "code_word", code_word: "INTERVIEW" };

test("add_idea with reel fields makes a reel card in the ideas column", async () => {
  await reset();
  const j = await ok({ action: "add_idea", title: "Ask me questions", reel: REEL });
  assertEquals(j.post.kind, "reel");
  assertEquals(j.post.reel, REEL);
  const t = await ok({ action: "add_idea", title: "Plain post" });
  assertEquals(t.post.kind, "text");
  assertEquals((await ok({ action: "list" })).posts.find((p: { title: string }) => p.title === "Ask me questions").kind, "reel");
  await refused({ action: "add_idea", title: "x", kind: "text", reel: REEL }, 400, /kind: reel/);
  await refused({ action: "add_idea", title: "x", kind: "carousel" }, 400, /kind must be one of/);
});

test("set_reel fills the fields, keeps the rest, clears a field set to empty, and signs the change", async () => {
  await reset();
  await post("e1", "final", "waiting");
  await ok({ action: "set_reel", post_id: POST + "e1", reel: { hook_a: "A", cta: "follow" } });
  const j = await ok({ action: "set_reel", post_id: POST + "e1", reel: { hook_b: "B", video_url: "https://drive.google.com/file/d/abc/view", cta: "" } });
  assertEquals(j.post.kind, "reel");
  assertEquals(j.post.reel, { hook_a: "A", hook_b: "B", video_url: "https://drive.google.com/file/d/abc/view" });
  const [row] = await sql`select updated_by from public.posts where id = ${POST + "e1"}`;
  assertEquals(row.updated_by, AGENT_EMAIL);
  const shown = await ok({ action: "show", post_id: POST + "e1" });
  assertEquals(shown.post.reel.hook_b, "B");
});

test("set_reel refuses bad fields, a code word CTA without the word, published, rejected and missing posts", async () => {
  await reset();
  await post("e1", "draft", "waiting");
  await post("e2", "published", "approved");
  await post("e3", "draft", "rejected");
  await refused({ action: "set_reel", post_id: POST + "e1", reel: { cta: "link_in_bio" } }, 400, /cta must be one of/);
  await refused({ action: "set_reel", post_id: POST + "e1", reel: { cta: "code_word" } }, 400, /needs reel.code_word/);
  await refused({ action: "set_reel", post_id: POST + "e1", reel: { code_word: "TWO WORDS" } }, 400, /one word/);
  await refused({ action: "set_reel", post_id: POST + "e1", reel: { video_url: "javascript:alert(1)" } }, 400, /must be a link/);
  await refused({ action: "set_reel", post_id: POST + "e1", reel: { hook_c: "x" } }, 400, /Unknown reel field/);
  await refused({ action: "set_reel", post_id: POST + "e1", reel: {} }, 400, /no fields/);
  await refused({ action: "set_reel", post_id: POST + "e1" }, 400, /reel is required/);
  await refused({ action: "set_reel", post_id: POST + "e1", reel: ["hook"] }, 400, /must be an object/);
  await refused({ action: "set_reel", post_id: POST + "e2", reel: { hook_b: "x" } }, 409, /published post/);
  await refused({ action: "set_reel", post_id: POST + "e3", reel: { hook_b: "x" } }, 409, /rejected/);
  await refused({ action: "set_reel", post_id: POST + "99", reel: { hook_b: "x" } }, 404, /No post/);
  assertEquals(await count(`select count(*) as n from public.posts where kind = 'reel'`), 0);
});

test("set_reel dry run writes nothing", async () => {
  await reset();
  await post("e1", "draft", "waiting");
  const j = await ok({ action: "set_reel", post_id: POST + "e1", reel: REEL, dry_run: true });
  assertEquals(j.dry_run, true);
  assertEquals(await count(`select count(*) as n from public.posts where kind = 'reel'`), 0);
});

test("reel captions: Instagram, TikTok and YouTube versions carry their extra fields", async () => {
  await reset();
  await post("e1", "final", "approved");
  const extra = { comment: "That's my AI twin talking.", alt_text: "Jay's avatar explains a prompt", dm_1: "Want it?", dm_2: "Here you go" };
  await ok({ action: "add_version", post_id: POST + "e1", channel: "instagram", body: "Caption", extra });
  await ok({ action: "add_version", post_id: POST + "e1", channel: "youtube", body: "Description", extra: { title: "Better ChatGPT answers", comment: "The prompt" } });
  await ok({ action: "add_version", post_id: POST + "e1", channel: "tiktok", body: "Short caption", extra: { comment: "", switches: "AI-generated content: on" } });
  const shown = await ok({ action: "show", post_id: POST + "e1" });
  const by = (ch: string) => shown.versions.find((v: { channel: string }) => v.channel === ch);
  assertEquals(by("instagram").extra, extra);
  assertEquals(by("youtube").extra.title, "Better ChatGPT answers");
  assertEquals(by("tiktok").extra, { switches: "AI-generated content: on" }); // an empty field is not kept
});

test("extra: only the fields of that channel, a YouTube title within 100 characters, not on X", async () => {
  await reset();
  await post("e1", "final", "approved");
  await refused({ action: "add_version", post_id: POST + "e1", channel: "tiktok", body: "b", extra: { dm_1: "x" } }, 400, /extra for tiktok takes comment, switches, not dm_1/);
  await refused({ action: "add_version", post_id: POST + "e1", channel: "x", body: "b", extra: { comment: "x" } }, 400, /extra for x takes nothing/);
  await refused({ action: "add_version", post_id: POST + "e1", channel: "youtube", body: "b", extra: { title: "t".repeat(101) } }, 400, /too long/);
  await refused({ action: "add_version", post_id: POST + "e1", channel: "instagram", body: "b", extra: "comment" }, 400, /must be an object/);
  await refused({ action: "add_version", post_id: POST + "e1", channel: "tiktok", body: "b", extra: { switches: ["AI info"] } }, 400, /extra.switches must be text/);
  assertEquals(await count(`select count(*) as n from public.versions`), 0);
});

test("the same caption with a new pinned comment is a new version; the same caption and comment is a twin", async () => {
  await reset();
  await post("e1", "final", "approved");
  await ok({ action: "add_version", post_id: POST + "e1", channel: "instagram", body: "Caption", extra: { comment: "one" } });
  await refused({ action: "add_version", post_id: POST + "e1", channel: "instagram", body: "Caption", extra: { comment: "one" } }, 409, /already has exactly this text/);
  const j = await ok({ action: "add_version", post_id: POST + "e1", channel: "instagram", body: "Caption", extra: { comment: "two" } });
  assertEquals(j.version.n, 2);
});


// ---------- a reel made from a post ----------
test("make_reel: a reel card linked to the post, with its title; one per post", async () => {
  await reset();
  await post("01", "ready", "approved", { title: "The interview prompt" });
  await post("02", "idea", "waiting", { title: "Already a reel", kind: "reel" });
  const j = await ok({ action: "make_reel", post_id: POST + "01", reel: { hook_a: "Stop asking AI for answers" } });
  assertEquals([j.post.kind, j.post.stage, j.post.status, j.post.title, j.post.source_post_id, j.post.author],
    ["reel", "idea", "waiting", "The interview prompt", POST + "01", AGENT_EMAIL]);
  assertEquals(j.post.reel, { hook_a: "Stop asking AI for answers" });
  const [src] = await sql`select kind, stage from public.posts where id = ${POST + "01"}`;
  assertEquals([src.kind, src.stage], ["text", "ready"]);
  assertEquals((await ok({ action: "show", post_id: POST + "01" })).post.reels, [j.post.id]);
  assertEquals((await ok({ action: "show", post_id: j.post.id })).post.source_post_id, POST + "01");
  await refused({ action: "make_reel", post_id: POST + "01" }, 409, /already has a reel/);
  await refused({ action: "make_reel", post_id: POST + "02" }, 409, /already a reel/);
  await refused({ action: "make_reel", post_id: POST + "99" }, 404, /No post/);
});

test("make_reel dry run writes nothing", async () => {
  await reset();
  await post("01", "draft", "waiting", { title: "A post" });
  const j = await ok({ action: "make_reel", post_id: POST + "01", dry_run: true });
  assertEquals([j.dry_run, j.post.kind], [true, "reel"]);
  assertEquals(await count(`select count(*) as n from public.posts where kind = 'reel'`), 0);
});

test("close the test connection", async () => {
  await sql.end();
});
