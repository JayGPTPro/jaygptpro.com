// send-wonka-daily
//
// NOT DEPLOYED. Built 28.8.2026, reviewed by nobody but Claude, armed by nothing.
// Deploying it is a separate, deliberate act. See README.md next to this file.
//
// Why this is a new function and not a branch inside send-daily-emails:
//   - Donna's schedule is five consecutive days from start_date. Wonka's is ten
//     NON consecutive dates with a three day and a four day break in the middle,
//     so day = daysBetween(start, today) + 1 is simply wrong here.
//   - Donna's rooms open at 14:00 New York. Wonka's open at 09:00.
//   - Wonka sends two emails that are not day emails at all: one preparation
//     email before the start, and one after Day 4 covering the first break.
//     (Was eight, until Jay cut the sequence from 17 to 12 on 30.8.2026;
//     a third, the support-upgrade email, was added back the same day at 13.)
//   - send-daily-emails already filters wonka_* out on purpose (line 193 there,
//     added 10.8 after Donna's content nearly fired at Wonka's cohort). That
//     filter stays. Nothing about this function touches Donna.
//
// The schedule is a literal table below, not arithmetic. Ten dates were decided by
// Jay and live in the portal's DAY_DATES. If they ever move, both move together.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EMAILS } from "./emails.ts";
import { resolveGroups, readyAtGroup, type Row, type Person } from "./recipients.ts";
import { nyDateAtHour } from "./nytime.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resendKey = Deno.env.get("RESEND_API_KEY")!;
// Reads EDGE_SHARED_SECRET (16.9.2026). FORM_SYNC_SECRET's value was hardcoded in the
// public admin.html page, so it opens nothing any more.
const sharedSecret = Deno.env.get("EDGE_SHARED_SECRET") || "";

const FROM_EMAIL = "Jay Margaliot <info@jaygptpro.com>";
const REPLY_TO = "info@jaygptpro.com";
const ROUND = "wonka_r1";
const UNSUB_HEADER = "<mailto:info@jaygptpro.com?subject=Unsubscribe from Wonka Bootcamp emails>";

// The preparation email is NOT on the date table below. It is triggered by the
// recipient's own welcome email, so somebody who buys a seat on 14 September
// still gets it, ten minutes after their welcome, instead of never.
//
// This also does the backfill for free: on the first armed run every existing
// buyer already has a welcome stamp in the past, so they all qualify at once.
// After that only new buyers do.
const PREP_EMAIL_ID = "01-before";
const PREP_DELAY_MINUTES = 10;

// ...but only for people who were already in before the bootcamp opened.
//
// Jay, 30.8.2026: somebody who buys on day 6 is not "preparing", they are behind.
// Telling them to set up an API key two days in advance and to see you on Tuesday
// is wrong on the day, and worse a week in. Everything that email asks for is
// covered again inside the lessons, so a late buyer loses nothing by not getting it.
//
// The cutoff is 09:00 New York on the round's start_date, which is the moment Day 1
// opens. It is read from the rounds row rather than written here, because
// rounds.start_date is what the rest of the email system already keys off and two
// copies of a date is one copy too many.
const PREP_CUTOFF_HOUR = 9;
const PREP_CUTOFF_FALLBACK = "2026-09-01"; // only if the rounds read fails

// customer_type values that receive the sequence live in recipients.ts,
// beside the resolver that applies them.

// date (New York) -> hour (New York) -> email id. The DAY emails only;
// 01-before is welcome-triggered, see PREP_EMAIL_ID above.
// Mirrors bootcamp/marketing/emails-bootcamp/content.py, field "when".
const SCHEDULE: Array<{ date: string; hour: number; id: string }> = [
  { date: "2026-08-31", hour: 9, id: "02-support" },
  { date: "2026-09-01", hour: 9, id: "03-day-1" },
  { date: "2026-09-02", hour: 9, id: "04-day-2" },
  { date: "2026-09-03", hour: 9, id: "05-day-3" },
  { date: "2026-09-04", hour: 9, id: "06-day-4" },
  { date: "2026-09-04", hour: 17, id: "07-after-day-4" },
  { date: "2026-09-08", hour: 9, id: "08-day-5" },
  { date: "2026-09-09", hour: 9, id: "09-day-6" },
  { date: "2026-09-10", hour: 9, id: "10-day-7" },
  { date: "2026-09-15", hour: 9, id: "11-day-8" },
  { date: "2026-09-16", hour: 9, id: "12-day-9" },
  { date: "2026-09-17", hour: 9, id: "13-day-10" },
];

function nyNow(): { hour: number; dateStr: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return { hour: parseInt(g("hour"), 10), dateStr: `${g("year")}-${g("month")}-${g("day")}` };
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-form-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

async function sendOne(to: string, id: string) {
  const e = EMAILS[id];
  if (!e) return { ok: false, error: `unknown email id ${id}` };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], reply_to: REPLY_TO,
                             subject: e.subject, html: e.html,
                             // RFC 2369. The footer link alone does not satisfy the
                             // Gmail and Yahoo bulk-sender rules; this header does.
                             // One-Click (List-Unsubscribe-Post) is deliberately absent:
                             // it requires an HTTPS endpoint that accepts POST, and
                             // claiming it over a mailto is a malformed header.
                             headers: { "List-Unsubscribe": UNSUB_HEADER } }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data?.message || `HTTP ${res.status}` };
    return { ok: true, id: data.id as string };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders() });
  if (!sharedSecret || (req.headers.get("x-form-secret") || "") !== sharedSecret) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!resendKey) return json({ error: "RESEND_API_KEY not configured" }, 500);

  const url = new URL(req.url);
  const supabase = createClient(supabaseUrl, supabaseKey);

  // ---- preview: one email, one address, no guard rows written -----------------
  // This is the ONLY path Jay should use before the round starts.
  //   curl -X POST ".../send-wonka-daily?preview=1&id=03-day-1&to=jay@..." -H "x-form-secret: ..."
  if (url.searchParams.get("preview") === "1") {
    const id = url.searchParams.get("id") || "";
    const to = url.searchParams.get("to") || "";
    if (!EMAILS[id] || !to) return json({ error: "preview needs a known id and a to address", known: Object.keys(EMAILS) }, 400);
    return json({ preview: true, id, ...(await sendOne(to, id)) });
  }

  // ---- the arming switch. Off by default, and it is a real row, not a constant.
  const { data: settingsRow } = await supabase.from("settings")
    .select("value").eq("key", "wonka_emails_armed").maybeSingle();
  const armed = settingsRow?.value?.armed === true;

  // ---- audience: this round only, never a Donna row ---------------------------
  const { data: rawRows } = await supabase.from("allowed_emails")
    .select("email, customer_type, round, primary_email, welcome_email_sent_at, created_at")
    .eq("round", ROUND)
    .is("access_revoked_at", null);
  const people = resolveGroups((rawRows || []) as Row[]);

  const { hour, dateStr } = nyNow();
  const nowMs = Date.now();
  const results: Record<string, unknown>[] = [];

  // A tiny helper so the two paths below cannot drift apart. Both must consult
  // the recipient table, both must write to it, whatever else they do.
  async function sendBatch(emailId: string, candidates: Person[]) {
    const { data: alreadyRows } = await supabase.from("wonka_email_recipients")
      .select("recipient_email").eq("round", ROUND).eq("email_id", emailId);
    const already = new Set((alreadyRows || [])
      .map((r: any) => String(r.recipient_email || "").toLowerCase()));

    // Skip a person if ANY address they own is already in the guard table, not
    // just the one we would pick today. The pick can move between runs when the
    // data changes, and a lookup on the pick alone would send a second copy.
    const pending = candidates.filter((p) => !p.addresses.some((a) => already.has(a)));

    if (!armed) {
      return { email_id: emailId, action: "dry_run_not_armed",
               would_send_to: pending.length, already_sent: already.size,
               addresses: pending.map((p) => p.pick.email) };
    }
    if (!pending.length) {
      return { email_id: emailId, action: "already_sent", recipients: already.size };
    }

    let ok = 0, errors = 0, lastErr: string | null = null;
    for (const p of pending) {
      const r = await sendOne(p.pick.email, emailId);
      if (r.ok) ok++; else { errors++; lastErr = r.error || "unknown"; }
      // Written per recipient, so a crash half way through resumes instead of
      // skipping the rest of the cohort.
      await supabase.from("wonka_email_recipients").upsert({
        round: ROUND, email_id: emailId, recipient_email: p.pick.email,
        sent_at: new Date().toISOString(), resend_id: r.ok ? r.id : null,
        error: r.ok ? null : r.error,
      }, { onConflict: "round,email_id,recipient_email" });
    }
    return { email_id: emailId, action: "sent", sent: ok, errors, last_error: lastErr };
  }

  // ---- 1. the preparation email, triggered by each person's own welcome -------
  // Runs on EVERY invocation, not on a date. That is what backfilled the round on
  // the first armed run and what picks up a new buyer ~10-25 minutes later.
  //
  // Bounded at the far end by the cutoff: it is a "get ready before we start"
  // email, so it stops being true the moment the bootcamp starts.
  const { data: roundRow } = await supabase.from("rounds")
    .select("start_date").eq("id", ROUND).maybeSingle();
  const startDate = roundRow?.start_date
    ? String(roundRow.start_date).slice(0, 10)
    : PREP_CUTOFF_FALLBACK;
  const prepCutoff = nyDateAtHour(startDate, PREP_CUTOFF_HOUR);

  // Gate on when the PERSON became reachable, not on the clock now. Somebody who
  // bought at 08:52 on opening morning registered in time and should still get it,
  // even though the cron only reaches them at 09:00. Somebody who buys at 09:05,
  // or on day 6, never does.
  const prepReady = people.filter((p) => {
    const t = readyAtGroup(p);
    if (!Number.isFinite(t)) return false;
    if (t >= prepCutoff) return false;                       // registered too late
    return (nowMs - t) >= PREP_DELAY_MINUTES * 60 * 1000;    // and the delay has passed
  });
  results.push(await sendBatch(PREP_EMAIL_ID, prepReady));

  // Split the ones we did not send to, so a quiet run says WHY it was quiet.
  const waiting = people.filter((p) => {
    const t = readyAtGroup(p);
    return Number.isFinite(t) && t < prepCutoff && (nowMs - t) < PREP_DELAY_MINUTES * 60 * 1000;
  }).length;
  const tooLate = people.filter((p) => {
    const t = readyAtGroup(p);
    return Number.isFinite(t) && t >= prepCutoff;
  }).length;

  // ---- 2. the day emails, still on their fixed dates --------------------------
  const due = SCHEDULE.find((s) => s.date === dateStr && s.hour === hour);
  if (due) {
    results.push(await sendBatch(due.id, people));
  }

  return json({ ok: true, armed, ny_date: dateStr, ny_hour: hour,
                people: people.length, rows_read: (rawRows || []).length,
                prep_waiting_for_delay: waiting,
                prep_too_late_registered_after_start: tooLate,
                prep_cutoff: new Date(prepCutoff).toISOString(),
                round_start_date: startDate,
                day_email_due: due?.id ?? null, results });
});
