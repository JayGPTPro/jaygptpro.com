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
      .select("ep_number,slug,title,guest_name,duration_seconds,published_at,updated_note,thumbnail_url,likes_base,episode_tags(tags(name))")
      .eq("status", "published").order("published_at", { ascending: false });
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
    (r.data || []).forEach(function (x) { map[x.slug] = { likes: x.likes, my_like: x.my_like, my_watch_later: x.my_watch_later, my_more: x.my_more, my_stars: x.my_stars || 0 }; });
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
      var mine = store("vault_qa_mine", "[]");
      var myReplies = store("vault_qa_replies", "{}");
      var base = (window.VAULT_DEMO.qa || []).map(function (q) {
        var extra = myReplies[q.id] || [];
        return Object.assign({}, q, { replies: (q.replies || []).concat(extra) });
      });
      return mine.concat(base);
    }
    var r = await sb.rpc("get_qa", { p_limit: 30 });
    return r.data || [];
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
    return r.data || [];
  }
  async function getDeals() {
    if (DEMO) return window.VAULT_DEMO.deals;
    var r = await sb.from("tool_deals").select("*").eq("active", true).order("sort");
    return r.data || [];
  }
  function whatsappLinks() {
    if (DEMO) return window.VAULT_DEMO.whatsapp;
    return { updates_url: "https://chat.whatsapp.com/FWEhjKesDrvAP8wugfVbIs", community_url: "" };
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
      localStorage.setItem("vault_progress", JSON.stringify(map)); return;
    }
    await sb.rpc("record_watch_progress", { p_episode_slug: episode.slug, p_position: Math.floor(positionSeconds), p_completed: !!completed });
  }

  async function getLessons() {
    if (DEMO) return window.VAULT_DEMO.lessons;
    var r = await sb.from("lessons").select("*").order("position");
    return r.data || [];
  }
  async function getLessonDone() {
    if (DEMO) return store("vault_lessons", "[]");
    var r = await sb.from("lesson_progress").select("lessons(position)");
    return (r.data || []).map(function (x) { return x.lessons.position; });
  }
  async function completeLesson(position) {
    if (DEMO) { var d = await getLessonDone(); if (d.indexOf(position) < 0) d.push(position); localStorage.setItem("vault_lessons", JSON.stringify(d)); return; }
    await sb.rpc("complete_lesson", { p_position: position });
  }

  async function getSessions() {
    if (DEMO) return window.VAULT_DEMO.sessions.filter(function (s) { return s.starts_at > Date.now(); });
    var r = await sb.from("live_sessions").select("*").gte("starts_at", new Date().toISOString()).order("starts_at");
    return (r.data || []).map(function (s) { s.starts_at = new Date(s.starts_at).getTime(); return s; });
  }
  async function getNextSession() { var list = await getSessions(); return list[0] || null; }

  async function getConsultations() {
    if (DEMO) return window.VAULT_DEMO.consultations;
    var r = await sb.from("consultations").select("*").order("quarter");
    return (r.data || []).map(function (c) { if (c.scheduled_for) c.scheduled_for = new Date(c.scheduled_for).getTime(); return c; });
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
    var c2 = (r.data || [])[0]; if (!c2) return null;
    c2.days = (c2.challenge_days || []).sort(function (a, b) { return a.day_number - b.day_number; });
    c2.starts_at = new Date(c2.starts_at).getTime();
    var p = await sb.from("challenge_progress").select("challenge_days(day_number)");
    c2.my_done = (p.data || []).map(function (x) { return x.challenge_days.day_number; });
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
    if (DEMO) return;
    try { sb.rpc("log_event", { p_event: eventType, p_ref: ref || null }); } catch (e) {}
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
  function reveal() {
    document.documentElement.classList.add("js");
    var pending = Array.prototype.slice.call(document.querySelectorAll(".rv:not(.rv-in)"));
    function check() {
      if (!pending.length) return;
      var vh = window.innerHeight;
      pending = pending.filter(function (n) {
        if (n.getBoundingClientRect().top < vh * 0.94) { n.classList.add("rv-in"); return false; }
        return true;
      });
      if (!pending.length) window.removeEventListener("scroll", onScroll);
    }
    var ticking = false;
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; check(); });
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    check();
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
      { id: "ask", label: "Ask Jay", href: "/ai-vault/ask.html" },
      { id: "consultation", label: "1-on-1", href: "/ai-vault/consultation.html" }
    ];
    var links = nav.map(function (n) {
      return '<a href="' + n.href + '" class="' + (active === n.id ? "active" : "") + '">' + n.label + "</a>";
    }).join("");
    var initial = access && access.name ? esc(access.name.trim()[0].toUpperCase()) : "·";
    var avatar = access && access.avatar_url ? '<img src="' + esc(access.avatar_url) + '" alt="">' : initial;
    var top = el('<header class="topbar">' +
      '<a class="brand" href="/ai-vault/home.html">' + KEYMARK + '<span class="wordmark">AI Vault</span></a>' +
      '<nav class="topnav">' + links + "</nav>" +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<button class="themebtn" id="themeToggle" title="Light / dark" aria-label="Toggle light or dark theme">◐</button>' +
        '<a class="memberchip" href="/ai-vault/account.html" title="The Ledger"><span class="micro">' + (access ? esc((access.name || "").split(" ")[0]) : "") + '</span><span class="bezel">' + avatar + "</span></a>" +
      "</div>" +
      "</header>");
    document.body.prepend(top);
    top.querySelector("#themeToggle").addEventListener("click", function () {
      var next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      try { localStorage.setItem("vault_theme", next); } catch (e) {}
    });
    var tabs = [
      { id: "home", label: "Home", ico: "◈", href: "/ai-vault/home.html" },
      { id: "episodes", label: "Episodes", ico: "▦", href: "/ai-vault/episodes.html" },
      { id: "live", label: "Upcoming", ico: "◉", href: "/ai-vault/live.html" },
      { id: "challenges", label: "Courses", ico: "◎", href: "/ai-vault/challenges.html" },
      { id: "account", label: "Profile", ico: "▣", href: "/ai-vault/account.html" }
    ].map(function (n) {
      return '<a href="' + n.href + '" class="' + (active === n.id ? "active" : "") + '"><span class="ico">' + n.ico + "</span>" + n.label + "</a>";
    }).join("");
    document.body.appendChild(el('<nav class="tabbar">' + tabs + "</nav>"));
    if (DEMO) {
      document.body.appendChild(el('<div style="position:fixed;bottom:0;left:0;right:0;z-index:70;text-align:center;pointer-events:none;"><span class="micro" style="background:var(--plate);border:1px solid var(--hairline);border-bottom:0;border-radius:6px 6px 0 0;padding:4px 12px;display:inline-block;">Demo mode. No live data</span></div>'));
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
    fmtDuration: fmtDuration, fmtTime: fmtTime, fmtDate: fmtDate, fmtMonth: fmtMonth, memberNo: memberNo,
    getAccess: getAccess, requireMember: requireMember, signIn: signIn, signOut: signOut,
    getEpisodes: getEpisodes, getEpisode: getEpisode, getProgressMap: getProgressMap, saveProgress: saveProgress,
    getSocial: getSocial, react: react, rate: rate, askQuestion: askQuestion,
    getQA: getQA, addReply: addReply, getPrograms: getPrograms, getDeals: getDeals, whatsappLinks: whatsappLinks,
    getLessons: getLessons, getLessonDone: getLessonDone, completeLesson: completeLesson,
    getSessions: getSessions, getNextSession: getNextSession, getConsultations: getConsultations,
    getChallenge: getChallenge, completeChallengeDay: completeChallengeDay, dayUnlockAt: dayUnlockAt,
    getLastVisit: getLastVisit, stampVisit: stampVisit,
    memberCount: memberCount, track: track, callFn: callFn,
    renderChrome: renderChrome, epCard: epCard, mountCountdown: mountCountdown, reveal: reveal, avatarStack: avatarStack
  };
})();
