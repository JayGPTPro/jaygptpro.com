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
//   { "action": "add_idea", "title": "...", "idea"?: "...", "category"?: "tip", "score"?: 7,
//     "covered_before"?: "...", "news_date"?: "2026-11-26", "expires_on"?: "2026-11-28", "kind"?: "reel", "reel"?: {...}, "dry_run"?: true }
//   { "action": "update", "post_id": "<uuid>", "expires_on": "2026-11-28" | null, "dry_run"?: true }
//   { "action": "make_reel", "post_id": "<uuid>", "reel"?: {...}, "dry_run"?: true }   (a reel card made from a post)
//   { "action": "set_reel", "post_id": "<uuid>", "reel": { "hook_a"?, "hook_b"?, "cta"?, "code_word"?,
//     "video_url"?, "video_b_url"?, "cover_url"? }, "dry_run"?: true }   (a field set to null or "" is cleared)
//   { "action": "add_version", "post_id": "<uuid>", "channel": "linkedin", "body": "...",
//     "headlines"?: ["..."], "previews"?: ["..."] (email only), "sources"?: ["https://..."],
//     "extra"?: { "title"?, "comment"?, "alt_text"?, "dm_1"?, "dm_2"?, "switches"? } (per channel, see EXTRA_KEYS),
//     "writer_note"?: "...", "dry_run"?: true }
// dry_run runs the whole write, rules included, and rolls it back.
import type { Sql, TransactionSql } from "npm:postgres@3.4.4";

export const AGENT_EMAIL = "chandler@agent.jaygptpro.com";
export const STAGES = ["idea", "draft", "final", "ready", "published"];
export const CATEGORIES = ["news", "tip", "skill", "deals", "other"];
// "whatsapp" is the post itself: its first draft and final move the card and go to Jay, which
// the agent never does. Every other channel is an adaptation he may add.
export const AGENT_CHANNELS = ["whatsapp_he", "email", "linkedin", "x", "facebook", "threads", "instagram", "tiktok", "youtube"];
// What a caption carries beside its text, per channel, as reel-texts writes it in post-texts.md:
// the YouTube title, the pinned (or LinkedIn first) comment, the Instagram alt text, the two DM
// messages for the code word, and the switches to turn on (AI label, content disclosure).
export const EXTRA_KEYS: Record<string, string[]> = {
  instagram: ["comment", "alt_text", "dm_1", "dm_2", "switches"],
  tiktok: ["comment", "switches"],
  youtube: ["title", "comment", "switches"],
  linkedin: ["comment"],
  facebook: ["switches"],
  threads: ["comment", "switches"],
};
const EXTRA_MAX: Record<string, number> = { title: 100, alt_text: 1000, switches: 500 };
// A reel's own fields on its card (posts.reel), and the CTA kinds that rotate (Jay, 27.11).
export const REEL_KEYS = ["hook_a", "hook_b", "cta", "code_word", "video_url", "video_b_url", "cover_url"];
export const CTA_KINDS = ["code_word", "follow", "whatsapp", "none"];
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
  if (v != null && typeof v !== "string") throw bad(`${name} must be text`);
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
    let host = "";
    try {
      host = new URL(url).hostname;
    } catch {
      host = "";
    }
    if (!host || !/^https?:\/\/[^\s"'<>]+$/i.test(url) || url.length > 2000) throw bad(`not a link: ${url.slice(0, 80)}`);
    // like the board: a link without a label is shown by its site name
    const label = String(o.label ?? "").trim().slice(0, 200) || host.replace(/^www\./, "");
    return { url, label, official: o.official === true };
  });
}

function link(v: unknown, name: string): string {
  const url = typeof v === "string" ? v.trim() : "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    host = "";
  }
  if (!host || !/^https?:\/\/[^\s"'<>]+$/i.test(url) || url.length > 2000) throw bad(`${name} must be a link (https://...)`);
  return url;
}
function obj(v: unknown, name: string): Record<string, unknown> {
  if (v == null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw bad(`${name} must be an object`);
  return v as Record<string, unknown>;
}
// The reel fields given in a call. A field set to null or "" means "clear it" (value null).
type ReelPatch = Record<string, string | null>;
function reelInput(v: unknown): ReelPatch {
  const o = obj(v, "reel");
  const unknown = Object.keys(o).filter((k) => !REEL_KEYS.includes(k));
  if (unknown.length) throw bad(`Unknown reel field: ${unknown.join(", ")}. Use ${REEL_KEYS.join(", ")}`);
  const out: ReelPatch = {};
  for (const k of Object.keys(o)) {
    const x = o[k];
    if (x == null || (typeof x === "string" && !x.trim())) {
      out[k] = null;
      continue;
    }
    if (k === "cta") out[k] = oneOf(x, CTA_KINDS, "reel.cta");
    else if (k === "code_word") {
      const w = text(x, "reel.code_word", 40).trim();
      if (/\s/.test(w)) throw bad("reel.code_word is one word, as said in the reel");
      out[k] = w;
    } else if (k.endsWith("_url")) out[k] = link(x, `reel.${k}`);
    else out[k] = text(x, `reel.${k}`, 300).trim();
  }
  return out;
}
// The reel after the patch: cleared fields go, a code word CTA needs its code word.
function mergeReel(cur: Record<string, unknown>, patch: ReelPatch): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries({ ...(cur ?? {}), ...patch })) if (typeof x === "string" && x) out[k] = x;
  if (out.cta === "code_word" && !out.code_word) throw bad("A code word CTA needs reel.code_word");
  return out;
}
function extraInput(v: unknown, channel: string): Record<string, string> {
  const o = obj(v, "extra");
  const allowed = EXTRA_KEYS[channel] ?? [];
  const unknown = Object.keys(o).filter((k) => !allowed.includes(k));
  if (unknown.length) {
    throw bad(`extra for ${channel} takes ${allowed.length ? allowed.join(", ") : "nothing"}, not ${unknown.join(", ")}`);
  }
  const out: Record<string, string> = {};
  for (const k of allowed) {
    const x = optText(o[k], `extra.${k}`, EXTRA_MAX[k] ?? 5000);
    if (x) out[k] = x;
  }
  return out;
}
// Same keys and values, in any order.
function sameExtra(a: unknown, b: Record<string, string>): boolean {
  const x = (a ?? {}) as Record<string, unknown>;
  const ka = Object.keys(x).filter((k) => x[k] != null && x[k] !== "");
  return ka.length === Object.keys(b).length && ka.every((k) => x[k] === b[k]);
}

// ---------- reads ----------
// Ideas whose expires_on has passed (in Israel) move to Rejected ("expired"); returns which ones.
// No other idea ever expires, and there is no cap on open ideas (Jay, 27.11).
async function expire(tx: Tx): Promise<Array<{ id: string; title: string }>> {
  const rows = await tx`select post_id, post_title from public.desk_expire_ideas()`;
  return rows.map((r) => ({ id: r.post_id, title: r.post_title }));
}

// One line per post, as the board shows it.
function card(r: Record<string, unknown>) {
  return {
    id: r.id, title: r.title, kind: r.kind, stage: r.stage, status: r.status, category: r.category,
    score: r.score, hot: r.hot, pinned_date: r.pinned_date, expires_on: r.expires_on ?? undefined,
    source_post_id: r.source_post_id ?? undefined, skip_reason: r.skip_reason ?? undefined,
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
    select p.id, p.title, p.kind, p.stage, p.status, p.category, p.score, p.hot, p.pinned_date::text as pinned_date,
           p.expires_on::text as expires_on, p.source_post_id, p.skip_reason, p.author, m.name as author_name,
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
  const cols = tx`p.id, p.title, p.kind, p.stage, p.status, p.category, p.score, p.hot, p.pinned_date::text as pinned_date,
    p.expires_on::text as expires_on, p.source_post_id, p.author, m.name as author_name, floor(extract(epoch from now() - p.created_at) / 86400)::int as age_days,
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
    select p.id, p.title, p.kind, p.reel, p.category, p.stage, p.status, p.idea, p.author, m.name as author_name, p.score,
           p.covered_before, p.news_date::text as news_date, p.expires_on::text as expires_on, p.source_post_id,
           (select array_agg(r.id order by r.created_at) from public.posts r where r.source_post_id = p.id) as reels,
           p.tried_myself, p.hot, p.pinned_date::text as pinned_date,
           p.email_too, p.skip_reason, p.published_at, p.published_text, p.reactions, p.created_at, p.updated_at
    from public.posts p left join public.team_members m on m.email = p.author where p.id = ${id}`;
  if (!p) throw new AgentError(404, "No post with this id");
  const versions = await tx`
    select v.id, v.channel, v.n, v.headlines, v.chosen, v.body, v.extra, v.sources, v.writer_note, v.author,
           m.name as author_name, v.created_at
    from public.versions v left join public.team_members m on m.email = v.author
    where v.post_id = ${id} order by v.channel, v.n`;
  const notes = await tx`
    select n.id, n.kind, n.body, n.version_n, n.author, m.name as author_name, n.created_at
    from public.notes n left join public.team_members m on m.email = n.author
    where n.post_id = ${id} and n.status = 'open' order by n.created_at`;
  return { post: p, versions, open_notes: notes };
}

// ---------- writes ----------
function ideaInput(b: Body) {
  const reel = b.reel == null ? null : mergeReel({}, reelInput(b.reel));
  const kind = b.kind == null ? (reel ? "reel" : "text") : oneOf(b.kind, ["text", "reel"], "kind");
  if (reel && kind !== "reel") throw bad("reel fields go on a reel (kind: reel)");
  return {
    kind, reel: reel ?? {},
    title: text(b.title, "title", 200).trim(),
    idea: optText(b.idea, "idea", 4000),
    category: b.category == null ? "tip" : oneOf(b.category, CATEGORIES, "category"),
    score: optInt(b.score, 1, 10, "score"),
    covered_before: optText(b.covered_before, "covered_before", 500),
    news_date: optDate(b.news_date, "news_date"),
    expires_on: optDate(b.expires_on, "expires_on"),
  };
}

// one add_idea at a time (handle() holds this lock), so two runs cannot both add the same title
export const IDEAS_LOCK = "desk-agent:ideas";
async function addIdea(tx: Tx, i: ReturnType<typeof ideaInput>) {
  const expired = await expire(tx);
  // a retry after a lost answer must say "already there", not add the idea twice
  const [dup] = await tx`select id from public.posts
    where stage = 'idea' and status <> 'rejected' and lower(title) = lower(${i.title}) limit 1`;
  if (dup) throw new AgentError(409, `An open idea with this title already exists: ${dup.id}`);
  const [post] = await tx`
    insert into public.posts (title, idea, category, score, covered_before, news_date, expires_on, stage, kind, reel)
    values (${i.title}, ${i.idea}, ${i.category}, ${i.score}, ${i.covered_before}, ${i.news_date}::date, ${i.expires_on}::date, 'idea', ${i.kind}, ${tx.json(i.reel)})
    returning id, title, kind, reel, stage, status, category, score, expires_on::text as expires_on, author, created_at`;
  return { expired, post };
}

// The fields update may change on a post. Only the end date for now.
async function update(tx: Tx, postId: string, b: Body) {
  if (!("expires_on" in b)) throw bad("update needs a field to change: expires_on (a date, or null to clear it)");
  const expiresOn = optDate(b.expires_on, "expires_on");
  const [p] = await tx`select id, status from public.posts where id = ${postId} for update`;
  if (!p) throw new AgentError(404, "No post with this id");
  if (p.status === "rejected") throw new AgentError(409, "This post was rejected. Bring it back on the board first.");
  const [out] = await tx`update public.posts set expires_on = ${expiresOn}::date where id = ${postId}
    returning id, title, kind, stage, status, expires_on::text as expires_on`;
  return { post: out };
}

// A reel card made from a post: a new idea with kind 'reel', the post's title and category, and a
// link back to the post. The post stays as it is. One reel per post: a second call is refused.
async function makeReel(tx: Tx, postId: string, patch: ReelPatch) {
  const [src] = await tx`select id, title, kind, category, status from public.posts where id = ${postId}`;
  if (!src) throw new AgentError(404, "No post with this id");
  if (src.kind === "reel") throw new AgentError(409, "This post is already a reel.");
  if (src.status === "rejected") throw new AgentError(409, "This post was rejected. Reels are made from live posts only.");
  const [dup] = await tx`select id from public.posts where source_post_id = ${postId} limit 1`;
  if (dup) throw new AgentError(409, `This post already has a reel: ${dup.id}`);
  const reel = mergeReel({}, patch);
  const [post] = await tx`
    insert into public.posts (title, category, stage, kind, reel, source_post_id)
    values (${src.title}, ${src.category}, 'idea', 'reel', ${tx.json(reel)}, ${postId})
    returning id, title, kind, reel, stage, status, category, source_post_id, author, created_at`;
  return { source: { id: src.id, title: src.title }, post };
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
    extra: extraInput(b.extra, channel),
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
  const [top] = await tx`select n, body, extra from public.versions
    where post_id = ${i.postId} and channel = ${i.channel} order by n desc limit 1`;
  // a retry after a lost answer must not add the same text again as the next version
  if (top && top.body === i.body && sameExtra(top.extra, i.extra)) {
    throw new AgentError(409, `The latest ${i.channel} version (v${top.n}) already has exactly this text.`);
  }
  const n = (top?.n ?? 0) + 1;
  const headlines = [...i.headlines.map((en) => ({ en })), ...i.previews.map((en) => ({ en, kind: "preview" }))];
  const [v] = await tx`
    insert into public.versions (post_id, channel, n, body, headlines, extra, sources, writer_note)
    values (${i.postId}, ${i.channel}, ${n}, ${i.body}, ${tx.json(headlines)}, ${tx.json(i.extra)}, ${tx.json(i.sources)}, ${i.writer_note})
    returning id, post_id, channel, n, author, created_at`;
  // like the board: an email version marks the post "also an email" (not once it is published)
  if (i.channel === "email" && p.stage !== "published") {
    await tx`update public.posts set email_too = true where id = ${i.postId} and not email_too`;
  }
  return { post: { id: p.id, title: p.title, stage: p.stage, status: p.status }, version: v };
}

// The reel's fields on its card: hooks, CTA, code word and the links to its files. Makes the post a reel.
async function setReel(tx: Tx, postId: string, patch: ReelPatch) {
  // for update: a board save between this read and the write below waits, so it is not overwritten
  const [p] = await tx`select id, title, kind, reel, stage, status from public.posts where id = ${postId} for update`;
  if (!p) throw new AgentError(404, "No post with this id");
  if (p.status === "rejected") throw new AgentError(409, "This post was rejected. Reel fields go on live posts only.");
  // a published post is Jay's: the Desk's own guard refuses the update (409)
  const reel = mergeReel(p.reel, patch);
  const [out] = await tx`update public.posts set kind = 'reel', reel = ${tx.json(reel)} where id = ${postId}
    returning id, title, kind, reel, stage, status`;
  return { post: out };
}

// ---------- the endpoint ----------
// The fields each action takes. Anything else is refused, so a misspelled field cannot be ignored.
const FIELDS: Record<string, string[]> = {
  list: ["stage", "all", "limit"],
  queue: [],
  show: ["post_id", "id"],
  add_idea: ["title", "idea", "category", "score", "covered_before", "news_date", "expires_on", "kind", "reel", "dry_run"],
  update: ["post_id", "expires_on", "dry_run"],
  make_reel: ["post_id", "reel", "dry_run"],
  add_version: ["post_id", "channel", "body", "headlines", "previews", "extra", "sources", "writer_note", "dry_run"],
  set_reel: ["post_id", "reel", "dry_run"],
};

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
  const allowed = FIELDS[action];
  if (!allowed) return json(400, { ok: false, error: "Unknown action. Use list, queue, show, add_idea, update, make_reel, add_version or set_reel." });
  // a typo such as "dryrun" or "dry_run": "true" must never turn a test into a real write
  const unknown = Object.keys(b).filter((k) => k !== "action" && !allowed.includes(k));
  if (unknown.length) return json(400, { ok: false, error: `Unknown field for ${action}: ${unknown.join(", ")}` });
  if (b.dry_run !== undefined && typeof b.dry_run !== "boolean") {
    return json(400, { ok: false, error: "dry_run must be true or false (not text)" });
  }
  const dryRun = b.dry_run === true;
  try {
    let out: unknown;
    if (action === "list") out = await asMember(deps.sql, email, (tx) => list(tx, b));
    else if (action === "queue") out = await asMember(deps.sql, email, queue);
    else if (action === "show") out = await asMember(deps.sql, email, (tx) => show(tx, b));
    else if (action === "add_idea") {
      const input = ideaInput(b);
      out = { dry_run: dryRun, ...(await asMember(deps.sql, email, (tx) => addIdea(tx, input), dryRun, [IDEAS_LOCK])) };
    } else if (action === "add_version") {
      const input = versionInput(b);
      // the next number per post and channel, one writer at a time
      const lock = `desk-agent:v:${input.postId}:${input.channel}`;
      out = { dry_run: dryRun, ...(await asMember(deps.sql, email, (tx) => addVersion(tx, input), dryRun, [lock])) };
    } else if (action === "update") {
      const postId = uuid(b.post_id, "post_id");
      out = { dry_run: dryRun, ...(await asMember(deps.sql, email, (tx) => update(tx, postId, b), dryRun, [`desk-agent:post:${postId}`])) };
    } else if (action === "make_reel") {
      const postId = uuid(b.post_id, "post_id");
      const patch = b.reel == null ? {} : reelInput(b.reel);
      // the same lock for every make_reel on this post, so two runs cannot both make its reel
      out = { dry_run: dryRun, ...(await asMember(deps.sql, email, (tx) => makeReel(tx, postId, patch), dryRun, [`desk-agent:make_reel:${postId}`])) };
    } else if (action === "set_reel") {
      const postId = uuid(b.post_id, "post_id");
      if (b.reel == null) throw bad("reel is required: the fields to set, e.g. { \"hook_b\": \"...\" }");
      const patch = reelInput(b.reel);
      if (!Object.keys(patch).length) throw bad("reel has no fields to set");
      out = { dry_run: dryRun, ...(await asMember(deps.sql, email, (tx) => setReel(tx, postId, patch), dryRun, [`desk-agent:reel:${postId}`])) };
    } else {
      return json(400, { ok: false, error: "Unknown action. Use list, queue, show, add_idea, update, make_reel, add_version or set_reel." });
    }
    if (action.startsWith("add_") || ["set_reel", "update", "make_reel"].includes(action)) console.log("desk-agent", action, dryRun ? "dry run" : "written", email);
    return json(200, { ok: true, action, ...(out as object) });
  } catch (e) {
    return fromError(e);
  }
}
