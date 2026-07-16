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

  /* ---------- loading veil (skips the door pages, which animate themselves) ---------- */
  (function loader() {
    if (document.querySelector(".doorstage")) return;
    var l = document.createElement("div");
    l.className = "vloader";
    l.setAttribute("aria-hidden", "true");
    l.innerHTML = '<svg viewBox="0 0 44 44" fill="none" stroke="#C9A227" stroke-width="2"><circle cx="22" cy="22" r="16" opacity="0.14"/><path d="M22 6 a16 16 0 0 1 16 16" stroke-linecap="round"/></svg>';
    document.documentElement.appendChild(l);
    var gone = false;
    function done() { if (gone) return; gone = true; l.classList.add("hide"); setTimeout(function () { if (l.parentNode) l.parentNode.removeChild(l); }, 350); }
    function watch() {
      if (document.body.classList.contains("in")) { done(); return; }
      var obs = new MutationObserver(function () { if (document.body.classList.contains("in")) { obs.disconnect(); done(); } });
      obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    }
    if (document.body) watch(); else document.addEventListener("DOMContentLoaded", watch);
    window.addEventListener("load", function () { setTimeout(done, 150); });
    setTimeout(done, 8000);
  })();

  /* reveal failsafe: a slow or failed data query must never leave a blank screen */
  setTimeout(function () { if (document.body) document.body.classList.add("in"); }, 6000);

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function pad(n) { return String(n).padStart(2, "0"); }
  function fmtDuration(sec) { if (!sec) return ""; var m = Math.round(sec / 60); return m + " MIN"; }
  function fmtTime(sec) { sec = Math.max(0, Math.floor(sec)); var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? h + ":" + pad(m) : m) + ":" + pad(s); }
  function fmtDate(ts) { var d = new Date(ts); return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase(); }
  function fmtMonth(ts) { var d = new Date(ts); return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase(); }
  function memberNo(n) { return "MEMBER " + String(n || 0).padStart(4, "0"); }

  /* ---------- demo local stores ---------- */
  function store(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || fallback); } catch (e) { return JSON.parse(fallback); } }
  function demoProgress() { return store("vault_progress", "{}"); }
  function demoSocial() { return store("vault_social", "{}"); }

  /* ---------- session + access ---------- */
  var _access = null;

  async function getAccess() {
    if (_access) return _access;
    if (DEMO) {
      _access = Object.assign({ has_access: true, demo: true }, window.VAULT_DEMO.member);
      return _access;
    }
    /* supabase-js CDN failed to load: treat as a connection problem, never a blank page */
    if (!sb) return { session: true, error: true };
    var s = await sb.auth.getSession();
    if (!s.data.session) { _access = { has_access: false, session: false }; return _access; }
    var u = s.data.session.user;
    var r = await sb.rpc("get_my_access");
    /* a failed access check is a connection problem, NOT a missing membership.
       Do not cache it, so a retry re-queries. */
    if (r.error) return { session: true, error: true };
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

  async function requireMember() {
    var a = await getAccess();
    if (DEMO) return a;
    if (a.error) { connectionNotice(); return null; }
    if (!a.session) { location.href = "/ai-vault/index.html"; return null; }
    if (!a.has_access) { location.href = "/ai-vault/locked.html"; return null; }
    return a;
  }

  /* full-stop retry plate: shown when the access check itself failed */
  function connectionNotice() {
    document.body.classList.add("in");
    if (document.getElementById("vaultRetry")) return;
    var n = el('<div id="vaultRetry" class="plate pad" style="position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:90;text-align:center;max-width:340px;width:calc(100% - 48px)">' +
      '<div class="micro gold" style="margin-bottom:10px">CONNECTION HICCUP</div>' +
      '<p style="font-size:13.5px;color:var(--text-dim);margin-bottom:18px">The Vault did not answer. Your membership is fine, the connection is not.</p>' +
      '<button class="btn gold wide">Try again</button></div>');
    n.querySelector("button").addEventListener("click", function () { location.reload(); });
    document.body.appendChild(n);
  }

  /* corner toast: shown once when a content query fails, page keeps rendering */
  var _dataNoticed = false;
  function dataNotice() {
    if (_dataNoticed) return; _dataNoticed = true;
    function mount() {
      var n = el('<div class="plate" style="position:fixed;bottom:76px;left:50%;transform:translateX(-50%);z-index:80;display:flex;gap:14px;align-items:center;padding:10px 16px;white-space:nowrap">' +
        '<span class="micro">SOME DATA DID NOT LOAD</span>' +
        '<button class="btn quiet" style="padding:6px 14px;font-size:12px">Reload</button></div>');
      n.querySelector("button").addEventListener("click", function () { location.reload(); });
      document.body.appendChild(n);
    }
    if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
  }
  function guard(r, fallback) {
    if (r && r.error) { console.error("vault query failed", r.error); dataNotice(); }
    return r && r.data != null ? r.data : fallback;
  }

  async function signIn(redirect) {
    if (DEMO) { location.href = redirect || "/ai-vault/home.html"; return; }
    if (!sb) { alert("Connection hiccup: the sign-in library did not load. Please reload the page."); location.reload(); return; }
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: location.origin + (redirect || "/ai-vault/index.html") }
    });
  }
  async function signOut() {
    if (!DEMO && sb) await sb.auth.signOut();
    /* clear every per-member key so the next account on this browser starts clean */
    ["vault_seen_door", "vault_last_visit", "vault_progress", "vault_social",
     "vault_qa_mine", "vault_qa_replies", "vault_lessons", "vault_challenge"]
      .forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
    try { sessionStorage.removeItem("vault_intent"); sessionStorage.removeItem("vault_checkout_at"); } catch (e) {}
    location.href = "/ai-vault/index.html";
  }

  /* ---------- data layer ---------- */
  async function getEpisodes() {
    if (DEMO) return window.VAULT_DEMO.episodes;
    var r = await sb.from("episodes")
      .select("ep_number,slug,title,description,guest_name,duration_seconds,published_at,updated_note,thumbnail_url,likes_base,episode_tags(tags(name))")
      .eq("status", "published").order("published_at", { ascending: false });
    return guard(r, []).map(function (e) {
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
    if (r.error && r.error.code !== "PGRST116") dataNotice(); /* PGRST116 = not found, a legit miss */
    var e = r.data; if (!e) return null;
    e.tags = (e.episode_tags || []).map(function (t) { return t.tags.name; });
    e.chapters = (e.episode_chapters || []).sort(function (a, b) { return a.position - b.position; });
    e.resources = (e.episode_resources || []).sort(function (a, b) { return a.position - b.position; });
    e.published_at = new Date(e.published_at).getTime();
    return e;
  }

  /* social: likes + my reactions + my private rating, keyed by slug */
  async function getSocial() {
    if (DEMO) {
      var mine = demoSocial(), map = {};
      window.VAULT_DEMO.episodes.forEach(function (e) {
        var m = mine[e.slug] || {};
        map[e.slug] = { likes: (e.likes || 0) + (m.like ? 1 : 0), my_like: !!m.like, my_watch_later: !!m.watch_later, my_more: !!m.more, my_stars: m.stars || 0 };
      });
      return map;
    }
    var r = await sb.rpc("get_episode_social");
    var map = {};
    guard(r, []).forEach(function (x) { map[x.slug] = { likes: x.likes, my_like: x.my_like, my_watch_later: x.my_watch_later, my_more: x.my_more, my_stars: x.my_stars || 0 }; });
    return map;
  }

  async function react(slug, kind, on) {
    if (DEMO) {
      var s = demoSocial(); s[slug] = s[slug] || {};
      s[slug][kind === "watch_later" ? "watch_later" : kind === "more_please" ? "more" : "like"] = on;
      localStorage.setItem("vault_social", JSON.stringify(s)); return;
    }
    await sb.rpc("react_episode", { p_slug: slug, p_kind: kind, p_on: on });
  }

  async function rate(slug, stars) {
    if (DEMO) { var s = demoSocial(); s[slug] = s[slug] || {}; s[slug].stars = stars; localStorage.setItem("vault_social", JSON.stringify(s)); return; }
    await sb.rpc("rate_episode", { p_slug: slug, p_stars: stars });
  }

  async function askQuestion(body, context) {
    if (DEMO) {
      var q = store("vault_qa_mine", "[]");
      q.unshift({ id: "mine-" + q.length, author: "You", body: body, created_at: Date.now(), replies: [] });
      localStorage.setItem("vault_qa_mine", JSON.stringify(q)); return;
    }
    await sb.rpc("ask_question", { p_body: body, p_context: context || null });
  }

  /* community Q&A board */
  async function getQA() {
    if (DEMO) {
      var myReplies = store("vault_qa_replies", "{}");
      function withReplies(q) {
        var extra = myReplies[q.id] || [];
        return Object.assign({}, q, { replies: (q.replies || []).concat(extra) });
      }
      /* your own questions get your replies merged too, not only the seeded ones */
      var mine = store("vault_qa_mine", "[]").map(withReplies);
      var base = (window.VAULT_DEMO.qa || []).map(withReplies);
      return mine.concat(base);
    }
    var r = await sb.rpc("get_qa", { p_limit: 30 });
    return guard(r, []);
  }
  async function addReply(questionId, body) {
    if (DEMO) {
      var m = store("vault_qa_replies", "{}");
      (m[questionId] = m[questionId] || []).push({ author: "You", body: body, created_at: Date.now() });
      localStorage.setItem("vault_qa_replies", JSON.stringify(m)); return;
    }
    await sb.rpc("add_reply", { p_question: questionId, p_body: body });
  }

  /* programs catalog + member deals */
  async function getPrograms() {
    if (DEMO) return window.VAULT_DEMO.programs;
    var r = await sb.from("programs").select("*").eq("active", true).order("sort");
    return guard(r, []);
  }
  async function getDeals() {
    if (DEMO) return window.VAULT_DEMO.deals;
    var r = await sb.rpc("get_deals");
    return guard(r, []);
  }
  async function getDealSavings() {
    if (DEMO) return (window.VAULT_DEMO.deals || []).reduce(function (t, d) { return t + (d.monthly_saving || 0); }, 0);
    var r = await sb.rpc("get_deal_savings");
    return guard(r, 0);
  }
  async function whatsappLinks() {
    if (DEMO) return window.VAULT_DEMO.whatsapp;
    var r = await sb.rpc("get_whatsapp_links");
    var d = guard(r, {}) || {};
    return { updates_url: d.updates_url || "", community_url: d.community_url || "" };
  }

  async function getProgressMap() {
    if (DEMO) return demoProgress();
    var r = await sb.from("watch_progress").select("episode_id,position_seconds,completed_at,updated_at,episodes(slug)");
    var map = {};
    guard(r, []).forEach(function (p) {
      /* t mirrors the demo contract: Continue Watching sorts on it */
      if (p.episodes) map[p.episodes.slug] = { position: p.position_seconds, completed: !!p.completed_at, updated: true, t: p.updated_at ? new Date(p.updated_at).getTime() : 0 };
    });
    return map;
  }

  async function saveProgress(episode, positionSeconds, completed) {
    if (DEMO) {
      var map = demoProgress();
      /* honor an explicit false: un-completing must stick */
      map[episode.slug] = { position: positionSeconds, completed: !!completed, t: Date.now() };
      localStorage.setItem("vault_progress", JSON.stringify(map)); return;
    }
    await sb.rpc("record_watch_progress", { p_episode_slug: episode.slug, p_position: Math.floor(positionSeconds), p_completed: !!completed });
  }

  async function getLessons() {
    if (DEMO) return window.VAULT_DEMO.lessons;
    var r = await sb.from("lessons").select("*").order("position");
    return guard(r, []);
  }
  async function getLessonDone() {
    if (DEMO) return store("vault_lessons", "[]");
    var r = await sb.from("lesson_progress").select("lessons(position)");
    return guard(r, []).filter(function (x) { return x.lessons; }).map(function (x) { return x.lessons.position; });
  }
  async function completeLesson(position) {
    if (DEMO) { var d = await getLessonDone(); if (d.indexOf(position) < 0) d.push(position); localStorage.setItem("vault_lessons", JSON.stringify(d)); return; }
    await sb.rpc("complete_lesson", { p_position: position });
  }

  async function getSessions() {
    if (DEMO) return window.VAULT_DEMO.sessions.filter(function (s) { return s.starts_at > Date.now(); });
    var r = await sb.from("live_sessions").select("*").gte("starts_at", new Date().toISOString()).order("starts_at");
    return guard(r, []).map(function (s) { s.starts_at = new Date(s.starts_at).getTime(); return s; });
  }
  async function getNextSession() { var list = await getSessions(); return list[0] || null; }

  async function getConsultations() {
    if (DEMO) return window.VAULT_DEMO.consultations;
    /* the RPC self-heals: creates the current quarter as available, expires stale ones */
    var r = await sb.rpc("get_my_consultations");
    return guard(r, []).map(function (c) {
      if (c.scheduled_for) c.scheduled_for = new Date(c.scheduled_for).getTime();
      var m = /^(\d{4})-Q(\d)$/.exec(c.quarter || "");
      if (m) c.quarter = "Q" + m[2] + " " + m[1];
      return c;
    });
  }

  async function memberCount() {
    var cfg = DEMO ? window.VAULT_DEMO.member_counter : null;
    if (!DEMO) {
      var r = await sb.rpc("get_member_count");
      if (r.data) return r.data;
      cfg = { base: 213, base_date: "2026-07-11", days_per_member: 2 };
    }
    var days = Math.max(0, (Date.now() - new Date(cfg.base_date).getTime()) / 86400000);
    return cfg.base + Math.floor(days / cfg.days_per_member);
  }

  /* ---------- challenges (day N unlocks at starts_at + (N-1) days) ---------- */
  async function getChallenge() {
    if (DEMO) {
      var c = Object.assign({}, window.VAULT_DEMO.challenge);
      c.my_done = store("vault_challenge", "[]");
      return c;
    }
    var r = await sb.from("challenges").select("*,challenge_days(*)").eq("status", "active").order("starts_at", { ascending: false }).limit(1);
    var c2 = guard(r, [])[0]; if (!c2) return null;
    c2.days = (c2.challenge_days || []).sort(function (a, b) { return a.day_number - b.day_number; });
    c2.starts_at = new Date(c2.starts_at).getTime();
    /* scope progress to THIS challenge: challenge_progress holds rows from every
       past challenge, and day_numbers 1..5 repeat across them */
    var p = await sb.from("challenge_progress")
      .select("challenge_days!inner(day_number,challenge_id)")
      .eq("challenge_days.challenge_id", c2.id);
    c2.my_done = guard(p, []).filter(function (x) { return x.challenge_days; }).map(function (x) { return x.challenge_days.day_number; });
    return c2;
  }
  async function completeChallengeDay(slug, dayNumber) {
    if (DEMO) { var d = store("vault_challenge", "[]"); if (d.indexOf(dayNumber) < 0) d.push(dayNumber); localStorage.setItem("vault_challenge", JSON.stringify(d)); return; }
    await sb.rpc("complete_challenge_day", { p_slug: slug, p_day: dayNumber });
  }
  function dayUnlockAt(challenge, dayNumber) { return challenge.starts_at + (dayNumber - 1) * 86400000; }

  /* ---------- since your last visit ---------- */
  function getLastVisit() {
    var v = Number(localStorage.getItem("vault_last_visit") || 0);
    if (!v && DEMO) v = Date.now() - 25 * 86400000; /* demo shows the band on first open */
    return v;
  }
  function stampVisit() { localStorage.setItem("vault_last_visit", String(Date.now())); }

  function track(eventType, ref) {
    if (DEMO || !sb) return;
    /* supabase-js builders are lazy: the request only fires when the thenable
       is consumed, so fire-and-forget still needs a .then() */
    try { sb.rpc("log_event", { p_event: eventType, p_ref: ref || null }).then(function () {}, function () {}); } catch (e) {}
  }

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

  /* ---------- scroll reveals (CSS-only fallback safe: hiding is scoped to html.js)
     rAF-throttled rect check instead of IntersectionObserver: instant scroll jumps
     and elements left above the viewport can never get stuck hidden. ---------- */
  /* module-level reveal state: reveal() may be called again after a re-render,
     so listeners and heartbeats must never stack */
  var _rvPending = [];
  var _rvArmed = false;
  var _rvKicker = null;
  function _rvCheck() {
    if (!_rvPending.length) return;
    var vh = window.innerHeight || document.documentElement.clientHeight || 800;
    _rvPending = _rvPending.filter(function (n) {
      if (n.getBoundingClientRect().top < vh * 0.94) { n.classList.add("rv-in"); return false; }
      return true;
    });
  }
  function reveal() {
    document.documentElement.classList.add("js");
    /* collect any not-yet-revealed nodes (new ones after a re-render included) */
    Array.prototype.forEach.call(document.querySelectorAll(".rv:not(.rv-in)"), function (n) {
      if (_rvPending.indexOf(n) < 0) _rvPending.push(n);
    });
    _rvCheck();
    if (_rvArmed) { restartKicker(); return; }
    _rvArmed = true;
    /* timestamp throttle, NOT requestAnimationFrame: a starved rAF callback
       would leave the old ticking flag stuck and jam reveals forever */
    var lastCheck = 0;
    function onScroll() {
      var now = Date.now();
      if (now - lastCheck < 80) return;
      lastCheck = now;
      _rvCheck();
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.addEventListener("load", onScroll);
    /* settle loop: fast for the first 3s (fonts/images shift layout), then a
       slow heartbeat until everything revealed. Ten rect reads per beat is
       nothing, and reveals must never depend on scroll events firing. */
    function restartKicker() {
      if (_rvKicker) clearInterval(_rvKicker);
      var kicks = 0;
      _rvKicker = setInterval(function () {
        _rvCheck();
        kicks++;
        if (!_rvPending.length) { clearInterval(_rvKicker); _rvKicker = null; return; }
        if (kicks >= 10) {
          clearInterval(_rvKicker);
          _rvKicker = setInterval(function () { _rvCheck(); if (!_rvPending.length) { clearInterval(_rvKicker); _rvKicker = null; } }, 1500);
        }
      }, 300);
    }
    restartKicker();
  }

  /* ---------- chrome (topbar + mobile tabbar) ---------- */
  var KEYMARK = '<svg class="keymark" viewBox="0 0 24 24" fill="none" stroke="#C9A227" stroke-width="1.4" aria-hidden="true"><circle cx="9" cy="9" r="5.2"/><circle cx="9" cy="9" r="1.8"/><path d="M13 13l7.2 7.2M17.4 17.6l2.2-2.2M15 15.2l1.6-1.6"/></svg>';

  function renderChrome(active, access) {
    var nav = [
      { id: "induction", label: "Start Here", href: "/ai-vault/induction.html" },
      { id: "home", label: "Home", href: "/ai-vault/home.html" },
      { id: "episodes", label: "AI Episodes", href: "/ai-vault/episodes.html" },
      { id: "live", label: "Upcoming", href: "/ai-vault/live.html" },
      { id: "masterminds", label: "Masterminds", href: "/ai-vault/masterminds.html" },
      { id: "challenges", label: "Challenges & Courses", href: "/ai-vault/challenges.html" },
      { id: "deals", label: "Buying Club", href: "/ai-vault/tools.html" },
      { id: "ask", label: "Ask Jay", href: "/ai-vault/ask.html" },
      { id: "consultation", label: "1-on-1", href: "/ai-vault/consultation.html" }
    ];
    var links = nav.map(function (n) {
      return '<a href="' + n.href + '" class="' + (active === n.id ? "active" : "") + '">' + n.label + "</a>";
    }).join("");
    var trimmedName = access && access.name ? String(access.name).trim() : "";
    var initial = trimmedName ? esc(trimmedName[0].toUpperCase()) : "·";
    var avatar = access && access.avatar_url ? '<img src="' + esc(access.avatar_url) + '" alt="">' : initial;
    var top = el('<header class="topbar">' +
      '<a class="brand" href="/ai-vault/home.html" aria-label="AI Vault, home">' + KEYMARK + '<span class="wordmark">AI Vault</span></a>' +
      '<nav class="topnav">' + links + "</nav>" +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<button class="themebtn" id="themeToggle" title="Light / dark" aria-label="Toggle light or dark theme">◐</button>' +
        '<a class="memberchip" href="/ai-vault/account.html" title="The Ledger" aria-label="Your account, The Ledger"><span class="micro">' + (access ? esc((access.name || "").split(" ")[0]) : "") + '</span><span class="bezel">' + avatar + "</span></a>" +
      "</div>" +
      "</header>");
    document.body.prepend(top);
    top.querySelector("#themeToggle").addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("vault_theme", next); } catch (e) {}
    });
    var ICON = {
      home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 11l8-7 8 7"/><path d="M6 10v9h12v-9"/></svg>',
      episodes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor" stroke="none"/></svg>',
      live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="4" y="5" width="16" height="16" rx="2"/><path d="M4 9h16M8 3v4M16 3v4"/></svg>',
      more: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
      account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5"/></svg>'
    };
    var tabDefs = [
      { id: "home", label: "Home", ico: "home", href: "/ai-vault/home.html" },
      { id: "episodes", label: "Episodes", ico: "episodes", href: "/ai-vault/episodes.html" },
      { id: "live", label: "Upcoming", ico: "live", href: "/ai-vault/live.html" },
      { id: "account", label: "Profile", ico: "account", href: "/ai-vault/account.html" }
    ];
    var moreItems = [
      { label: "Start Here", href: "/ai-vault/induction.html" },
      { label: "Challenges & Courses", href: "/ai-vault/challenges.html" },
      { label: "Masterminds", href: "/ai-vault/masterminds.html" },
      { label: "Buying Club", href: "/ai-vault/tools.html", tag: "DEALS" },
      { label: "Ask the Experts", href: "/ai-vault/ask.html" },
      { label: "Your 1-on-1 with Jay", href: "/ai-vault/consultation.html" },
      { label: "WhatsApp Groups", href: "/ai-vault/whatsapp.html" },
      { label: "AI Vault FAQs", href: "/ai-vault/faq.html" }
    ];
    var moreActive = ["masterminds", "deals", "challenges", "ask", "consultation", "induction"].indexOf(active) >= 0;
    var tabHtml = tabDefs.map(function (n) {
      return '<a href="' + n.href + '" class="' + (active === n.id ? "active" : "") + '"><span class="ico">' + ICON[n.ico] + "</span>" + n.label + "</a>";
    }).join("") +
      '<button type="button" class="' + (moreActive ? "active" : "") + '" id="moreTab" aria-label="More sections"><span class="ico">' + ICON.more + "</span>More</button>";
    document.body.appendChild(el('<nav class="tabbar">' + tabHtml + "</nav>"));

    var sheet = el('<div class="msheet" id="moreSheet" role="dialog" aria-label="More sections"><div class="scrim"></div><div class="panel"><div class="grab"></div>' +
      moreItems.map(function (m) { return '<a href="' + m.href + '">' + esc(m.label) + (m.tag ? '<span class="micro">' + m.tag + "</span>" : '<span class="micro">→</span>') + "</a>"; }).join("") +
      "</div></div>");
    document.body.appendChild(sheet);
    var moreTab = document.getElementById("moreTab");
    function toggleSheet(open) { sheet.classList.toggle("open", open); }
    moreTab.addEventListener("click", function () { toggleSheet(!sheet.classList.contains("open")); });
    sheet.querySelector(".scrim").addEventListener("click", function () { toggleSheet(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") toggleSheet(false); });
    if (DEMO) {
      document.body.appendChild(el('<div class="demobadge"><span class="micro" style="background:var(--plate);border:1px solid var(--hairline);border-bottom:0;border-radius:6px 6px 0 0;padding:4px 12px;display:inline-block;">Demo mode. No live data</span></div>'));
    }
  }

  /* member avatar stack: three initials + the live count */
  function avatarStack(count) {
    var seeds = [["A", "#1E5C40"], ["MS", "#2C5218"], ["RK", "#5C4A16"]];
    return '<span class="avstack" title="' + count + ' members">' +
      seeds.map(function (s) { return '<span class="av" style="background:' + s[1] + '">' + s[0] + "</span>"; }).join("") +
      '<span class="avplus">+' + count + "</span></span>";
  }

  /* ---------- episode card (date-first, image thumb, likes) ---------- */
  function epCard(ep, prog, social) {
    var p = prog && prog[ep.slug];
    var soc = social && social[ep.slug];
    var pct = p && ep.duration_seconds ? Math.min(100, Math.round((p.position / ep.duration_seconds) * 100)) : 0;
    var thumb = ep.thumbnail_url
      ? '<img src="' + esc(ep.thumbnail_url) + '" alt="" loading="lazy">'
      : '<span class="epnum">' + fmtMonth(ep.published_at).split(" ")[0] + "</span>";
    return '<a class="plate ep-plate rv" href="/ai-vault/episode.html?ep=' + encodeURIComponent(ep.slug) + '">' +
      '<span class="glint-edge"></span>' +
      '<div class="ep-thumb">' + thumb +
        '<span class="chip dur">' + fmtDuration(ep.duration_seconds) + "</span>" +
        (ep.updated_note ? '<span class="updated">Updated</span>' : "") +
        (p && p.completed ? '<span class="check">✓</span>' : "") +
      "</div>" +
      '<div class="ep-body">' +
        '<div class="micro gold">' + fmtMonth(ep.published_at) + (ep.guest_name ? ' · <span style="color:var(--text-dim)">WITH ' + esc(ep.guest_name).toUpperCase() + "</span>" : "") + "</div>" +
        '<div class="title">' + esc(ep.title) + "</div>" +
        '<div class="ep-meta micro"><span>' + fmtDate(ep.published_at) + "</span>" + (soc ? '<span class="likecount">♥ ' + soc.likes + "</span>" : "") + "</div>" +
      "</div>" +
      (pct ? '<span class="ep-hairline" style="width:' + pct + '%"></span>' : "") +
      "</a>";
  }

  /* ---------- countdown board ---------- */
  function mountCountdown(node, ts) {
    node.innerHTML = ["Days", "Hrs", "Min", "Sec"].map(function (l) {
      return '<div class="cell"><div class="num">00</div><div class="lbl">' + l + "</div></div>";
    }).join("");
    var nums = node.querySelectorAll(".num");
    function tick() {
      var d = Math.max(0, ts - Date.now());
      var v = [Math.floor(d / 86400000), Math.floor(d / 3600000) % 24, Math.floor(d / 60000) % 60, Math.floor(d / 1000) % 60];
      for (var i = 0; i < 4; i++) { var t = pad(v[i]); if (nums[i].textContent !== t) nums[i].textContent = t; }
    }
    tick(); return setInterval(tick, 1000);
  }

  return {
    DEMO: DEMO, sb: function () { return sb; },
    $: $, el: el, esc: esc, pad: pad,
    fmtDuration: fmtDuration, fmtTime: fmtTime, fmtDate: fmtDate, fmtMonth: fmtMonth, memberNo: memberNo,
    getAccess: getAccess, requireMember: requireMember, signIn: signIn, signOut: signOut,
    getEpisodes: getEpisodes, getEpisode: getEpisode, getProgressMap: getProgressMap, saveProgress: saveProgress,
    getSocial: getSocial, react: react, rate: rate, askQuestion: askQuestion,
    getQA: getQA, addReply: addReply, getPrograms: getPrograms, getDeals: getDeals, getDealSavings: getDealSavings, whatsappLinks: whatsappLinks,
    getLessons: getLessons, getLessonDone: getLessonDone, completeLesson: completeLesson,
    getSessions: getSessions, getNextSession: getNextSession, getConsultations: getConsultations,
    getChallenge: getChallenge, completeChallengeDay: completeChallengeDay, dayUnlockAt: dayUnlockAt,
    getLastVisit: getLastVisit, stampVisit: stampVisit,
    memberCount: memberCount, track: track, callFn: callFn,
    renderChrome: renderChrome, epCard: epCard, mountCountdown: mountCountdown, reveal: reveal, avatarStack: avatarStack
  };
})();
