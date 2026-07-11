// AI Vault. Admin actions, verified SERVER-SIDE against admin_users.
// The admin.html page is just UI; without a row in admin_users every call here fails.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "https://jaygptpro.com",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const authed = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: { user } } = await authed.auth.getUser();
    if (!user) return json({ error: "Sign in first" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isAdmin } = await admin.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
    if (!isAdmin) return json({ error: "Not an admin" }, 403);

    const { action, payload } = await req.json();

    switch (action) {
      case "upsert_episode": {
        const p = payload;
        const { data: ep, error } = await admin.from("episodes").upsert({
          ep_number: Number(p.ep_number),
          slug: p.slug,
          title: p.title,
          description: p.description || null,
          guest_name: p.guest_name || null,
          vimeo_id: p.vimeo_id || null,
          vimeo_hash: p.vimeo_hash || null,
          duration_seconds: p.duration_seconds || null,
          thumbnail_url: p.thumbnail_url || null,
          likes_base: Number(p.likes_base) || 0,
          updated_note: p.updated_note || null,
          content_updated_at: p.updated_note ? new Date().toISOString() : null,
          status: "published",
          published_at: p.published_date ? new Date(p.published_date).toISOString() : new Date().toISOString(),
        }, { onConflict: "slug" }).select("id").single();
        if (error) return json({ error: error.message }, 400);

        // tags: resolve by name, create missing, replace links
        if (Array.isArray(p.tags)) {
          await admin.from("episode_tags").delete().eq("episode_id", ep.id);
          for (const name of p.tags) {
            const slug = String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-");
            const { data: tag } = await admin.from("tags").upsert({ slug, name }, { onConflict: "slug" }).select("id").single();
            if (tag) await admin.from("episode_tags").insert({ episode_id: ep.id, tag_id: tag.id });
          }
        }
        // resources: replace
        if (Array.isArray(p.resources)) {
          await admin.from("episode_resources").delete().eq("episode_id", ep.id);
          for (let i = 0; i < p.resources.length; i++) {
            const r = p.resources[i];
            await admin.from("episode_resources").insert({
              episode_id: ep.id, kind: r.kind, title: r.title, url: r.url, body: r.body, position: i,
            });
          }
        }
        return json({ ok: true, id: ep.id });
      }
      case "upsert_session": {
        const p = payload;
        const { error } = await admin.from("live_sessions").insert({
          title: p.title, kind: p.kind || "episode", guest_name: p.guest_name || null, starts_at: p.starts_at, zoom_url: p.zoom_url || null,
        });
        return error ? json({ error: error.message }, 400) : json({ ok: true });
      }
      case "comp_member": {
        const email = String(payload.email).toLowerCase();
        await admin.from("comped_emails").upsert({ email, note: "comped via admin" });
        // if they already have a profile, flip it now
        await admin.from("profiles").update({ access_type: "comped" }).ilike("google_email", email);
        return json({ ok: true });
      }
      case "list_members": {
        const { data } = await admin.from("profiles")
          .select("display_name,google_email,access_type,created_at,subscriptions(status,price_lookup_key)")
          .order("created_at", { ascending: false }).limit(200);
        const members = (data || []).map((m: Record<string, unknown>) => {
          const subs = (m.subscriptions as Array<{ status: string; price_lookup_key: string }>) || [];
          const live = subs.find((s) => ["active", "trialing", "past_due"].includes(s.status)) || subs[0];
          return {
            name: m.display_name, email: m.google_email,
            status: m.access_type === "comped" ? "comped" : (live?.status || "none"),
            plan: live?.price_lookup_key || "",
          };
        });
        return json({ members });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    console.error("admin-api error", e);
    return json({ error: "Admin action failed" }, 500);
  }
});
