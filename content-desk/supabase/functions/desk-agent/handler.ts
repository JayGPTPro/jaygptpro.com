// Content Desk agent endpoint: Chandler (an AI writer) reads the board and adds ideas and
// channel versions, as the team member chandler@agent.jaygptpro.com. See content-desk/AGENT.md.
//
// Every call runs in ONE database transaction that switches to the "authenticated" role with
// Chandler's email in the JWT claims, exactly what PostgREST does for a signed-in browser.
// So row level security and every Desk trigger (who wrote it, only Jay approves or moves a
// card, an approved WhatsApp text is locked) apply to him as to any writer. Nothing here
// re-implements those rules; the checks below only make the agent narrower.
//
// POST JSON with the header  x-desk-agent-token: <DESK_AGENT_TOKEN>
//   { "action": "list",  "stage"?: "idea", "all"?: false, "limit"?: 100 }
//   { "action": "queue" }
//   { "action": "show",  "post_id": "<uuid>" }
//   { "action": "cap" }
//   { "action": "add_idea", "title": "...", "idea"?: "...", "category"?: "tip", "score"?: 7,
//     "covered_before"?: "...", "news_date"?: "2026-11-26", "dry_run"?: true }
//   { "action": "add_version", "post_id": "<uuid>", "channel": "linkedin", "body": "...",
//     "headlines"?: ["..."], "previews"?: ["..."] (email only), "sources"?: ["https://..."],
//     "writer_note"?: "...", "dry_run"?: true }
// dry_run runs the whole write, rules included, and rolls it back.
import type { Sql, TransactionSql } from "npm:postgres@3.4.4";

export const AGENT_EMAIL = "chandler@agent.jaygptpro.com";
export const IDEA_CAP = 7; // plan S6: at most 7 open ideas
export const STAGES = ["idea", "draft", "final", "ready", "published"];
export const CATEGORIES = ["news", "tip", "skill", "deals", "other"];
// "whatsapp" is the post itself: its first draft and final move the card and go to Jay, which
// the agent never does. Every other channel is an adaptation he may add.
export const AGENT_CHANNELS = ["whatsapp_he", "email", "linkedin", "x", "facebook", "threads"];
const MAX_BODY_BYTES = 200_000;

export type Deps = { token: string; sql: Sql; email?: string };
type Tx = TransactionSql;
type Body = Record<string, unknown>;

export class AgentError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function sha(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
// Same time whatever the input, so the token cannot be guessed one character at a time.
async function tokenOk(given: string, want: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha(given), sha(want)]);
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

const ROLLBACK = new Error("dry run: rolled back");
// Runs fn in one transaction as the signed-in member `email`. dryRun rolls everything back.
// locks: names of transaction locks to hold first (taken as the database owner, before the
// switch, so they never depend on what the "authenticated" role may call).
export async function asMember<T>(sql: Sql, email: string, fn: (tx: Tx) => Promise<T>, dryRun = false, locks: string[] = []): Promise<T> {
  let out: T | undefined;
  try {
    await sql.begin(async (tx) => {
      for (const k of locks) await tx`select pg_advisory_xact_lock(hashtext(${k}))`;
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ email, role: "authenticated" })}, true)`;
      await tx`set local role authenticated`;
      const [me] = await tx`select public.is_team() as ok`;
      if (!me?.ok) throw new AgentError(403, `${email} is not an active member of the Desk team`);
      out = await fn(tx);
      if (dryRun) throw ROLLBACK;
    });
  } catch (e) {
    if (e !== ROLLBACK) throw e;
  }
  return out as T;
}

// ---------- input checks ----------
const bad = (msg: string) => new AgentError(400, msg);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(v: unknown, name: string): string {
  if (typeof v !== "string" || !UUID_RE.test(v)) throw bad(`${name} must be a post id (uuid)`);
  return v.toLowerCase();
}
function text(v: unknown, name: string, max: number): string {
  if (typeof v !== "string" || !v.trim()) throw bad(`${name} is required`);
  const s = v.replace(/\s+$/, "");
  if (s.length > max) throw bad(`${name} is too long (${s.length} characters, at most ${max})`);
  return s;
}
function optText(v: unknown, name: string, max: number): string | null {
  if (v == null || (typeof v === "string" && !v.trim())) return null;
  return text(v, name, max);
}
function oneOf(v: unknown, list: string[], name: string): string {
  if (typeof v !== "string" || !list.includes(v)) throw bad(`${name} must be one of: ${list.join(", ")}`);
  return v;
}
function optInt(v: unknown, min: number, max: number, name: string): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be a whole number from ${min} to ${max}`);
  return n;
}
function optDate(v: unknown, name: string): string | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v + "T00:00:00Z"))) {
    throw bad(`${name} must be a date like 2026-11-26`);
  }
  return v;
}
function strList(v: unknown, name: string, maxItems: number, maxLen: number): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw bad(`${name} must be a list of texts`);
  const out = v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  if (out.length !== v.length) throw bad(`${name} must be a list of non-empty texts`);
  if (out.length > maxItems) throw bad(`${name}: at most ${maxItems}`);
  for (const s of out) if (s.length > maxLen) throw bad(`${name}: each at most ${maxLen} characters`);
  return out;
}
type Source = { url: string; label: string; official: boolean };
function sources(v: unknown): Source[] {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > 20) throw bad("sources must be a list of at most 20 links");
  return v.map((s) => {
    const o = typeof s === "string" ? { url: s } : (s ?? {}) as Record<string, unknown>;
    const url = String(o.url ?? "").trim();
    if (!/^https?:\/\/[^\s"'<>]+$/i.test(url) || url.length > 2000) throw bad(`not a link: ${url.slice(0, 80)}`);
    // like the board: a link without a label is shown by its site name
    const label = String(o.label ?? "").trim().slice(0, 200) || new URL(url).hostname.replace(/^www\./, "");
    return { url, label, official: o.official === true };
  });
}

// ---------- reads ----------
async function expire(tx: Tx): Promise<number> {
  const [r] = await tx`select public.desk_expire_ideas() as n`;
  return Number(r.n) || 0;
}
async function openIdeas(tx: Tx): Promise<number> {
  const [r] = await tx`select count(*)::int as n from public.posts where stage = 'idea' and status <> 'rejected'`;
  return r.n;
}

// One line per post, as the board shows it.
function card(r: Record<string, unknown>) {
  return {
    id: r.id, title: r.title, stage: r.stage, status: r.status, category: r.category,
    score: r.score, hot: r.hot, pinned_date: r.pinned_date, skip_reason: r.skip_reason ?? undefined,
    author: r.author_name ?? r.author, mine: r.author === AGENT_EMAIL,
    channels: r.channels ?? undefined, age_days: r.age_days, waiting_days: r.waiting_days ?? undefined,
  };
}

async function list(tx: Tx, b: Body) {
  const stage = b.stage == null ? null : oneOf(b.stage, STAGES, "stage");
  const all = b.all === true;
  const limit = optInt(b.limit, 1, 500, "limit") ?? 100;
  const expired = await expire(tx);
  const rows = await tx`
    select p.id, p.title, p.stage, p.status, p.category, p.score, p.hot, p.pinned_date::text as pinned_date,
           p.skip_reason, p.author, m.name as author_name,
           floor(extract(epoch from now() - p.created_at) / 86400)::int as age_days,
           coalesce((select array_agg(distinct v.channel order by v.channel) from public.versions v where v.post_id = p.id), '{}') as channels
    from public.posts p left join public.team_members m on m.email = p.author
    where (${stage}::text is null or p.stage = ${stage}::text)
      and (${all}::boolean or (p.status <> 'rejected'
           and not (p.stage = 'published' and coalesce(p.published_at, p.updated_at) < now() - interval '14 days')))
    order by p.updated_at desc
    limit ${limit}`;
  return { expired, count: rows.length, posts: rows.map(card) };
}

// What waits on Jay: his answer on an idea, draft or final, and a date for a Ready post.
async function queue(tx: Tx) {
  const expired = await expire(tx);
  const cols = tx`p.id, p.title, p.stage, p.status, p.category, p.score, p.hot, p.pinned_date::text as pinned_date,
    p.author, m.name as author_name, floor(extract(epoch from now() - p.created_at) / 86400)::int as age_days,
    floor(extract(epoch from now() - p.updated_at) / 86400)::int as waiting_days`;
  const waiting = await tx`select ${cols} from public.posts p left join public.team_members m on m.email = p.author
    where p.stage in ('idea', 'draft', 'final') and p.status = 'waiting' order by p.updated_at asc`;
  const noDate = await tx`select ${cols} from public.posts p left join public.team_members m on m.email = p.author
    where p.stage = 'ready' and p.pinned_date is null and p.status <> 'rejected' order by p.updated_at asc`;
  return {
    expired,
    waiting: waiting.map(card),
    ready_without_date: noDate.map(card),
    oldest_waiting_days: waiting.length ? waiting[0].waiting_days : null,
  };
}

async function show(tx: Tx, b: Body) {
  const id = uuid(b.post_id ?? b.id, "post_id");
  const [p] = await tx`
    select p.id, p.title, p.category, p.stage, p.status, p.idea, p.author, m.name as author_name, p.score,
           p.covered_before, p.news_date::text as news_date, p.tried_myself, p.hot, p.pinned_date::text as pinned_date,
           p.email_too, p.skip_reason, p.published_at, p.published_text, p.reactions, p.created_at, p.updated_at
    from public.posts p left join public.team_members m on m.email = p.author where p.id = ${id}`;
  if (!p) throw new AgentError(404, "No post with this id");
  const versions = await tx`
    select v.id, v.channel, v.n, v.headlines, v.chosen, v.body, v.sources, v.writer_note, v.author,
           m.name as author_name, v.created_at
    from public.versions v left join public.team_members m on m.email = v.author
    where v.post_id = ${id} order by v.channel, v.n`;
  const notes = await tx`
    select n.id, n.kind, n.body, n.version_n, n.author, m.name as author_name, n.created_at
    from public.notes n left join public.team_members m on m.email = n.author
    where n.post_id = ${id} and n.status = 'open' order by n.created_at`;
  return { post: p, versions, open_notes: notes };
}

async function cap(tx: Tx) {
  const expired = await expire(tx);
  const n = await openIdeas(tx);
  return { expired, open_ideas: n, cap: IDEA_CAP, room: Math.max(0, IDEA_CAP - n) };
}

// ---------- writes ----------
function ideaInput(b: Body) {
  return {
    title: text(b.title, "title", 200).trim(),
    idea: optText(b.idea, "idea", 4000),
    category: b.category == null ? "tip" : oneOf(b.category, CATEGORIES, "category"),
    score: optInt(b.score, 1, 10, "score"),
    covered_before: optText(b.covered_before, "covered_before", 500),
    news_date: optDate(b.news_date, "news_date"),
  };
}

// one add_idea at a time (handle() holds this lock), so two runs cannot both take the last place
export const IDEAS_LOCK = "desk-agent:ideas";
async function addIdea(tx: Tx, i: ReturnType<typeof ideaInput>) {
  const expired = await expire(tx);
  const open = await openIdeas(tx);
  if (open >= IDEA_CAP) {
    throw new AgentError(409, `The ideas column is full: ${open} open ideas, the cap is ${IDEA_CAP}. Wait until Jay answers some or old ones expire.`);
  }
  const [dup] = await tx`select id from public.posts
    where stage = 'idea' and status <> 'rejected' and lower(title) = lower(${i.title}) limit 1`;
  if (dup) throw new AgentError(409, `An open idea with this title already exists: ${dup.id}`);
  const [post] = await tx`
    insert into public.posts (title, idea, category, score, covered_before, news_date, stage)
    values (${i.title}, ${i.idea}, ${i.category}, ${i.score}, ${i.covered_before}, ${i.news_date}::date, 'idea')
    returning id, title, stage, status, category, score, author, created_at`;
  return { expired, open_ideas: open + 1, cap: IDEA_CAP, post };
}

function versionInput(b: Body) {
  const postId = uuid(b.post_id, "post_id");
  if (b.channel === "whatsapp") {
    throw bad("The WhatsApp text is the post itself: its drafts move the card and go to Jay, so they are written on the board. Use whatsapp_he for the Hebrew group.");
  }
  const channel = oneOf(b.channel, AGENT_CHANNELS, "channel");
  const previews = strList(b.previews, "previews", 10, 300);
  if (previews.length && channel !== "email") throw bad("previews are for the email only");
  return {
    postId, channel, previews,
    body: text(b.body, "body", 60000),
    headlines: strList(b.headlines, "headlines", 10, 300),
    sources: sources(b.sources),
    writer_note: optText(b.writer_note, "writer_note", 2000),
  };
}

async function addVersion(tx: Tx, i: ReturnType<typeof versionInput>) {
  const [p] = await tx`select id, title, stage, status from public.posts where id = ${i.postId}`;
  if (!p) throw new AgentError(404, "No post with this id");
  if (p.status === "rejected") throw new AgentError(409, "This post was rejected. Channel versions go on live posts only.");
  // like the board: other channels come after the first draft, never on a bare idea
  if (p.stage === "idea") throw new AgentError(409, "This post is still an idea. Channel versions come after the first draft.");
  const [{ n }] = await tx`select coalesce(max(n), 0) + 1 as n from public.versions
    where post_id = ${i.postId} and channel = ${i.channel}`;
  const headlines = [...i.headlines.map((en) => ({ en })), ...i.previews.map((en) => ({ en, kind: "preview" }))];
  const [v] = await tx`
    insert into public.versions (post_id, channel, n, body, headlines, sources, writer_note)
    values (${i.postId}, ${i.channel}, ${n}, ${i.body}, ${tx.json(headlines)}, ${tx.json(i.sources)}, ${i.writer_note})
    returning id, post_id, channel, n, author, created_at`;
  return { post: { id: p.id, title: p.title, stage: p.stage, status: p.status }, version: v };
}

// ---------- the endpoint ----------
function fromError(e: unknown): Response {
  if (e instanceof AgentError) return json(e.status, { ok: false, error: e.message });
  const code = (e as { code?: string })?.code ?? "";
  const msg = (e as Error)?.message ?? String(e);
  if (code === "P0001") return json(409, { ok: false, error: msg }); // a Desk rule said no
  if (code === "42501") return json(403, { ok: false, error: msg }); // row level security
  if (code === "23505") return json(409, { ok: false, error: msg });
  if (code.startsWith("22") || code === "23514") return json(400, { ok: false, error: msg });
  console.error("desk-agent", code, msg);
  return json(500, { ok: false, error: "Database error. Try again.", detail: msg });
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json(405, { ok: false, error: "POST only" });
  // an unset or short secret must never match anything
  if (!deps.token || deps.token.length < 32) return json(503, { ok: false, error: "DESK_AGENT_TOKEN is not set" });
  if (!(await tokenOk(req.headers.get("x-desk-agent-token") ?? "", deps.token))) {
    return json(401, { ok: false, error: "Wrong or missing x-desk-agent-token" });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { ok: false, error: "Body too large" });
  let b: Body;
  try {
    b = JSON.parse(raw);
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
  } catch {
    return json(400, { ok: false, error: "Body must be a JSON object" });
  }
  const email = deps.email ?? AGENT_EMAIL;
  const action = String(b.action ?? "");
  const dryRun = b.dry_run === true;
  try {
    let out: unknown;
    if (action === "list") out = await asMember(deps.sql, email, (tx) => list(tx, b));
    else if (action === "queue") out = await asMember(deps.sql, email, queue);
    else if (action === "show") out = await asMember(deps.sql, email, (tx) => show(tx, b));
    else if (action === "cap") out = await asMember(deps.sql, email, cap);
    else if (action === "add_idea") {
      const input = ideaInput(b);
      out = { dry_run: dryRun, ...(await asMember(deps.sql, email, (tx) => addIdea(tx, input), dryRun, [IDEAS_LOCK])) };
    } else if (action === "add_version") {
      const input = versionInput(b);
      // the next number per post and channel, one writer at a time
      const lock = `desk-agent:v:${input.postId}:${input.channel}`;
      out = { dry_run: dryRun, ...(await asMember(deps.sql, email, (tx) => addVersion(tx, input), dryRun, [lock])) };
    } else {
      return json(400, { ok: false, error: "Unknown action. Use list, queue, show, cap, add_idea or add_version." });
    }
    if (action.startsWith("add_")) console.log("desk-agent", action, dryRun ? "dry run" : "written", email);
    return json(200, { ok: true, action, ...(out as object) });
  } catch (e) {
    return fromError(e);
  }
}
