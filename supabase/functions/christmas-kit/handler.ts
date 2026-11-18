// The Perfect Gift Kit ($299): what a buyer downloads.
// jaygptpro.com/christmas-video/kit/?s=cs_... (the buyer's page) and the kit's own setup script both call it.
//
// GET ?s=cs_...            -> { name, email, version, kit: <signed url of the kit zip> }
// GET ?s=cs_...&files=1    -> the same, plus files: [{ p, size, sha, url }] (the film's scenes, music and voices)
//
// The key is the Checkout Session id. Stripe puts it in the redirect after payment and the webhook puts it in the
// buyer's mail. It is long and unguessable, and it opens only a PAID session that bought the Skill and was not
// refunded. The files sit in a PRIVATE Storage bucket; every answer hands out signed links that expire.

export const SKILL_PRODUCT = "prod_VdK0WmRf7Cgnvy";
export const SIGN_SECONDS = 6 * 3600;

export type Order = { paid: boolean; skill: boolean; refunded: boolean; email: string; name: string };
export type Manifest = { version: string; kit: string; files: { p: string; rel?: string; size: number; sha: string }[] };
export type Deps = {
  order: (sessionId: string) => Promise<Order | null>;                        // null: no such session
  manifest: () => Promise<Manifest>;                                           // the latest published kit
  sign: (paths: string[], seconds: number) => Promise<Record<string, string>>; // storage path -> signed url
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store, private, max-age=0" },
  });
}

export function validSession(s: unknown): s is string {
  return typeof s === "string" && /^cs_(live|test)_[A-Za-z0-9]{20,200}$/.test(s);
}
function maskEmail(e: string): string {
  const [a, b] = e.split("@");
  if (!a || !b) return "";
  return a.slice(0, 2) + "***@" + b;
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);
  const url = new URL(req.url);
  const s = url.searchParams.get("s");
  if (!validSession(s)) return json({ error: "bad code" }, 400);
  const o = await deps.order(s);
  if (!o || !o.paid || !o.skill) return json({ error: "not found", message: "We could not find a kit for this code." }, 404);
  if (o.refunded) return json({ error: "refunded", message: "This order was refunded." }, 403);
  const m = await deps.manifest();
  const wantFiles = url.searchParams.get("files") === "1";
  const paths = [m.kit, ...(wantFiles ? m.files.map((f) => f.p) : [])];
  const signed = await deps.sign(paths, SIGN_SECONDS);
  if (!signed[m.kit]) throw new Error("kit zip could not be signed: " + m.kit);
  const body: Record<string, unknown> = {
    name: (o.name || "").split(" ")[0],
    email: maskEmail(o.email),
    version: m.version,
    kit: signed[m.kit],
  };
  if (wantFiles) {
    const missing = m.files.filter((f) => !signed[f.p]).map((f) => f.p);
    if (missing.length) throw new Error("files could not be signed: " + missing.slice(0, 3).join(", "));
    body.files = m.files.map((f) => ({ ...f, url: signed[f.p] }));
  }
  return json(body);
}
