import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Reads EDGE_SHARED_SECRET (16.9.2026). FORM_SYNC_SECRET's value was hardcoded in the
// public admin.html page, so it opens nothing any more.
const sharedSecret = Deno.env.get('EDGE_SHARED_SECRET') || '';

function parseRoundLabel(label: string): 'round1' | 'round2' | null {
  if (!label) return null;
  const s = label.trim().toLowerCase();
  if (s.startsWith('round 1') || s.startsWith('round1')) return 'round1';
  if (s.startsWith('round 2') || s.startsWith('round2')) return 'round2';
  return null;
}

function parseWaStatus(answer: string, round: string | null): string | null {
  if (!answer) return null;
  const s = answer.toLowerCase();
  if (s.includes("don't use whatsapp") || s.includes('dont use whatsapp')) return 'none';
  if (s.startsWith('yes')) {
    // "Yes, I'm in" = they're in the group of their round
    return round || 'unknown';
  }
  if (s.startsWith('not yet')) return 'unknown';
  return null;
}

function normalizePhone(p: string): string {
  if (!p) return '';
  return p.trim().replace(/[\s\-()]+/g, ' ').trim();
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-form-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders() });

  const provided = req.headers.get('x-form-secret') || '';
  if (!sharedSecret || provided !== sharedSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const roundLabel = String(body.round || '').trim();
    const phoneRaw = String(body.phone || '').trim();
    const waAnswer = String(body.whatsapp || '').trim();
    const formTimestamp = body.timestamp ? String(body.timestamp) : new Date().toISOString();

    if (!email) {
      return new Response(JSON.stringify({ error: 'Missing email' }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    const round = parseRoundLabel(roundLabel);
    if (!round) {
      return new Response(JSON.stringify({ error: 'Could not parse round label', label: roundLabel }), { status: 400, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }

    const phone = normalizePhone(phoneRaw) || null;
    const waStatus = parseWaStatus(waAnswer, round);

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existing } = await supabase
      .from('allowed_emails')
      .select('id, round, primary_email, name, notes, phone, in_whatsapp')
      .ilike('email', email)
      .maybeSingle();

    const noteEntry = `Form submission ${formTimestamp}: round=${round}` +
      (phone ? `, phone=${phone}` : '') +
      (waStatus ? `, wa=${waStatus}` : '');

    if (existing) {
      if (existing.round === 'both') {
        return new Response(JSON.stringify({ ok: true, action: 'skipped_admin', email }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
      }

      const targetEmail = existing.primary_email || email;
      const newNotes = (existing.notes ? existing.notes + '\n' : '') + noteEntry;

      // Build update object: round always; phone only if provided AND not already set;
      // in_whatsapp only if user said "yes" or "none" (don't override if currently better data exists)
      const updates: Record<string, unknown> = { round, notes: newNotes };
      if (phone) updates.phone = phone;
      if (waStatus === round) {
        // user confirms in their round group - upgrade to round1/round2 (or 'both' if already in other)
        const cur = existing.in_whatsapp;
        if (cur === 'round1' && round === 'round2') updates.in_whatsapp = 'both';
        else if (cur === 'round2' && round === 'round1') updates.in_whatsapp = 'both';
        else if (cur !== 'both') updates.in_whatsapp = round;
      } else if (waStatus === 'none') {
        updates.in_whatsapp = 'none';
      }

      const { error: updateErr } = await supabase
        .from('allowed_emails')
        .update(updates)
        .ilike('email', targetEmail);
      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true, action: 'updated', email: targetEmail, round, phone, waStatus }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    } else {
      const insertData: Record<string, unknown> = {
        email,
        round,
        notes: 'Created from Google Form (no Stripe match yet). ' + noteEntry,
      };
      if (phone) insertData.phone = phone;
      if (waStatus === round) insertData.in_whatsapp = round;
      else if (waStatus === 'none') insertData.in_whatsapp = 'none';

      const { error: insertErr } = await supabase.from('allowed_emails').insert(insertData);
      if (insertErr) {
        return new Response(JSON.stringify({ error: insertErr.message }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true, action: 'inserted', email, round, phone, waStatus }), { headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
    }
  } catch (err) {
    console.error('form-sync error:', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
  }
});
