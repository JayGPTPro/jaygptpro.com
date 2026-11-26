// Click logger for the source links jaygptpro.com/go/<src>/ (Instagram, TikTok, YouTube, ...).
// Each page logs one click with its source and sends the visitor to the English WhatsApp group.
//
// Kept apart from the hiring links on purpose: its own function, its own table (go_clicks) and
// its own project (jaygptpro-team). The hiring codes (whatsapp-group, join-jaygpt, ...) measure
// candidates in the challenge project; a hiring code sent here is refused, and nothing here
// writes there.
//
// POST (sendBeacon, text/plain JSON): { "s": "ig", "r": document.referrer, "p": 0 | 1 }
// Privacy: no IP, phone number or full referrer is stored. visitor_hash is
// sha256(salt + UTC day + ip + user agent) cut to 16 hex characters: it only tells repeat
// visitors apart within one day.
import type { Sql } from "npm:postgres@3.4.4";

export const SOURCES = new Set(["ig", "tt", "yt", "li", "fb", "x", "th", "email"]);

const BOT_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|twitter|linkedin|skype|embedly|quora|pinterest|vkshare|headless|lighthouse|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch/i;

export type GoClick = {
  src: string;
  ref_domain: string | null;
  is_bot: boolean;
  is_repeat: boolean;
  visitor_hash: string | null;
};

export type Deps = {
  insert: (row: GoClick) => Promise<void>;
  salt: string;
  now?: () => Date;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function refDomain(ref: unknown): string | null {
  if (typeof ref !== "string" || !ref) return null;
  try {
    return new URL(ref).hostname.toLowerCase().replace(/^www\./, "").slice(0, 80) || null;
  } catch {
    return null;
  }
}

async function sha16(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The real write, used by index.ts and by the tests against a local database.
export function pgInsert(sql: Sql): Deps["insert"] {
  return async (r) => {
    await sql`insert into public.go_clicks (src, ref_domain, is_bot, is_repeat, visitor_hash)
      values (${r.src}, ${r.ref_domain}, ${r.is_bot}, ${r.is_repeat}, ${r.visitor_hash})`;
  };
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse((await req.text()).slice(0, 2000));
    if (!body || typeof body !== "object") throw new Error();
  } catch {
    return json({ ok: false }, 400);
  }
  const src = String(body.s ?? "").toLowerCase();
  if (!SOURCES.has(src)) return json({ ok: false }, 404);
  const ua = req.headers.get("user-agent") ?? "";
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const day = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
  const row: GoClick = {
    src,
    ref_domain: refDomain(body.r),
    is_bot: !ua || BOT_RE.test(ua),
    is_repeat: body.p === 1 || body.p === "1",
    visitor_hash: ip || ua ? await sha16(`${deps.salt}|${day}|${ip}|${ua}`) : null,
  };
  try {
    await deps.insert(row);
  } catch (e) {
    console.error("go-clicks insert failed", e);
    return json({ ok: false }, 500);
  }
  return json({ ok: true });
}
