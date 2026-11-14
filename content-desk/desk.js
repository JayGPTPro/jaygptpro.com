// Content Desk: one place where a post idea becomes an approved WhatsApp post.
import { createStore } from "./store.js?v=2";
import { HE } from "./i18n.js?v=3";

const PARAMS = new URLSearchParams(location.search);
const DEMO = PARAMS.has("demo");
const store = createStore(DEMO);
const app = document.getElementById("app");

const CATS = ["news", "tip", "skill", "deals", "other"];
const CAT_KEYS = { news: "News", tip: "Tip", skill: "Skill", deals: "Deals", other: "Other" };
const STAGE_KEYS = { idea: "Idea", writing: "Writing", review: "Waiting on Jay", ready: "Ready to publish", published: "Published", skipped: "Skipped", parked: "Not now" };
const CHANNELS = [["whatsapp", "WhatsApp"], ["email", "Email"], ["linkedin", "LinkedIn"], ["x", "X"]];
const DAY = 86400000;
const CAPTION_LIMIT = 1024;
const MAX_UPLOAD = 50 * 1024 * 1024; // Supabase global limit while the spend cap is on

const S = {
  session: null, me: "", member: null, loaded: false, loadError: "",
  d: { team_members: [], posts: [], versions: [], notes: [], assets: [], rules: [], settings: [] },
  busy: 0, toast: null, modal: null, urls: {},
  edit: null, // { postId, channel } while a draft is open for editing
  channel: {}, vsel: {}, diff: {}, filter: "all", newMode: "idea", split: null, showHe: null,
  files: {}, translateError: "", lang: "en", langChosen: false,
};

// ---------------- helpers ----------------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" }[c]));

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
const T = (s, vars) => esc(t(s, vars));
const plural = (n, one, many) => (n === 1 ? t(one) : t(many, { n }));
const locale = () => (S.lang === "he" ? "he-IL" : "en-GB");
const catLabel = (c) => t(CAT_KEYS[c] || c);
const stageLabel = (st) => t(STAGE_KEYS[st] || st);

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
function fmtDay(s) {
  if (!s) return "";
  return parseDate(s).toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" });
}
const fmtDow = (s) => parseDate(s).toLocaleDateString(locale(), { weekday: "short" });
const fmtDM = (s) => parseDate(s).toLocaleDateString(locale(), { day: "numeric", month: "short" });
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
  return S.d.team_members.find((m) => m.email === email) || { email, name: email ? email.split("@")[0] : "?", color: "#857d6f", role: "writer" };
}
const nameOf = (email) => member(email).name;
function avatar(email) {
  const m = member(email);
  const ini = (m.name || "?").replace(/\(.*\)/, "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return `<span class="av" style="background:${esc(m.color || "#857d6f")}" title="${esc(m.name)}">${esc(ini)}</span>`;
}
const isOwner = () => S.member && S.member.role === "owner";
const tag = (c) => `<span class="tag ${esc(c)}">${esc(catLabel(c))}</span>`;
function waHtml(text) {
  return esc(text).replace(/\*([^*\n]+)\*/g, "<b>$1</b>").replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, "$1<i>$2</i>");
}
function setting(key, fallback) {
  const r = S.d.settings.find((s) => s.key === key);
  return r ? r.value : fallback;
}
const cadence = () => ({ days: [0, 1, 2, 3, 4], email_per_week: 3, ...(setting("cadence", {}) || {}) });

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
  return { en: h.en || p.title, he: h.en && h.en !== p.title ? h.he || "" : h.he || p.title_he || "" };
}
const finalAsset = (pid) => assetsOf(pid).filter((a) => a.stage === "final" && a.status !== "replaced").pop();
const approvedAsset = (pid) => assetsOf(pid).filter((a) => a.status === "approved").pop();
const openQuestions = () => S.d.notes.filter((n) => n.kind === "question" && n.status === "open");

function turnOf(p) {
  if (["idea", "review", "ready"].includes(p.stage)) return "owner";
  if (p.stage === "writing") return p.author;
  return null;
}
function isMyTurn(p) {
  const t = turnOf(p);
  if (t === "owner") return isOwner();
  return t === S.me;
}
function ownerQueue() {
  const rev = S.d.posts.filter((p) => p.stage === "review").sort((a, b) => (b.hot - a.hot) || a.updated_at.localeCompare(b.updated_at));
  const ideas = S.d.posts.filter((p) => p.stage === "idea").sort((a, b) => (b.hot - a.hot) || a.created_at.localeCompare(b.created_at));
  return [...rev, ...ideas];
}

// Text that goes to WhatsApp: "<emoji> *Headline*", body, then the signature unless the body already ends with one.
function splitEmoji(h) {
  const m = String(h || "").trim().match(/^((?:\p{Extended_Pictographic}|\p{Regional_Indicator})[\uFE0F\u200D\u20E3\p{Extended_Pictographic}\p{Emoji_Modifier}]*)\s*(.*)$/u);
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
  const text = p.stage ? composeWhatsApp(p, v) : v.body;
  const hasImage = assetsOf(p.id).some((a) => (a.mime || "").startsWith("image/") && a.status !== "replaced");
  if (text.length > CAPTION_LIMIT && hasImage) out.push({ ok: false, t: t("{n} characters with an image. Desktop WhatsApp can cut a caption after {max}.", { n: text.length.toLocaleString(), max: CAPTION_LIMIT.toLocaleString() }) });
  else out.push({ ok: true, t: t("{n} characters", { n: text.length.toLocaleString() }) });
  if (p.tried_myself === false && !/(planning to try|haven['’]t tried|not tried it|will try this myself)/i.test(v.body || "")) {
    out.push({ ok: false, t: t("Jay has not tried it: add a personal line, e.g. “I'm planning to try this myself and I'll share what I find.”") });
  }
  if (p.category === "news" && !(v.sources || []).some((s) => s.official)) out.push({ ok: false, t: t("News post without an official source") });
  return out;
}

// ---------------- loading, auth, translation ----------------
async function loadAll(silent) {
  try {
    const d = await store.loadAll();
    S.d = d;
    S.member = d.team_members.find((m) => m.email === S.me && m.active) || null;
    S.loaded = true;
    S.loadError = "";
    if (S.showHe === null) S.showHe = readPref("showHe", isOwner());
    // Owners read Hebrew by default, writers English. The switch in the top bar overrides it per browser.
    if (!S.langChosen) S.lang = isOwner() ? "he" : "en";
  } catch (e) {
    if (!silent) S.loadError = e.message;
  }
  render();
  translateMissing();
}

function readPref(k, def) {
  try {
    const v = localStorage.getItem(`desk:${k}`);
    return v === null ? def : v === "1";
  } catch (_) {
    return def;
  }
}
function writePref(k, v) {
  try {
    localStorage.setItem(`desk:${k}`, v ? "1" : "0");
  } catch (_) {
    /* only a convenience */
  }
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
function toast(msg, err) {
  S.toast = { msg: t(msg), err };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    S.toast = null;
    const el = document.querySelector(".toast");
    if (el) el.remove();
  }, err ? 6000 : 2600);
  render();
}
async function run(fn, okMsg) {
  S.busy++;
  render();
  try {
    await fn();
    if (okMsg) toast(okMsg);
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
async function urlFor(a, download) {
  if (download) return store.signedUrl(a.path, a.filename);
  const c = S.urls[a.path];
  if (c && c.exp > Date.now()) return c.url;
  const url = await store.signedUrl(a.path);
  S.urls[a.path] = { url, exp: Date.now() + 50 * 60000 };
  return url;
}
async function ensureUrls(assets) {
  const missing = assets.filter((a) => !(S.urls[a.path] && S.urls[a.path].exp > Date.now()));
  if (!missing.length) return;
  await Promise.all(
    missing.map((a) =>
      urlFor(a).catch(() => {
        // remember the failure for a minute so a broken file can't cause a render loop
        S.urls[a.path] = { url: "", exp: Date.now() + 60000 };
      }),
    ),
  );
  softRender();
}
const cachedUrl = (a) => (S.urls[a.path] ? S.urls[a.path].url : "");

// ---------------- actions ----------------
const A = {
  async signIn() {
    await store.signIn();
  },
  async signOut() {
    await store.signOut();
  },
  toggleHe() {
    S.showHe = !S.showHe;
    writePref("showHe", S.showHe);
    render();
  },
  toggleMeta() {
    S.metaOpen = !S.metaOpen;
    render();
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
  filter(c) {
    S.filter = c;
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

  // ideas
  ideaYes(id) {
    const p = post(id);
    run(() => savePost(p, { stage: "writing" }), "Approved. It's the writer's turn.");
  },
  ideaChange(id) {
    openModal({ title: "Yes, with a change", body: "What should change? The writer gets this note and the idea moves to writing.", act: "ideaChangeGo", args: [id], required: true, confirm: "Send" });
  },
  async ideaChangeGo(id, text) {
    const p = post(id);
    await run(async () => {
      await insertRow("notes", { post_id: id, kind: "note", body: text, version_n: latest(id) ? latest(id).n : null });
      await savePost(p, { stage: "writing" });
    }, "Sent with your note");
  },
  ideaNotNow(id) {
    openModal({ title: "Not now", body: "Optional: why, or when to come back to it.", act: "parkGo", args: [id], confirm: "Park it" });
  },
  parkGo(id, reason) {
    run(() => savePost(post(id), { stage: "parked", skip_reason: reason || null }), "Parked");
  },
  skip(id) {
    openModal({ title: "Skip this", body: "Optional: the reason. It stays visible so nobody pitches it again.", act: "skipGo", args: [id], confirm: "Skip" });
  },
  skipGo(id, reason) {
    run(() => savePost(post(id), { stage: "skipped", skip_reason: reason || null }), "Skipped");
  },
  revive(id) {
    run(() => savePost(post(id), { stage: "idea", skip_reason: null }), "Back in ideas");
  },

  // review
  submit(id) {
    const p = post(id);
    if (!latest(id)) return toast("Write the WhatsApp text first.", true);
    run(() => savePost(p, { stage: "review" }), "Sent to Jay");
  },
  approve(id, mode) {
    const p = post(id);
    const v = latest(id);
    if (!v) return toast("There is no text yet.", true);
    if ((v.headlines || []).length > 1 && chosenIndex(v) < 0) return toast("Pick a headline first.", true);
    run(async () => {
      if ((v.headlines || []).length === 1 && chosenIndex(v) < 0) await updateRow("versions", v, { chosen: 0 });
      const fin = finalAsset(id);
      if (mode === "withBanner" && fin) {
        if (fin.status !== "approved") await updateRow("assets", fin, { status: "approved" });
        await savePost(p, { stage: "ready", text_ok: true });
      } else if (mode === "textOnly") {
        await savePost(p, { stage: "writing", text_ok: true });
      } else {
        await savePost(p, { stage: "ready", text_ok: true });
      }
    }, mode === "textOnly" ? "Text approved. The banner is next." : "Approved. It's ready to publish.");
    if (location.hash.startsWith("#/review")) setTimeout(nextReview, 400);
  },
  requestChanges(id) {
    const p = post(id);
    const v = latest(id);
    const open = notesOf(id).filter((n) => n.kind === "note" && n.status === "open");
    if (!open.length) {
      openModal({ title: "Request changes", body: "Write what should change. The writer sees it next to the text.", act: "changesGo", args: [id], required: true, confirm: "Send back" });
      return;
    }
    run(() => savePost(p, { stage: "writing" }), plural(open.length, "Sent back with 1 note", "Sent back with {n} notes"));
    if (location.hash.startsWith("#/review")) setTimeout(nextReview, 400);
    void v;
  },
  async changesGo(id, text) {
    await run(async () => {
      await insertRow("notes", { post_id: id, kind: "note", body: text, version_n: latest(id) ? latest(id).n : null });
      await savePost(post(id), { stage: "writing" });
    }, "Sent back with your note");
    if (location.hash.startsWith("#/review")) setTimeout(nextReview, 400);
  },
  backToReview(id) {
    run(() => savePost(post(id), { stage: "review" }), "Moved back to review");
  },
  publish(id) {
    openModal({ title: "Mark as published", body: "Optional: paste the text you actually sent, so the writer sees your last edits.", act: "publishGo", args: [id], confirm: "Mark published", big: true, value: composeWhatsApp(post(id)) });
  },
  publishGo(id, text) {
    run(() => savePost(post(id), { stage: "published", published_at: new Date().toISOString(), published_text: text || null }), "Marked published");
  },
  unpublish(id) {
    run(() => savePost(post(id), { stage: "ready", published_at: null }), "Back to ready");
  },
  reactions(id, n) {
    run(() => savePost(post(id), { reactions: n === "" ? null : Number(n) }));
  },

  // queue
  hot(id) {
    const p = post(id);
    run(() => savePost(p, { hot: !p.hot }), p.hot ? "No longer hot" : "Hot: it takes the next free day");
  },
  emailToo(id) {
    const p = post(id);
    run(() => savePost(p, { email_too: !p.email_too }));
  },
  pin(id, date) {
    run(() => savePost(post(id), { pinned_date: date || null }), date ? t("Locked to {d}", { d: fmtDay(date) }) : "Unlocked");
  },
  move(id, dir) {
    const q = queueOrder().filter((p) => !p.pinned_date && !!p.hot === !!post(id).hot);
    const i = q.findIndex((p) => p.id === id);
    const j = i + Number(dir);
    if (i < 0 || j < 0 || j >= q.length) return;
    const a = q[i], b = q[j];
    run(async () => {
      const pa = a.queue_pos, pb = b.queue_pos === pa ? pa + Number(dir) * 0.001 : b.queue_pos;
      await savePost(a, { queue_pos: pb });
      await savePost(b, { queue_pos: pa });
    });
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
    openModal({ title: "Edit the idea", body: "The pitch: what it is, why now, what readers get.", act: "editIdeaGo", args: [id], required: true, value: p.idea || "", big: true, confirm: "Save" });
  },
  editIdeaGo(id, text) {
    run(async () => {
      await savePost(post(id), { idea: text, idea_he: null });
      translateMissing();
    });
  },

  // headlines and versions
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
  removeHeadline(vid, i) {
    const v = S.d.versions.find((x) => x.id === vid);
    const hl = v.headlines.filter((_, k) => k !== Number(i));
    let chosen = v.chosen;
    if (chosen != null) chosen = chosen === Number(i) ? null : chosen > Number(i) ? chosen - 1 : chosen;
    run(() => updateRow("versions", v, { headlines: hl, chosen }));
  },
  startEdit(pid, ch) {
    S.edit = { postId: pid, channel: ch };
    render();
    setTimeout(() => {
      const t = document.querySelector("textarea[name=body]");
      if (t) t.focus();
    }, 30);
  },
  cancelEdit() {
    S.edit = null;
    render();
  },
  async saveEdit(form) {
    const { postId, channel } = S.edit;
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
      const was = prevH[chosenIndex(prev)].en;
      const k = hl.findIndex((h) => h.en === was);
      chosen = k >= 0 ? k : null;
    }
    await run(async () => {
      const v = await insertRow("versions", {
        post_id: postId, channel, n: prev ? prev.n + 1 : 1, body, headlines: hl, chosen, sources,
        writer_note: note || (isOwner() && p.author !== S.me ? "Edited by Jay" : null),
      });
      S.vsel[`${postId}:${channel}`] = v.n;
      // Jay approved this text: a writer's new WhatsApp version goes back to him.
      if (!isOwner() && channel === "whatsapp" && (p.stage === "ready" || p.text_ok)) {
        await savePost(p, { stage: "review", text_ok: false });
      }
      // closing notes the writer ticked as fixed
      const ticks = [...form.querySelectorAll("input[name=fixed]:checked")].map((i) => i.value);
      for (const nid of ticks) {
        const n = S.d.notes.find((x) => x.id === nid);
        if (n) await updateRow("notes", n, { status: "closed", closed_in: v.n });
      }
      S.edit = null;
      translateMissing();
    }, "Saved as a new version");
  },
  fromWhatsApp(pid, ch) {
    const wa = latest(pid, "whatsapp");
    if (!wa) return toast("There is no WhatsApp text to start from.", true);
    S.edit = { postId: pid, channel: ch, seed: { body: wa.body, headlines: (wa.headlines || []).map((h) => h.en).join("\n") } };
    render();
  },

  // notes
  async addNote(form) {
    const pid = form.dataset.post;
    const text = form.note.value.trim();
    const kind = form.kind ? form.kind.value : isOwner() ? "note" : "team";
    if (!text) return;
    await run(async () => {
      await insertRow("notes", { post_id: pid, kind, body: text, version_n: latest(pid) ? latest(pid).n : null });
      form.note.value = "";
      translateMissing();
    }, kind === "question" ? "Question sent to Jay" : "Note added");
  },
  toggleNote(nid) {
    const n = S.d.notes.find((x) => x.id === nid);
    const v = latest(n.post_id);
    run(() => updateRow("notes", n, n.status === "open" ? { status: "closed", closed_in: v ? v.n : null } : { status: "open", closed_in: null }));
  },
  answer(nid, preset) {
    if (preset) return A.answerGo(nid, preset);
    openModal({ title: "Answer", act: "answerGo", args: [nid], required: true, confirm: "Send" });
  },
  answerGo(nid, text) {
    const n = S.d.notes.find((x) => x.id === nid);
    run(async () => {
      await updateRow("notes", n, { answer: text, answer_he: null, answered_by: S.me, status: "closed" });
      translateMissing();
    }, "Answered");
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

  // visuals
  async upload(pid, files, stage) {
    files = [...files];
    if (!files.length) return;
    await run(async () => {
      for (const f of files) {
        if (f.size > MAX_UPLOAD) throw new Error(t("{name} is over 50 MB. Upload it to Drive and paste the link in a note.", { name: f.name }));
        const safe = f.name.replace(/[^\w.\-]+/g, "-").slice(-80);
        const path = `${pid}/${uuid()}-${safe}`;
        await store.upload(path, f);
        await insertRow("assets", { post_id: pid, path, filename: f.name, mime: f.type || null, size: f.size, stage });
      }
    }, files.length > 1 ? t("{n} files uploaded", { n: files.length }) : "Uploaded");
  },
  assetApprove(aid) {
    const a = S.d.assets.find((x) => x.id === aid);
    run(() => updateRow("assets", a, { status: "approved", stage: "final" }), "Visual approved");
  },
  assetReplace(aid) {
    const a = S.d.assets.find((x) => x.id === aid);
    run(() => updateRow("assets", a, { status: "replaced" }));
  },
  assetRestore(aid) {
    const a = S.d.assets.find((x) => x.id === aid);
    run(() => updateRow("assets", a, { status: "pending" }));
  },
  assetFinal(aid) {
    const a = S.d.assets.find((x) => x.id === aid);
    run(() => updateRow("assets", a, { stage: a.stage === "final" ? "sketch" : "final" }));
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

  // new posts
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
        title: f.title.trim(), category: f.category, idea: f.idea.trim() || null, stage: "idea",
        hot: f.hot === "on", score: f.score ? Number(f.score) : null, news_date: f.news_date || null,
        covered_before: f.covered_before.trim() || null,
      });
      const sources = f.sources.split("\n").map((s) => s.trim()).filter(Boolean).map(parseSource);
      if (sources.length) await insertRow("notes", { post_id: p.id, kind: "team", body: `Sources:\n${sources.map((s) => s.url).join("\n")}` });
      translateMissing();
      location.hash = `#/post/${p.id}`;
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
      const stage = isOwner() ? "writing" : "review";
      const p = await insertRow("posts", {
        title: (f.title.trim() || headlines[0]).slice(0, 200), category: f.category, stage, hot: f.hot === "on",
        idea: f.idea.trim() || null, news_date: f.news_date || null,
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
      location.hash = `#/post/${p.id}`;
    }, isOwner() ? "Draft saved" : "Sent to Jay");
  },
  addDraftToIdea(pid) {
    S.edit = { postId: pid, channel: "whatsapp" };
    render();
  },

  // rules and settings
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
      const saved = await store.upsert("team_members", { email, name: f.name.trim() || email.split("@")[0], role: f.role, color: f.color || "#2b4f86", active: true });
      const row = S.d.team_members.find((m) => m.email === email);
      if (row) Object.assign(row, saved);
      else S.d.team_members.push(saved);
      form.reset();
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
  deletePost(id) {
    openModal({ title: "Delete this post for good?", body: "Its versions, notes and files go too. Skip keeps it visible instead.", act: "deletePostGo", args: [id], confirm: "Delete", danger: true, noText: true });
  },
  deletePostGo(id) {
    run(async () => {
      for (const a of assetsOf(id)) await store.removeFile(a.path).catch(() => {});
      await store.remove("posts", id);
      S.d.posts = S.d.posts.filter((p) => p.id !== id);
      S.d.versions = S.d.versions.filter((v) => v.post_id !== id);
      S.d.notes = S.d.notes.filter((n) => n.post_id !== id);
      S.d.assets = S.d.assets.filter((a) => a.post_id !== id);
      location.hash = "#/board";
    }, "Deleted");
  },
};

function parseSource(line) {
  const m = line.match(/https?:\/\/\S+/);
  const url = m ? m[0] : line;
  const label = line.replace(url, "").replace(/^[\s:–-]+|[\s:–-]+$/g, "") || (isHttp(url) ? new URL(url).hostname.replace(/^www\./, "") : url);
  const official = /(^|\.)(amazon\.[a-z.]+|aboutamazon\.com|openai\.com|anthropic\.com|claude\.com|claude\.ai|google\.com|blog\.google|shopify\.com|meta\.com|microsoft\.com|apple\.com)$/i.test(isHttp(url) ? new URL(url).hostname : "");
  return { url, label, official };
}

function nextReview() {
  const q = ownerQueue();
  if (!q.length) {
    location.hash = "#/";
    toast("You're through the queue.");
    return;
  }
  const m = location.hash.match(/^#\/review\/(\d+)/);
  const i = Math.min(m ? Number(m[1]) : 0, q.length - 1);
  location.hash = `#/review/${i}`;
  render();
}

// ---------------- schedule ----------------
function queueOrder() {
  return S.d.posts
    .filter((p) => ["writing", "review", "ready"].includes(p.stage))
    .sort((a, b) => (b.hot - a.hot) || (a.queue_pos - b.queue_pos));
}
function buildSchedule(weeks = 3) {
  const cad = cadence();
  const start = parseDate(todayStr());
  const sunday = start.getDate() - start.getDay(); // Sunday of this week
  const days = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), sunday + i);
    const ds = localDate(d);
    days.push({ date: ds, dow: d.getDay(), past: ds < todayStr(), on: cad.days.includes(d.getDay()), posts: [], published: [] });
  }
  const byDate = Object.fromEntries(days.map((d) => [d.date, d]));
  for (const p of S.d.posts.filter((x) => x.stage === "published" && x.published_at)) {
    const ds = localDate(new Date(p.published_at));
    if (byDate[ds]) byDate[ds].published.push(p);
  }
  const queue = queueOrder();
  const overdue = [];
  const later = [];
  for (const p of queue.filter((x) => x.pinned_date)) {
    if (p.pinned_date < todayStr()) overdue.push(p);
    else if (byDate[p.pinned_date]) byDate[p.pinned_date].posts.push(p);
    else later.push(p);
  }
  const free = queue.filter((x) => !x.pinned_date);
  for (const d of days) {
    if (d.past || !d.on) continue;
    if (d.posts.length || d.published.length) continue;
    if (free.length) d.posts.push(free.shift());
  }
  later.push(...free);
  const out = [];
  for (let w = 0; w < weeks; w++) out.push(days.slice(w * 7, w * 7 + 7));
  return { weeks: out, overdue, later, slotOf: Object.fromEntries(days.flatMap((d) => d.posts.map((p) => [p.id, d.date]))) };
}

// ---------------- views ----------------
function route() {
  const h = location.hash.replace(/^#/, "") || "/";
  const parts = h.split("/").filter(Boolean);
  return { name: parts[0] || "home", id: parts[1] };
}

function topBar(r) {
  const myCount = isOwner()
    ? ownerQueue().length + S.d.posts.filter((p) => p.stage === "ready").length + openQuestions().length
    : S.d.posts.filter((p) => p.stage === "writing" && p.author === S.me).length;
  const link = (name, href, label, extra = "") => `<a href="${href}" class="${r.name === name ? "on" : ""}">${T(label)}${extra}</a>`;
  return `<header class="top"><div class="top-in">
    <a class="brand" href="#/"><i></i>Content Desk</a>
    <nav class="nav">
      ${link("home", "#/", isOwner() ? "Waiting on me" : "My turn", myCount ? `<span class="dot">${myCount}</span>` : "")}
      ${link("board", "#/board", "Board")}
      ${link("schedule", "#/schedule", "Schedule")}
      ${link("published", "#/published", "Published|nav")}
      ${link("rules", "#/rules", "House rules")}
      ${link("settings", "#/settings", "Settings")}
    </nav>
    <div class="me">${DEMO ? '<span class="demo-badge">DEMO</span>' : ""}
      <a class="btn sm go" href="#/new">${T("+ New")}</a>
      <button class="btn sm ghost" data-act="setLang" data-a="${S.lang === "he" ? "en" : "he"}">${S.lang === "he" ? "English" : "עברית"}</button>
      ${avatar(S.me)}
      <button class="btn sm ghost out" data-act="signOut">${T("Sign out")}</button>
    </div>
  </div></header>`;
}

// The reader's language first, the other language under it.
const showsHe = () => S.lang === "he" || S.showHe;
function biText(en, he) {
  en = en || "";
  he = he || "";
  if (S.lang === "he") return he && he !== en ? { main: he, sub: en } : { main: he || en, sub: "" };
  return { main: en, sub: S.showHe && he && he !== en ? he : "" };
}
function bi(en, he, mainCls = "", subCls = "t-sub") {
  const b = biText(en, he);
  return `<div class="${mainCls}" dir="auto">${esc(b.main)}</div>${b.sub ? `<div class="${subCls}" dir="auto">${esc(b.sub)}</div>` : ""}`;
}
const clip = (s, n = 260) => (s && s.length > n ? s.slice(0, n) + "…" : s || "");

function postCard(p, opts = {}) {
  const tt = displayTitle(p);
  const title = biText(tt.en, tt.he);
  const v = latest(p.id);
  const openNotes = notesOf(p.id).filter((n) => n.kind === "note" && n.status === "open").length;
  const qs = notesOf(p.id).filter((n) => n.kind === "question" && n.status === "open").length;
  const fin = approvedAsset(p.id) || finalAsset(p.id);
  const pills = [];
  if (p.hot) pills.push(`<span class="pill hot">🔥 ${T("Hot")}</span>`);
  if (p.pinned_date) pills.push(`<span class="pill lock">🔒 ${esc(fmtDay(p.pinned_date))}</span>`);
  if (p.email_too) pills.push(`<span class="pill blue">✉ ${T("Email")}</span>`);
  if (p.text_ok && p.stage === "writing") pills.push(`<span class="pill go">${T("Text ✓ · banner next")}</span>`);
  if (v && (v.headlines || []).length < 3 && ["review", "writing"].includes(p.stage)) pills.push(`<span class="pill wait">${T("{n} of 3 headlines", { n: (v.headlines || []).length })}</span>`);
  if (qs) pills.push(`<span class="pill blue">${esc(plural(qs, "1 question", "{n} questions"))}</span>`);
  const cls = ["card"];
  if (opts.turn) cls.push("turn");
  if (p.stage === "ready") cls.push("ready");
  if (opts.muted) cls.push("muted");
  const metaBits = [];
  if (v) metaBits.push(`v${v.n}`);
  if (openNotes) metaBits.push(esc(plural(openNotes, "1 open note", "{n} open notes")));
  if (p.stage === "published" && p.published_at) metaBits.push(T("published {d}", { d: fmtDay(localDate(new Date(p.published_at))) }));
  if (p.reactions != null) metaBits.push(T("{n} reactions", { n: p.reactions }));
  if (p.skip_reason && ["skipped", "parked"].includes(p.stage)) metaBits.push(esc(p.skip_reason));
  if (opts.slot) metaBits.push(T("goes out {d}", { d: fmtDay(opts.slot) }));
  const pitch = opts.pitch && p.idea ? biText(clip(p.idea), clip(p.idea_he)) : null;
  return `<div class="${cls.join(" ")}">
    <div class="r1">${tag(p.category)}${pills.join("")}</div>
    <a class="t" dir="auto" href="#/post/${p.id}">${esc(title.main)}</a>
    ${title.sub && !opts.compact ? `<div class="t-sub" dir="auto">${esc(title.sub)}</div>` : ""}
    ${pitch ? `<div class="pitch pre" dir="auto">${esc(pitch.main)}</div>` : ""}
    ${opts.thumb && fin && (fin.mime || "").startsWith("image/") ? `<img class="thumb" alt="" src="${esc(cachedUrl(fin))}">` : ""}
    <div class="meta">${avatar(p.author)}<span>${esc(nameOf(p.author))}</span><span>· ${esc(ago(p.updated_at))}</span>${metaBits.map((b) => `<span>· ${b}</span>`).join("")}</div>
    ${opts.actions || ""}
  </div>`;
}

function viewHome() {
  const sched = buildSchedule(2);
  const stockReady = S.d.posts.filter((p) => p.stage === "ready").length;
  const thisWeek = sched.weeks[0];
  const cad = cadence();
  const doneThisWeek = thisWeek.reduce((n, d) => n + d.published.length, 0);
  const stock = `<div class="stock">
    <span><b>${stockReady}</b> ${T("ready to publish")}</span>
    <span><b>${doneThisWeek}</b> ${T("of {n} published this week", { n: cad.days.length })}</span>
    <span><b>${S.d.posts.filter((p) => p.stage === "review").length}</b> ${T("drafts waiting on Jay")}</span>
    <span><b>${S.d.posts.filter((p) => p.stage === "idea").length}</b> ${T("ideas")}</span>
  </div>`;

  if (isOwner()) {
    const ready = S.d.posts.filter((p) => p.stage === "ready").sort((a, b) => (sched.slotOf[a.id] || "9").localeCompare(sched.slotOf[b.id] || "9"));
    ready.forEach((p) => {
      const a = approvedAsset(p.id);
      if (a) ensureUrls([a]);
    });
    const review = S.d.posts.filter((p) => p.stage === "review").sort((a, b) => (b.hot - a.hot) || a.updated_at.localeCompare(b.updated_at));
    const ideas = S.d.posts.filter((p) => p.stage === "idea").sort((a, b) => (b.hot - a.hot) || a.created_at.localeCompare(b.created_at));
    const mine = S.d.posts.filter((p) => p.stage === "writing" && p.author === S.me);
    const qs = openQuestions();
    const total = ready.length + review.length + ideas.length + qs.length + mine.length;
    const readyCards = ready.map((p) => {
      const a = approvedAsset(p.id);
      return postCard(p, { thumb: true, slot: sched.slotOf[p.id], actions: `<div class="btns">
        <button class="btn go" data-act="copyPost" data-a="${p.id}">${T("Copy for WhatsApp")}</button>
        ${a ? `<button class="btn" data-act="download" data-a="${a.id}">${T("Banner ↓")}</button>` : ""}
        <button class="btn ghost" data-act="publish" data-a="${p.id}">${T("Mark published")}</button></div>` });
    });
    const qCards = qs.map((n) => {
      const p = post(n.post_id);
      return `<div class="card q">
        <div class="r1"><span class="tag news">${T("Quick question")}</span>${p ? tag(p.category) : ""}</div>
        ${bi(n.body, n.body_he, "t")}
        <div class="meta">${avatar(n.author)}<span>${esc(nameOf(n.author))}</span>${p ? `<span>· ${T("on")} <a href="#/post/${p.id}" dir="auto">${esc(biText(displayTitle(p).en, displayTitle(p).he).main)}</a></span>` : ""}</div>
        <div class="btns"><button class="btn" data-act="answer" data-a="${n.id}" data-b="Yes">${T("Yes")}</button><button class="btn" data-act="answer" data-a="${n.id}" data-b="No">${T("No")}</button><button class="btn" data-act="answer" data-a="${n.id}" data-b="Didn't check yet">${T("Didn't check")}</button><button class="btn ghost" data-act="answer" data-a="${n.id}">${T("Write an answer")}</button></div>
      </div>`;
    });
    const reviewCards = review.map((p) => postCard(p, { turn: true, actions: `<div class="btns"><a class="btn dark" href="#/post/${p.id}">${T("Open")}</a><button class="btn ghost" data-act="skip" data-a="${p.id}">${T("Skip")}</button></div>` }));
    const ideaCards = ideas.map((p) => postCard(p, { turn: true, pitch: true, actions: `<div class="btns">
      <button class="btn go" data-act="ideaYes" data-a="${p.id}">${T("Yes")}</button>
      <button class="btn" data-act="ideaChange" data-a="${p.id}">${T("Change")}</button>
      <button class="btn ghost" data-act="ideaNotNow" data-a="${p.id}">${T("Not now")}</button></div>` }));
    const mineCards = mine.map((p) => postCard(p, { turn: true }));
    return `<div class="headrow"><div><h1>${T("Waiting on you")} <em>${total}</em></h1>
      <p class="lead">${T("Ready posts first, then quick questions, drafts and new ideas.")}</p></div>
      ${review.length + ideas.length ? `<a class="btn dark" href="#/review/0">${T("Review one by one →")} ${review.length + ideas.length}</a>` : ""}</div>
      ${stock}
      ${S.translateError ? `<p class="muted small" style="margin-top:10px">${T("Hebrew translation paused: {e}. It retries by itself.", { e: S.translateError })}</p>` : ""}
      ${section("Ready to publish", readyCards, "Nothing approved is waiting.")}
      ${qCards.length ? section("Quick questions", qCards) : ""}
      ${section("Drafts to review", reviewCards, "No drafts are waiting.")}
      ${section("New ideas", ideaCards, "No new ideas.")}
      ${mineCards.length ? section("Your own drafts", mineCards) : ""}`;
  }

  const mine = S.d.posts.filter((p) => p.stage === "writing" && p.author === S.me).sort((a, b) => (b.hot - a.hot) || a.queue_pos - b.queue_pos);
  const others = S.d.posts.filter((p) => p.stage === "writing" && p.author !== S.me && member(p.author).role !== "owner");
  const answered = S.d.notes.filter((n) => n.kind === "question" && n.answer && n.author === S.me && Date.now() - new Date(n.updated_at || n.created_at).getTime() < 7 * DAY);
  const waiting = S.d.posts.filter((p) => ["idea", "review", "ready"].includes(p.stage) && p.author === S.me);
  return `<h1>${T("Your turn")} <em>${mine.length}</em></h1>
    <p class="lead">${T("Drafts and fixes that are yours. When a post is ready, send it to Jay from its page.")}</p>
    ${stock}
    ${section("To write or fix", mine.map((p) => postCard(p, { turn: true, slot: buildSchedule(3).slotOf[p.id] })), "Nothing is waiting on you.")}
    ${answered.length ? section("Answers from Jay", answered.map((n) => {
      const p = post(n.post_id);
      return `<div class="card q">${bi(n.body, n.body_he, "t")}<div class="ans"><b>${esc(nameOf(n.answered_by))}:</b> <span dir="auto">${esc(biText(n.answer, n.answer_he).main)}</span></div>${p ? `<div class="meta">${T("on")} <a href="#/post/${p.id}" dir="auto">${esc(biText(displayTitle(p).en, displayTitle(p).he).main)}</a></div>` : ""}</div>`;
    })) : ""}
    ${others.length ? section("Teammates are writing", others.map((p) => postCard(p, {}))) : ""}
    ${section("Waiting on Jay", waiting.map((p) => postCard(p, { pitch: p.stage === "idea" })), "Nothing of yours is waiting on Jay.")}`;
}

function section(title, cards, empty) {
  return `<h2>${T(title)} <span class="count">${cards.length}</span></h2>${cards.length ? `<div class="grid">${cards.join("")}</div>` : `<div class="empty">${T(empty || "")}</div>`}`;
}

function viewBoard() {
  const f = S.filter;
  const match = (p) => f === "all" || p.category === f;
  const col = (title, cls, list, opts = {}) => `<div class="col ${cls}"><h3>${T(title)}<span class="count">${list.length}</span></h3>${list.length ? list.map((p) => postCard(p, { compact: true, ...opts })).join("") : `<div class="empty">${T("Empty")}</div>`}</div>`;
  const ps = S.d.posts.filter(match);
  const sorted = (st) => ps.filter((p) => p.stage === st).sort((a, b) => (b.hot - a.hot) || b.updated_at.localeCompare(a.updated_at));
  const twoWeeks = Date.now() - 14 * DAY;
  const pub = ps.filter((p) => p.stage === "published" && new Date(p.published_at || p.updated_at).getTime() > twoWeeks).sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""));
  const shelved = ps.filter((p) => ["parked", "skipped"].includes(p.stage)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return `<div class="headrow"><h1>${T("Board")}</h1><a class="btn go" href="#/new">${T("+ New idea or draft")}</a></div>
    <div class="filters">${["all", ...CATS].map((c) => `<button class="chip ${f === c ? "on" : ""}" data-act="filter" data-a="${c}">${c === "all" ? T("All") : esc(catLabel(c))}</button>`).join("")}</div>
    <div class="board">
      ${col("Ideas", "", sorted("idea"), { pitch: false })}
      ${col("Writing", "", sorted("writing"))}
      ${col("Waiting on Jay", "jay", sorted("review"))}
      ${col("Ready", "rdy", sorted("ready"))}
      ${col("Published · 14 days", "", pub)}
    </div>
    <h2>${T("Not now and skipped")} <span class="count">${shelved.length}</span></h2>
    ${shelved.length ? `<div class="grid">${shelved.map((p) => postCard(p, { muted: true, actions: isOwner() ? `<div class="btns"><button class="btn sm ghost" data-act="revive" data-a="${p.id}">${T("Back to ideas")}</button></div>` : "" })).join("")}</div>` : `<div class="empty">${T("Nothing shelved.")}</div>`}`;
}

function viewSchedule() {
  const sch = buildSchedule(3);
  const cad = cadence();
  const owner = isOwner();
  const name = (p) => esc(biText(displayTitle(p).en, displayTitle(p).he).main);
  const slotHtml = (p, d) => {
    const cls = p.pinned_date ? "lock" : p.hot ? "hotslot" : "";
    const ctl = `<div class="ctl">
      ${!p.pinned_date ? `<button data-act="move" data-a="${p.id}" data-b="-1" title="${T("Move earlier")}">↑</button><button data-act="move" data-a="${p.id}" data-b="1" title="${T("Move later")}">↓</button>` : ""}
      <button class="${p.hot ? "on" : ""}" data-act="hot" data-a="${p.id}" title="${T("Hot: it takes the next free day")}">🔥</button>
      <button class="${p.email_too ? "on" : ""}" data-act="emailToo" data-a="${p.id}" title="${T("Also email")}">✉</button>
      <button class="${p.pinned_date ? "on" : ""}" data-act="pinPrompt" data-a="${p.id}" data-b="${d || ""}" title="${T("Lock to a date")}">🔒</button>
    </div>`;
    return `<div class="slot ${cls}"><a href="#/post/${p.id}" dir="auto">${name(p)}</a>
      <span class="stg">${esc(stageLabel(p.stage))}${p.email_too ? ` · ✉ ${T("email")}` : ""}</span>${ctl}</div>`;
  };
  const weekHtml = (days, w) => {
    const wa = days.reduce((n, d) => n + d.posts.length + d.published.length, 0);
    const em = days.reduce((n, d) => n + [...d.posts, ...d.published].filter((p) => p.email_too).length, 0);
    const label = w === 0 ? T("This week") : w === 1 ? T("Next week") : T("Week of {d}", { d: fmtDM(days[0].date) });
    return `<div class="week"><div class="week-head"><b>${label}</b>
      <span class="muted small">${T("WhatsApp {a} of {b} · Email {c} of {d}", { a: wa, b: cad.days.length, c: em, d: cad.email_per_week })}</span></div>
      <div class="days">${days.map((d) => `<div class="day ${d.on ? "" : "off"} ${d.date === todayStr() ? "today" : ""}">
        <div class="dn"><span>${esc(fmtDow(d.date))}</span><span>${esc(fmtDM(d.date))}</span></div>
        ${d.published.map((p) => `<div class="slot pub"><a href="#/post/${p.id}" dir="auto">✓ ${name(p)}</a></div>`).join("")}
        ${d.posts.map((p) => slotHtml(p, d.date)).join("")}
        ${!d.past && d.on && !d.posts.length && !d.published.length ? `<div class="slot-empty">${T("open")}</div>` : ""}
      </div>`).join("")}</div></div>`;
  };
  const loose = (list) => `<div class="days loose">${list.map((p) => `<div class="day">${slotHtml(p)}</div>`).join("")}</div>`;
  return `<div class="headrow"><div><h1>${T("Schedule")}</h1>
    <p class="lead">${T("One queue. Hot posts take the next free day, locked posts stay on their date, everything else moves forward in order. Ideas are not scheduled until Jay says yes.")}</p></div></div>
    ${sch.overdue.length ? `<h2>${T("Locked to a date that passed")} <span class="count">${sch.overdue.length}</span></h2>${loose(sch.overdue)}` : ""}
    <div style="margin-top:18px">${sch.weeks.map(weekHtml).join("")}</div>
    <h2>${T("Later")} <span class="count">${sch.later.length}</span></h2>
    ${sch.later.length ? loose(sch.later) : `<div class="empty">${T("Every post in the queue has a day.")}</div>`}
    ${owner ? `<p class="muted small" style="margin-top:14px">${T("Publishing days and the weekly email count are in")} <a href="#/settings">${T("Settings")}</a>.</p>` : ""}`;
}

function viewPublished() {
  const list = S.d.posts.filter((p) => p.stage === "published").sort((a, b) => (b.published_at || "").localeCompare(a.published_at || ""));
  return `<h1>${T("Published|nav")}</h1><p class="lead">${T("Newest first. Reactions are typed in by hand for now.")}</p>
    ${list.length ? `<div class="tablewrap"><table><tr><th>${T("Date")}</th><th>${T("Post")}</th><th>${T("By")}</th><th>${T("Reactions")}</th></tr>
    ${list.map((p) => {
      const b = biText(displayTitle(p).en, displayTitle(p).he);
      return `<tr><td class="nowrap muted">${p.published_at ? esc(fmtDay(localDate(new Date(p.published_at)))) : ""}</td>
      <td>${tag(p.category)} <a href="#/post/${p.id}" dir="auto">${esc(b.main)}</a>${b.sub ? `<div class="t-sub" dir="auto">${esc(b.sub)}</div>` : ""}</td>
      <td>${esc(nameOf(p.author))}</td>
      <td>${isOwner() ? `<input type="number" min="0" style="width:90px" value="${p.reactions ?? ""}" data-change="reactions" data-a="${p.id}">` : esc(p.reactions ?? "")}</td></tr>`;
    }).join("")}
    </table></div>` : `<div class="empty" style="margin-top:16px">${T("Nothing published yet.")}</div>`}`;
}

function viewRules() {
  const rules = [...S.d.rules].sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
  const owner = isOwner();
  return `<div class="headrow"><div><h1>${T("House rules")}</h1>
    <p class="lead">${T("Every note from Jay that is a rule and not a one-off fix. Copy them as a prompt for your own Claude, so the rules go in while you write.")}</p></div>
    <div class="btns"><button class="btn dark" data-act="copyRules">${T("Copy as a prompt")}</button>${owner ? `<button class="btn" data-act="addRule">${T("+ Rule")}</button>` : ""}</div></div>
    <div class="tablewrap"><table><tr><th>#</th><th>${T("Rule")}</th><th>${T("Where it came from")}</th>${owner ? "<th></th>" : ""}</tr>
    ${rules.map((r, i) => `<tr style="${r.active ? "" : "opacity:.5"}"><td class="muted">${i + 1}</td>
      <td>${bi(r.body, r.body_he)}${r.check_key ? `<span class="pill go" style="margin-top:4px">${T("checked automatically")}</span>` : ""}</td>
      <td class="muted small" dir="auto">${esc(r.source || "")}</td>
      ${owner ? `<td><div class="btns"><button class="btn sm ghost" data-act="editRule" data-a="${r.id}">${T("Edit")}</button><button class="btn sm ghost" data-act="toggleRule" data-a="${r.id}">${r.active ? T("Switch off") : T("Switch on")}</button><button class="btn sm ghost" data-act="deleteRule" data-a="${r.id}">${T("Delete")}</button></div></td>` : ""}
    </tr>`).join("")}</table></div>`;
}

function viewSettings() {
  const owner = isOwner();
  const cad = cadence();
  const sig = (setting("signature", {}) || {}).text || "";
  const dayName = (i) => new Date(2026, 0, 4 + i).toLocaleDateString(locale(), { weekday: "short" });
  return `<h1>${T("Settings")}</h1>
    <div class="panel" style="margin-top:18px"><h3>${T("Display")}</h3>
      <div class="field"><label>${T("Language")}</label><div><span class="seg"><button type="button" class="${S.lang === "en" ? "on" : ""}" data-act="setLang" data-a="en">English</button><button type="button" class="${S.lang === "he" ? "on" : ""}" data-act="setLang" data-a="he">עברית</button></span></div>
      <span class="hint">${T("Only changes what you see. Everyone else keeps their own language.")}</span></div>
      ${S.lang === "en" ? `<label class="check"><input type="checkbox" data-act="toggleHe" ${S.showHe ? "checked" : ""}> ${T("Show the Hebrew translation next to the English")}</label>` : ""}
    </div>
    <h2>${T("Team")}</h2>
    <div class="tablewrap"><table><tr><th>${T("Name")}</th><th>${T("Email")}</th><th>${T("Role")}</th><th>${T("Status")}</th></tr>
    ${S.d.team_members.map((m) => `<tr><td class="nowrap">${avatar(m.email)} ${esc(m.name)}</td><td class="mono" dir="ltr">${esc(m.email)}</td>
      <td>${owner && m.email !== S.me ? `<select data-change="memberRole" data-a="${esc(m.email)}" style="width:auto"><option value="writer" ${m.role === "writer" ? "selected" : ""}>${T("Writer")}</option><option value="owner" ${m.role === "owner" ? "selected" : ""}>${T("Owner")}</option></select>` : m.role === "owner" ? T("Owner") : T("Writer")}</td>
      <td>${owner && m.email !== S.me ? `<button class="btn sm ghost" data-act="memberActive" data-a="${esc(m.email)}">${m.active ? T("Active · switch off") : T("Off · switch on")}</button>` : m.active ? T("Active") : T("Off")}</td></tr>`).join("")}</table></div>
    ${owner ? `<form data-form="addMember" class="panel" style="margin-top:12px"><h3>${T("Add someone")}</h3>
      <div class="row3"><div class="field"><label>${T("Google email")}</label><input type="email" name="email" dir="ltr" required placeholder="name@jaygptpro.com"></div>
      <div class="field"><label>${T("Name")}</label><input type="text" name="name" dir="auto"></div>
      <div class="field"><label>${T("Role")}</label><select name="role"><option value="writer">${T("Writer")}</option><option value="owner">${T("Owner")}</option></select></div></div>
      <input type="hidden" name="color" value="#0c8f6f"><button class="btn go">${T("Add")}</button>
      <p class="muted small" style="margin-top:8px">${T("They sign in with that Google account. Anyone not on this list sees nothing.")}</p></form>` : ""}
    <form data-form="saveSettings" class="panel" style="margin-top:22px"><h3>${T("Publishing")}</h3>
      <div class="field"><label>${T("Publishing days (WhatsApp)")}</label><div class="btns">${[0, 1, 2, 3, 4, 5, 6].map((i) => `<label class="check"><input type="checkbox" name="day" value="${i}" ${cad.days.includes(i) ? "checked" : ""} ${owner ? "" : "disabled"}> ${esc(dayName(i))}</label>`).join("")}</div></div>
      <div class="field" style="max-width:220px"><label>${T("Emails per week")}</label><input type="number" min="0" max="7" name="email_per_week" value="${cad.email_per_week}" ${owner ? "" : "disabled"}></div>
      <div class="field"><label>${T("Signature added under every WhatsApp post")}</label><textarea name="signature" dir="auto" ${owner ? "" : "disabled"}>${esc(sig)}</textarea>
      <span class="hint">${T("Added only when the post text has no group link of its own.")}</span></div>
      ${owner ? `<button class="btn go">${T("Save")}</button>` : ""}
    </form>
    <p style="margin-top:22px"><button class="btn ghost" data-act="signOut">${T("Sign out")}</button></p>`;
}

function viewNew() {
  const mode = S.newMode;
  const owner = isOwner();
  const catSel = (val) => `<select name="category">${CATS.map((c) => `<option value="${c}" ${val === c ? "selected" : ""}>${esc(catLabel(c))}</option>`).join("")}</select>`;
  let body;
  if (mode === "idea") {
    body = `<form data-form="createIdea" class="panel">
      <div class="row2"><div class="field"><label>${T("Working title")}</label><input type="text" name="title" dir="auto" required placeholder="${T("What the post is about, in one line")}"></div>
      <div class="field"><label>${T("Category")}</label>${catSel("tip")}</div></div>
      <div class="field"><label>${T("The pitch")}</label><textarea name="idea" dir="auto" placeholder="${T("Hook, why now, what readers get. Two to five lines.")}"></textarea></div>
      <div class="row3"><div class="field"><label>${T("When the news came out (if news)")}</label><input type="date" name="news_date"></div>
      <div class="field"><label>${T("Your score, 1 to 10")}</label><input type="number" name="score" min="1" max="10"></div>
      <div class="field"><label>&nbsp;</label><label class="check"><input type="checkbox" name="hot"> ${T("Hot: it goes stale fast")}</label></div></div>
      <div class="field"><label>${T("Covered before?")}</label><input type="text" name="covered_before" dir="auto" placeholder="${T("e.g. a similar post went out on 29 Mar")}"></div>
      <div class="field"><label>${T("Sources, one per line")}</label><textarea name="sources" dir="ltr" placeholder="https://..."></textarea></div>
      <button class="btn go">${T("Add idea")}</button></form>`;
  } else if (!S.split) {
    body = `<form data-form="splitDraft" class="panel">
      <div class="field"><label>${T("Paste the full draft")}</label><textarea class="big" name="draft" dir="auto" placeholder="${T("Headline options, the post, sources and notes for Jay, in one block. The desk splits it into fields.")}">${esc(S.draftText || "")}</textarea></div>
      <button class="btn go">${T("Split it into fields →")}</button>
      <p class="muted small" style="margin-top:8px">${T("Nothing is saved until you check the fields and press Create.")}</p></form>`;
  } else {
    const sp = S.split;
    body = `<form data-form="createDraft" class="panel">
      <div class="row3"><div class="field"><label>${T("Working title")}</label><input type="text" name="title" dir="auto" value="${esc((sp.headlines[0] || {}).en || "")}"></div>
      <div class="field"><label>${T("Category")}</label>${catSel(sp.category)}</div>
      <div class="field"><label>${T("When the news came out")}</label><input type="date" name="news_date"></div></div>
      <div class="field"><label>${T("Headline options, one per line")}</label><textarea name="headlines" dir="auto">${esc(sp.headlines.map((h) => h.en).join("\n"))}</textarea>
      ${sp.headlines.some((h) => h.pick) ? `<span class="hint">${T("The writer's pick: {x}", { x: sp.headlines.find((h) => h.pick).en })}</span>` : ""}</div>
      <div class="field"><label>${T("Post text (WhatsApp format, no headline, no signature)")}</label><textarea class="big" name="body" dir="auto">${esc(sp.body)}</textarea></div>
      <div class="row2"><div class="field"><label>${T("Sources, one per line")}</label><textarea name="sources" dir="ltr">${esc(sp.sources.map((s) => `${s.url} ${s.label}`).join("\n"))}</textarea></div>
      <div class="field"><label>${T("Notes for Jay")}</label><textarea name="notes" dir="auto">${esc(sp.notes)}</textarea></div></div>
      <div class="field"><label>${T("The idea in a line (optional)")}</label><input type="text" name="idea" dir="auto"></div>
      <label class="check" style="margin-bottom:12px"><input type="checkbox" name="hot"> ${T("Hot: it goes stale fast")}</label><br>
      <div class="btns"><button class="btn go">${owner ? T("Create draft") : T("Create and send to Jay")}</button><button type="button" class="btn ghost" data-act="newMode" data-a="draft">${T("Start over")}</button></div></form>`;
  }
  return `<h1>${T("New")}</h1><p class="lead">${owner ? T("Your own idea or post. It stays with you until you mark it ready.") : T("Start with an idea for Jay to say yes to. For hot news, paste the full draft and Jay answers both at once.")}</p>
    <div style="margin:16px 0"><span class="seg"><button class="${mode === "idea" ? "on" : ""}" data-act="newMode" data-a="idea">${T("Idea")}</button><button class="${mode === "draft" ? "on" : ""}" data-act="newMode" data-a="draft">${T("Paste a full draft")}</button></span></div>
    ${body}`;
}

function viewPost(id, reviewIdx) {
  const p = post(id);
  if (!p) return `<div class="empty" style="margin-top:30px">${T("This post doesn't exist anymore.")} <a href="#/board">${T("Back to the board")}</a></div>`;
  const owner = isOwner();
  const mine = p.author === S.me;
  const canEdit = owner || mine || member(p.author).role !== "owner";
  const ch = S.channel[p.id] || "whatsapp";
  const chName = t(CHANNELS.find((c) => c[0] === ch)[1]);
  const v = shownVersion(p.id, ch);
  const vs = versionsOf(p.id, ch);
  const isLatest = v && vs.length && v.n === vs[vs.length - 1].n;
  const notes = notesOf(p.id);
  const assets = assetsOf(p.id);
  ensureUrls(assets.filter((a) => a.status !== "replaced" || assets.length < 6));
  const tt = displayTitle(p);
  const title = biText(tt.en, tt.he);
  const sched = buildSchedule(3);
  const editing = S.edit && S.edit.postId === p.id && S.edit.channel === ch;

  const q = reviewIdx != null ? ownerQueue() : null;
  const reviewBar = q ? `<div class="review-bar"><span>${T("Review · {a} of {b}", { a: Math.min(reviewIdx + 1, q.length), b: q.length })}</span>
    <span class="btns">${reviewIdx > 0 ? `<a class="btn sm" href="#/review/${reviewIdx - 1}">${T("← Prev")}</a>` : ""}${reviewIdx < q.length - 1 ? `<a class="btn sm" href="#/review/${reviewIdx + 1}">${T("Next →")}</a>` : ""}<a class="btn sm ghost" href="#/">${T("Exit")}</a></span></div>` : "";

  const head = `${reviewBar}<div class="post-head"><a class="btn sm ghost" href="#/board">${T("← Board")}</a>${tag(p.category)}
      <span class="pill ${p.stage === "ready" ? "go" : p.stage === "review" || p.stage === "idea" ? "wait" : "mute"}">${esc(stageLabel(p.stage))}</span>
      ${p.hot ? `<span class="pill hot">🔥 ${T("Hot")}</span>` : ""}${p.text_ok && p.stage === "writing" ? `<span class="pill go">${T("Text approved · banner next")}</span>` : ""}
      ${sched.slotOf[p.id] ? `<span class="pill blue">${T("Goes out {d}", { d: fmtDay(sched.slotOf[p.id]) })}</span>` : ""}
      <span class="by">${avatar(p.author)} ${esc(nameOf(p.author))} · ${esc(ago(p.created_at))}</span></div>
    <h1 class="post-title" dir="auto">${esc(title.main)}</h1>${title.sub ? `<div class="post-title-sub" dir="auto">${esc(title.sub)}</div>` : ""}
    <div><button class="linkbtn metabtn" data-act="toggleMeta">${T("Details: category, date, hot, email")} ${S.metaOpen ? "▴" : "▾"}</button></div>${S.metaOpen ? `<div class="meta-row">
      ${canEdit ? `<button class="btn sm ghost" data-act="renameTitle" data-a="${p.id}">${T("Working title")}: <span dir="auto">${esc(p.title.slice(0, 50))}${p.title.length > 50 ? "…" : ""}</span></button>` : ""}
      <label>${T("Category")} <select data-change="meta" data-a="${p.id}" data-b="category">${CATS.map((c) => `<option value="${c}" ${p.category === c ? "selected" : ""}>${esc(catLabel(c))}</option>`).join("")}</select></label>
      <label>${T("Jay tried it")} <select data-change="meta" data-a="${p.id}" data-b="tried"><option value="" ${p.tried_myself == null ? "selected" : ""}>${T("Not set")}</option><option value="yes" ${p.tried_myself === true ? "selected" : ""}>${T("Yes")}</option><option value="no" ${p.tried_myself === false ? "selected" : ""}>${T("Not yet")}</option></select></label>
      ${p.category === "news" ? `<label>${T("News date")} <input type="date" value="${esc(p.news_date || "")}" data-change="meta" data-a="${p.id}" data-b="news_date"></label>` : ""}
      <button class="btn sm ${p.hot ? "hot" : "ghost"}" data-act="hot" data-a="${p.id}">🔥 ${p.hot ? T("Hot") : T("Make hot")}</button>
      <button class="btn sm ${p.email_too ? "dark" : "ghost"}" data-act="emailToo" data-a="${p.id}">✉ ${p.email_too ? T("Also email") : T("Email too?")}</button>
      <label>🔒 ${T("Lock to")} <input type="date" value="${esc(p.pinned_date || "")}" data-change="pin" data-a="${p.id}"></label>
    </div>` : ""}`;

  // idea block
  const ib = biText(p.idea, p.idea_he);
  const ideaBlock = p.idea || p.stage === "idea" ? `<div class="panel" style="margin-top:14px"><h3>${T("The idea")}${canEdit ? ` <button class="btn sm ghost" data-act="editIdea" data-a="${p.id}">${T("Edit")}</button>` : ""}</h3>
      <div class="${ib.sub ? "two" : ""}">
        <div class="pre" dir="auto">${p.idea ? esc(ib.main) : T("No pitch written.")}</div>
        ${ib.sub ? `<div class="pre muted" dir="auto">${esc(ib.sub)}</div>` : ""}
      </div>
      <div class="meta-row">${p.score ? `<span class="pill blue">${T("Score {n}/10", { n: p.score })}</span>` : ""}${p.covered_before ? `<span>${T("Covered before:")} <span dir="auto">${esc(p.covered_before)}</span></span>` : ""}${p.news_date ? `<span>${T("News from {d}", { d: fmtDay(p.news_date) })}</span>` : ""}</div>
    </div>` : "";

  // first column: headlines and the text in the reader's language. Second column: the other language.
  let colA;
  let colB = "";
  if (editing) {
    const seed = S.edit.seed || {};
    const base = v || {};
    const openNotes = notes.filter((n) => n.kind === "note" && n.status === "open");
    colA = `<form data-form="saveEdit" class="panel"><h3>${ch === "whatsapp" ? T("Edit the post") : T("Edit the {ch} version", { ch: chName })} · ${T("saves as v{n}", { n: (vs.length ? vs[vs.length - 1].n : 0) + 1 })}</h3>
      <div class="field"><label>${ch === "email" ? T("Subject line options, one per line") : T("Headline options, one per line")}</label><textarea name="headlines" dir="auto" style="min-height:96px">${esc(seed.headlines ?? (base.headlines || []).map((h) => h.en).join("\n"))}</textarea></div>
      <div class="field"><label>${ch === "whatsapp" ? T("Post text, WhatsApp format (*bold*). No headline, no signature.") : T("Text")}</label><textarea class="big" name="body" dir="auto">${esc(seed.body ?? base.body ?? "")}</textarea></div>
      <div class="field"><label>${T("Sources, one per line")}</label><textarea name="sources" dir="ltr" style="min-height:70px">${esc((base.sources || []).map((s) => `${s.url}${s.label ? " " + s.label : ""}`).join("\n"))}</textarea></div>
      ${!owner ? `<div class="field"><label>${T("What changed (for Jay)")}</label><input type="text" name="writer_note" dir="auto" placeholder="${T("e.g. new headline, added the source")}"></div>` : ""}
      ${openNotes.length ? `<div class="field"><label>${T("Notes this version fixes")}</label>${openNotes.map((n) => `<label class="check"><input type="checkbox" name="fixed" value="${n.id}"> <span dir="auto">${esc(n.body.slice(0, 120))}</span></label>`).join("<br>")}</div>` : ""}
      <div class="btns"><button class="btn go">${T("Save as new version")}</button><button type="button" class="btn ghost" data-act="cancelEdit">${T("Cancel")}</button></div></form>`;
  } else if (!v) {
    colA = `<div class="panel"><h3>${ch === "whatsapp" ? T("The post") : esc(chName)}</h3>
      <div class="empty">${ch === "whatsapp" ? T("No text yet.") : T("No version for this channel yet.")}</div>
      ${canEdit ? `<div class="btns" style="margin-top:10px"><button class="btn go" data-act="startEdit" data-a="${p.id}" data-b="${ch}">${T("Write it")}</button>${ch !== "whatsapp" && latest(p.id, "whatsapp") ? `<button class="btn" data-act="fromWhatsApp" data-a="${p.id}" data-b="${ch}">${T("Start from the WhatsApp text")}</button>` : ""}</div>` : ""}</div>`;
  } else {
    const ci = chosenIndex(v);
    const nH = (v.headlines || []).length;
    const hl = (v.headlines || []).map((h, i) => {
      const hb = biText(h.en, h.he);
      return `<button class="hl ${ci === i ? "pick" : ""}" data-act="pickHeadline" data-a="${v.id}" data-b="${i}" ${isLatest && (owner || canEdit) ? "" : "disabled"}>
        <span class="rad"></span><span class="hl-t"><span dir="auto">${esc(hb.main)}</span>${hb.sub ? `<small dir="auto">${esc(hb.sub)}</small>` : ""}</span>${h.pick ? `<span class="wp">${T("writer’s pick")}</span>` : ""}</button>`;
    }).join("");
    const prev = vs.find((x) => x.n === v.n - 1);
    const showDiff = S.diff[p.id] && prev;
    const headlines = `<h3><span>${ch === "email" ? T("Subject lines") : T("Headline options")}</span><span style="color:${nH >= 3 ? "var(--go)" : "var(--hot)"}">${T("{n} of 3", { n: nH })}${ci >= 0 ? ` · ${T("picked")}` : owner && nH > 1 ? ` · ${T("pick one")}` : ""}</span></h3>
      ${hl || `<div class="empty">${T("No headline options.")}</div>`}
      ${isLatest && canEdit && (owner || !(p.stage === "ready" || p.text_ok)) ? `<div class="btns"><button class="btn sm ghost" data-act="addHeadline" data-a="${v.id}">${T("+ Option")}</button>${nH ? `<button class="btn sm ghost" data-act="removeHeadlinePrompt" data-a="${v.id}">${T("− Remove one")}</button>` : ""}</div>` : ""}`;
    const enBlock = `<h3><span>${S.lang === "he" ? T("The English text · this is what goes out") : ch === "whatsapp" ? T("Post · English") : T("Text · English")}</span>
        <span class="vtabs">${vs.map((x) => `<button class="${x.n === v.n ? "on" : ""}" data-act="vsel" data-a="${p.id}" data-b="${ch}" data-c="${x.n}">v${x.n}</button>`).join("")}${prev ? `<button class="${S.diff[p.id] ? "on" : ""}" data-act="diff" data-a="${p.id}">${T("changes")}</button>` : ""}</span></h3>
      ${showDiff ? `<div class="body-en pre diff" dir="auto">${diffHtml(prev.body, v.body)}</div>` : `<div class="body-en pre" dir="auto">${markNumbers(v.body)}</div>`}
      ${v.writer_note ? `<div class="wnote"><b>${esc(nameOf(v.author))}:</b> ${bi(v.writer_note, v.writer_note_he)}</div>` : ""}
      <div class="meta" style="margin-top:8px">${T("v{n} by {name}", { n: v.n, name: nameOf(v.author) })} · ${esc(ago(v.created_at))}${!isLatest ? ` · ${T("an older version")}` : ""}</div>
      ${canEdit && isLatest ? `<div class="btns" style="margin-top:10px"><button class="btn" data-act="startEdit" data-a="${p.id}" data-b="${ch}">${owner && !mine ? T("Edit the text myself") : T("New version")}</button>${!owner && (p.stage === "ready" || p.text_ok) && ch === "whatsapp" ? `<span class="muted small">${T("Jay approved this text. A new version goes back to him.")}</span>` : ""}</div>` : ""}`;
    const heBlock = `<h3><span>${T("Hebrew · literal translation")}</span><span class="pill blue">${T("auto")}</span></h3>
      <div class="body-he pre" dir="rtl">${esc(v.body_he || t("Translating…"))}</div>`;
    if (S.lang === "he") {
      colA = `<div class="panel">${headlines}<div class="gap"></div>${heBlock}</div>`;
      colB = `<div class="panel">${enBlock}</div>`;
    } else {
      colA = `<div class="panel">${headlines}<div class="gap"></div>${enBlock}</div>`;
      colB = S.showHe ? `<div class="panel">${heBlock}</div>` : "";
    }
  }

  // WhatsApp preview
  const fin = approvedAsset(p.id) || finalAsset(p.id);
  const finUrl = fin ? cachedUrl(fin) : "";
  const preview = ch === "whatsapp" && v && !editing ? `<div class="panel"><h3>${T("WhatsApp preview")}</h3><div class="wa" dir="ltr"><div class="bub" dir="auto">${fin && finUrl ? ((fin.mime || "").startsWith("video/") ? `<video src="${esc(finUrl)}" muted playsinline></video>` : `<img alt="" src="${esc(finUrl)}">`) : ""}${waHtml(composeWhatsApp(p, v))}<div class="tm">${new Date().toTimeString().slice(0, 5)}</div></div></div></div>` : "";

  // third column: notes, questions, sources, checks
  const noteRow = (n) => {
    const closed = n.status === "closed";
    const canToggle = n.kind !== "question" && (owner || canEdit);
    const ck = n.kind === "question" ? `<span class="ck q">${n.answer ? "✓" : "?"}</span>` : `<button class="ck ${closed ? "done" : ""}" data-act="toggleNote" data-a="${n.id}" ${canToggle ? "" : "disabled"} title="${closed ? T("Reopen") : T("Mark fixed")}">${closed ? "✓" : ""}</button>`;
    const nb = biText(n.body, n.body_he);
    const ab = biText(n.answer, n.answer_he);
    return `<div class="note ${n.kind}">${ck}<div style="flex:1;min-width:0">
      <div class="pre" dir="auto">${n.kind === "question" ? `<b>${T("Question:")}</b> ` : n.kind === "team" ? `<b>${T("Team:")}</b> ` : ""}${esc(nb.main)}</div>${nb.sub ? `<div class="t-sub pre" dir="auto">${esc(nb.sub)}</div>` : ""}
      ${n.answer ? `<div class="ans"><b>${esc(nameOf(n.answered_by))}:</b> <span dir="auto">${esc(ab.main)}</span>${ab.sub ? `<div class="t-sub" dir="auto">${esc(ab.sub)}</div>` : ""}</div>` : ""}
      <div class="who">${esc(nameOf(n.author))} · ${esc(ago(n.created_at))}${n.version_n ? ` · ${T("on v{n}", { n: n.version_n })}` : ""}${closed && n.closed_in ? `<span class="fix">${T("fixed in v{n}", { n: n.closed_in })}</span>` : ""}
        ${n.kind === "question" && !n.answer && owner ? `<button class="btn sm" data-act="answer" data-a="${n.id}" data-b="Yes">${T("Yes")}</button><button class="btn sm" data-act="answer" data-a="${n.id}" data-b="No">${T("No")}</button><button class="btn sm ghost" data-act="answer" data-a="${n.id}">${T("Answer")}</button>` : ""}
        ${owner && n.kind === "note" && !n.is_rule ? `<button class="btn sm ghost" data-act="noteToRule" data-a="${n.id}" title="${T("Add to house rules")}">${T("Make it a rule")}</button>` : ""}${n.is_rule ? `<span class="pill go">${T("rule")}</span>` : ""}
        ${n.author === S.me || owner ? `<button class="btn sm ghost" data-act="deleteNote" data-a="${n.id}">${T("delete")}</button>` : ""}</div>
    </div></div>`;
  };
  const jayNotes = notes.filter((n) => n.kind === "note");
  const otherNotes = notes.filter((n) => n.kind !== "note");
  const openCount = jayNotes.filter((n) => n.status === "open").length;
  const checks = ch === "whatsapp" && v ? checksFor(p, latest(p.id)) : [];
  const right = `<div class="panel"><h3><span>${T("Jay's notes")}</span><span style="color:${openCount ? "var(--hot)" : "var(--go)"}">${T("{a} of {b} closed", { a: jayNotes.length - openCount, b: jayNotes.length })}</span></h3>
      ${jayNotes.map(noteRow).join("") || `<div class="muted small">${T("No notes yet.")}</div>`}
      ${otherNotes.length ? `<h3>${T("Questions and team")}</h3>${otherNotes.map(noteRow).join("")}` : ""}
      <form data-form="addNote" data-post="${p.id}" style="margin-top:10px">
        <textarea name="note" dir="auto" style="min-height:64px" placeholder="${owner ? T("Add a note for the writer") : T("A note for the team, or a question for Jay")}"></textarea>
        <div class="btns" style="margin-top:6px">${owner ? `<input type="hidden" name="kind" value="note">` : `<select name="kind" style="width:auto"><option value="team">${T("Team note")}</option><option value="question">${T("Question for Jay")}</option></select>`}<button class="btn sm dark">${T("Add")}</button></div>
      </form></div>
    ${v && (v.sources || []).length ? `<div class="panel"><h3>${T("Sources")}</h3>${v.sources.map((s) => `<div class="src">${s.official ? `<span class="pill go">${T("official")}</span>` : `<span class="pill mute">${T("other")}</span>`}${isHttp(s.url) ? `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" dir="auto">${esc(s.label || s.url)}</a>` : esc(s.url)}</div>`).join("")}</div>` : ""}
    ${checks.length ? `<div class="panel"><h3>${T("House rules check")}</h3>${checks.map((c) => `<div class="lint ${c.ok ? "" : "bad"}"><i></i><span dir="auto">${esc(c.t)}</span></div>`).join("")}</div>` : ""}`;

  // visuals
  const visCard = (a) => {
    const url = cachedUrl(a);
    const isImg = (a.mime || "").startsWith("image/");
    const isVid = (a.mime || "").startsWith("video/");
    const media = url ? (isImg ? `<img alt="" src="${esc(url)}" loading="lazy">` : isVid ? `<video src="${esc(url)}" controls muted playsinline preload="metadata"></video>` : `<span class="mono">${esc(a.filename)}</span>`) : `<span class="muted">${T("loading…")}</span>`;
    return `<div class="vcard ${a.status}"><div class="im">${media}<span class="v">${a.stage === "final" ? T("final") : T("sketch")}${a.status === "approved" ? ` · ${T("approved")}` : a.status === "replaced" ? ` · ${T("replaced")}` : ""}</span></div>
      <div class="bd"><div><b dir="auto">${esc(a.filename)}</b> <span class="muted">${a.size ? (a.size / 1048576).toFixed(1) + " MB" : ""}</span></div>
      <div class="muted">${esc(nameOf(a.author))} · ${esc(ago(a.created_at))}</div>
      <div class="btns">
        <button class="btn sm dark" data-act="download" data-a="${a.id}">${T("Download original ↓")}</button>
        ${isImg ? `<button class="btn sm" data-act="copyImage" data-a="${a.id}">${T("Copy image")}</button>` : ""}
        ${navigator.canShare ? `<button class="btn sm" data-act="share" data-a="${a.id}">${T("Share / save")}</button>` : ""}
        ${owner && a.status !== "approved" ? `<button class="btn sm go" data-act="assetApprove" data-a="${a.id}">${T("Approve")}</button>` : ""}
        ${a.status === "replaced" ? `<button class="btn sm ghost" data-act="assetRestore" data-a="${a.id}">${T("Restore")}</button>` : `<button class="btn sm ghost" data-act="assetReplace" data-a="${a.id}">${T("Mark replaced")}</button>`}
        ${a.status !== "approved" ? `<button class="btn sm ghost" data-act="assetFinal" data-a="${a.id}">${a.stage === "final" ? T("Make it a sketch") : T("Make it final")}</button>` : ""}
        ${(owner || a.author === S.me) && a.status !== "approved" ? `<button class="btn sm ghost" data-act="assetDelete" data-a="${a.id}">${T("Delete")}</button>` : ""}
      </div></div></div>`;
  };
  const visuals = `<h2>${T("Visuals")} <span class="count">${assets.filter((a) => a.status !== "replaced").length}</span></h2>
    <div class="vis">${assets.map(visCard).join("")}
      <label class="drop" data-drop="${p.id}"><b>${T("Upload a banner, image or video")}</b><span>${T("Drop files here or choose. Up to 50 MB each, the original file is kept. Bigger videos: a Drive link in a note.")}</span>
        <span class="btns"><select data-upstage="${p.id}" style="width:auto"><option value="sketch">${T("Sketch")}</option><option value="final">${T("Final")}</option></select>
        <input type="file" multiple accept="image/*,video/*,application/pdf" data-upload="${p.id}" style="max-width:210px"></span></label>
    </div>`;

  // action bar
  const fa = finalAsset(p.id);
  const acts = [];
  let why = "";
  if (owner) {
    if (p.stage === "idea") {
      why = T("An idea. Say yes and it moves to writing.");
      acts.push(`<button class="btn go" data-act="ideaYes" data-a="${p.id}">${T("Yes")}</button><button class="btn" data-act="ideaChange" data-a="${p.id}">${T("Yes, with a change")}</button><button class="btn ghost" data-act="ideaNotNow" data-a="${p.id}">${T("Not now")}</button>`);
      if (!latest(p.id)) acts.push(`<button class="btn ghost" data-act="addDraftToIdea" data-a="${p.id}">${T("Write it myself")}</button>`);
    } else if (p.stage === "review") {
      why = openCount ? esc(plural(openCount, "1 open note. Send back, or approve anyway.", "{n} open notes. Send back, or approve anyway.")) : T("Your call: approve, or add notes and send back.");
      acts.push(`<button class="btn" data-act="requestChanges" data-a="${p.id}">${openCount ? T("Send back with {n}", { n: openCount }) : T("Send back")}</button>`);
      if (fa) acts.push(`<button class="btn go" data-act="approve" data-a="${p.id}" data-b="withBanner">${T("Approve text + banner")}</button>`);
      else acts.push(`<button class="btn go" data-act="approve" data-a="${p.id}" data-b="textOnly">${T("Approve text, banner next")}</button><button class="btn ghost" data-act="approve" data-a="${p.id}" data-b="noBanner">${T("Approve, no banner")}</button>`);
    } else if (p.stage === "ready") {
      why = T("Approved. Copy it, attach the banner, send, then mark it published.");
      acts.push(`<button class="btn ghost" data-act="backToReview" data-a="${p.id}">${T("Back to review")}</button><button class="btn" data-act="publish" data-a="${p.id}">${T("Mark published")}</button>`);
    } else if (p.stage === "writing") {
      why = mine ? T("Your own draft.") : T("{name} is on it.", { name: nameOf(p.author) });
      if (mine || p.text_ok) acts.push(`<button class="btn go" data-act="approve" data-a="${p.id}" data-b="${fa ? "withBanner" : "noBanner"}">${T("Mark ready")}</button>`);
    } else if (p.stage === "published") {
      why = T("Published {d}.", { d: p.published_at ? fmtDay(localDate(new Date(p.published_at))) : "" });
      acts.push(`<button class="btn ghost" data-act="unpublish" data-a="${p.id}">${T("Not published after all")}</button>`);
    } else {
      why = `${esc(stageLabel(p.stage))}${p.skip_reason ? `: <span dir="auto">${esc(p.skip_reason)}</span>` : ""}`;
      acts.push(`<button class="btn" data-act="revive" data-a="${p.id}">${T("Back to ideas")}</button>`);
    }
    if (!["skipped", "parked", "published"].includes(p.stage)) acts.push(`<button class="btn ghost" data-act="skip" data-a="${p.id}">${T("Skip")}</button>`);
    acts.push(`<button class="btn ghost" data-act="deletePost" data-a="${p.id}">${T("Delete")}</button>`);
  } else {
    if (p.stage === "writing" && (mine || member(p.author).role !== "owner")) {
      why = p.text_ok ? T("Jay approved the text. Upload the final banner, then send it back.") : openCount ? esc(plural(openCount, "1 note to fix.", "{n} notes to fix.")) : T("When it's ready, send it to Jay.");
      acts.push(`<button class="btn go" data-act="submit" data-a="${p.id}">${T("Send to Jay")}</button>`);
    } else if (p.stage === "idea") {
      why = T("Waiting for Jay's yes. For hot news, add the full draft now.");
      if (!latest(p.id)) acts.push(`<button class="btn" data-act="addDraftToIdea" data-a="${p.id}">${T("Add the draft now")}</button>`);
      else acts.push(`<button class="btn go" data-act="submit" data-a="${p.id}">${T("Send idea + draft to Jay")}</button>`);
    } else why = esc(stageLabel(p.stage));
  }
  const copyBtn = v || latest(p.id, "whatsapp") ? `<button class="btn ${p.stage === "ready" ? "go" : "dark"}" data-act="copyPost" data-a="${p.id}" data-b="${ch}">${T("Copy for {ch}", { ch: chName })}</button>` : "";
  const bar = `<div class="actionbar"><span class="why">${why}</span><span class="sp"></span>${acts.join("")}${copyBtn}</div>
    <div class="morebar"><span class="why">${why}</span>${acts.join("")}</div>`;

  const chtabs = `<div class="chtabs" style="margin-top:18px">${CHANNELS.map(([k, label]) => {
    const n = versionsOf(p.id, k).length;
    return `<button class="${ch === k ? "on" : ""}" data-act="channel" data-a="${p.id}" data-b="${k}">${T(label)}${n ? ` · v${n}` : ""}${k === "email" && p.email_too ? " ✉" : ""}</button>`;
  }).join("")}</div>`;

  return `${head}${ideaBlock}${chtabs}
    <div class="cols">${editing ? `<div style="grid-column:1/-1">${colA}</div>` : `<div>${colA}</div><div>${colB}${preview}</div><div>${right}</div>`}</div>
    ${visuals}${bar}`;
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
  const field = m.noText ? "" : m.readonly ? `<textarea readonly class="big" dir="auto">${esc(m.text)}</textarea>` : m.input ? `<input type="text" name="v" dir="auto" value="${esc(m.value || "")}">` : `<textarea name="v" dir="auto" class="${m.big ? "big" : ""}">${esc(m.value || "")}</textarea>`;
  return `<div class="modal-bg" data-act="closeModalBg"><form class="modal" data-form="modal">
    <h4>${T(m.title)}</h4>${m.body ? `<p dir="auto">${T(m.body)}</p>` : ""}${field}
    <div class="btns" style="margin-top:14px;justify-content:flex-end"><button type="button" class="btn ghost" data-act="closeModal">${m.readonly ? T("Close") : T("Cancel")}</button>
    ${m.readonly ? "" : `<button class="btn ${m.danger ? "danger" : "go"}">${T(m.confirm || "OK")}</button>`}</div></form></div>`;
}

function render() {
  document.documentElement.lang = S.lang;
  document.documentElement.dir = S.lang === "he" ? "rtl" : "ltr";
  const r = route();
  let html;
  if (!S.session) html = S.loaded || S.authChecked ? viewLogin() : "";
  else if (!S.loaded) html = S.loadError ? `<div class="login"><h1>${T("Couldn't load")}</h1><p>${esc(S.loadError)}</p><button class="btn go" data-act="refresh">${T("Try again")}</button></div>` : `<div class="login"><p>${T("Loading…")}</p></div>`;
  else if (!S.member) html = viewNotMember();
  else {
    let body;
    if (r.name === "board") body = viewBoard();
    else if (r.name === "schedule") body = viewSchedule();
    else if (r.name === "published") body = viewPublished();
    else if (r.name === "rules") body = viewRules();
    else if (r.name === "settings") body = viewSettings();
    else if (r.name === "new") body = viewNew();
    else if (r.name === "post") body = viewPost(r.id);
    else if (r.name === "review") {
      const q = ownerQueue();
      const i = Math.max(0, Math.min(Number(r.id) || 0, q.length - 1));
      body = q.length ? viewPost(q[i].id, i) : `<h1>${T("All clear")}</h1><p class="lead">${T("Nothing waits for review.")} <a href="#/">${T("Back")}</a></p>`;
    } else body = viewHome();
    html = `${topBar(r)}<main class="wrap">${body}</main>`;
  }
  // keep scroll and whatever is typed in any form while re-rendering
  const sameRoute = S.lastRoute === location.hash;
  const keep = new Map();
  if (sameRoute) {
    app.querySelectorAll("form[data-form]").forEach((f) => {
      const fk = `${f.dataset.form}|${f.dataset.post || ""}|${f.dataset.form === "modal" && S.modal ? S.modal.title : ""}`;
      f.querySelectorAll("input[name], textarea[name], select[name]").forEach((el) => {
        if (el.type === "file" || el.type === "hidden") return;
        const key = `${fk}|${el.name}|${el.type === "checkbox" ? el.value : ""}`;
        keep.set(key, el.type === "checkbox" ? el.checked : el.value);
      });
    });
  }
  const focusKey = (() => {
    const a = document.activeElement;
    const f = a && a.closest && a.closest("form[data-form]");
    return f && a.name ? { form: f.dataset.form, post: f.dataset.post || "", name: a.name, start: a.selectionStart, end: a.selectionEnd } : null;
  })();
  const y = window.scrollY;
  app.innerHTML = html + modalHtml() + (S.busy ? '<div class="busy"></div>' : "") + (S.toast ? `<div class="toast ${S.toast.err ? "err" : ""}">${esc(S.toast.msg)}</div>` : "");
  if (keep.size) {
    app.querySelectorAll("form[data-form]").forEach((f) => {
      const fk = `${f.dataset.form}|${f.dataset.post || ""}|${f.dataset.form === "modal" && S.modal ? S.modal.title : ""}`;
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
  if (S.lastRoute === location.hash) window.scrollTo(0, y);
  else window.scrollTo(0, 0);
  S.lastRoute = location.hash;
}

// ---------------- events ----------------
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "closeModalBg") {
    if (e.target === el) A.closeModal();
    return;
  }
  if (act === "pinPrompt") {
    const p = post(el.dataset.a);
    if (p.pinned_date) return A.pin(p.id, null);
    openModal({ title: "Lock to a date", body: "Type the date as YYYY-MM-DD.", act: "pinGo", args: [p.id], required: true, input: true, value: el.dataset.b || todayStr(), confirm: "Lock" });
    return;
  }
  if (act === "removeHeadlinePrompt") {
    const v = S.d.versions.find((x) => x.id === el.dataset.a);
    openModal({ title: "Remove a headline option", body: (v.headlines || []).map((h, i) => `${i + 1}. ${h.en}`).join("\n"), act: "removeHeadlineGo", args: [v.id], required: true, input: true, confirm: "Remove", value: String(v.headlines.length) });
    return;
  }
  const fn = A[act];
  if (!fn) return;
  e.preventDefault();
  fn(el.dataset.a, el.dataset.b, el.dataset.c);
});
A.pinGo = (id, text) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text.trim())) return toast("Use YYYY-MM-DD, e.g. 2026-11-23.", true);
  A.pin(id, text.trim());
};
A.removeHeadlineGo = (vid, text) => {
  const i = Number(text) - 1;
  const v = S.d.versions.find((x) => x.id === vid);
  if (!(i >= 0 && i < v.headlines.length)) return toast("Type the number of the option.", true);
  A.removeHeadline(vid, i);
};

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
    const stageSel = document.querySelector(`select[data-upstage="${el.dataset.upload}"]`);
    A.upload(el.dataset.upload, el.files, stageSel ? stageSel.value : "sketch");
    return;
  }
  const act = el.dataset.change;
  if (!act) return;
  if (act === "meta") A.meta(el.dataset.a, el.dataset.b, el.value);
  else if (act === "pin") A.pin(el.dataset.a, el.value);
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
  const stageSel = document.querySelector(`select[data-upstage="${d.dataset.drop}"]`);
  A.upload(d.dataset.drop, e.dataTransfer.files, stageSel ? stageSel.value : "sketch");
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && S.modal) A.closeModal();
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
