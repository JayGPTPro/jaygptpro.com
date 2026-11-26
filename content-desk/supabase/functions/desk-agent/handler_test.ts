// Runs the REAL handler against a real Postgres that has the Desk schema and migration 5
// (content-desk/tests/run.sh builds one and sets DESK_TEST_DB_URL). No database mock: the
// writer rules under test are the triggers and policies themselves.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import postgres from "npm:postgres@3.4.4";
import { AGENT_EMAIL, asMember, handle, IDEA_CAP } from "./handler.ts";

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
async function post(id: string, stage: string, status: string, o: { title?: string; daysOld?: number; author?: string; pinned?: string } = {}) {
  const at = new Date(Date.now() - (o.daysOld ?? 0) * 86400000);
  await sql`insert into public.posts (id, title, stage, status, author, created_at, updated_at, pinned_date)
    values (${POST + id}, ${o.title ?? `post ${id}`}, ${stage}, ${status}, ${o.author ?? "denisa@example.com"}, ${at}, ${at}, ${o.pinned ?? null})`;
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

test("list expires ideas nobody touched for 7 days, and says how many", async () => {
  await reset();
  await post("01", "idea", "waiting", { daysOld: 8 });
  await post("02", "idea", "waiting", { daysOld: 3 });
  const j = await ok({ action: "list" });
  assertEquals(j.expired, 1);
  assertEquals(j.posts.map((p: { id: string }) => p.id.slice(-2)), ["02"]);
  const [gone] = await sql`select status, skip_reason from public.posts where id = ${POST + "01"}`;
  assertEquals([gone.status, gone.skip_reason], ["rejected", "expired"]);
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
  assertEquals([j.post.stage, j.post.status, j.post.author, j.post.title, j.open_ideas], ["idea", "waiting", AGENT_EMAIL, "A new idea", 1]);
  const [row] = await sql`select category, score, covered_before, news_date::text as d from public.posts where id = ${j.post.id}`;
  assertEquals([row.category, row.score, row.covered_before, row.d], ["news", 8, "no", "2026-11-25"]);
});

test("add_idea dry run checks everything and writes nothing", async () => {
  await reset();
  await post("01", "idea", "waiting", { daysOld: 9 });
  const j = await ok({ action: "add_idea", title: "Try me", dry_run: true });
  assertEquals([j.dry_run, j.post.status, j.expired], [true, "waiting", 1]);
  assertEquals(await count(`select count(*) as n from public.posts where title = 'Try me'`), 0);
  // the expiry inside the dry run is rolled back too
  assertEquals(await count(`select count(*) as n from public.posts where status = 'rejected'`), 0);
});

test(`add_idea is refused at ${IDEA_CAP} open ideas, rejected ones do not count`, async () => {
  await reset();
  for (let i = 1; i <= IDEA_CAP; i++) await post(`0${i}`, "idea", i === 1 ? "approved" : "waiting", { daysOld: 1 });
  await post("10", "idea", "rejected", { daysOld: 1 });
  await refused({ action: "add_idea", title: "one too many" }, 409, /full: 7 open ideas/);
  assertEquals(await count(`select count(*) as n from public.posts where title = 'one too many'`), 0);
  assertEquals((await ok({ action: "cap" })).room, 0);
  await sql`update public.posts set status = 'rejected' where id = ${POST + "02"}`;
  const c = await ok({ action: "cap" });
  assertEquals([c.open_ideas, c.cap, c.room], [IDEA_CAP - 1, IDEA_CAP, 1]);
  await ok({ action: "add_idea", title: "fits now" });
});

test("a stale idea expires first and frees its place under the cap", async () => {
  await reset();
  for (let i = 1; i <= IDEA_CAP; i++) await post(`0${i}`, "idea", "waiting", { daysOld: i === 1 ? 8 : 1 });
  const j = await ok({ action: "add_idea", title: "replaces the stale one" });
  assertEquals([j.expired, j.open_ideas], [1, IDEA_CAP]);
});

test("two runs at once cannot both take the last place: the second waits, then sees a full column", async () => {
  await reset();
  for (let i = 1; i < IDEA_CAP; i++) await post(`0${i}`, "idea", "waiting", { daysOld: 1 });
  // another add_idea is half way: it holds the ideas lock and has written the 7th idea, not committed yet
  const other = await sql.reserve();
  await other`begin`;
  await other`select pg_advisory_xact_lock(hashtext('desk-agent:ideas'))`;
  await other`insert into public.posts (title, stage, status, author) values ('taken meanwhile', 'idea', 'waiting', 'denisa@example.com')`;
  let settled = false;
  const late = call({ action: "add_idea", title: "late" }).finally(() => (settled = true));
  await new Promise((r) => setTimeout(r, 300));
  const waited = !settled;
  await other`commit`;
  other.release();
  const res = await late;
  assert(waited, "the second add_idea should wait for the first one's lock");
  assertEquals(res.status, 409);
  assertEquals(await count(`select count(*) as n from public.posts where stage = 'idea' and status <> 'rejected'`), IDEA_CAP);
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
  assertEquals(row.sources, [{ url: "https://example.com/a", label: "", official: false }]);
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

test("add_version refuses the WhatsApp post itself, unknown channels, ideas, rejected and missing posts", async () => {
  await reset();
  await post("01", "draft", "waiting");
  await post("02", "idea", "approved");
  await post("03", "draft", "rejected");
  await refused({ action: "add_version", post_id: POST + "01", channel: "whatsapp", body: "b" }, 400, /written on the board/);
  await refused({ action: "add_version", post_id: POST + "01", channel: "tiktok", body: "b" }, 400, /channel must be one of/);
  await refused({ action: "add_version", post_id: POST + "02", channel: "x", body: "b" }, 409, /still an idea/);
  await refused({ action: "add_version", post_id: POST + "03", channel: "x", body: "b" }, 409, /rejected/);
  await refused({ action: "add_version", post_id: POST + "99", channel: "x", body: "b" }, 404, /No post/);
  await refused({ action: "add_version", post_id: POST + "01", channel: "x", body: "  " }, 400, /body is required/);
  await refused({ action: "add_version", post_id: POST + "01", channel: "x", body: "b", sources: ["javascript:alert(1)"] }, 400, /not a link/);
  assertEquals(await count(`select count(*) as n from public.versions`), 0);
});

test("add_version dry run writes nothing", async () => {
  await reset();
  await post("01", "final", "waiting");
  const j = await ok({ action: "add_version", post_id: POST + "01", channel: "facebook", body: "fb", dry_run: true });
  assert(j.dry_run && j.version.n === 1);
  assertEquals(await count(`select count(*) as n from public.versions`), 0);
});

test("close the test connection", async () => {
  await sql.end();
});
