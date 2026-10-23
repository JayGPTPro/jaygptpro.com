// Click logger for the hiring challenge short links (jaygptpro.com/<slug>).
// POST: one click event from the redirect page (sent with sendBeacon, text/plain JSON).
// GET:  aggregated counts per code. Codes only; the code-to-candidate mapping never leaves Jay's machine.
// Privacy: no IP, phone number or full referrer is stored. visitor_hash is
// sha256(daily salt + ip + user agent), cut to 16 hex chars, so it only dedupes within one UTC day.

export const VALID_CODES = new Set(["ai-alerts", "whatsapp-group", "join-jaygpt", "jaygpt-community", "zz-test"]);
// zz-test: Donna's health-check code, not a candidate. Ignore it in reviews.

const BOT_RE =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|twitter|linkedin|skype|embedly|quora|pinterest|vkshare|headless|lighthouse|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch/i;

export type ClickRow = {
  code: string;
  ref_domain: string | null;
  is_bot: boolean;
  is_repeat: boolean;
  visitor_hash: string | null;
};

export type Deps = {
  insert: (row: ClickRow) => Promise<void>;
  rows: () => Promise<Array<ClickRow & { created_at: string }>>;
  salt: string;
  now?: () => Date;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store, private, max-age=0" },
  });
}

export function refDomain(ref: unknown): string | null {
  if (typeof ref !== "string" || !ref) return null;
  try {
    const h = new URL(ref).hostname.toLowerCase().replace(/^www\./, "");
    return h.slice(0, 80) || null;
  } catch {
    return null;
  }
}

async function sha16(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).slice(0, 8).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (req.method === "POST") {
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse((await req.text()).slice(0, 2000));
    } catch {
      return json({ ok: false }, 400);
    }
    const code = String(body.c ?? "").toLowerCase();
    if (!VALID_CODES.has(code)) return json({ ok: false }, 404);
    const ua = req.headers.get("user-agent") ?? "";
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
    const day = (deps.now?.() ?? new Date()).toISOString().slice(0, 10);
    const row: ClickRow = {
      code,
      ref_domain: refDomain(body.r),
      is_bot: !ua || BOT_RE.test(ua),
      is_repeat: body.p === 1 || body.p === "1",
      visitor_hash: ip || ua ? await sha16(`${deps.salt}|${day}|${ip}|${ua}`) : null,
    };
    try {
      await deps.insert(row);
    } catch (e) {
      console.error("insert failed", e);
      return json({ ok: false }, 500);
    }
    return json({ ok: true });
  }

  if (req.method === "GET") {
    const rows = await deps.rows();
    const out: Record<string, unknown> = {};
    for (const code of VALID_CODES) {
      const mine = rows.filter((r) => r.code === code);
      const human = mine.filter((r) => !r.is_bot);
      const uniq = new Set(human.filter((r) => r.visitor_hash).map((r) => `${r.created_at.slice(0, 10)}|${r.visitor_hash}`));
      const daily: Record<string, number> = {};
      const refs: Record<string, number> = {};
      for (const r of human) {
        daily[r.created_at.slice(0, 10)] = (daily[r.created_at.slice(0, 10)] ?? 0) + 1;
        const k = r.ref_domain ?? "(direct / app)";
        refs[k] = (refs[k] ?? 0) + 1;
      }
      out[code] = {
        raw: mine.length,
        human: human.length,
        human_first_in_session: human.filter((r) => !r.is_repeat).length,
        unique_daily_visitors: uniq.size,
        last_at: mine.length ? mine.map((r) => r.created_at).sort().at(-1) : null,
        daily,
        refs,
      };
    }
    return json({ generated_at: new Date().toISOString(), codes: out });
  }

  return json({ ok: false }, 405);
}
