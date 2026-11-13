// Content Desk data layer.
// Real mode talks to the "jaygptpro-team" Supabase project. Demo mode (?demo) keeps
// made-up data in this browser only, so the screens can be tried without signing in.

export const SUPABASE_URL = "https://sjdcvjunibwxkwqzjitw.supabase.co";
// Publishable key: safe in a browser. Every table is locked by row level security to
// the emails in team_members.
export const SUPABASE_KEY = "sb_publishable_EByrqj6P7ZrIna3Q7QYfMQ_VaVbDsy3";

export const TABLES = ["team_members", "posts", "versions", "notes", "assets", "rules", "settings"];
const KEYS = { team_members: "email", settings: "key" };
const keyOf = (t) => KEYS[t] || "id";

export function createStore(demo) {
  return demo ? demoStore() : realStore();
}

function realStore() {
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
  });
  const check = ({ data, error }) => {
    if (error) throw new Error(error.message || String(error));
    return data;
  };
  return {
    demo: false,
    async session() {
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    onAuth(cb) {
      sb.auth.onAuthStateChange((event, session) => cb(session, event));
    },
    async signIn() {
      await sb.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: "select_account" } },
      });
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async loadAll() {
      const out = {};
      await Promise.all(
        TABLES.map(async (t) => {
          const rows = [];
          for (let from = 0; ; from += 1000) {
            const page = check(await sb.from(t).select("*").range(from, from + 999));
            rows.push(...page);
            if (page.length < 1000) break;
          }
          out[t] = rows;
        }),
      );
      return out;
    },
    async getRow(t, id) {
      return check(await sb.from(t).select("*").eq(keyOf(t), id).maybeSingle());
    },
    async insert(t, row) {
      return check(await sb.from(t).insert(row).select().single());
    },
    async update(t, id, patch) {
      return check(await sb.from(t).update(patch).eq(keyOf(t), id).select().single());
    },
    async upsert(t, row) {
      return check(await sb.from(t).upsert(row).select().single());
    },
    async remove(t, id) {
      const gone = check(await sb.from(t).delete().eq(keyOf(t), id).select());
      if (!gone || !gone.length) throw new Error("You can't delete this one.");
    },
    async upload(path, file) {
      check(await sb.storage.from("desk").upload(path, file, { contentType: file.type || undefined, upsert: false }));
    },
    async signedUrl(path, downloadName) {
      const opts = downloadName ? { download: downloadName } : undefined;
      return check(await sb.storage.from("desk").createSignedUrl(path, 3600, opts)).signedUrl;
    },
    async removeFile(path) {
      check(await sb.storage.from("desk").remove([path]));
    },
    async ai(action, body) {
      const { data, error } = await sb.functions.invoke("desk-ai", { body: { action, ...body } });
      if (error) {
        let msg = error.message;
        try {
          const j = await error.context.json();
          if (j && j.error) msg = j.error;
        } catch (_) {
          /* keep the generic message */
        }
        throw new Error(msg);
      }
      return data;
    },
  };
}

// ---------------- demo mode ----------------
function demoStore() {
  const LS = "content-desk-demo-v1";
  const params = new URLSearchParams(location.search);
  let db;
  try {
    const raw = localStorage.getItem(LS);
    if (raw && !params.has("reset")) db = JSON.parse(raw);
  } catch (_) {
    db = null;
  }
  const fresh = () => JSON.parse(JSON.stringify(window.DESK_DEMO_DATA));
  if (!db) db = fresh();
  const save = () => {
    try {
      localStorage.setItem(LS, JSON.stringify(db));
    } catch (_) {
      /* demo data stays in memory */
    }
  };
  const as = params.get("as") === "writer" ? "writer@example.com" : "owner@example.com";
  let signedIn = !params.has("signedout");
  const listeners = [];
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  const now = () => new Date().toISOString();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const session = () => (signedIn ? { user: { email: as } } : null);
  const guardStage = (t, row, old) => {
    if (t !== "posts") return;
    const me = db.team_members.find((m) => m.email === as);
    if (me && me.role === "owner") return;
    if (!old && !["idea", "writing", "review"].includes(row.stage)) throw new Error(`Only the owner can create a post in stage ${row.stage}`);
    if (old && row.stage !== old.stage && !["writing", "review"].includes(row.stage)) throw new Error(`Only the owner can move a post to ${row.stage}`);
    if (old && row.text_ok && !old.text_ok) throw new Error("Only the owner can approve the text");
  };
  return {
    demo: true,
    async session() {
      return session();
    },
    onAuth(cb) {
      listeners.push(cb);
    },
    async signIn() {
      signedIn = true;
      listeners.forEach((cb) => cb(session()));
    },
    async signOut() {
      signedIn = false;
      listeners.forEach((cb) => cb(null));
    },
    async loadAll() {
      await wait(60);
      return JSON.parse(JSON.stringify(db));
    },
    async insert(t, row) {
      await wait(40);
      const full = { ...row };
      if (keyOf(t) === "id" && !full.id) full.id = uuid();
      if (!("created_at" in full)) full.created_at = now();
      if (t === "posts") {
        full.author = full.author || as;
        full.updated_at = now();
        full.queue_pos = full.queue_pos ?? Date.now() / 1000;
        full.text_ok = !!full.text_ok;
      }
      if (["versions", "notes", "assets"].includes(t)) full.author = full.author || as;
      guardStage(t, full, null);
      db[t].push(full);
      save();
      return JSON.parse(JSON.stringify(full));
    },
    async update(t, id, patch) {
      await wait(40);
      const row = db[t].find((r) => r[keyOf(t)] === id);
      if (!row) throw new Error("Row not found");
      const next = { ...row, ...patch };
      guardStage(t, next, row);
      const onlyTranslation = Object.keys(patch).every((k) => k.endsWith("_he"));
      if ((t === "posts" || t === "notes") && !onlyTranslation) next.updated_at = now();
      Object.assign(row, next);
      save();
      return JSON.parse(JSON.stringify(row));
    },
    async getRow(t, id) {
      const r = db[t].find((x) => x[keyOf(t)] === id);
      return r ? JSON.parse(JSON.stringify(r)) : null;
    },
    async upsert(t, row) {
      const existing = db[t].find((r) => r[keyOf(t)] === row[keyOf(t)]);
      return existing ? this.update(t, row[keyOf(t)], row) : this.insert(t, row);
    },
    async remove(t, id) {
      await wait(30);
      db[t] = db[t].filter((r) => r[keyOf(t)] !== id);
      if (t === "posts") ["versions", "notes", "assets"].forEach((c) => (db[c] = db[c].filter((r) => r.post_id !== id)));
      save();
    },
    async upload(path, file) {
      await wait(120);
      // Demo keeps small images as data URLs so they show after a reload.
      if (file.size < 1500000 && file.type.startsWith("image/")) {
        const url = await new Promise((res) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.readAsDataURL(file);
        });
        db.__files = db.__files || {};
        db.__files[path] = url;
      } else {
        db.__blobs = db.__blobs || {};
        db.__blobs[path] = URL.createObjectURL(file);
      }
      save();
    },
    async signedUrl(path) {
      return (db.__files && db.__files[path]) || (db.__blobs && db.__blobs[path]) || window.DESK_DEMO_IMAGE;
    },
    async removeFile(path) {
      if (db.__files) delete db.__files[path];
      save();
    },
    async ai(action, body) {
      await wait(350);
      if (action === "translate") return { he: body.texts.map((t) => (t ? `[תרגום הדגמה] ${t}` : "")) };
      if (action === "split") return demoSplit(body.text);
      throw new Error("Unknown action");
    },
  };
}

// A rough local stand-in for the AI split, good enough to try the paste flow in demo mode.
function demoSplit(text) {
  const lines = text.split(/\r?\n/);
  const headlines = [];
  const sources = [];
  let body = [];
  let mode = "body";
  for (const raw of lines) {
    const line = raw.trim();
    if (/^\**headline options/i.test(line)) {
      mode = "headlines";
      continue;
    }
    if (/^\**(post|body)\**:?$/i.test(line)) {
      mode = "body";
      continue;
    }
    if (/^\**notes for jay/i.test(line)) {
      mode = "notes";
      continue;
    }
    const url = line.match(/https?:\/\/\S+/);
    if (url && !/chat\.whatsapp\.com/.test(url[0])) sources.push({ url: url[0], label: new URL(url[0]).hostname, official: true });
    if (mode === "headlines" && line) headlines.push({ en: line.replace(/^\d+[.)]\s*|^[-•]\s*|\*/g, "").trim(), pick: false });
    else if (mode === "body") body.push(raw);
  }
  body = body.join("\n").trim();
  if (!headlines.length) {
    const first = body.split("\n")[0].replace(/\*/g, "").trim();
    headlines.push({ en: first, pick: true });
    body = body.split("\n").slice(1).join("\n").trim();
  }
  body = body.replace(/\n*Jay\s*\n+📲[\s\S]*$/, "").trim();
  return { headlines, body, sources, notes: "", category: "tip" };
}
