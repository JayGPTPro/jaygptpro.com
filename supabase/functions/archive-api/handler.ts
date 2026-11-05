// The Jay GPT archive page (jaygptpro.com/archive): visitor reactions, and Jay's hide/show marks.
// GET:  { reactions: { post: { emoji: count } }, decisions: { post: "hide" | "show" } }
// POST: { action: "react", post, visitor, emoji }  emoji "" takes the reaction back
//       { action: "hide" | "show" | "clear", post, admin }  Jay only: admin is checked against ADMIN_HASH
// Anything else answers 401, which is also what the deploy workflow probes for.
// Privacy: visitor is a random id the page keeps in the browser. No IP, name or phone number is stored.

// sha256 of the admin key. The key itself lives only on Jay's Mac (groups-dashboard/archive/ADMIN-LINK.txt).
export const ADMIN_HASH = "572910b782b84cfeea2104d5089f7f17a28f517407c020afb74fd7afef5656f8";
export const EMOJIS = new Set(["👍", "❤️", "😂", "😮", "🙏", "🔥"]);
// one browser cannot react to more posts than the archive could ever hold
export const MAX_PER_VISITOR = 400;
const POST_RE = /^\d{14}$/;
const VISITOR_RE = /^[a-z0-9]{16,40}$/;

export type Decision = "hide" | "show";

export type Deps = {
  reactions: () => Promise<Array<{ post: string; emoji: string; n: number }>>;
  decisions: () => Promise<Array<{ post: string; decision: Decision }>>;
  setReaction: (post: string, visitor: string, emoji: string | null) => Promise<void>;
  visitorCount: (visitor: string) => Promise<number>;
  setDecision: (post: string, decision: Decision | null) => Promise<void>;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store, max-age=0" },
  });
}

export async function sha256(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (req.method === "GET") {
    const reactions: Record<string, Record<string, number>> = {};
    for (const r of await deps.reactions()) (reactions[r.post] ||= {})[r.emoji] = Number(r.n);
    const decisions: Record<string, Decision> = {};
    for (const d of await deps.decisions()) decisions[d.post] = d.decision;
    return json({ reactions, decisions });
  }

  if (req.method !== "POST") return json({ ok: false }, 405);
  let body: Record<string, unknown>;
  try {
    // the page sends text/plain, so no CORS preflight is needed
    body = JSON.parse(await req.text());
  } catch {
    return json({ ok: false }, 401);
  }
  const post = typeof body.post === "string" ? body.post : "";
  if (!POST_RE.test(post)) return json({ ok: false }, 401);

  if (body.action === "react") {
    const visitor = typeof body.visitor === "string" ? body.visitor : "";
    const emoji = typeof body.emoji === "string" ? body.emoji : "";
    if (!VISITOR_RE.test(visitor) || (emoji && !EMOJIS.has(emoji))) return json({ ok: false }, 401);
    if (emoji && (await deps.visitorCount(visitor)) >= MAX_PER_VISITOR) return json({ ok: false }, 429);
    await deps.setReaction(post, visitor, emoji || null);
    return json({ ok: true });
  }

  if (body.action === "hide" || body.action === "show" || body.action === "clear") {
    const admin = typeof body.admin === "string" ? body.admin : "";
    if (!admin || (await sha256(admin)) !== ADMIN_HASH) return json({ ok: false }, 401);
    await deps.setDecision(post, body.action === "clear" ? null : body.action);
    return json({ ok: true });
  }

  return json({ ok: false }, 401);
}
