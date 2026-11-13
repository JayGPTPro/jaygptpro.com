// Content Desk AI helper, deployed to the "jaygptpro-team" project (NOT the challenge project).
// Lives outside supabase/functions on purpose: the repo's deploy workflow sends every
// function under supabase/functions to the challenge project.
//
// Actions (POST JSON, signed-in team members only):
//   { "action": "translate", "texts": ["...", ...] }  -> { "he": ["...", ...] }
//   { "action": "split", "text": "<a draft pasted from Claude>" } -> { headlines, body, sources, notes }
//
// Secrets: ANTHROPIC_API_KEY (set in the dashboard). SUPABASE_URL and the anon key are
// provided by the platform.
import Anthropic from "npm:@anthropic-ai/sdk@1.3.0";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

const MODEL = "claude-opus-5-5";
const PUBLISHABLE_KEY = "sb_publishable_EByrqj6P7ZrIna3Q7QYfMQ_VaVbDsy3";
const MAX_TRANSLATE_CHARS = 40000;
const MAX_SPLIT_CHARS = 20000;

const ALLOWED_ORIGINS = new Set([
  "https://jaygptpro.com",
  "https://www.jaygptpro.com",
  "http://localhost:4321",
]);

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://jaygptpro.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

// Returns the member's email, or null when the caller is not an active team member.
async function teamMember(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return null;
  const url = Deno.env.get("SUPABASE_URL") || "https://sjdcvjunibwxkwqzjitw.supabase.co";
  // Newer projects may not set SUPABASE_ANON_KEY; the publishable key is public and does the same job here.
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || PUBLISHABLE_KEY;
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
  const email = userData?.user?.email?.toLowerCase();
  if (userErr || !email) return null;
  // RLS lets a member read team_members only when is_team() is true for them.
  const { data, error } = await sb.from("team_members").select("email").eq("email", email).eq("active", true).maybeSingle();
  if (error || !data) return null;
  return email;
}

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

type Schema = Record<string, unknown>;

async function askJson(system: string, user: string, schema: Schema, maxTokens: number): Promise<unknown> {
  const response = await anthropic.beta.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: user }],
  });
  if (response.stop_reason === "refusal") throw new Error("The model declined this text.");
  if (response.stop_reason === "max_tokens") throw new Error("The text is too long to process in one go.");
  const text = response.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { type: string; text?: string }) => b.text ?? "")
    .join("");
  return JSON.parse(text);
}

const TRANSLATE_SYSTEM = `You translate English WhatsApp posts and work notes into Hebrew for an Israeli business owner who reads Hebrew more easily than English.

Rules:
- Translate literally. Keep the meaning and order of every sentence. Do not improve, shorten, summarise or explain.
- Keep in English: product and company names (Claude, ChatGPT, Amazon, Alexa, Shopify, OpenAI, Gemini), feature names, and seller terms such as ACoS, ROAS, PPC, listing, bullets, prompt, Skill, MCP, Seller Central.
- Keep every emoji, line break, URL, number and WhatsApp *bold* marker exactly where it is.
- Text that is already Hebrew comes back unchanged.
- Return exactly one translation per input, in the same order.`;

const SPLIT_SYSTEM = `You receive one pasted block: a WhatsApp post draft that a content writer prepared for Jay, often straight from her own AI chat. Split it into fields without rewriting anything.

- headlines: every headline option offered, in order, without numbering, bullets or asterisks. If there are no options, use the post's own title line as the single headline. pick is true for the one the writer marks as her pick, otherwise false for all.
- body: the post text exactly as written, WITHOUT the headline line at the top, WITHOUT the sign-off "Jay" and the "Share this group" line and link at the end, and WITHOUT any notes, sources list or explanations addressed to Jay. Keep emojis, line breaks and *bold* markers.
- sources: every URL given as a source, with a short label. official is true when the URL is the company's own site (amazon.com, aboutamazon.com, advertising.amazon.com, openai.com, anthropic.com, claude.com, google.com, shopify.com and similar first-party domains).
- notes: anything addressed to Jay that is not part of the post (what changed, questions, caveats), as one plain text block, or an empty string.
- category: news for announcements and launches, tip for how-to and prompts, skill for Claude Skills and tools Jay built, deals for discounts and offers, other otherwise.`;

const TRANSLATE_SCHEMA: Schema = {
  type: "object",
  properties: { translations: { type: "array", items: { type: "string" } } },
  required: ["translations"],
  additionalProperties: false,
};

const SPLIT_SCHEMA: Schema = {
  type: "object",
  properties: {
    headlines: {
      type: "array",
      items: {
        type: "object",
        properties: { en: { type: "string" }, pick: { type: "boolean" } },
        required: ["en", "pick"],
        additionalProperties: false,
      },
    },
    body: { type: "string" },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: { url: { type: "string" }, label: { type: "string" }, official: { type: "boolean" } },
        required: ["url", "label", "official"],
        additionalProperties: false,
      },
    },
    notes: { type: "string" },
    category: { type: "string", enum: ["news", "tip", "skill", "deals", "other"] },
  },
  required: ["headlines", "body", "sources", "notes", "category"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "POST only" });

  const member = await teamMember(req);
  if (!member) return json(req, 401, { error: "Not a team member" });

  let payload: { action?: string; texts?: unknown; text?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json(req, 400, { error: "Body must be JSON" });
  }

  try {
    if (payload.action === "translate") {
      const texts = Array.isArray(payload.texts) ? payload.texts.map((t) => String(t ?? "")) : [];
      if (!texts.length) return json(req, 400, { error: "texts is empty" });
      const total = texts.reduce((n, t) => n + t.length, 0);
      if (total > MAX_TRANSLATE_CHARS) return json(req, 413, { error: "Too much text in one request" });
      const out = (await askJson(
        TRANSLATE_SYSTEM,
        `Translate each item of this JSON array into Hebrew:\n${JSON.stringify(texts)}`,
        TRANSLATE_SCHEMA,
        16000,
      )) as { translations: string[] };
      if (!Array.isArray(out.translations) || out.translations.length !== texts.length) {
        return json(req, 502, { error: "Translation came back with the wrong number of items" });
      }
      return json(req, 200, { he: out.translations });
    }

    if (payload.action === "split") {
      const text = String(payload.text ?? "");
      if (!text.trim()) return json(req, 400, { error: "text is empty" });
      if (text.length > MAX_SPLIT_CHARS) return json(req, 413, { error: "The pasted text is too long" });
      const out = await askJson(SPLIT_SYSTEM, text, SPLIT_SCHEMA, 16000);
      return json(req, 200, out);
    }

    return json(req, 400, { error: "Unknown action" });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("anthropic", e.status, e.message);
      return json(req, 502, { error: `AI service error (${e.status ?? "network"})` });
    }
    console.error(e);
    return json(req, 500, { error: e instanceof Error ? e.message : "Unexpected error" });
  }
});
