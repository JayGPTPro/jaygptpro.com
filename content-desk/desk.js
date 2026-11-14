// Content Desk: one shared board where a post idea becomes a published WhatsApp post.
// Columns: idea -> first draft -> final version -> ready (gets a date) -> published.
// Each post in the first three columns carries Jay's answer: waiting, approved, changes or rejected.
import { createStore } from "./store.js?v=6";
import { HE } from "./i18n.js?v=6";

const PARAMS = new URLSearchParams(location.search);
const DEMO = PARAMS.has("demo");
const store = createStore(DEMO);
const app = document.getElementById("app");

const CATS = ["news", "tip", "skill", "deals", "other"];
const CAT_KEYS = { news: "News", tip: "Tip", skill: "Skill", deals: "Deals", other: "Other" };
const COLS = ["idea", "draft", "final", "ready", "published"];
const COL_KEYS = { idea: "Ideas", draft: "First draft", final: "Final version", ready: "Ready", published: "Published" };
const COL_ONE = { idea: "Idea", draft: "First draft", final: "Final version", ready: "Ready", published: "Published" };
const STATUS_KEYS = { waiting: "Waiting for Jay", approved: "Approved", changes: "Needs changes", rejected: "Rejected" };
const STATUS_ORDER = { waiting: 0, changes: 1, approved: 2, rejected: 3 };
const CHANNELS = [["whatsapp", "WhatsApp"], ["email", "Email"], ["linkedin", "LinkedIn"]];
const DAY = 86400000;
const CAPTION_LIMIT = 1024;
const MAX_UPLOAD = 50 * 1024 * 1024; // Supabase global limit while the spend cap is on

const S = {
  session: null, me: "", member: null, loaded: false, loadError: "",
  d: { team_members: [], posts: [], versions: [], notes: [], assets: [], rules: [], settings: [] },
  busy: 0, toast: null, modal: null, urls: {},
  edit: null, // { postId, channel, mode } while a text is open for editing
  channel: {}, vsel: {}, diff: {}, view: {}, more: {},
  cat: "all", only: "", col: "", q: "", showRejected: {},
  newMode: "idea", split: null, draftText: "",
  files: {}, translateError: "", lang: "en", langChosen: false,
};

// ---------------- language ----------------
// The desk's own words come in English and Hebrew. Posts stay in the language they were written in.
(function initLang() {
  let l = PARAMS.get("lang");
  try {
    if (l !== "he" && l !== "en") l = localStorage.getItem("desk:lang");
  } catch (_) {
    l = null;
  }
  S.langChosen = l === "he" || l === "en";
  S.lang = S.langChosen ? l : (navigator.language || "").toLowerCase().startsWith("he") ? "he" : "en";
})();
const MISSING = new Set();
if (DEMO) window.__deskMissing = MISSING;
// t("English text", { n: 3 }): the English text is the key, Hebrew comes from i18n.js.
function t(s, vars) {
  let out = String(s ?? "");
  if (S.lang === "he") {
    if (HE[out] != null) out = HE[out];
    else if (DEMO && /[A-Za-z]{3}/.test(out)) MISSING.add(out);
  }
  out = out.replace(/\|[a-z]+$/, ""); // "Published|nav": the part after | only tells two Hebrew meanings apart
  return vars ? out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : out;
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[c]));
const T = (s, vars) => esc(t(s, vars));
const plural = (n, one, many) => (n === 1 ? t(one) : t(many, { n }));
const locale = () => (S.lang === "he" ? "he-IL" : "en-GB");
const catLabel = (c) => t(CAT_KEYS[c] || c);

// ---------------- helpers ----------------
const isHttp = (u) => /^https?:\/\/[^\s"'<>]+$/i.test(String(u || ""));
const todayStr = () => localDate(new Date());
function localDate(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function parseDate(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(s, n) {
  const d = parseDate(s);
  return localDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}
const fmtDay = (s) => (s ? parseDate(s).toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" }) : "");
const fmtDow = (s) => parseDate(s).toLocaleDateString(locale(), { weekday: "long" });
const fmtDM = (s) => parseDate(s).toLocaleDateString(locale(), { day: "numeric", month: "short" });
function relDay(s) {
  if (!s) return "";
  const diff = Math.round((parseDate(s) - parseDate(todayStr())) / DAY);
  if (diff === 0) return t("Today");
  if (diff === 1) return t("Tomorrow");
  return fmtDay(s);
}
function ago(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return t("just now");
  if (s < 3600) return plural(Math.floor(s / 60), "1m ago", "{n}m ago");
  if (s < 86400) return plural(Math.floor(s / 3600), "1h ago", "{n}h ago");
  if (s < 7 * 86400) return plural(Math.floor(s / 86400), "1d ago", "{n}d ago");
  return new Date(iso).toLocaleDateString(locale(), { day: "numeric", month: "short" });
}
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
function member(email) {
  return S.d.team_members.find((m) => m.email === email) || { email, name: email ? email.split("@")[0] : "?", color: "#8b94a3", role: "writer" };
}
const nameOf = (email) => member(email).name;
function avatar(email, size = "") {
  const m = member(email);
  const ini = (m.name || "?").replace(/\(.*\)/, "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return `<span class="av ${size}" style="background:${esc(m.color || "#8b94a3")}" title="${esc(m.name)}">${esc(ini)}</span>`;
}
const isOwner = () => !!(S.member && S.member.role === "owner");
const tag = (c) => `<span class="tag ${esc(c)}">${esc(catLabel(c))}</span>`;
function waHtml(text) {
  return esc(text).replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, "$1<i>$2</i>");
}
function setting(key, fallback) {
  const r = S.d.settings.find((s) => s.key === key);
  return r ? r.value : fallback;
}
function cadence() {
  const c = { days: [0, 1, 2, 3, 4], email_per_week: 3, ...(setting("cadence", {}) || {}) };
  c.days = (Array.isArray(c.days) ? c.days : []).map(Number).filter((d) => d >= 0 && d <= 6);
  return c;
}

// The reader's language first, the other language under it.
function biText(en, he) {
  en = en || "";
  he = he || "";
  if (S.lang === "he") return he && he !== en ? { main: he, sub: en } : { main: he || en, sub: "" };
  return { main: en, sub: "" };
}
const clip = (s, n = 200) => (s && s.length > n ? s.slice(0, n) + "…" : s || "");

// ---------------- data access ----------------
const post = (id) => S.d.posts.find((p) => p.id === id);
function versionsOf(pid, ch = "whatsapp") {
  return S.d.versions.filter((v) => v.post_id === pid && v.channel === ch).sort((a, b) => a.n - b.n);
}
function latest(pid, ch = "whatsapp") {
  const vs = versionsOf(pid, ch);
  return vs[vs.length - 1] || null;
}
function shownVersion(pid, ch) {
  const vs = versionsOf(pid, ch);
  const want = S.vsel[`${pid}:${ch}`];
  return vs.find((v) => v.n === want) || vs[vs.length - 1] || null;
}
const notesOf = (pid) => S.d.notes.filter((n) => n.post_id === pid).sort((a, b) => a.created_at.localeCompare(b.created_at));
const assetsOf = (pid) => S.d.assets.filter((a) => a.post_id === pid).sort((a, b) => a.created_at.localeCompare(b.created_at));
const isMedia = (a) => /^(image|video)\//.test(a.mime || "");
// The picture that represents a post on its card: the approved one, else the newest live one.
function coverOf(pid) {
  const live = assetsOf(pid).filter((a) => isMedia(a) && a.status !== "replaced");
  return live.filter((a) => a.status === "approved").pop() || live.pop() || null;
}
function chosenIndex(v) {
  if (!v || !v.headlines || !v.headlines.length) return -1;
  if (v.chosen != null && v.headlines[v.chosen]) return v.chosen;
  return -1;
}
function headlineOf(p, v = latest(p.id)) {
  if (!v || !v.headlines || !v.headlines.length) return { en: p.title, he: p.title_he };
  let i = chosenIndex(v);
  if (i < 0) i = v.headlines.findIndex((h) => h.pick);
  return v.headlines[i < 0 ? 0 : i];
}
function displayTitle(p) {
  const h = headlineOf(p);
  // A headline that is not translated yet shows alone, not next to the working title's Hebrew.
  return biText(h.en || p.title, h.en && h.en !== p.title ? h.he || "" : h.he || p.title_he || "");
}
// What someone else did on a post since this browser last opened it.
const SEEN = (() => {
  try {
    return JSON.parse(localStorage.getItem("desk:seen") || "{}");
  } catch (_) {
    return {};
  }
})();
function saveSeen() {
  try {
    localStorage.setItem("desk:seen", JSON.stringify(SEEN));
  } catch (_) {
    /* only a convenience */
  }
}
if (!SEEN._base) {
  SEEN._base = new Date().toISOString();
  saveSeen();
}
function lastTouch(p) {
  let at = p.updated_by && p.updated_by !== S.me ? p.updated_at || "" : "";
  for (const list of [S.d.notes, S.d.versions, S.d.assets]) {
    for (const x of list) if (x.post_id === p.id && x.author !== S.me && (x.created_at || "") > at) at = x.created_at;
  }
  return at;
}
const isNew = (p) => {
  const at = lastTouch(p);
  return !!at && at > (SEEN[p.id] || SEEN._base);
};
function markSeen(p) {
  if (!isNew(p)) return;
  SEEN[p.id] = new Date().toISOString();
  saveSeen();
}
// The order of a column on the board; the drawer walks the same order.
function sortStage(c, list) {
  if (c === "ready") return list.sort((a, b) => (a.pinned_date || "9").localeCompare(b.pinned_date || "9"));
  if (c === "published") return list.sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""));
  return list.sort((a, b) => (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || (b.hot - a.hot) || b.updated_at.localeCompare(a.updated_at));
}
function siblings(p) {
  return sortStage(p.stage, S.d.posts.filter((x) => x.id === p.id || (x.stage === p.stage && x.status !== "rejected" && (S.cat === "all" || x.category === S.cat))));
}
// The next post in the column that still waits for Jay, after this one.
function nextWaiting(p) {
  const sib = siblings(p);
  const i = sib.findIndex((x) => x.id === p.id);
  const hit = [...sib.slice(i + 1), ...sib.slice(0, i)].find((x) => x.status === "waiting");
  return hit ? hit.id : null;
}
const openNotes = (pid) => notesOf(pid).filter((n) => n.kind === "note" && n.status === "open");
const waitingCount = () => S.d.posts.filter((p) => ["idea", "draft", "final"].includes(p.stage) && p.status === "waiting").length;

// Text that goes to WhatsApp: "<emoji> *Headline*", body, then the signature unless the body already has a group link.
function splitEmoji(h) {
  const m = String(h || "").trim().match(/^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})[️‍⃣\p{Extended_Pictographic}\p{Emoji_Modifier}]*)\s*(.*)$/u);
  return m ? [m[1], m[2]] : ["", String(h || "").trim()];
}
function composeWhatsApp(p, v = latest(p.id, "whatsapp")) {
  if (!v) return "";
  const [emoji, text] = splitEmoji(headlineOf(p, v).en);
  const clean = text.replace(/^\*+|\*+$/g, "").trim();
  const head = clean ? `${emoji ? emoji + " " : ""}*${clean}*` : "";
  const body = (v.body || "").trim();
  const sig = String((setting("signature", {}) || {}).text || "").trim();
  let out = head ? `${head}\n\n${body}` : body;
  if (sig && !/chat\.whatsapp\.com/.test(body)) out += `\n\n${sig}`;
  return out;
}
function composeChannel(p, ch) {
  if (ch === "whatsapp") return composeWhatsApp(p);
  const v = latest(p.id, ch);
  if (!v) return "";
  const h = headlineOf(p, v).en;
  if (ch === "email") return `${h ? `Subject: ${h}\n\n` : ""}${v.body || ""}`.trim();
  return [h, v.body].filter(Boolean).join("\n\n").trim();
}

// Warnings for the writer, never blockers.
function checksFor(p, v) {
  const out = [];
  if (!v) return out;
  const n = (v.headlines || []).length;
  out.push(n >= 3 ? { ok: true, t: t("{n} headline options", { n }) } : { ok: false, t: t("Headline options: {n} of 3", { n }) });
  const br = (v.body || "").match(/\[[^\]\n]{2,}\]/);
  out.push(br ? { ok: false, t: t("Brackets left in the text: {x}", { x: br[0].slice(0, 60) }) } : { ok: true, t: t("No [brackets] left") });
  const cta = ((v.body || "").match(/drop an? [^\n]*/i) || [])[0];
  if (cta) {
    const narrow = /\bif you('| a)?(re| are)?\s*(planning|going|claiming|building|testing|trying|already|using|switching)/i.test(cta) && !/useful|more (updates|like this)|learned/i.test(cta);
    out.push(narrow ? { ok: false, t: t("Narrow reaction ask: “{x}”. Try “if you found this useful”.", { x: cta.slice(0, 70) }) } : { ok: true, t: t("Easy reaction ask") });
  }
  const text = composeWhatsApp(p, v);
  const hasImage = assetsOf(p.id).some((a) => (a.mime || "").startsWith("image/") && a.status !== "replaced");
  if (text.length > CAPTION_LIMIT && hasImage) out.push({ ok: false, t: t("{n} characters with an image. Desktop WhatsApp can cut a caption after {max}.", { n: text.length.toLocaleString(), max: CAPTION_LIMIT.toLocaleString() }) });
  else out.push({ ok: true, t: t("{n} characters", { n: text.length.toLocaleString() }) });
  if (p.tried_myself === false && !/(planning to try|haven['’]t tried|not tried it|will try this myself)/i.test(v.body || "")) {
    out.push({ ok: false, t: t("Jay has not tried it: add a personal line, e.g. “I'm planning to try this myself and I'll share what I find.”") });
  }
  if (p.category === "news" && !(v.sources || []).some((s) => s.official)) out.push({ ok: false, t: t("News post without an official source") });
  return out;
}

// ---------------- schedule ----------------
const isCadenceDay = (ds) => cadence().days.includes(parseDate(ds).getDay());
function nextCadence(ds) {
  let d = addDays(ds, 1);
  for (let i = 0; i < 7 && !isCadenceDay(d); i++) d = addDays(d, 1);
  return d;
}
function prevCadence(ds) {
  let d = addDays(ds, -1);
  for (let i = 0; i < 7 && !isCadenceDay(d); i++) d = addDays(d, -1);
  return d;
}
// Posts that hold a publishing day: dated, not published, not rejected.
const dated = () => S.d.posts.filter((p) => p.pinned_date && p.stage !== "published" && p.status !== "rejected");
const pubDay = (p) => (p.published_at ? localDate(new Date(p.published_at)) : p.pinned_date);
const publishedOn = (ds) => S.d.posts.filter((p) => p.stage === "published" && pubDay(p) === ds);
// Who holds a day: a planned post, or one that already went out that day.
const onDay = (ds, except) => [...dated().filter((p) => p.pinned_date === ds && p.id !== except), ...publishedOn(ds)];
// The next publishing day after ds that nothing went out on yet.
function nextOpen(ds) {
  let d = nextCadence(ds);
  for (let i = 0; i < 400 && publishedOn(d).length; i++) d = nextCadence(d);
  return d;
}
// The first publishing day from today that nobody holds.
function nextFreeDay(except) {
  let d = todayStr();
  if (!isCadenceDay(d)) d = nextCadence(d);
  for (let i = 0; i < 400 && onDay(d, except).length; i++) d = nextCadence(d);
  return d;
}
// Put a post on a day and push whatever stands in its way one publishing day forward,
// until the chain reaches a gap. Returns [[post, newDate], ...] for the posts that move.
function pushPlan(ds, id) {
  // a post someone put on a non-publishing day on purpose stays where it is
  const later = dated()
    .filter((p) => p.id !== id && p.pinned_date >= ds && isCadenceDay(p.pinned_date))
    .sort((a, b) => a.pinned_date.localeCompare(b.pinned_date) || (a.queue_pos - b.queue_pos));
  const moves = [];
  let cur = ds;
  for (const p of later) {
    if (p.pinned_date > cur) break;
    cur = nextOpen(cur);
    moves.push([p, cur]);
  }
  return moves;
}
// ---------------- loading, auth, translation ----------------
async function loadAll(silent) {
  try {
    const d = await store.loadAll();
    S.d = d;
    S.member = d.team_members.find((m) => m.email === S.me && m.active) || null;
    S.loaded = true;
    S.loadError = "";
    // Owners read Hebrew by default, writers English. The switch in the top bar overrides it per browser.
    if (!S.langChosen) S.lang = isOwner() ? "he" : "en";
  } catch (e) {
    if (!silent) S.loadError = e.message;
  }
  render();
  translateMissing();
}

let translating = false;
const trSkip = new Map(); // "table:id:field" -> retry after (ms)
async function translateMissing() {
  if (translating || !S.member) return;
  translating = true;
  const mineOnly = !isOwner();
  let maxBatch = 8;
  try {
    for (let round = 0; round < 12; round++) {
      const jobs = [];
      const add = (table, id, field, text, author) => {
        if (!text || !String(text).trim()) return;
        if (mineOnly && author !== S.me) return;
        const k = `${table}:${id}:${field}`;
        if ((trSkip.get(k) || 0) > Date.now()) return;
        jobs.push({ table, id, field, text: String(text), key: k });
      };
      for (const p of S.d.posts) {
        if (!p.title_he) add("posts", p.id, "title_he", p.title, p.author);
        if (p.idea && !p.idea_he) add("posts", p.id, "idea_he", p.idea, p.author);
      }
      for (const v of S.d.versions) {
        if (v.body && !v.body_he) add("versions", v.id, "body_he", v.body, v.author);
        if (v.writer_note && !v.writer_note_he) add("versions", v.id, "writer_note_he", v.writer_note, v.author);
        (v.headlines || []).forEach((h, i) => {
          if (h.en && !h.he) add("versions", v.id, `headline:${h.en}`, h.en, v.author);
        });
      }
      for (const n of S.d.notes) {
        if (!n.body_he) add("notes", n.id, "body_he", n.body, n.author);
        if (n.answer && !n.answer_he) add("notes", n.id, "answer_he", n.answer, n.answered_by);
      }
      if (isOwner()) for (const r of S.d.rules) if (!r.body_he) add("rules", r.id, "body_he", r.body, S.me);
      if (!jobs.length) break;
      // Small batches: Hebrew output is long, and one failing item must not block the rest.
      const batch = [];
      let size = 0;
      for (const j of jobs) {
        if (batch.length >= maxBatch || (batch.length && size + j.text.length > 6000)) break;
        batch.push(j);
        size += j.text.length;
      }
      let res;
      try {
        res = await store.ai("translate", { texts: batch.map((j) => j.text) });
        S.translateError = "";
      } catch (e) {
        if (/not a team member/i.test(e.message)) throw e;
        S.translateError = e.message;
        // A failed batch is retried one item at a time; an item that fails alone waits 30 minutes.
        if (batch.length > 1) maxBatch = 1;
        else trSkip.set(batch[0].key, Date.now() + 30 * 60000);
        continue;
      }
      const byRow = new Map();
      batch.forEach((j, i) => {
        const key = `${j.table}:${j.id}`;
        if (!byRow.has(key)) byRow.set(key, { table: j.table, id: j.id, items: [] });
        byRow.get(key).items.push({ field: j.field, he: res.he[i] || "" });
      });
      for (const { table, id, items } of byRow.values()) {
        const row = S.d[table].find((r) => r.id === id);
        if (!row) continue;
        const patch = {};
        const heads = items.filter((x) => x.field.startsWith("headline:"));
        if (heads.length) {
          // Merge into the newest copy of the row, matched by the English text, so a
          // headline someone added or picked meanwhile is not overwritten.
          const fresh = (await store.getRow(table, id)) || row;
          patch.headlines = (fresh.headlines || []).map((h) => {
            const hit = heads.find((x) => x.field === `headline:${h.en}`);
            return hit && !h.he ? { ...h, he: hit.he } : { ...h };
          });
        }
        for (const { field, he } of items) if (!field.startsWith("headline:")) patch[field] = he;
        const saved = await store.update(table, id, patch);
        Object.assign(row, saved);
      }
      softRender();
    }
  } catch (e) {
    console.warn("translation paused:", e.message);
  } finally {
    translating = false;
  }
}

// Background updates wait while someone is typing, so a half-written text is never wiped.
function isTyping() {
  const a = document.activeElement;
  return !!(a && (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && !["checkbox", "radio", "file", "button", "submit"].includes(a.type))));
}
let renderLater = false;
function softRender() {
  if (S.modal || S.edit || isTyping()) {
    renderLater = true;
    return;
  }
  render();
}
document.addEventListener("focusout", () => {
  setTimeout(() => {
    if (renderLater && !isTyping() && !S.modal && !S.edit) {
      renderLater = false;
      render();
    }
  }, 150);
});

// ---------------- running actions ----------------
let toastTimer;
function toast(msg, err, undo) {
  S.toast = { undo, msg: t(/^Only the owner|^Only Jay/.test(msg) ? "Only Jay can do this." : /^Jay already approved this post/.test(msg) ? "Jay already approved this post. Ask him to send it back before changing the text." : msg), err };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    S.toast = null;
    const el = document.querySelector(".toast");
    if (el) el.remove();
  }, err ? 6000 : undo ? 7000 : 2600);
  render();
}
// Jay's answer on a post: save it, offer an undo, and move on to the next post that waits for him.
function decide(p, patch, msg, extra) {
  const before = { stage: p.stage, status: p.status, skip_reason: p.skip_reason || null };
  const inDrawer = route().id === p.id;
  const nextId = inDrawer ? nextWaiting(p) : null;
  const base = baseOf();
  return run(async () => {
    if (extra) await extra();
    await savePost(p, patch);
    if (inDrawer) go(nextId ? `#/${base}/p/${nextId}` : `#/${base}`);
  }, msg, () => run(async () => {
    await savePost(p, before);
    if (inDrawer) go(`#/${base}/p/${p.id}`);
  }, "Undone"));
}
async function run(fn, okMsg, undo) {
  S.busy++;
  render();
  try {
    await fn();
    if (okMsg) toast(okMsg, false, undo);
  } catch (e) {
    console.error(e);
    toast(e.message || String(e), true);
  } finally {
    S.busy--;
    render();
  }
}
async function savePost(p, patch) {
  const saved = await store.update("posts", p.id, patch);
  Object.assign(p, saved);
  return p;
}
async function insertRow(table, row) {
  const saved = await store.insert(table, row);
  S.d[table].push(saved);
  return saved;
}
async function updateRow(table, row, patch) {
  const saved = await store.update(table, row.id, patch);
  Object.assign(row, saved);
  return row;
}
function openModal(m) {
  S.modal = m;
  render();
  setTimeout(() => {
    const el = document.querySelector(".modal textarea, .modal input");
    if (el) el.focus();
  }, 30);
}

async function copyText(text, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${t(label)} ✓`);
  } catch (_) {
    openModal({ title: "Copy this text", body: "Your browser blocked automatic copying. Select all and copy.", text, readonly: true });
  }
}
async function urlFor(a, download, fresh) {
  if (download) return store.signedUrl(a.path, a.filename);
  const c = S.urls[a.path];
  if (!fresh && c && c.url && c.exp > Date.now()) return c.url;
  const url = await store.signedUrl(a.path);
  S.urls[a.path] = { url, exp: Date.now() + 50 * 60000 };
  return url;
}
async function ensureUrls(assets) {
  const missing = assets.filter((a) => a && !(S.urls[a.path] && S.urls[a.path].exp > Date.now()));
  if (!missing.length) return;
  // mark them as on the way, so the next render does not ask for the same links again
  missing.forEach((a) => (S.urls[a.path] = { url: "", exp: Date.now() + 30000 }));
  await Promise.all(
    missing.map((a) =>
      urlFor(a, false, true).catch(() => {
        // remember the failure for a minute so a broken file can't cause a render loop
        S.urls[a.path] = { url: "", exp: Date.now() + 60000 };
      }),
    ),
  );
  softRender();
}
const cachedUrl = (a) => (S.urls[a.path] ? S.urls[a.path].url : "");


// ---------------- actions ----------------
function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}
const baseOf = () => route().base;
const closeDrawer = () => go(`#/${baseOf()}`);

const A = {
  async signIn() {
    await store.signIn();
  },
  async signOut() {
    await store.signOut();
  },
  setLang(l) {
    S.lang = l === "he" ? "he" : "en";
    S.langChosen = true;
    try {
      localStorage.setItem("desk:lang", S.lang);
    } catch (_) {
      /* only a convenience */
    }
    render();
  },
  open(id) {
    go(`#/${baseOf()}/p/${id}`);
  },
  nav(id, dir) {
    const p = post(id);
    if (!p) return;
    const sib = siblings(p);
    const to = sib[sib.findIndex((x) => x.id === id) + Number(dir)];
    if (to) go(`#/${baseOf()}/p/${to.id}`);
  },
  undo() {
    const u = S.toast && S.toast.undo;
    S.toast = null;
    if (u) u();
    else render();
  },
  search() {},
  close() {
    S.edit = null;
    closeDrawer();
  },
  newPost(mode) {
    S.newMode = mode || "idea";
    S.split = null;
    go(`#/${baseOf()}/new`);
  },
  cat(c) {
    S.cat = c;
    render();
  },
  only(f) {
    S.only = S.only === f ? "" : f;
    render();
  },
  col(c) {
    S.col = c;
    render();
  },
  toggleRejected(c) {
    S.showRejected[c] = !S.showRejected[c];
    render();
  },
  view(pid, v) {
    S.view[pid] = v;
    render();
  },
  more(pid) {
    S.more[pid] = !S.more[pid];
    render();
  },
  channel(pid, ch) {
    S.channel[pid] = ch;
    S.edit = null;
    render();
  },
  vsel(pid, ch, n) {
    S.vsel[`${pid}:${ch}`] = Number(n);
    render();
  },
  diff(pid) {
    S.diff[pid] = !S.diff[pid];
    render();
  },
  closeModal() {
    S.modal = null;
    render();
  },
  refresh() {
    run(() => loadAll());
  },

  // ----- Jay's answers -----
  approve(id) {
    const p = post(id);
    if (p.stage === "final") return A.approveFinal(id);
    decide(p, { status: "approved" }, p.stage === "idea" ? "Approved. Next: the first draft." : "Approved. Next: the final version.");
  },
  approveFinal(id, sure) {
    const p = post(id);
    const v = latest(id);
    if (!v) return toast("There is no text yet.", true);
    if ((v.headlines || []).length > 1 && chosenIndex(v) < 0) return toast("Pick a headline first.", true);
    if (!coverOf(id) && !sure) {
      return openModal({ title: "Approve without a banner?", body: "This post has no image yet. It moves to Ready without one.", act: "approveFinalGo", args: [id], noText: true, confirm: "Approve without a banner" });
    }
    decide(p, { stage: "ready", status: "approved" }, p.pinned_date ? "Approved. It's in Ready." : "Approved. It's in Ready: pick a date.", async () => {
      if ((v.headlines || []).length === 1 && chosenIndex(v) < 0) await updateRow("versions", v, { chosen: 0 });
      for (const a of assetsOf(id)) if (isMedia(a) && a.status === "pending") await updateRow("assets", a, { status: "approved", stage: "final" });
    });
  },
  approveFinalGo(id) {
    A.approveFinal(id, true);
  },
  sendBack(id) {
    const open = openNotes(id);
    if (!open.length) {
      return openModal({ title: "Send back for changes", body: "What should change? The writer sees it on the post.", act: "sendBackGo", args: [id], required: true, confirm: "Send back" });
    }
    decide(post(id), { status: "changes" }, plural(open.length, "Sent back with 1 note", "Sent back with {n} notes"));
  },
  async sendBackGo(id, text) {
    await decide(post(id), { status: "changes" }, "Sent back with your note", async () => {
      await insertRow("notes", { post_id: id, kind: "note", body: text, version_n: latest(id) ? latest(id).n : null });
      translateMissing();
    });
  },
  reject(id) {
    openModal({ title: "Reject", body: "Optional: why. It stays on the board under Rejected, so nobody pitches it again.", act: "rejectGo", args: [id], confirm: "Reject" });
  },
  rejectGo(id, reason) {
    decide(post(id), { status: "rejected", skip_reason: reason || null }, "Rejected");
  },
  revive(id) {
    run(() => savePost(post(id), { status: "waiting", skip_reason: null }), "Back on the board");
  },
  resubmit(id) {
    run(() => savePost(post(id), { status: "waiting" }), "Sent to Jay");
  },
  moveTo(id, stage) {
    const p = post(id);
    if (!stage || stage === p.stage) return;
    const patch = { stage, status: ["ready", "published"].includes(stage) ? "approved" : "waiting" };
    if (stage === "published") patch.published_at = new Date().toISOString();
    if (p.stage === "published") patch.published_at = null;
    run(() => savePost(p, patch), t("Moved to {c}", { c: t(COL_ONE[stage]) }));
  },
  publish(id) {
    openModal({ title: "Mark as published", body: "Optional: paste the text you actually sent, so the writer sees your last edits.", act: "publishGo", args: [id], confirm: "Mark published", big: true, value: composeWhatsApp(post(id)) });
  },
  publishGo(id, text) {
    run(() => savePost(post(id), { stage: "published", published_at: new Date().toISOString(), published_text: text || null }), "Marked published");
  },
  unpublish(id) {
    run(() => savePost(post(id), { stage: "ready", status: "approved", published_at: null }), "Back in Ready");
  },
  reactions(id, n) {
    run(() => savePost(post(id), { reactions: n === "" ? null : Number(n) }));
  },
  deletePost(id) {
    openModal({ title: "Delete this post for good?", body: "Its versions, notes and files go too. Reject keeps it visible instead.", act: "deletePostGo", args: [id], confirm: "Delete", danger: true, noText: true });
  },
  deletePostGo(id) {
    run(async () => {
      for (const a of assetsOf(id)) await store.removeFile(a.path).catch(() => {});
      await store.remove("posts", id);
      S.d.posts = S.d.posts.filter((p) => p.id !== id);
      S.d.versions = S.d.versions.filter((v) => v.post_id !== id);
      S.d.notes = S.d.notes.filter((n) => n.post_id !== id);
      S.d.assets = S.d.assets.filter((a) => a.post_id !== id);
      closeDrawer();
    }, "Deleted");
  },

  // ----- dates -----
  // Put a post on a day. If the day is taken, ask whether to push the rest forward.
  setDate(id, ds) {
    const p = post(id);
    if (!ds) return run(() => savePost(p, { pinned_date: null }), "Date removed");
    const taken = onDay(ds, id);
    if (taken.length) {
      if (publishedOn(ds).length) {
        return openModal({ pre: true, title: t("That day is taken"), body: t("{x} already went out on {d}.", { x: displayTitle(publishedOn(ds)[0]).main, d: fmtDay(ds) }), noText: true,
          act: "setDateGo", args: [id, ds, "same"], confirm: t("Both on the same day") });
      }
      const moves = pushPlan(ds, id);
      return openModal({
        pre: true,
        title: t("That day is taken"),
        body: t("{x} is already on {d}.", { x: displayTitle(taken[0]).main, d: fmtDay(ds) }),
        noText: true,
        act: "setDateGo", args: [id, ds, "push"], confirm: plural(moves.length, "Push 1 post a day forward", "Push {n} posts a day forward"),
        alt: { act: "setDateGo", args: [id, ds, "same"], label: t("Both on the same day") },
      });
    }
    A.setDateGo(id, ds, "same");
  },
  setDateGo(id, ds, how) {
    const p = post(id);
    const moves = how === "push" ? pushPlan(ds, id) : [];
    run(async () => {
      await savePost(p, { pinned_date: ds });
      for (const [q, d] of moves) await savePost(q, { pinned_date: d });
    }, moves.length ? t("On {d}. {n} moved a day forward.", { d: fmtDay(ds), n: moves.length }) : t("On {d}", { d: fmtDay(ds) }));
  },
  nextFree(id) {
    A.setDateGo(id, nextFreeDay(id), "same");
  },
  // Hot: the first publishing day from today, everything after it moves forward.
  hotNow(id) {
    let d = todayStr();
    if (!isCadenceDay(d) || publishedOn(d).length) d = nextOpen(d);
    const p = post(id);
    const moves = pushPlan(d, id);
    run(async () => {
      await savePost(p, { pinned_date: d, hot: true });
      for (const [q, nd] of moves) await savePost(q, { pinned_date: nd });
    }, moves.length ? t("First in line: {d}. {n} moved a day forward.", { d: fmtDay(d), n: moves.length }) : t("First in line: {d}", { d: fmtDay(d) }));
  },
  // Arrows on the schedule: one publishing day earlier or later, swapping with whoever is there.
  shift(id, dir) {
    const p = post(id);
    const to = Number(dir) > 0 ? nextCadence(p.pinned_date) : prevCadence(p.pinned_date);
    if (to < todayStr()) return toast("That day has passed.", true);
    const there = onDay(to, id);
    run(async () => {
      for (const q of there) await savePost(q, { pinned_date: p.pinned_date });
      await savePost(p, { pinned_date: to });
    });
  },
  pickForDay(ds) {
    const ready = S.d.posts.filter((p) => ["ready", "final", "draft"].includes(p.stage) && p.status !== "rejected" && !p.pinned_date)
      .sort((a, b) => COLS.indexOf(b.stage) - COLS.indexOf(a.stage));
    if (!ready.length) return toast("No post without a date. Ready posts land here.", true);
    openModal({
      pre: true, title: t("What goes out on {d}?", { d: fmtDay(ds) }), noText: true, readonlyList: true,
      list: ready.map((p) => ({ act: "pickGo", args: [p.id, ds], label: displayTitle(p).main, sub: t(COL_ONE[p.stage]) })),
    });
  },
  pickGo(id, ds) {
    S.modal = null;
    A.setDateGo(id, ds, "same");
  },
  hot(id) {
    const p = post(id);
    run(() => savePost(p, { hot: !p.hot }), p.hot ? "No longer hot" : "Marked hot");
  },
  emailToo(id) {
    const p = post(id);
    run(() => savePost(p, { email_too: !p.email_too }));
  },
  meta(id, field, value) {
    const p = post(id);
    const patch = {};
    if (field === "category") patch.category = value;
    else if (field === "tried") patch.tried_myself = value === "" ? null : value === "yes";
    else if (field === "news_date") patch.news_date = value || null;
    else return;
    run(() => savePost(p, patch));
  },
  renameTitle(id) {
    const p = post(id);
    openModal({ title: "Working title", body: "Used on the board until a headline is picked.", act: "renameGo", args: [id], required: true, value: p.title, input: true, confirm: "Save" });
  },
  renameGo(id, text) {
    run(async () => {
      await savePost(post(id), { title: text, title_he: null });
      translateMissing();
    });
  },
  editIdea(id) {
    const p = post(id);
    openModal({ title: "Edit the idea", body: "What it is, why now, what readers get.", act: "editIdeaGo", args: [id], required: true, value: p.idea || "", big: true, confirm: "Save" });
  },
  editIdeaGo(id, text) {
    run(async () => {
      await savePost(post(id), { idea: text, idea_he: null });
      translateMissing();
    });
  },

  // ----- headlines and versions -----
  pickHeadline(vid, i) {
    const v = S.d.versions.find((x) => x.id === vid);
    if (!v) return;
    if (isOwner()) {
      run(() => updateRow("versions", v, { chosen: Number(i) === v.chosen ? null : Number(i) }));
    } else {
      const hl = v.headlines.map((h, k) => ({ ...h, pick: k === Number(i) ? !h.pick : false }));
      run(() => updateRow("versions", v, { headlines: hl }));
    }
  },
  addHeadline(vid) {
    openModal({ title: "Add a headline option", act: "addHeadlineGo", args: [vid], required: true, input: true, confirm: "Add" });
  },
  addHeadlineGo(vid, text) {
    const v = S.d.versions.find((x) => x.id === vid);
    run(async () => {
      await updateRow("versions", v, { headlines: [...(v.headlines || []), { en: text.trim() }] });
      translateMissing();
    });
  },
  // mode: "draft" (first draft of an approved idea), "final" (final version of an approved draft),
  // "fix" (a new version after notes) or "edit" (same column, same status).
  startEdit(pid, ch, mode) {
    S.edit = { postId: pid, channel: ch || "whatsapp", mode: mode || "edit" };
    S.channel[pid] = S.edit.channel;
    render();
    setTimeout(() => {
      const el = document.querySelector(".drawer textarea[name=body]");
      if (el) el.focus();
    }, 40);
  },
  cancelEdit() {
    S.edit = null;
    render();
  },
  async saveEdit(form) {
    const { postId, channel, mode } = S.edit;
    const p = post(postId);
    const prev = latest(postId, channel);
    const body = form.body.value.replace(/\s+$/, "");
    const headlines = form.headlines.value.split("\n").map((s) => s.trim()).filter(Boolean);
    const sources = form.sources.value.split("\n").map((s) => s.trim()).filter(Boolean).map(parseSource);
    const note = form.writer_note ? form.writer_note.value.trim() : "";
    if (!body.trim()) return toast("The text is empty.", true);
    const prevH = prev ? prev.headlines || [] : [];
    const hl = headlines.map((en) => {
      const old = prevH.find((h) => h.en === en);
      return old ? { ...old } : { en };
    });
    let chosen = null;
    if (prev && chosenIndex(prev) >= 0) {
      const k = hl.findIndex((h) => h.en === prevH[chosenIndex(prev)].en);
      chosen = k >= 0 ? k : null;
    }
    const owner = isOwner();
    let patch = null;
    let msg = "Saved as a new version";
    if (channel === "whatsapp") {
      if (mode === "draft") {
        patch = { stage: "draft", status: owner ? "approved" : "waiting" };
        msg = owner ? "Saved as the first draft" : "First draft sent to Jay";
      } else if (mode === "final") {
        patch = { stage: "final", status: owner ? "approved" : "waiting" };
        msg = owner ? "Saved as the final version" : "Final version sent to Jay";
      } else if (!owner && p.status !== "waiting") {
        patch = { status: "waiting" };
        msg = "Sent to Jay";
      }
    }
    await run(async () => {
      if (patch) {
        const fresh = await store.getRow("posts", postId);
        if (fresh && (fresh.stage !== p.stage || fresh.status !== p.status)) {
          Object.assign(p, fresh);
          throw new Error(t("Jay changed this post while you were writing. Your text is still here: copy it before closing."));
        }
      }
      const v = await insertRow("versions", {
        post_id: postId, channel, n: prev ? prev.n + 1 : 1, body, headlines: hl, chosen, sources,
        writer_note: note || (owner && p.author !== S.me ? "Edited by Jay" : null),
      });
      S.vsel[`${postId}:${channel}`] = v.n;
      const ticks = [...form.querySelectorAll("input[name=fixed]:checked")].map((i) => i.value);
      for (const nid of ticks) {
        const n = S.d.notes.find((x) => x.id === nid);
        if (n) await updateRow("notes", n, { status: "closed", closed_in: v.n });
      }
      if (patch) await savePost(p, patch);
      S.edit = null;
      translateMissing();
    }, msg);
  },
  fromWhatsApp(pid, ch) {
    const wa = latest(pid, "whatsapp");
    if (!wa) return toast("There is no WhatsApp text to start from.", true);
    S.edit = { postId: pid, channel: ch, mode: "edit", seed: { body: wa.body, headlines: (wa.headlines || []).map((h) => h.en).join("\n") } };
    render();
  },

  // ----- notes -----
  async addNote(form) {
    const pid = form.dataset.post;
    const text = form.note.value.trim();
    if (!text) return;
    await run(async () => {
      await insertRow("notes", { post_id: pid, kind: isOwner() ? "note" : "team", body: text, version_n: latest(pid) ? latest(pid).n : null });
      app.querySelectorAll(`form[data-form=addNote][data-post="${pid}"] textarea[name=note]`).forEach((el) => (el.value = ""));
      translateMissing();
    }, "Note added");
  },
  toggleNote(nid) {
    const n = S.d.notes.find((x) => x.id === nid);
    const v = latest(n.post_id);
    run(() => updateRow("notes", n, n.status === "open" ? { status: "closed", closed_in: v ? v.n : null } : { status: "open", closed_in: null }));
  },
  deleteNote(nid) {
    const n = S.d.notes.find((x) => x.id === nid);
    run(async () => {
      await store.remove("notes", nid);
      S.d.notes = S.d.notes.filter((x) => x !== n);
    });
  },
  noteToRule(nid) {
    const n = S.d.notes.find((x) => x.id === nid);
    run(async () => {
      await insertRow("rules", { body: n.body, source: `From a note on “${post(n.post_id).title}”, ${new Date().toLocaleDateString("en-GB")}`, sort: 100 });
      await updateRow("notes", n, { is_rule: true });
      translateMissing();
    }, "Added to house rules");
  },

  // ----- visuals -----
  async upload(pid, files) {
    files = [...files];
    if (!files.length) return;
    const p = post(pid);
    await run(async () => {
      for (const f of files) {
        if (f.size > MAX_UPLOAD) throw new Error(t("{name} is over 50 MB. Upload it to Drive and paste the link in a note.", { name: f.name }));
        const safe = f.name.replace(/[^\w.\-]+/g, "-").slice(-80);
        const path = `${pid}/${uuid()}-${safe}`;
        await store.upload(path, f);
        await insertRow("assets", { post_id: pid, path, filename: f.name, mime: f.type || null, size: f.size, stage: ["final", "ready", "published"].includes(p.stage) ? "final" : "sketch" });
      }
    }, files.length > 1 ? t("{n} files uploaded", { n: files.length }) : "Uploaded");
  },
  assetApprove(aid) {
    const a = S.d.assets.find((x) => x.id === aid);
    run(() => updateRow("assets", a, { status: "approved", stage: "final" }), "Visual approved");
  },
  assetReplace(aid) {
    const a = S.d.assets.find((x) => x.id === aid);
    run(() => updateRow("assets", a, { status: a.status === "replaced" ? "pending" : "replaced" }));
  },
  assetDelete(aid) {
    const a = S.d.assets.find((x) => x.id === aid);
    run(async () => {
      await store.remove("assets", aid);
      S.d.assets = S.d.assets.filter((x) => x !== a);
      await store.removeFile(a.path).catch((e) => console.warn("file left in storage:", e.message));
    });
  },
  async download(aid) {
    const a = S.d.assets.find((x) => x.id === aid);
    await run(async () => {
      const url = await urlFor(a, true);
      const link = document.createElement("a");
      link.href = url;
      link.download = a.filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    });
  },
  downloadCover(pid) {
    const a = coverOf(pid);
    if (a) A.download(a.id);
  },
  share(aid) {
    const a = S.d.assets.find((x) => x.id === aid);
    const file = S.files[a.id];
    if (file) {
      // Called straight from the tap, so Safari still counts it as the user's action.
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file] }).catch((e) => {
          if (e.name !== "AbortError") toast(e.message, true);
        });
      } else toast("This browser can't share files. Use Download.", true);
      return;
    }
    run(async () => {
      const blob = await (await fetch(await urlFor(a))).blob();
      S.files[a.id] = new File([blob], a.filename, { type: blob.type || a.mime || "application/octet-stream" });
    }, "Ready. Tap Share / save again.");
  },
  copyImage(aid) {
    const a = S.d.assets.find((x) => x.id === aid);
    const png = (async () => {
      const blob = await (await fetch(await urlFor(a))).blob();
      if (blob.type === "image/png") return blob;
      const bmp = await createImageBitmap(blob);
      const c = document.createElement("canvas");
      c.width = bmp.width;
      c.height = bmp.height;
      c.getContext("2d").drawImage(bmp, 0, 0);
      return new Promise((r) => c.toBlob(r, "image/png"));
    })();
    // The clipboard write starts inside the tap; Safari accepts a promise for the data.
    let writing;
    try {
      writing = navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
    } catch (e) {
      return toast("This browser can't copy images. Use Download.", true);
    }
    run(() => writing, "Image copied. Paste it in WhatsApp, then copy the text.");
  },
  copyPost(pid, ch = "whatsapp") {
    const p = post(pid);
    const v = latest(pid, ch);
    if (ch === "whatsapp" && v && (v.headlines || []).length > 1 && chosenIndex(v) < 0) return toast("Pick a headline first.", true);
    const text = composeChannel(p, ch);
    if (!text) return toast("Nothing to copy yet.", true);
    copyText(text, ch === "whatsapp" ? "Copied for WhatsApp" : "Copied");
  },

  // ----- new posts -----
  newMode(m) {
    S.newMode = m;
    S.split = null;
    render();
  },
  async createIdea(form) {
    const f = Object.fromEntries(new FormData(form));
    if (!f.title.trim()) return toast("Give it a working title.", true);
    await run(async () => {
      const p = await insertRow("posts", {
        title: f.title.trim(), category: f.category, idea: (f.idea || "").trim() || null, stage: "idea", status: "waiting",
        hot: f.hot === "on", score: f.score ? Number(f.score) : null, news_date: f.news_date || null,
        covered_before: (f.covered_before || "").trim() || null,
      });
      const sources = (f.sources || "").split("\n").map((s) => s.trim()).filter(Boolean).map(parseSource);
      if (sources.length) await insertRow("notes", { post_id: p.id, kind: "team", body: `Sources:\n${sources.map((s) => s.url).join("\n")}` });
      translateMissing();
      go(`#/${baseOf()}/p/${p.id}`);
    }, "Idea added");
  },
  async splitDraft(form) {
    const text = form.draft.value;
    if (!text.trim()) return toast("Paste the draft first.", true);
    S.draftText = text;
    await run(async () => {
      S.split = await store.ai("split", { text });
    });
  },
  async createDraft(form) {
    const f = Object.fromEntries(new FormData(form));
    const headlines = f.headlines.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!f.title.trim() && !headlines.length) return toast("Add a title or a headline.", true);
    if (!f.body.trim()) return toast("The post text is empty.", true);
    const pickIdx = S.split ? S.split.headlines.findIndex((h) => h.pick) : -1;
    const pickEn = pickIdx >= 0 ? S.split.headlines[pickIdx].en : null;
    await run(async () => {
      const p = await insertRow("posts", {
        title: (f.title.trim() || headlines[0]).slice(0, 200), category: f.category, stage: "draft", status: isOwner() ? "approved" : "waiting",
        hot: f.hot === "on", idea: (f.idea || "").trim() || null, news_date: f.news_date || null,
      });
      await insertRow("versions", {
        post_id: p.id, channel: "whatsapp", n: 1, body: f.body.trim(),
        headlines: headlines.map((en) => ({ en, pick: en === pickEn })),
        sources: f.sources.split("\n").map((s) => s.trim()).filter(Boolean).map(parseSource),
        writer_note: f.notes.trim() || null,
      });
      S.split = null;
      S.draftText = "";
      translateMissing();
      go(`#/${baseOf()}/p/${p.id}`);
    }, isOwner() ? "Draft saved" : "Sent to Jay");
  },

  // ----- rules and settings -----
  addRule() {
    openModal({ title: "New house rule", body: "One rule, in plain words.", act: "addRuleGo", args: [], required: true, confirm: "Add" });
  },
  addRuleGo(text) {
    run(async () => {
      await insertRow("rules", { body: text, source: `Added ${new Date().toLocaleDateString("en-GB")}`, sort: 100 });
      translateMissing();
    });
  },
  editRule(id) {
    const r = S.d.rules.find((x) => x.id === id);
    openModal({ title: "Edit rule", act: "editRuleGo", args: [id], required: true, value: r.body, confirm: "Save" });
  },
  editRuleGo(id, text) {
    const r = S.d.rules.find((x) => x.id === id);
    run(async () => {
      await updateRow("rules", r, { body: text, body_he: null });
      translateMissing();
    });
  },
  toggleRule(id) {
    const r = S.d.rules.find((x) => x.id === id);
    run(() => updateRow("rules", r, { active: !r.active }));
  },
  deleteRule(id) {
    run(async () => {
      await store.remove("rules", id);
      S.d.rules = S.d.rules.filter((r) => r.id !== id);
    });
  },
  copyRules() {
    const rules = S.d.rules.filter((r) => r.active).sort((a, b) => a.sort - b.sort);
    copyText(`House rules for Jay's WhatsApp posts. Follow every one:\n${rules.map((r, i) => `${i + 1}. ${r.body}`).join("\n")}`, "Rules copied as a prompt");
  },
  async saveSettings(form) {
    const f = Object.fromEntries(new FormData(form));
    const days = [...form.querySelectorAll("input[name=day]:checked")].map((i) => Number(i.value));
    await run(async () => {
      for (const [key, value] of [["signature", { text: f.signature.trim() }], ["cadence", { days, email_per_week: Number(f.email_per_week) || 0 }]]) {
        const saved = await store.upsert("settings", { key, value });
        const row = S.d.settings.find((s) => s.key === key);
        if (row) Object.assign(row, saved);
        else S.d.settings.push(saved);
      }
    }, "Settings saved");
  },
  async addMember(form) {
    const f = Object.fromEntries(new FormData(form));
    const email = f.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("That email doesn't look right.", true);
    if (email === S.me) return toast("That's your own account. Change other members from the table.", true);
    if (S.d.team_members.some((m) => m.email === email)) return toast("That email is already on the team. Use the table above.", true);
    await run(async () => {
      const saved = await store.upsert("team_members", { email, name: f.name.trim() || email.split("@")[0], role: f.role, color: f.color || "#2f68d8", active: true });
      const row = S.d.team_members.find((m) => m.email === email);
      if (row) Object.assign(row, saved);
      else S.d.team_members.push(saved);
      app.querySelectorAll("form[data-form=addMember]").forEach((f) => f.reset());
    }, "Member saved");
  },
  memberActive(email) {
    const m = S.d.team_members.find((x) => x.email === email);
    if (m.email === S.me) return toast("You can't switch yourself off.", true);
    run(async () => Object.assign(m, await store.update("team_members", email, { active: !m.active })));
  },
  memberRole(email, role) {
    const m = S.d.team_members.find((x) => x.email === email);
    if (m.email === S.me) return toast("You can't change your own role.", true);
    run(async () => Object.assign(m, await store.update("team_members", email, { role })));
  },
};

function parseSource(line) {
  const m = line.match(/https?:\/\/\S+/);
  const url = m ? m[0] : line;
  const label = line.replace(url, "").replace(/^[\s:–-]+|[\s:–-]+$/g, "") || (isHttp(url) ? new URL(url).hostname.replace(/^www\./, "") : url);
  const official = /(^|\.)(amazon\.[a-z.]+|aboutamazon\.com|openai\.com|anthropic\.com|claude\.com|claude\.ai|google\.com|blog\.google|shopify\.com|meta\.com|microsoft\.com|apple\.com)$/i.test(isHttp(url) ? new URL(url).hostname : "");
  return { url, label, official };
}

// ---------------- views ----------------
// #/board, #/schedule, #/published, #/settings; a post opens on top: #/board/p/<id>; new: #/board/new
function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "post") return { base: "board", id: parts[1] };
  const base = ["board", "schedule", "published", "settings"].includes(parts[0]) ? parts[0] : "board";
  if (parts[1] === "p" && parts[2]) return { base, id: parts[2] };
  if (parts[1] === "new") return { base, isNew: true };
  return { base };
}

function topBar(r) {
  const w = waitingCount();
  const link = (name, label, extra = "") => `<a href="#/${name}" class="${r.base === name ? "on" : ""}">${T(label)}${extra}</a>`;
  return `<header class="top"><div class="top-in">
    <a class="brand" href="#/board"><i></i>Content Desk</a>
    <nav class="nav">
      ${link("board", "Board", w ? `<span class="dot" title="${T("Waiting for Jay")}">${w}</span>` : "")}
      ${link("schedule", "Schedule")}
      ${link("published", "Published|nav")}
    </nav>
    <div class="me">${DEMO ? '<span class="demo-badge">DEMO</span>' : ""}
      <button class="btn sm go" data-act="newPost" data-a="idea">${T("+ New")}</button>
      <button class="btn sm ghost" data-act="setLang" data-a="${S.lang === "he" ? "en" : "he"}">${S.lang === "he" ? "English" : "עברית"}</button>
      <a class="iconbtn ${r.base === "settings" ? "on" : ""}" href="#/settings" title="${T("Settings")}" aria-label="${T("Settings")}">⚙</a>
      ${avatar(S.me)}
    </div>
  </div></header>`;
}

function statusPill(p) {
  if (p.stage === "published") return `<span class="pill mute">✓ ${esc(p.published_at ? fmtDM(localDate(new Date(p.published_at))) : t("Published"))}</span>`;
  if (p.status === "rejected") return `<span class="pill st-rejected">${T("Rejected")}</span>`;
  if (p.stage === "ready") return p.pinned_date ? `<span class="pill go">📅 ${esc(relDay(p.pinned_date))}</span>` : `<span class="pill wait">📅 ${T("No date yet")}</span>`;
  return `<span class="pill st-${esc(p.status)}">${T(STATUS_KEYS[p.status] || p.status)}</span>`;
}
// One short line under the title: what has to happen next, and by whom.
function nextStep(p) {
  if (p.status === "rejected" || p.stage === "published") return "";
  const n = openNotes(p.id).length;
  if (p.stage === "ready") return p.pinned_date ? "" : t("Next: pick a date");
  if (p.status === "approved") return p.stage === "idea" ? t("Next: the first draft") : p.stage === "draft" ? t("Next: the final version") : "";
  if (p.status === "changes") return n ? plural(n, "Next: fix 1 note", "Next: fix {n} notes") : t("Next: fix and send again");
  return "";
}

function card(p, opts = {}) {
  const tt = displayTitle(p);
  const cover = coverOf(p.id);
  if (cover) ensureUrls([cover]);
  const url = cover ? cachedUrl(cover) : "";
  const coverHtml = cover ? `<div class="c-cover">${url ? ((cover.mime || "").startsWith("video/") ? `<video src="${esc(url)}" muted playsinline preload="metadata"></video><span class="c-play">▶</span>` : `<img alt="" src="${esc(url)}" loading="lazy">`) : ""}</div>` : "";
  const next = nextStep(p);
  const nNotes = notesOf(p.id).length;
  const v = latest(p.id);
  const foot = [
    `${avatar(p.author, "sm")}<span>${esc(nameOf(p.author))}</span>`,
    `<span>${esc(ago(p.updated_at))}</span>`,
    v ? `<span>v${v.n}</span>` : "",
    nNotes ? `<span title="${T("Notes")}">💬 ${nNotes}</span>` : "",
    p.email_too ? `<span title="${T("Also email")}">✉</span>` : "",
    p.pinned_date && p.stage !== "ready" && p.stage !== "published" ? `<span>📅 ${esc(fmtDM(p.pinned_date))}</span>` : "",
  ].filter(Boolean).join("");
  let quick = "";
  let footQuick = "";
  const pitch = p.stage === "idea" && p.idea && p.status !== "rejected" ? biText(clip(p.idea, 200), clip(p.idea_he, 200)).main : "";
  if (isOwner() && p.stage === "idea" && p.status === "waiting") {
    footQuick = `<span class="sp"></span><button class="qbtn ok" data-act="approve" data-a="${p.id}" title="${T("Approve")}" aria-label="${T("Approve")}">✓</button><button class="qbtn no" data-act="reject" data-a="${p.id}" title="${T("Reject")}" aria-label="${T("Reject")}">✕</button>`;
  } else if (p.stage === "ready") {
    quick = `<div class="c-quick">${!p.pinned_date ? `<button class="btn sm" data-act="nextFree" data-a="${p.id}">📅 ${esc(fmtDay(nextFreeDay(p.id)))}</button>` : ""}<button class="btn sm go" data-act="copyPost" data-a="${p.id}">${T("Copy")}</button>${cover ? `<button class="btn sm" data-act="downloadCover" data-a="${p.id}" title="${T("Download the banner")}">↓</button>` : ""}</div>`;
  }
  return `<div class="card st-${esc(p.status)} ${p.stage === "ready" && !p.pinned_date ? "needs-date" : ""} ${opts.big ? "big" : ""}" data-act="open" data-a="${p.id}" tabindex="0">
    ${coverHtml}
    <div class="c-body">
      <div class="c-top">${isNew(p) ? `<span class="newdot" title="${T("New since you last looked")}"></span>` : ""}${statusPill(p)}${p.score && p.stage === "idea" ? `<span class="pill mute">${p.score}/10</span>` : ""}${p.hot ? `<span class="pill hot">🔥</span>` : ""}<span class="sp"></span>${tag(p.category)}</div>
      <div class="c-title" dir="auto">${esc(tt.main)}</div>
      ${tt.sub && opts.big ? `<div class="c-sub" dir="auto">${esc(tt.sub)}</div>` : ""}
      ${pitch ? `<div class="c-pitch" dir="auto">${esc(pitch)}</div>` : ""}
      ${next ? `<div class="c-next">${esc(next)}</div>` : ""}
      ${p.status === "rejected" && p.skip_reason ? `<div class="c-why" dir="auto">${esc(p.skip_reason)}</div>` : ""}
      <div class="c-foot ${footQuick ? "with-q" : ""}"><span class="c-meta">${foot}</span>${footQuick}</div>
      ${quick}
    </div>
  </div>`;
}

function viewBoard() {
  const match = (p) => (S.cat === "all" || p.category === S.cat) && (
    !S.only ||
    (S.only === "waiting" && p.status === "waiting" && ["idea", "draft", "final"].includes(p.stage)) ||
    (S.only === "changes" && p.status === "changes" && ["idea", "draft", "final"].includes(p.stage)) ||
    (S.only === "nodate" && p.stage === "ready" && !p.pinned_date));
  const q = S.q.trim().toLowerCase();
  const hay = (p) => {
    const v = latest(p.id);
    return [p.title, p.title_he, p.idea, p.idea_he, ...((v && v.headlines) || []).flatMap((h) => [h.en, h.he])].filter(Boolean).join(" ").toLowerCase();
  };
  const ps = S.d.posts.filter((p) => match(p) && (!q || hay(p).includes(q)));
  const all = S.d.posts.filter((p) => S.cat === "all" || p.category === S.cat);
  const count = (f) => all.filter(f).length;
  const nWait = count((p) => p.status === "waiting" && ["idea", "draft", "final"].includes(p.stage));
  const nChg = count((p) => p.status === "changes" && ["idea", "draft", "final"].includes(p.stage));
  const nNoDate = count((p) => p.stage === "ready" && !p.pinned_date);
  const twoWeeks = Date.now() - 14 * DAY;
  const sortCol = sortStage;
  const colOf = (c) => {
    let list = ps.filter((p) => p.stage === c);
    if (c === "published") list = list.filter((p) => new Date(p.published_at || p.updated_at).getTime() > twoWeeks);
    const live = sortCol(c, list.filter((p) => p.status !== "rejected"));
    const gone = list.filter((p) => p.status === "rejected").sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return { live, gone };
  };
  const cols = COLS.map((c) => ({ c, ...colOf(c) }));
  if (!S.col) S.col = (cols.find((x) => x.live.some((p) => p.status === "waiting")) || cols[0]).c;
  const chip = (key, n, label, cls) => `<button class="chip ${cls} ${S.only === key ? "on" : ""}" data-act="only" data-a="${key}" ${n || S.only === key ? "" : "disabled"}><b>${n}</b> ${T(label)}</button>`;
  return `<div class="boardbar">
      <div class="chips">${chip("waiting", nWait, "waiting for Jay", "c-wait")}${chip("changes", nChg, "need changes", "c-chg")}${chip("nodate", nNoDate, "ready without a date", "c-date")}</div>
      <form data-form="search" class="search"><input type="search" name="q" data-input="q" dir="auto" value="${esc(S.q)}" placeholder="${T("Search…")}" aria-label="${T("Search…")}"></form>
      <div class="chips cats">${["all", ...CATS].map((c) => `<button class="chip ${S.cat === c ? "on" : ""}" data-act="cat" data-a="${c}">${c === "all" ? T("All") : esc(catLabel(c))}</button>`).join("")}</div>
    </div>
    <div class="coltabs">${cols.map((x) => `<button class="${S.col === x.c ? "on" : ""}" data-act="col" data-a="${x.c}">${T(COL_KEYS[x.c])} <span>${x.live.length}</span></button>`).join("")}</div>
    <div class="board" style="grid-template-columns:${cols.map((x) => (x.live.length + x.gone.length ? "minmax(250px,1fr)" : "minmax(170px,.5fr)")).join(" ")}">${cols.map((x) => `<section class="col col-${x.c} ${S.col === x.c ? "on" : ""}">
      <h3><i></i>${T(COL_KEYS[x.c])}<span class="count">${x.live.length}</span>${x.c === "idea" ? `<button class="iconbtn sm" data-act="newPost" data-a="idea" title="${T("+ New idea")}">+</button>` : ""}</h3>
      <div class="col-body">
        ${x.live.map((p) => card(p)).join("") || `<div class="empty">${T(x.c === "published" ? "Nothing in the last 14 days." : "Nothing here.")}</div>`}
        ${x.gone.length ? `<div class="rej-head">${T("Rejected|col")} <span class="count">${x.gone.length}</span></div>${x.gone.map((p) => card(p)).join("")}` : ""}
        ${x.c === "published" ? `<a class="linkbtn" href="#/published">${T("All published →")}</a>` : ""}
      </div></section>`).join("")}
    </div>`;
}

function viewSchedule() {
  const cad = cadence();
  const today = todayStr();
  const start = parseDate(today);
  const sunday = localDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() - start.getDay()));
  const weeks = 4;
  const last = addDays(sunday, weeks * 7 - 1);
  const live = dated();
  const pubOn = (ds) => S.d.posts.filter((p) => p.stage === "published" && p.published_at && localDate(new Date(p.published_at)) === ds);
  const he = S.lang === "he";
  const item = (p, published) => {
    const cover = coverOf(p.id);
    if (cover) ensureUrls([cover]);
    const url = cover ? cachedUrl(cover) : "";
    const canMove = !published && p.pinned_date >= today;
    return `<div class="s-item ${published ? "pub" : `stg-${p.stage}`}" data-act="open" data-a="${p.id}">
      ${url && (cover.mime || "").startsWith("image/") ? `<img alt="" src="${esc(url)}" loading="lazy">` : ""}
      <div class="s-t" dir="auto">${published ? "✓ " : ""}${esc(displayTitle(p).main)}</div>
      <div class="s-meta">${published ? T("Published") : p.stage === "ready" ? `<span class="pill go">${T("Ready")}</span>` : `<span class="pill st-${esc(p.status)}">${T(COL_ONE[p.stage])}</span>`}${p.email_too ? " ✉" : ""}${p.hot ? " 🔥" : ""}</div>
      ${canMove ? `<div class="s-ctl"><button data-act="shift" data-a="${p.id}" data-b="-1" title="${T("A publishing day earlier")}">${he ? "→" : "←"}</button><button data-act="shift" data-a="${p.id}" data-b="1" title="${T("A publishing day later")}">${he ? "←" : "→"}</button></div>` : ""}
    </div>`;
  };
  const weekHtml = (w) => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(sunday, w * 7 + i));
    const inWeek = (p) => p.pinned_date >= days[0] && p.pinned_date <= days[6];
    const pubs = days.reduce((n, d) => n + pubOn(d).length, 0);
    const wa = live.filter(inWeek).length + pubs;
    const em = live.filter((p) => inWeek(p) && p.email_too).length + days.reduce((n, d) => n + pubOn(d).filter((p) => p.email_too).length, 0);
    const label = w === 0 ? t("This week") : w === 1 ? t("Next week") : t("Week of {d}", { d: fmtDM(days[0]) });
    return `<div class="week"><div class="week-head"><b>${esc(label)}</b><span class="muted small">${esc(fmtDM(days[0]))} – ${esc(fmtDM(days[6]))}</span>
        <span class="sp"></span><span class="wk ${wa >= cad.days.length ? "ok" : ""}">${T("WhatsApp {a}/{b}", { a: wa, b: cad.days.length })}</span><span class="wk ${em >= cad.email_per_week ? "ok" : ""}">${T("Email {a}/{b}", { a: em, b: cad.email_per_week })}</span></div>
      <div class="days">${days.map((ds) => {
        const on = isCadenceDay(ds);
        const items = live.filter((p) => p.pinned_date === ds);
        const pub = pubOn(ds);
        const past = ds < today;
        return `<div class="day ${on ? "" : "off"} ${ds === today ? "today" : ""} ${past ? "past" : ""}">
          <div class="dn"><b>${esc(fmtDow(ds))}</b><span>${esc(fmtDM(ds))}</span></div>
          ${pub.map((p) => item(p, true)).join("")}${items.map((p) => item(p)).join("")}
          ${!past && on && !items.length && !pub.length ? `<button class="slot-free" data-act="pickForDay" data-a="${ds}">+ ${T("free")}</button>` : ""}
        </div>`;
      }).join("")}</div></div>`;
  };
  const noDate = S.d.posts.filter((p) => p.stage === "ready" && !p.pinned_date);
  const overdue = live.filter((p) => p.pinned_date < today);
  const beyond = live.filter((p) => p.pinned_date > last).sort((a, b) => a.pinned_date.localeCompare(b.pinned_date));
  const strip = (title, list, hint) => `<section class="strip"><h2>${T(title)} <span class="count">${list.length}</span></h2>${hint ? `<p class="muted small">${T(hint)}</p>` : ""}
    <div class="strip-row">${list.map((p) => {
      const cover = coverOf(p.id);
      if (cover) ensureUrls([cover]);
      const url = cover ? cachedUrl(cover) : "";
      return `<div class="u-card" data-act="open" data-a="${p.id}">
        ${url && (cover.mime || "").startsWith("image/") ? `<img alt="" src="${esc(url)}">` : ""}
        <div class="u-t" dir="auto">${esc(displayTitle(p).main)}</div>
        ${p.pinned_date ? `<div class="muted small">📅 ${esc(fmtDay(p.pinned_date))}</div>` : ""}
        <div class="btns"><button class="btn sm go" data-act="nextFree" data-a="${p.id}">📅 ${esc(fmtDay(nextFreeDay(p.id)))}</button>
        <input type="date" class="sm" min="${today}" data-change="date" data-a="${p.id}" title="${T("Pick a day")}">
        <button class="btn sm" data-act="hotNow" data-a="${p.id}" title="${T("First publishing day from today; the rest move a day forward")}">🔥 ${T("First in line")}</button></div>
      </div>`;
    }).join("")}</div></section>`;
  return `<div class="headrow"><div><h1>${T("Schedule")}</h1>
      <p class="lead">${T("Ready posts get a day here. Hot news goes first in line and the rest move a publishing day forward. A free day: press it and pick a post.")}</p></div></div>
    ${overdue.length ? strip("The date passed and it did not go out", overdue) : ""}
    ${noDate.length ? strip("Ready, no date yet", noDate) : ""}
    <div class="weeks">${Array.from({ length: weeks }, (_, w) => weekHtml(w)).join("")}</div>
    ${beyond.length ? `<h2>${T("Further ahead")} <span class="count">${beyond.length}</span></h2><div class="days loose">${beyond.map((p) => `<div class="day"><div class="dn"><b>${esc(fmtDay(p.pinned_date))}</b></div>${item(p)}</div>`).join("")}</div>` : ""}
    ${isOwner() ? `<p class="muted small" style="margin-top:16px">${T("Publishing days and the weekly email count are in")} <a href="#/settings">${T("Settings")}</a>.</p>` : ""}`;
}

function viewPublished() {
  const list = S.d.posts.filter((p) => p.stage === "published").sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""));
  const groups = [];
  for (const p of list) {
    const d = new Date(p.published_at || p.updated_at);
    const key = d.toLocaleDateString(locale(), { month: "long", year: "numeric" });
    if (!groups.length || groups[groups.length - 1].key !== key) groups.push({ key, items: [] });
    groups[groups.length - 1].items.push(p);
  }
  return `<div class="headrow"><div><h1>${T("Published|nav")}</h1><p class="lead">${T("Everything that went out, newest first, with its banner.")}</p></div></div>
    ${groups.length ? groups.map((g) => `<h2>${esc(g.key)} <span class="count">${g.items.length}</span></h2>
      <div class="pgrid">${g.items.map((p) => card(p, { big: true })).join("")}</div>`).join("") : `<div class="empty" style="margin-top:16px">${T("Nothing published yet.")}</div>`}`;
}

function viewSettings() {
  const owner = isOwner();
  const cad = cadence();
  const sig = (setting("signature", {}) || {}).text || "";
  const dayName = (i) => new Date(2026, 0, 4 + i).toLocaleDateString(locale(), { weekday: "short" });
  const rules = [...S.d.rules].sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
  return `<h1>${T("Settings")}</h1>
    <div class="panel" style="margin-top:18px"><h3>${T("Language")}</h3>
      <span class="seg"><button type="button" class="${S.lang === "en" ? "on" : ""}" data-act="setLang" data-a="en">English</button><button type="button" class="${S.lang === "he" ? "on" : ""}" data-act="setLang" data-a="he">עברית</button></span>
      <p class="hint">${T("Only changes what you see. Everyone else keeps their own language.")}</p>
    </div>
    <div class="panel"><div class="headrow"><h3>${T("House rules")}</h3><div class="btns"><button class="btn sm" data-act="copyRules">${T("Copy as a prompt")}</button>${owner ? `<button class="btn sm" data-act="addRule">${T("+ Rule")}</button>` : ""}</div></div>
      <p class="hint">${T("Every note from Jay that is a rule and not a one-off fix. Copy them as a prompt for your own Claude, so the rules go in while you write.")}</p>
      <ol class="rules">${rules.map((r) => {
        const b = biText(r.body, r.body_he);
        return `<li class="${r.active ? "" : "off"}"><div dir="auto">${esc(b.main)}</div>${b.sub ? `<div class="t-sub" dir="auto">${esc(b.sub)}</div>` : ""}
        <div class="who">${r.check_key ? `<span class="pill go">${T("checked automatically")}</span>` : ""}<span dir="auto">${esc(r.source || "")}</span>
        ${owner ? `<button class="linkbtn" data-act="editRule" data-a="${r.id}">${T("Edit")}</button><button class="linkbtn" data-act="toggleRule" data-a="${r.id}">${r.active ? T("Switch off") : T("Switch on")}</button><button class="linkbtn" data-act="deleteRule" data-a="${r.id}">${T("Delete")}</button>` : ""}</div></li>`;
      }).join("")}</ol>
    </div>
    <form data-form="saveSettings" class="panel"><h3>${T("Publishing")}</h3>
      <div class="field"><label>${T("Publishing days (WhatsApp)")}</label><div class="btns">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<label class="check"><input type="checkbox" name="day" value="${i}" ${cad.days.includes(i) ? "checked" : ""} ${owner ? "" : "disabled"}> ${esc(dayName(i))}</label>`).join("")}</div></div>
      <div class="field" style="max-width:220px"><label>${T("Emails per week")}</label><input type="number" min="0" max="7" name="email_per_week" value="${cad.email_per_week}" ${owner ? "" : "disabled"}></div>
      <div class="field"><label>${T("Signature added under every WhatsApp post")}</label><textarea name="signature" dir="auto" ${owner ? "" : "disabled"}>${esc(sig)}</textarea>
      <span class="hint">${T("Added only when the post text has no group link of its own.")}</span></div>
      ${owner ? `<button class="btn go">${T("Save")}</button>` : ""}
    </form>
    <div class="panel"><h3>${T("Team")}</h3>
    <div class="tablewrap"><table><tr><th>${T("Name")}</th><th>${T("Email")}</th><th>${T("Role")}</th><th>${T("Status")}</th></tr>
    ${S.d.team_members.map((m) => `<tr><td class="nowrap">${avatar(m.email, "sm")} ${esc(m.name)}</td><td class="mono" dir="ltr">${esc(m.email)}</td>
      <td>${owner && m.email !== S.me ? `<select data-change="memberRole" data-a="${esc(m.email)}" style="width:auto"><option value="writer" ${m.role === "writer" ? "selected" : ""}>${T("Writer")}</option><option value="owner" ${m.role === "owner" ? "selected" : ""}>${T("Owner")}</option></select>` : m.role === "owner" ? T("Owner") : T("Writer")}</td>
      <td>${owner && m.email !== S.me ? `<button class="btn sm ghost" data-act="memberActive" data-a="${esc(m.email)}">${m.active ? T("Active · switch off") : T("Off · switch on")}</button>` : m.active ? T("Active") : T("Off")}</td></tr>`).join("")}</table></div>
    ${owner ? `<form data-form="addMember" style="margin-top:16px"><div class="row3"><div class="field"><label>${T("Google email")}</label><input type="email" name="email" dir="ltr" required placeholder="name@jaygptpro.com"></div>
      <div class="field"><label>${T("Name")}</label><input type="text" name="name" dir="auto"></div>
      <div class="field"><label>${T("Role")}</label><select name="role"><option value="writer">${T("Writer")}</option><option value="owner">${T("Owner")}</option></select></div></div>
      <input type="hidden" name="color" value="#2f68d8"><button class="btn">${T("Add someone")}</button>
      <p class="hint" style="margin-top:8px">${T("They sign in with that Google account. Anyone not on this list sees nothing.")}</p></form>` : ""}
    </div>
    <p style="margin-top:22px">${T("Signed in as {me}", { me: S.me })} · <button class="linkbtn" data-act="signOut">${T("Sign out")}</button></p>`;
}

// ---------------- the post, opened over the board ----------------
function steps(p) {
  const at = COLS.indexOf(p.stage);
  return `<ol class="steps">${COLS.map((c, i) => `<li class="${i < at ? "done" : i === at ? "now" : ""}"><i>${i < at ? "✓" : i + 1}</i><span>${T(COL_ONE[c])}</span></li>`).join("")}</ol>`;
}

function drawerPost(p) {
  const owner = isOwner();
  const mine = p.author === S.me;
  const live = p.status !== "rejected";
  const canWrite = owner || (live && ["idea", "draft", "final"].includes(p.stage));
  const ch = S.channel[p.id] || "whatsapp";
  const v = shownVersion(p.id, ch);
  const vs = versionsOf(p.id, ch);
  const isLatest = v && v.n === vs[vs.length - 1].n;
  const notes = notesOf(p.id);
  const assets = assetsOf(p.id);
  ensureUrls(assets.filter(isMedia));
  const tt = displayTitle(p);
  const editing = S.edit && S.edit.postId === p.id ? S.edit : null;
  const next = nextStep(p);

  // ---- date box (ready and later) ----
  let dateBox = "";
  if (p.stage === "ready") {
    dateBox = `<section class="sec datebox ${p.pinned_date ? "" : "need"}"><h3>${T("Publishing date")}</h3>
      <div class="btns"><input type="date" min="${todayStr()}" value="${esc(p.pinned_date || "")}" data-change="date" data-a="${p.id}">
      ${p.pinned_date ? `<b>${esc(fmtDow(p.pinned_date))}</b><button class="linkbtn" data-act="setDate" data-a="${p.id}" data-b="">${T("Remove the date")}</button>`
        : `<button class="btn sm go" data-act="nextFree" data-a="${p.id}">${T("Next free day: {d}", { d: fmtDay(nextFreeDay(p.id)) })}</button>`}
      <button class="btn sm" data-act="hotNow" data-a="${p.id}" title="${T("First publishing day from today; the rest move a day forward")}">🔥 ${T("First in line")}</button></div></section>`;
  } else if (p.stage === "published") {
    dateBox = `<section class="sec"><h3>${T("Published")}</h3><div class="btns"><b>${esc(p.published_at ? fmtDay(localDate(new Date(p.published_at))) : "")}</b>
      <label class="small muted">${T("Reactions")} ${owner ? `<input type="number" min="0" style="width:90px" value="${p.reactions ?? ""}" data-change="reactions" data-a="${p.id}">` : `<b>${esc(p.reactions ?? "–")}</b>`}</label></div></section>`;
  }

  // ---- visuals ----
  const visCard = (a) => {
    const url = cachedUrl(a);
    const isImg = (a.mime || "").startsWith("image/");
    const isVid = (a.mime || "").startsWith("video/");
    const media = url ? (isImg ? `<img alt="" src="${esc(url)}" loading="lazy">` : isVid ? `<video src="${esc(url)}" controls muted playsinline preload="metadata"></video>` : `<span class="mono">${esc(a.filename)}</span>`) : isMedia(a) ? `<span class="muted small">${T("loading…")}</span>` : `<span class="mono small">${esc(a.filename)}</span>`;
    return `<div class="vcard ${esc(a.status)}"><div class="im">${media}${a.status === "approved" ? `<span class="v ok">✓ ${T("approved")}</span>` : a.status === "replaced" ? `<span class="v">${T("replaced")}</span>` : ""}</div>
      <div class="bd"><div class="fn" dir="auto" title="${esc(a.filename)}">${esc(a.filename)}</div>
      <div class="btns">
        <button class="btn sm" data-act="download" data-a="${a.id}">↓ ${T("Download")}</button>
        ${isImg ? `<button class="btn sm" data-act="copyImage" data-a="${a.id}">${T("Copy image")}</button>` : ""}
        ${navigator.canShare ? `<button class="btn sm" data-act="share" data-a="${a.id}">${T("Share / save")}</button>` : ""}
        ${owner && a.status === "pending" ? `<button class="btn sm go" data-act="assetApprove" data-a="${a.id}">${T("Approve")}</button>` : ""}
      </div>
      <div class="lnk">${a.status !== "approved" ? `<button class="linkbtn" data-act="assetReplace" data-a="${a.id}">${a.status === "replaced" ? T("Bring back") : T("Mark replaced")}</button>` : ""}
        ${(owner || a.author === S.me) && a.status !== "approved" ? `<button class="linkbtn" data-act="assetDelete" data-a="${a.id}">${T("Delete")}</button>` : ""}
        <span class="muted">${esc(nameOf(a.author))} · ${esc(ago(a.created_at))}</span></div></div></div>`;
  };
  const shown = assets.filter((a) => a.status !== "replaced");
  const old = assets.filter((a) => a.status === "replaced");
  const visuals = `<section class="sec"><h3>${T("Banner and images")} <span class="count">${shown.length}</span></h3>
    <div class="vis">${shown.map(visCard).join("")}
      <label class="drop" data-drop="${p.id}"><b>+ ${T("Upload a banner, image or video")}</b><span>${T("Drop files here or choose. Up to 50 MB each, the original file is kept.")}</span>
        <input type="file" multiple accept="image/*,video/*,application/pdf" data-upload="${p.id}"></label>
    </div>
    ${old.length ? `<details class="more-old"><summary>${T("Replaced")} (${old.length})</summary><div class="vis">${old.map(visCard).join("")}</div></details>` : ""}</section>`;

  // ---- the idea ----
  const ib = biText(p.idea, p.idea_he);
  const ideaSec = `<section class="sec"><h3>${T("The idea")}${canWrite ? `<button class="linkbtn" data-act="editIdea" data-a="${p.id}">${T("Edit")}</button>` : ""}</h3>
    <div class="pre" dir="auto">${p.idea ? esc(ib.main) : `<span class="muted">${T("No pitch written.")}</span>`}</div>${ib.sub ? `<div class="pre t-sub" dir="auto">${esc(ib.sub)}</div>` : ""}
    <div class="meta-row">${p.score ? `<span class="pill blue">${T("Score {n}/10", { n: p.score })}</span>` : ""}${p.news_date ? `<span>${T("News from {d}", { d: fmtDay(p.news_date) })}</span>` : ""}${p.covered_before ? `<span>${T("Covered before:")} <span dir="auto">${esc(p.covered_before)}</span></span>` : ""}</div></section>`;

  // ---- headlines and text ----
  let textSec = "";
  if (editing) {
    const seed = editing.seed || {};
    const base = latest(p.id, ch) || {};
    const open = openNotes(p.id);
    const title = editing.mode === "draft" ? T("The first draft") : editing.mode === "final" ? T("The final version") : ch === "whatsapp" ? T("Edit the post") : T("Edit the {ch} version", { ch: t(CHANNELS.find((c) => c[0] === ch)[1]) });
    textSec = `<form data-form="saveEdit" class="sec editbox"><h3>${title} <span class="muted">· v${(vs.length ? vs[vs.length - 1].n : 0) + 1}</span></h3>
      <div class="field"><label>${ch === "email" ? T("Subject line options, one per line") : T("Headline options, one per line")}</label><textarea name="headlines" dir="auto" style="min-height:96px">${esc(seed.headlines ?? (base.headlines || []).map((h) => h.en).join("\n"))}</textarea></div>
      <div class="field"><label>${ch === "whatsapp" ? T("Post text, WhatsApp format (*bold*). No headline, no signature.") : T("Text")}</label><textarea class="big" name="body" dir="auto">${esc(seed.body ?? base.body ?? "")}</textarea></div>
      <div class="field"><label>${T("Sources, one per line")}</label><textarea name="sources" dir="ltr" style="min-height:64px">${esc((base.sources || []).map((s) => `${s.url}${s.label ? " " + s.label : ""}`).join("\n"))}</textarea></div>
      ${!owner ? `<div class="field"><label>${T("What changed (for Jay)")}</label><input type="text" name="writer_note" dir="auto" placeholder="${T("e.g. new headline, added the source")}"></div>` : ""}
      ${open.length ? `<div class="field"><label>${T("Notes this version fixes")}</label>${open.map((n) => `<label class="check"><input type="checkbox" name="fixed" value="${n.id}"> <span dir="auto">${esc(biText(n.body, n.body_he).main.slice(0, 140))}</span></label>`).join("")}</div>` : ""}
      <div class="btns"><button class="btn go">${owner || ch !== "whatsapp" ? T("Save") : T("Save and send to Jay")}</button><button type="button" class="btn ghost" data-act="cancelEdit">${T("Cancel")}</button></div></form>`;
  } else if (v) {
    const ci = chosenIndex(v);
    const nH = (v.headlines || []).length;
    const canPick = isLatest && (owner || canWrite);
    const hl = (v.headlines || []).map((h, i) => {
      const hb = biText(h.en, h.he);
      return `<button class="hl ${ci === i ? "pick" : ""}" data-act="pickHeadline" data-a="${v.id}" data-b="${i}" ${canPick ? "" : "disabled"}>
        <span class="rad"></span><span class="hl-t"><span dir="auto">${esc(hb.main)}</span>${hb.sub ? `<small dir="auto">${esc(hb.sub)}</small>` : ""}</span>${h.pick ? `<span class="wp">${T("writer’s pick")}</span>` : ""}</button>`;
    }).join("");
    const mode = S.view[p.id] || (S.lang === "he" ? "he" : "en");
    const prev = vs.find((x) => x.n === v.n - 1);
    let body;
    if (mode === "wa" && ch === "whatsapp") {
      const cover = coverOf(p.id);
      const cu = cover ? cachedUrl(cover) : "";
      body = `<div class="wa" dir="ltr"><div class="bub" dir="auto">${cu ? ((cover.mime || "").startsWith("video/") ? `<video src="${esc(cu)}" muted playsinline></video>` : `<img alt="" src="${esc(cu)}">`) : ""}${waHtml(composeWhatsApp(p, v))}<div class="tm">${new Date().toTimeString().slice(0, 5)}</div></div></div>`;
    } else if (mode === "he") {
      body = `<div class="body-he pre" dir="rtl">${esc(v.body_he || t("Translating…"))}</div>`;
    } else {
      body = S.diff[p.id] && prev ? `<div class="body-en pre diff" dir="auto">${diffHtml(prev.body, v.body)}</div>` : `<div class="body-en pre" dir="auto">${markNumbers(v.body)}</div>`;
    }
    const seg = (k, label) => `<button class="${mode === k ? "on" : ""}" data-act="view" data-a="${p.id}" data-b="${k}">${label}</button>`;
    textSec = `<section class="sec"><h3>${ch === "email" ? T("Subject lines") : T("Headline options")} <span class="count ${nH >= 3 ? "ok" : "warn"}">${T("{n} of 3", { n: nH })}</span>${ci >= 0 ? `<span class="pill go">${T("picked")}</span>` : owner && nH > 1 ? `<span class="pill wait">${T("pick one")}</span>` : ""}</h3>
      ${hl || `<div class="muted small">${T("No headline options.")}</div>`}
      ${isLatest && canWrite ? `<button class="linkbtn" data-act="addHeadline" data-a="${v.id}">+ ${T("Option")}</button>` : ""}</section>
      <section class="sec"><h3><span class="seg sm">${seg("he", "עברית")}${seg("en", "English")}${ch === "whatsapp" ? seg("wa", T("WhatsApp")) : ""}</span><span class="sp"></span>
        <span class="vtabs">${vs.length > 1 ? vs.map((x) => `<button class="${x.n === v.n ? "on" : ""}" data-act="vsel" data-a="${p.id}" data-b="${ch}" data-c="${x.n}">v${x.n}</button>`).join("") : ""}${prev && mode === "en" ? `<button class="${S.diff[p.id] ? "on" : ""}" data-act="diff" data-a="${p.id}">${T("changes")}</button>` : ""}</span></h3>
        ${mode === "he" ? `<p class="hint">${T("A literal translation for reading. What goes out is the English.")}</p>` : ""}
        ${body}
        ${v.writer_note ? `<div class="wnote"><b>${esc(nameOf(v.author))}:</b> <span dir="auto">${esc(biText(v.writer_note, v.writer_note_he).main)}</span></div>` : ""}
        <div class="meta-row">${T("v{n} by {name}", { n: v.n, name: nameOf(v.author) })} · ${esc(ago(v.created_at))}${!isLatest ? ` · <b>${T("an older version")}</b>` : ""}
          ${canWrite && isLatest ? `<span class="sp"></span><button class="btn sm" data-act="startEdit" data-a="${p.id}" data-b="${ch}" data-c="${!owner && p.status === "changes" ? "fix" : "edit"}">✎ ${T("Edit the text")}</button>` : ""}</div>
      </section>`;
  } else if (p.stage !== "idea") {
    textSec = `<section class="sec"><h3>${ch === "whatsapp" ? T("The post") : esc(t(CHANNELS.find((c) => c[0] === ch)[1]))}</h3>
      <div class="empty">${ch === "whatsapp" ? T("No text yet.") : T("No version for this channel yet.")}</div>
      ${canWrite ? `<div class="btns" style="margin-top:10px"><button class="btn" data-act="startEdit" data-a="${p.id}" data-b="${ch}">${T("Write it")}</button>${ch !== "whatsapp" && latest(p.id, "whatsapp") ? `<button class="btn" data-act="fromWhatsApp" data-a="${p.id}" data-b="${ch}">${T("Start from the WhatsApp text")}</button>` : ""}</div>` : ""}</section>`;
  }

  // ---- notes ----
  const noteRow = (n) => {
    const closed = n.status === "closed";
    const fixable = n.kind === "note";
    const nb = biText(n.body, n.body_he);
    const ab = biText(n.answer, n.answer_he);
    return `<div class="note ${fixable ? "fixable" : ""} ${closed ? "closed" : ""}">${avatar(n.author, "sm")}<div class="n-body">
      <div class="n-who"><b>${esc(nameOf(n.author))}</b> <span>${esc(ago(n.created_at))}${n.version_n ? ` · v${n.version_n}` : ""}</span>
        ${fixable ? `<button class="tick ${closed ? "done" : ""}" data-act="toggleNote" data-a="${n.id}" ${owner || canWrite ? "" : "disabled"}>${closed ? `✓ ${T("fixed")}${n.closed_in ? ` v${n.closed_in}` : ""}` : T("Mark fixed")}</button>` : ""}</div>
      <div class="pre" dir="auto">${esc(nb.main)}</div>${nb.sub ? `<div class="t-sub pre" dir="auto">${esc(nb.sub)}</div>` : ""}
      ${n.answer ? `<div class="ans"><b>${esc(nameOf(n.answered_by))}:</b> <span dir="auto">${esc(ab.main)}</span></div>` : ""}
      <div class="n-act">${owner && fixable && !n.is_rule ? `<button class="linkbtn" data-act="noteToRule" data-a="${n.id}">${T("Make it a house rule")}</button>` : ""}${n.is_rule ? `<span class="pill go">${T("rule")}</span>` : ""}
        ${n.author === S.me || owner ? `<button class="linkbtn" data-act="deleteNote" data-a="${n.id}">${T("delete")}</button>` : ""}</div>
    </div></div>`;
  };
  const nOpen = openNotes(p.id).length;
  const notesSec = `<section class="sec"><h3>${T("Notes")} <span class="count">${notes.length}</span>${nOpen ? `<span class="pill st-changes">${plural(nOpen, "1 open", "{n} open")}</span>` : ""}</h3>
    ${notes.map(noteRow).join("")}
    <form data-form="addNote" data-post="${p.id}" class="noteform"><textarea name="note" dir="auto" placeholder="${owner ? T("A note for the writer…") : T("A note or a question for Jay…")}"></textarea><button class="btn sm">${T("Add")}</button></form></section>`;

  // ---- more details ----
  const otherCh = CHANNELS.filter(([k]) => k !== "whatsapp");
  const checks = latest(p.id) ? checksFor(p, latest(p.id)) : [];
  const srcs = (latest(p.id) || {}).sources || [];
  const moreSec = `<section class="sec more"><button class="linkbtn morebtn" data-act="more" data-a="${p.id}">${S.more[p.id] ? "▾" : "▸"} ${T("More: other channels, sources, rule checks, details")}</button>
    ${S.more[p.id] ? `
      <h3>${T("Channels")}</h3><div class="chips">${CHANNELS.map(([k, label]) => `<button class="chip ${ch === k ? "on" : ""}" data-act="channel" data-a="${p.id}" data-b="${k}">${T(label)}${versionsOf(p.id, k).length ? ` · v${versionsOf(p.id, k).length}` : ""}</button>`).join("")}</div>
      <p class="hint">${T("Email and LinkedIn versions live here. The text above shows the channel you pick.")}${otherCh.some(([k]) => latest(p.id, k)) ? "" : ""}</p>
      ${srcs.length ? `<h3>${T("Sources")}</h3>${srcs.map((s) => `<div class="src">${s.official ? `<span class="pill go">${T("official")}</span>` : `<span class="pill mute">${T("other")}</span>`}${isHttp(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" dir="auto">${esc(s.label || s.url)}</a>` : esc(s.url)}</div>`).join("")}` : ""}
      ${checks.length ? `<h3>${T("House rules check")}</h3>${checks.map((c) => `<div class="lint ${c.ok ? "" : "bad"}"><i></i><span dir="auto">${esc(c.t)}</span></div>`).join("")}` : ""}
      <h3>${T("Details")}</h3>
      <div class="meta-row">
        <label>${T("Category")} <select data-change="meta" data-a="${p.id}" data-b="category">${CATS.map((c) => `<option value="${c}" ${p.category === c ? "selected" : ""}>${esc(catLabel(c))}</option>`).join("")}</select></label>
        <label>${T("Jay tried it")} <select data-change="meta" data-a="${p.id}" data-b="tried"><option value="" ${p.tried_myself == null ? "selected" : ""}>${T("Not set")}</option><option value="yes" ${p.tried_myself === true ? "selected" : ""}>${T("Yes")}</option><option value="no" ${p.tried_myself === false ? "selected" : ""}>${T("Not yet")}</option></select></label>
        <label>${T("News date")} <input type="date" value="${esc(p.news_date || "")}" data-change="meta" data-a="${p.id}" data-b="news_date"></label>
        ${p.stage !== "ready" && p.stage !== "published" ? `<label>📅 ${T("Planned date")} <input type="date" value="${esc(p.pinned_date || "")}" data-change="date" data-a="${p.id}"></label>` : ""}
        <button class="btn sm ${p.hot ? "hot" : ""}" data-act="hot" data-a="${p.id}">🔥 ${p.hot ? T("Hot") : T("Mark hot")}</button>
        <button class="btn sm ${p.email_too ? "dark" : ""}" data-act="emailToo" data-a="${p.id}">✉ ${p.email_too ? T("Also email") : T("Email too?")}</button>
        ${canWrite ? `<button class="btn sm" data-act="renameTitle" data-a="${p.id}">${T("Working title")}</button>` : ""}
      </div>
      ${owner ? `<h3>${T("Jay only")}</h3><div class="meta-row"><label>${T("Move to")} <select data-change="moveTo" data-a="${p.id}">${COLS.map((c) => `<option value="${c}" ${p.stage === c ? "selected" : ""}>${T(COL_ONE[c])}</option>`).join("")}</select></label>
        <button class="btn sm ghost" data-act="deletePost" data-a="${p.id}">${T("Delete the post")}</button></div>` : ""}
    ` : ""}</section>`;

  // ---- the action bar at the bottom ----
  const acts = [];
  let say = "";
  if (!live) {
    say = p.skip_reason ? `${T("Rejected")}: <span dir="auto">${esc(p.skip_reason)}</span>` : T("Rejected");
    if (owner) acts.push(`<button class="btn" data-act="revive" data-a="${p.id}">${T("Bring it back")}</button>`);
  } else if (p.stage === "ready") {
    say = p.pinned_date ? T("Goes out {d}", { d: fmtDay(p.pinned_date) }) : T("Pick a date above.");
    acts.push(`<button class="btn go" data-act="copyPost" data-a="${p.id}" data-b="${ch}">${T("Copy for {ch}", { ch: t(CHANNELS.find((c) => c[0] === ch)[1]) })}</button>`);
    if (coverOf(p.id)) acts.push(`<button class="btn" data-act="downloadCover" data-a="${p.id}">↓ ${T("Banner")}</button>`);
    if (owner) acts.push(`<button class="btn" data-act="publish" data-a="${p.id}">✓ ${T("Mark published")}</button>`);
  } else if (p.stage === "published") {
    say = T("Published {d}.", { d: p.published_at ? fmtDay(localDate(new Date(p.published_at))) : "" });
    acts.push(`<button class="btn" data-act="copyPost" data-a="${p.id}" data-b="${ch}">${T("Copy the text")}</button>`);
    if (owner) acts.push(`<button class="btn ghost" data-act="unpublish" data-a="${p.id}">${T("Not published after all")}</button>`);
  } else if (owner) {
    const label = p.stage === "idea" ? "Approve the idea" : p.stage === "draft" ? "Approve the draft" : "Approve · to Ready";
    if (p.status !== "approved" || p.stage === "final") acts.push(`<button class="btn go" data-act="approve" data-a="${p.id}">✓ ${T(label)}</button>`);
    if (p.status === "approved" && p.stage === "idea") acts.push(`<button class="btn go" data-act="startEdit" data-a="${p.id}" data-b="whatsapp" data-c="draft">${T("Write the first draft")}</button>`);
    if (p.status === "approved" && p.stage === "draft") acts.push(`<button class="btn go" data-act="startEdit" data-a="${p.id}" data-b="whatsapp" data-c="final">${T("Upload the final version")}</button>`);
    if (p.status !== "changes") acts.push(`<button class="btn" data-act="sendBack" data-a="${p.id}">↩ ${T("Send back")}</button>`);
    acts.push(`<button class="btn ghost" data-act="reject" data-a="${p.id}">✕ ${T("Reject")}</button>`);
    say = p.status === "waiting" ? T("Your call.") : p.status === "changes" ? T("Sent back. Waiting for a new version.") : T("Approved.");
  } else {
    if (p.status === "approved" && p.stage === "idea") {
      say = T("Jay approved the idea.");
      acts.push(`<button class="btn go" data-act="startEdit" data-a="${p.id}" data-b="whatsapp" data-c="draft">${T("Write the first draft")}</button>`);
    } else if (p.status === "approved" && p.stage === "draft") {
      say = T("Jay approved the draft. Next: the final version with the banner.");
      acts.push(`<button class="btn go" data-act="startEdit" data-a="${p.id}" data-b="whatsapp" data-c="final">${T("Upload the final version")}</button>`);
    } else if (p.status === "changes") {
      say = nOpen ? plural(nOpen, "Jay sent it back with 1 note.", "Jay sent it back with {n} notes.") : T("Jay sent it back.");
      if (p.stage === "idea" || !latest(p.id)) acts.push(`<button class="btn go" data-act="resubmit" data-a="${p.id}">${T("Send to Jay again")}</button>`);
      else acts.push(`<button class="btn go" data-act="startEdit" data-a="${p.id}" data-b="whatsapp" data-c="fix">${T("Fix and send again")}</button>`);
    } else {
      say = T("Waiting for Jay.");
    }
  }

  const sib = siblings(p);
  const si = sib.findIndex((x) => x.id === p.id);
  const nav = sib.length > 1 ? `<span class="d-nav"><button class="iconbtn" data-act="nav" data-a="${p.id}" data-b="-1" ${si <= 0 ? "disabled" : ""} title="${T("Previous (K)")}">↑</button><span>${si + 1}/${sib.length}</span><button class="iconbtn" data-act="nav" data-a="${p.id}" data-b="1" ${si >= sib.length - 1 ? "disabled" : ""} title="${T("Next (J)")}">↓</button></span>` : "";
  const order = p.stage === "idea"
    ? [ideaSec, textSec, notesSec, assets.length ? visuals : ""]
    : p.stage === "ready" || p.stage === "published"
      ? [dateBox, visuals, textSec, notesSec, ideaSec]
      : [textSec, visuals, notesSec, ideaSec];
  return `<div class="scrim" data-act="close"></div>
  <aside class="drawer" role="dialog" aria-modal="true">
    <header class="d-head"><button class="iconbtn" data-act="close" aria-label="${T("Close")}">✕</button>${steps(p)}${nav}</header>
    <div class="d-body">
      <div class="d-meta">${statusPill(p)}${p.hot ? `<span class="pill hot">🔥 ${T("Hot")}</span>` : ""}${tag(p.category)}<span class="sp"></span>${avatar(p.author, "sm")}<span class="muted small">${esc(nameOf(p.author))} · ${esc(ago(p.created_at))}</span></div>
      <h1 class="d-title" dir="auto">${esc(tt.main)}</h1>${tt.sub ? `<div class="d-sub" dir="auto">${esc(tt.sub)}</div>` : ""}
      ${next ? `<div class="nextbox">${esc(next)}</div>` : ""}
      ${order.join("")}
      ${moreSec}
    </div>
    <footer class="d-foot"><span class="say">${say}</span><span class="sp"></span>${acts.join("")}</footer>
  </aside>`;
}

function drawerNew() {
  const mode = S.newMode;
  const owner = isOwner();
  const catSel = (val) => `<select name="category">${CATS.map((c) => `<option value="${c}" ${val === c ? "selected" : ""}>${esc(catLabel(c))}</option>`).join("")}</select>`;
  let body;
  if (mode === "idea") {
    body = `<form data-form="createIdea">
      <div class="field"><label>${T("Working title")}</label><input type="text" name="title" dir="auto" required placeholder="${T("What the post is about, in one line")}"></div>
      <div class="field"><label>${T("The pitch")}</label><textarea name="idea" dir="auto" placeholder="${T("Hook, why now, what readers get. Two to five lines.")}"></textarea></div>
      <div class="row2"><div class="field"><label>${T("Category")}</label>${catSel("tip")}</div>
      <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" name="hot"> 🔥 ${T("Hot: it goes stale fast")}</label></div></div>
      <details><summary class="linkbtn">${T("More details (optional)")}</summary>
        <div class="row2"><div class="field"><label>${T("When the news came out (if news)")}</label><input type="date" name="news_date"></div>
        <div class="field"><label>${T("Your score, 1 to 10")}</label><input type="number" name="score" min="1" max="10"></div></div>
        <div class="field"><label>${T("Covered before?")}</label><input type="text" name="covered_before" dir="auto" placeholder="${T("e.g. a similar post went out on 29 Mar")}"></div>
        <div class="field"><label>${T("Sources, one per line")}</label><textarea name="sources" dir="ltr" placeholder="https://..."></textarea></div>
      </details>
      <div class="d-foot inline"><span class="sp"></span><button class="btn go">${T("Add the idea")}</button></div></form>`;
  } else if (!S.split) {
    body = `<form data-form="splitDraft">
      <div class="field"><label>${T("Paste the full draft")}</label><textarea class="big" name="draft" dir="auto" placeholder="${T("Headline options, the post, sources and notes for Jay, in one block. The desk splits it into fields.")}">${esc(S.draftText || "")}</textarea></div>
      <p class="hint">${T("For hot news: it goes straight to First draft and Jay answers on the text.")}</p>
      <div class="d-foot inline"><span class="sp"></span><button class="btn go">${T("Split it into fields →")}</button></div></form>`;
  } else {
    const sp = S.split;
    body = `<form data-form="createDraft">
      <div class="row2"><div class="field"><label>${T("Working title")}</label><input type="text" name="title" dir="auto" value="${esc((sp.headlines[0] || {}).en || "")}"></div>
      <div class="field"><label>${T("Category")}</label>${catSel(sp.category)}</div></div>
      <div class="field"><label>${T("Headline options, one per line")}</label><textarea name="headlines" dir="auto">${esc(sp.headlines.map((h) => h.en).join("\n"))}</textarea>
      ${sp.headlines.some((h) => h.pick) ? `<span class="hint">${T("The writer's pick: {x}", { x: sp.headlines.find((h) => h.pick).en })}</span>` : ""}</div>
      <div class="field"><label>${T("Post text (WhatsApp format, no headline, no signature)")}</label><textarea class="big" name="body" dir="auto">${esc(sp.body)}</textarea></div>
      <div class="row2"><div class="field"><label>${T("Sources, one per line")}</label><textarea name="sources" dir="ltr">${esc(sp.sources.map((s) => `${s.url} ${s.label}`).join("\n"))}</textarea></div>
      <div class="field"><label>${T("Notes for Jay")}</label><textarea name="notes" dir="auto">${esc(sp.notes)}</textarea></div></div>
      <div class="row2"><div class="field"><label>${T("When the news came out")}</label><input type="date" name="news_date"></div>
      <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" name="hot"> 🔥 ${T("Hot: it goes stale fast")}</label></div></div>
      <input type="hidden" name="idea" value="">
      <div class="d-foot inline"><button type="button" class="btn ghost" data-act="newMode" data-a="draft">${T("Start over")}</button><span class="sp"></span><button class="btn go">${owner ? T("Create the draft") : T("Create and send to Jay")}</button></div></form>`;
  }
  return `<div class="scrim" data-act="close"></div>
  <aside class="drawer narrow" role="dialog" aria-modal="true">
    <header class="d-head"><button class="iconbtn" data-act="close" aria-label="${T("Close")}">✕</button><b>${T("New")}</b></header>
    <div class="d-body">
      <span class="seg"><button class="${mode === "idea" ? "on" : ""}" data-act="newMode" data-a="idea">💡 ${T("Idea")}</button><button class="${mode === "draft" ? "on" : ""}" data-act="newMode" data-a="draft">📝 ${T("A written draft")}</button></span>
      <p class="hint" style="margin:10px 0 16px">${mode === "idea" ? T("An idea goes to the Ideas column. Jay approves it, then the first draft is written.") : T("Paste a draft from your Claude. The desk splits it into headlines, text, sources and notes.")}</p>
      ${body}
    </div>
  </aside>`;
}

function markNumbers(text) {
  // Highlight figures and dates so they get checked against a source.
  return esc(text).replace(/(\b\d[\d,.]*\s?(%|x|×|k|K|M|B|days?|hours?|weeks?|months?|stars?|reviews?|ratings?)?|\$\d[\d,.]*)/g, "<mark>$1</mark>");
}

function diffHtml(a, b) {
  const A = String(a || "").split(/(\s+)/);
  const B = String(b || "").split(/(\s+)/);
  if (A.length * B.length > 4e6) return esc(b);
  const dp = Array.from({ length: A.length + 1 }, () => new Uint16Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) for (let j = B.length - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  let i = 0, j = 0, out = "";
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) { out += esc(A[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out += `<del>${esc(A[i])}</del>`; i++; }
    else { out += `<ins>${esc(B[j])}</ins>`; j++; }
  }
  while (i < A.length) out += `<del>${esc(A[i++])}</del>`;
  while (j < B.length) out += `<ins>${esc(B[j++])}</ins>`;
  return out;
}

const langLink = () => `<button class="linkbtn" data-act="setLang" data-a="${S.lang === "he" ? "en" : "he"}">${S.lang === "he" ? "English" : "עברית"}</button>`;

function viewLogin() {
  return `<div class="login"><div class="logo"><i></i>Content Desk</div>
    <p>${T("Post ideas, drafts, banners and the schedule for the Jay GPT groups. For the team only.")}</p>
    <button class="gbtn" data-act="signIn"><svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.4-4.6 7l7.4 5.7c4.3-4 6.9-9.9 6.9-17.2z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.2-8.5 2.2-6.2 0-11.5-4.1-13.4-9.8l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>${T("Sign in with Google")}</button>
    ${DEMO ? `<p class="muted small">${T("Demo mode: nothing leaves this browser.")}</p>` : ""}
    <p class="small">${langLink()}</p></div>`;
}

function viewNotMember() {
  return `<div class="login"><h1>${T("Not on the team yet")}</h1>
    <p>${T("You're signed in as {me}, and that account isn't on the Content Desk team. Ask Jay to add it, or sign in with your work account.", { me: S.me })}</p>
    <button class="btn go" data-act="signOut">${T("Sign out")}</button>
    <p class="small">${langLink()}</p></div>`;
}

function modalHtml() {
  const m = S.modal;
  if (!m) return "";
  const tx = (s) => (m.pre ? esc(s) : T(s));
  const field = m.noText ? "" : m.readonly ? `<textarea readonly class="big" dir="auto">${esc(m.text)}</textarea>` : m.input ? `<input type="text" name="v" dir="auto" value="${esc(m.value || "")}">` : `<textarea name="v" dir="auto" class="${m.big ? "big" : ""}">${esc(m.value || "")}</textarea>`;
  const list = m.list ? `<div class="mlist">${m.list.map((x, i) => `<button type="button" class="mrow" data-act="modalPick" data-a="${i}"><span dir="auto">${esc(x.label)}</span><small>${esc(x.sub || "")}</small></button>`).join("")}</div>` : "";
  return `<div class="modal-bg" data-act="closeModalBg"><form class="modal" data-form="modal">
    <h4>${tx(m.title)}</h4>${m.body ? `<p dir="auto">${tx(m.body)}</p>` : ""}${field}${list}
    <div class="btns" style="margin-top:16px;justify-content:flex-end"><button type="button" class="btn ghost" data-act="closeModal">${m.readonly || m.list ? T("Close") : T("Cancel")}</button>
    ${m.alt ? `<button type="button" class="btn" data-act="modalAlt">${esc(m.alt.label)}</button>` : ""}
    ${m.readonly || m.list ? "" : `<button class="btn ${m.danger ? "danger" : "go"}">${m.pre ? esc(m.confirm || t("OK")) : T(m.confirm || "OK")}</button>`}</div></form></div>`;
}

// ---------------- render ----------------
function render() {
  document.documentElement.lang = S.lang;
  document.documentElement.dir = S.lang === "he" ? "rtl" : "ltr";
  const r = route();
  let html;
  let overlay = "";
  if (!S.session) html = S.loaded || S.authChecked ? viewLogin() : "";
  else if (!S.loaded) html = S.loadError ? `<div class="login"><h1>${T("Couldn't load")}</h1><p>${esc(S.loadError)}</p><button class="btn go" data-act="refresh">${T("Try again")}</button></div>` : `<div class="login"><p>${T("Loading…")}</p></div>`;
  else if (!S.member) html = viewNotMember();
  else {
    let body;
    if (r.base === "schedule") body = viewSchedule();
    else if (r.base === "published") body = viewPublished();
    else if (r.base === "settings") body = viewSettings();
    else body = viewBoard();
    html = `${topBar(r)}<main class="wrap ${r.base === "board" ? "wide" : ""}">${body}</main>`;
    if (r.id) {
      const p = post(r.id);
      if (p) markSeen(p);
      overlay = p ? drawerPost(p) : `<div class="scrim" data-act="close"></div><aside class="drawer narrow"><header class="d-head"><button class="iconbtn" data-act="close">✕</button></header><div class="d-body"><div class="empty">${T("This post doesn't exist anymore.")}</div></div></aside>`;
    } else if (r.isNew) overlay = drawerNew();
  }
  document.body.classList.toggle("has-drawer", !!overlay);
  // keep scroll and whatever is typed in any form while re-rendering
  const sameRoute = S.lastRoute === location.hash;
  const keep = new Map();
  const formKey = (f) => `${f.dataset.form}|${f.dataset.post || ""}|${f.dataset.form === "modal" && S.modal ? S.modal.title : ""}`;
  if (sameRoute) {
    app.querySelectorAll("form[data-form]").forEach((f) => {
      const fk = formKey(f);
      f.querySelectorAll("input[name], textarea[name], select[name]").forEach((el) => {
        if (el.type === "file" || el.type === "hidden") return;
        keep.set(`${fk}|${el.name}|${el.type === "checkbox" ? el.value : ""}`, el.type === "checkbox" ? el.checked : el.value);
      });
    });
  }
  const focusKey = (() => {
    const a = document.activeElement;
    const f = a && a.closest && a.closest("form[data-form]");
    return f && a.name ? { form: f.dataset.form, post: f.dataset.post || "", name: a.name, start: a.selectionStart, end: a.selectionEnd } : null;
  })();
  const y = window.scrollY;
  const dEl = app.querySelector(".d-body");
  const dy = dEl ? dEl.scrollTop : 0;
  const colY = [...app.querySelectorAll(".col-body")].map((c) => c.scrollTop);
  app.innerHTML = html + overlay + modalHtml() + (S.busy ? '<div class="busy"></div>' : "") + (S.toast ? `<div class="toast ${S.toast.err ? "err" : ""}"><span>${esc(S.toast.msg)}</span>${S.toast.undo ? `<button data-act="undo">${T("Undo")}</button>` : ""}</div>` : "");
  // A Hebrew line that opens with an English name (Claude, Amazon) still reads right to left.
  app.querySelectorAll("[dir=auto]").forEach((el) => {
    if (!/^(INPUT|TEXTAREA)$/.test(el.tagName) && !el.matches(".body-en, .bub") && /[\u0590-\u05FF]/.test(el.textContent)) el.dir = "rtl";
  });
  if (keep.size) {
    app.querySelectorAll("form[data-form]").forEach((f) => {
      const fk = formKey(f);
      f.querySelectorAll("input[name], textarea[name], select[name]").forEach((el) => {
        const key = `${fk}|${el.name}|${el.type === "checkbox" ? el.value : ""}`;
        if (!keep.has(key)) return;
        if (el.type === "checkbox") el.checked = keep.get(key);
        else el.value = keep.get(key);
      });
    });
  }
  if (focusKey) {
    const f = app.querySelector(`form[data-form="${focusKey.form}"]${focusKey.post ? `[data-post="${focusKey.post}"]` : ""}`);
    const el = f && f.querySelector(`[name="${focusKey.name}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      try {
        if (focusKey.start != null) el.setSelectionRange(focusKey.start, focusKey.end);
      } catch (_) {
        /* not a text field */
      }
    }
  }
  // the page under a drawer keeps its place; a new page starts at the top
  const prev = S.lastRoute ? S.lastRoute.split("/").slice(0, 2).join("/") : "";
  const now = location.hash.split("/").slice(0, 2).join("/");
  if (prev === now || (!S.lastRoute && !location.hash)) window.scrollTo(0, y);
  else window.scrollTo(0, 0);
  const dNew = app.querySelector(".d-body");
  if (dNew && sameRoute) dNew.scrollTop = dy;
  if (prev === now) app.querySelectorAll(".col-body").forEach((c, i) => (c.scrollTop = colY[i] || 0));
  S.lastRoute = location.hash;
}

// ---------------- events ----------------
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  // a click on a field or a link inside a card is for that field, not for opening the card
  if (act === "open" && e.target.closest("input, select, textarea, label, a, button:not([data-act=open])")) return;
  if (act === "closeModalBg") {
    if (e.target === el) A.closeModal();
    return;
  }
  if (act === "modalPick" || act === "modalAlt") {
    const m = S.modal;
    const it = act === "modalAlt" ? m.alt : m.list[Number(el.dataset.a)];
    S.modal = null;
    render();
    if (it && A[it.act]) A[it.act](...(it.args || []));
    return;
  }
  const fn = A[act];
  if (!fn) return;
  e.preventDefault();
  fn(el.dataset.a, el.dataset.b, el.dataset.c);
});

document.addEventListener("submit", (e) => {
  const form = e.target.closest("form[data-form]");
  if (!form) return;
  e.preventDefault();
  const name = form.dataset.form;
  if (name === "modal") {
    const m = S.modal;
    const input = form.querySelector("[name=v]");
    const val = input ? input.value.trim() : "";
    if (m.required && !val) return toast("Write something first.", true);
    S.modal = null;
    render();
    if (m.act && A[m.act]) A[m.act](...(m.args || []), val);
    return;
  }
  if (A[name]) A[name](form);
});

document.addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.upload) {
    A.upload(el.dataset.upload, el.files);
    return;
  }
  const act = el.dataset.change;
  if (!act) return;
  if (act === "meta") A.meta(el.dataset.a, el.dataset.b, el.value);
  else if (act === "date") A.setDate(el.dataset.a, el.value);
  else if (act === "moveTo") A.moveTo(el.dataset.a, el.value);
  else if (act === "reactions") A.reactions(el.dataset.a, el.value);
  else if (act === "memberRole") A.memberRole(el.dataset.a, el.value);
});

document.addEventListener("dragover", (e) => {
  const d = e.target.closest("[data-drop]");
  if (!d) return;
  e.preventDefault();
  d.classList.add("over");
});
document.addEventListener("dragleave", (e) => {
  const d = e.target.closest("[data-drop]");
  if (d) d.classList.remove("over");
});
document.addEventListener("drop", (e) => {
  const d = e.target.closest("[data-drop]");
  if (!d) return;
  e.preventDefault();
  A.upload(d.dataset.drop, e.dataTransfer.files);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (S.modal) return A.closeModal();
    if (S.edit) return A.cancelEdit();
    if (route().id || route().isNew) return A.close();
  }
  if (e.key === "Enter" && e.target.matches && e.target.matches(".card[data-act=open]")) A.open(e.target.dataset.a);
  // J / K walk the column while a post is open (by key position, so a Hebrew keyboard works too)
  if ((e.code === "KeyJ" || e.code === "KeyK") && route().id && !S.modal && !S.edit && !isTyping() && !e.metaKey && !e.ctrlKey && !e.altKey) {
    e.preventDefault();
    A.nav(route().id, e.code === "KeyJ" ? 1 : -1);
  }
});
document.addEventListener("input", (e) => {
  if (e.target.dataset && e.target.dataset.input === "q") {
    S.q = e.target.value;
    render();
  }
});

window.addEventListener("hashchange", () => {
  S.edit = null;
  render();
});

// Refresh when the tab comes back, unless someone is typing.
function quietRefresh() {
  if (!S.member || S.edit || S.modal || S.busy) return;
  const a = document.activeElement;
  if (a && ["TEXTAREA", "INPUT", "SELECT"].includes(a.tagName) && a.value) return;
  loadAll(true);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") quietRefresh();
});
setInterval(() => {
  if (document.visibilityState === "visible") quietRefresh();
}, 90000);

// ---------------- start ----------------
async function onSession(session) {
  S.session = session;
  S.authChecked = true;
  S.me = session && session.user && session.user.email ? session.user.email.toLowerCase() : "";
  if (session) {
    S.loaded = false;
    render();
    await loadAll();
  } else {
    S.loaded = false;
    S.member = null;
    render();
  }
}
store.onAuth((s, event) => {
  if (event === "INITIAL_SESSION") return; // store.session() below handles the first load
  const email = s && s.user ? s.user.email : "";
  if ((s && !S.session) || (!s && S.session) || (email && email.toLowerCase() !== S.me)) onSession(s);
});
store.session().then(onSession).catch((e) => {
  S.authChecked = true;
  S.loadError = e.message;
  render();
});
