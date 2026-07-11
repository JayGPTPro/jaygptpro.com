/* ============================================================
   AI VAULT core. Session, access, data, chrome, helpers.
   DEMO MODE: leave VAULT_CONFIG empty and the portal renders
   with sample data (assets/js/demo-data.js). Fill the two
   values below to go live (see supabase/SETUP.md).
   ============================================================ */

var VAULT_CONFIG = {
  SUPABASE_URL: "",        // e.g. https://xxxx.supabase.co
  SUPABASE_ANON_KEY: ""    // the public anon key (safe to publish, RLS protects data)
};

var VAULT = (function () {
  var DEMO = !VAULT_CONFIG.SUPABASE_URL;
  var sb = null;
  if (!DEMO && window.supabase) {
    sb = window.supabase.createClient(VAULT_CONFIG.SUPABASE_URL, VAULT_CONFIG.SUPABASE_ANON_KEY);
  }

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function fmtDuration(sec) { if (!sec) return ""; var m = Math.round(sec / 60); return m + " MIN"; }
  function fmtTime(sec) { sec = Math.max(0, Math.floor(sec)); var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? h + ":" + pad(m) : m) + ":" + pad(s); }
  function fmtDate(ts) { var d = new Date(ts); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase(); }
  function memberNo(n) { return "MEMBER " + String(n || 0).padStart(4, "0"); }

  /* ---------- demo progress store ---------- */
  function demoProgress() { try { return JSON.parse(localStorage.getItem("vault_progress") || "{}"); } catch (e) { return {}; } }
  function demoSaveProgress(map) { localStorage.setItem("vault_progress", JSON.stringify(map)); }

  /* ---------- session + access ---------- */
  var _access = null;

  async function getAccess() {
    if (_access) return _access;
    if (DEMO) {
      _access = Object.assign({ has_access: true, demo: true }, window.VAULT_DEMO.member);
      return _access;
    }
    var s = await sb.auth.getSession();
    if (!s.data.session) { _access = { has_access: false, session: false }; return _access; }
    var u = s.data.session.user;
    var r = await sb.rpc("get_my_access");
    var row = (r.data && r.data[0]) || {};
    _access = {
      session: true,
      has_access: !!row.has_access,
      is_admin: !!row.is_admin,
      name: (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email,
      email: u.email,
      avatar_url: (u.user_metadata && u.user_metadata.avatar_url) || "",
      member_number: row.member_number,
      member_since: row.member_since,
      plan: row.plan || "",
      status: row.status || ""
    };
    return _access;
  }

  /* Gate a members-only page. Redirects out if not allowed. */
  async function requireMember() {
    var a = await getAccess();
    if (DEMO) return a;
    if (!a.session) { location.href = "/ai-vault/index.html"; return null; }
    if (!a.has_access) { location.href = "/ai-vault/locked.html"; return null; }
    return a;
  }

  async function signIn() {
    if (DEMO) { location.href = "/ai-vault/home.html"; return; }
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + "/ai-vault/index.html" }
    });
  }
  async function signOut() {
    if (!DEMO) await sb.auth.signOut();
    localStorage.removeItem("vault_seen_door");
    location.href = "/ai-vault/index.html";
  }

  /* ---------- data layer ---------- */
  async function getEpisodes() {
    if (DEMO) return window.VAULT_DEMO.episodes;
    var r = await sb.from("episodes")
      .select("ep_number,slug,title,guest_name,duration_seconds,published_at,updated_note,thumbnail_url,episode_tags(tags(name))")
      .eq("status", "published").order("ep_number", { ascending: false });
    return (r.data || []).map(function (e) {
      e.tags = (e.episode_tags || []).map(function (t) { return t.tags.name; });
      e.published_at = new Date(e.published_at).getTime();
      return e;
    });
  }

  async function getEpisode(slug) {
    if (DEMO) return window.VAULT_DEMO.episodes.find(function (e) { return e.slug === slug; }) || null;
    var r = await sb.from("episodes")
      .select("*,episode_tags(tags(name)),episode_chapters(title,starts_at,position),episode_resources(kind,title,url,body,position)")
      .eq("slug", slug).single();
    var e = r.data; if (!e) return null;
    e.tags = (e.episode_tags || []).map(function (t) { return t.tags.name; });
    e.chapters = (e.episode_chapters || []).sort(function (a, b) { return a.position - b.position; });
    e.resources = (e.episode_resources || []).sort(function (a, b) { return a.position - b.position; });
    e.published_at = new Date(e.published_at).getTime();
    return e;
  }

  async function getProgressMap() {
    if (DEMO) return demoProgress();
    var r = await sb.from("watch_progress").select("episode_id,position_seconds,completed_at,episodes(slug)");
    var map = {};
    (r.data || []).forEach(function (p) {
      if (p.episodes) map[p.episodes.slug] = { position: p.position_seconds, completed: !!p.completed_at, updated: true };
    });
    return map;
  }

  async function saveProgress(episode, positionSeconds, completed) {
    if (DEMO) {
      var map = demoProgress();
      map[episode.slug] = { position: positionSeconds, completed: !!completed || (map[episode.slug] || {}).completed, t: Date.now() };
      demoSaveProgress(map); return;
    }
    await sb.rpc("record_watch_progress", { p_episode_slug: episode.slug, p_position: Math.floor(positionSeconds), p_completed: !!completed });
  }

  async function getLessons() {
    if (DEMO) return window.VAULT_DEMO.lessons;
    var r = await sb.from("lessons").select("*").order("position");
    return r.data || [];
  }
  async function getLessonDone() {
    if (DEMO) { try { return JSON.parse(localStorage.getItem("vault_lessons") || "[]"); } catch (e) { return []; } }
    var r = await sb.from("lesson_progress").select("lessons(position)");
    return (r.data || []).map(function (x) { return x.lessons.position; });
  }
  async function completeLesson(position) {
    if (DEMO) { var d = await getLessonDone(); if (d.indexOf(position) < 0) d.push(position); localStorage.setItem("vault_lessons", JSON.stringify(d)); return; }
    await sb.rpc("complete_lesson", { p_position: position });
  }

  async function getNextSession() {
    if (DEMO) return window.VAULT_DEMO.next_session;
    var r = await sb.from("live_sessions").select("*").gte("starts_at", new Date().toISOString()).order("starts_at").limit(1);
    var s = (r.data || [])[0]; if (!s) return null;
    s.starts_at = new Date(s.starts_at).getTime();
    return s;
  }

  function track(eventType, ref) {
    if (DEMO) return;
    try { sb.rpc("log_event", { p_event: eventType, p_ref: ref || null }); } catch (e) {}
  }

  /* Edge function caller (checkout, portal, admin) */
  async function callFn(name, payload) {
    if (DEMO) { alert("Demo mode. Connect Supabase + Stripe first (see supabase/SETUP.md)."); return null; }
    var s = await sb.auth.getSession();
    var res = await fetch(VAULT_CONFIG.SUPABASE_URL + "/functions/v1/" + name, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + (s.data.session ? s.data.session.access_token : VAULT_CONFIG.SUPABASE_ANON_KEY)
      },
      body: JSON.stringify(payload || {})
    });
    if (!res.ok) { var t = await res.text(); throw new Error(t || res.statusText); }
    return res.json();
  }

  /* ---------- chrome (topbar + mobile tabbar) ---------- */
  var KEYMARK = '<svg class="keymark" viewBox="0 0 24 24" fill="none" stroke="#C9A227" stroke-width="1.4" aria-hidden="true"><circle cx="9" cy="9" r="5.2"/><circle cx="9" cy="9" r="1.8"/><path d="M13 13l7.2 7.2M17.4 17.6l2.2-2.2M15 15.2l1.6-1.6"/></svg>';

  function renderChrome(active, access) {
    var nav = [
      { id: "home", label: "Vault", href: "/ai-vault/home.html" },
      { id: "episodes", label: "Episodes", href: "/ai-vault/episodes.html" },
      { id: "induction", label: "Start Here", href: "/ai-vault/induction.html" },
      { id: "account", label: "The Ledger", href: "/ai-vault/account.html" }
    ];
    var links = nav.map(function (n) {
      return '<a href="' + n.href + '" class="' + (active === n.id ? "active" : "") + '">' + n.label + "</a>";
    }).join("");
    var initial = access && access.name ? esc(access.name.trim()[0].toUpperCase()) : "·";
    var avatar = access && access.avatar_url ? '<img src="' + esc(access.avatar_url) + '" alt="">' : initial;
    var top = el('<header class="topbar">' +
      '<a class="brand" href="/ai-vault/home.html">' + KEYMARK + '<span class="wordmark">AI Vault</span></a>' +
      '<nav class="topnav">' + links + "</nav>" +
      '<a class="memberchip" href="/ai-vault/account.html" title="The Ledger"><span class="micro">' + (access ? esc((access.name || "").split(" ")[0]) : "") + '</span><span class="bezel">' + avatar + "</span></a>" +
      "</header>");
    document.body.prepend(top);
    var icons = { home: "◈", episodes: "▦", induction: "01", account: "▣" };
    var tabs = nav.map(function (n) {
      return '<a href="' + n.href + '" class="' + (active === n.id ? "active" : "") + '"><span class="ico">' + icons[n.id] + "</span>" + n.label + "</a>";
    }).join("");
    document.body.appendChild(el('<nav class="tabbar">' + tabs + "</nav>"));
    if (DEMO) {
      document.body.appendChild(el('<div style="position:fixed;bottom:0;left:0;right:0;z-index:70;text-align:center;pointer-events:none;"><span class="micro" style="background:#141414;border:1px solid #2A2A2A;border-bottom:0;border-radius:6px 6px 0 0;padding:4px 12px;display:inline-block;">Demo mode. No live data</span></div>'));
    }
  }

  /* ---------- episode card ---------- */
  function epCard(ep, prog) {
    var p = prog && prog[ep.slug];
    var pct = p && ep.duration_seconds ? Math.min(100, Math.round((p.position / ep.duration_seconds) * 100)) : 0;
    var thumb = ep.thumbnail_url
      ? '<img src="' + esc(ep.thumbnail_url) + '" alt="" loading="lazy">'
      : '<span class="epnum">EP ' + pad(ep.ep_number) + "</span>";
    return '<a class="plate ep-plate" href="/ai-vault/episode.html?ep=' + encodeURIComponent(ep.slug) + '">' +
      '<span class="glint-edge"></span>' +
      '<div class="ep-thumb">' + thumb +
        (ep.updated_note ? '<span class="updated">Updated</span>' : "") +
        (p && p.completed ? '<span class="check">✓</span>' : "") +
      "</div>" +
      '<div class="ep-body">' +
        '<div class="micro">EP ' + pad(ep.ep_number) + (ep.guest_name ? " · " + esc(ep.guest_name).toUpperCase() : "") + "</div>" +
        '<div class="title">' + esc(ep.title) + "</div>" +
        '<div class="ep-meta micro">' + fmtDuration(ep.duration_seconds) + "<span>" + fmtDate(ep.published_at) + "</span></div>" +
      "</div>" +
      (pct ? '<span class="ep-hairline" style="width:' + pct + '%"></span>' : "") +
      "</a>";
  }

  /* ---------- countdown board ---------- */
  function mountCountdown(node, ts) {
    function tick() {
      var d = Math.max(0, ts - Date.now());
      var days = Math.floor(d / 86400000), h = Math.floor(d / 3600000) % 24, m = Math.floor(d / 60000) % 60, s = Math.floor(d / 1000) % 60;
      node.innerHTML =
        '<div class="cell"><div class="num">' + pad(days) + '</div><div class="lbl">Days</div></div>' +
        '<div class="cell"><div class="num">' + pad(h) + '</div><div class="lbl">Hrs</div></div>' +
        '<div class="cell"><div class="num">' + pad(m) + '</div><div class="lbl">Min</div></div>' +
        '<div class="cell"><div class="num">' + pad(s) + '</div><div class="lbl">Sec</div></div>';
    }
    tick(); return setInterval(tick, 1000);
  }

  return {
    DEMO: DEMO, sb: function () { return sb; },
    $: $, el: el, esc: esc, pad: pad,
    fmtDuration: fmtDuration, fmtTime: fmtTime, fmtDate: fmtDate, memberNo: memberNo,
    getAccess: getAccess, requireMember: requireMember, signIn: signIn, signOut: signOut,
    getEpisodes: getEpisodes, getEpisode: getEpisode, getProgressMap: getProgressMap, saveProgress: saveProgress,
    getLessons: getLessons, getLessonDone: getLessonDone, completeLesson: completeLesson,
    getNextSession: getNextSession, track: track, callFn: callFn,
    renderChrome: renderChrome, epCard: epCard, mountCountdown: mountCountdown
  };
})();
