// Made-up data for demo mode (?demo). Nothing here is a real draft.
(function () {
  const day = 86400000;
  const iso = (offsetDays) => new Date(Date.now() + offsetDays * day).toISOString();
  const date = (offsetDays) => iso(offsetDays).slice(0, 10);
  const sig = "Jay\n\n📲 Share this group with friends: https://chat.whatsapp.com/EXAMPLE";

  window.DESK_DEMO_IMAGE =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b4f86"/><stop offset=".6" stop-color="#6b3a5b"/><stop offset="1" stop-color="#d5412a"/></linearGradient></defs><rect width="1200" height="675" fill="url(#g)"/><text x="600" y="350" font-family="Georgia" font-size="64" fill="#fff" text-anchor="middle">Demo banner</text></svg>',
    );

  window.DESK_DEMO_DATA = {
    team_members: [
      { email: "owner@example.com", name: "Jay (demo)", role: "owner", color: "#d5412a", active: true },
      { email: "writer@example.com", name: "Writer (demo)", role: "writer", color: "#2b4f86", active: true },
      { email: "ideas@example.com", name: "Ideas (demo)", role: "writer", color: "#1e5f4b", active: true },
    ],
    settings: [
      { key: "signature", value: { text: sig } },
      { key: "cadence", value: { days: [0, 1, 2, 3, 4], email_per_week: 3 } },
    ],
    rules: [
      { id: "r1", body: "Always give at least 3 headline options.", source: "Demo rule", check_key: "headlines", sort: 1, active: true },
      { id: "r2", body: "Make the reaction ask easy for everyone: “Drop a 👍 if you found this useful”.", source: "Demo rule", check_key: "cta", sort: 2, active: true },
      { id: "r3", body: "Every number and date needs an official source.", source: "Demo rule", check_key: null, sort: 3, active: true },
      { id: "r4", body: "No [brackets] left in a post that goes out.", source: "Demo rule", check_key: "brackets", sort: 4, active: true },
    ],
    posts: [
      { id: "p1", title: "Demo: ready post", category: "tip", stage: "ready", idea: "A short tip that is approved and waiting to go out.", author: "writer@example.com", text_ok: true, hot: false, pinned_date: null, queue_pos: 1, email_too: true, created_at: iso(-3), updated_at: iso(-1) },
      { id: "p2", title: "Demo: news waiting for review", category: "news", stage: "review", idea: "A product launch from this week.", author: "writer@example.com", news_date: date(-2), hot: true, text_ok: false, pinned_date: null, queue_pos: 2, email_too: false, tried_myself: false, created_at: iso(-1), updated_at: iso(-0.2) },
      { id: "p3", title: "Demo: second draft after notes", category: "tip", stage: "review", idea: "A prompt that finds what buyers complain about.", author: "writer@example.com", hot: false, text_ok: false, pinned_date: null, queue_pos: 3, email_too: true, created_at: iso(-4), updated_at: iso(-0.5) },
      { id: "p4", title: "Demo: writer is fixing this one", category: "skill", stage: "writing", idea: "A Skill that turns reviews into bullets.", author: "writer@example.com", hot: false, text_ok: false, pinned_date: null, queue_pos: 4, email_too: false, created_at: iso(-5), updated_at: iso(-1) },
      { id: "p5", title: "Demo: deals roundup", category: "deals", stage: "writing", idea: "AI tool deals for the shopping weekend.", author: "writer@example.com", hot: false, text_ok: false, pinned_date: date(6), queue_pos: 5, email_too: true, created_at: iso(-6), updated_at: iso(-2) },
      { id: "p6", title: "Demo: fresh idea", category: "news", stage: "idea", idea: "Something launched yesterday that sellers can try today. Three steps.", author: "ideas@example.com", score: 8, covered_before: "Not covered before.", hot: false, text_ok: false, pinned_date: null, queue_pos: 6, email_too: false, created_at: iso(-0.3), updated_at: iso(-0.3) },
      { id: "p7", title: "Demo: another idea", category: "tip", stage: "idea", idea: "A two-minute check sellers can run on their own listing.", author: "writer@example.com", score: 6, covered_before: "A similar post went out in March.", hot: false, text_ok: false, pinned_date: null, queue_pos: 7, email_too: false, created_at: iso(-0.4), updated_at: iso(-0.4) },
      { id: "p8", title: "Demo: published last week", category: "tip", stage: "published", idea: "", author: "owner@example.com", text_ok: true, hot: false, pinned_date: null, queue_pos: 0, email_too: false, published_at: iso(-2), reactions: 12, created_at: iso(-9), updated_at: iso(-2) },
      { id: "p9", title: "Demo: parked idea", category: "other", stage: "parked", idea: "A poll for the group.", author: "writer@example.com", skip_reason: "Not now, until the next launch.", text_ok: false, hot: false, pinned_date: null, queue_pos: 9, email_too: false, created_at: iso(-7), updated_at: iso(-6) },
    ],
    versions: [
      { id: "v1", post_id: "p1", channel: "whatsapp", n: 1, author: "writer@example.com", created_at: iso(-2),
        headlines: [{ en: "Demo Headline One for the Ready Post." }, { en: "Demo Headline Two." }, { en: "Demo Headline Three." }], chosen: 0,
        body: "This is a demo post body. It is short and practical.\n\n👉 Paste this into ChatGPT or Claude: \"Find the three most common complaints in these reviews.\"\n\nThe smart move? Check first, then decide.\n\nDrop a 👍 if you found this useful!",
        sources: [{ url: "https://example.com/announcement", label: "Example announcement", official: true }], writer_note: "Final version with your two notes." },
      { id: "v2", post_id: "p2", channel: "whatsapp", n: 1, author: "writer@example.com", created_at: iso(-0.2),
        headlines: [{ en: "Demo: A New Tool Launched This Week.", pick: true }],
        body: "A new tool launched this week. Here is what it does and who can use it.\n\n[Confirm before posting: is it live in your account?]\n\nDrop a 👍 if you're planning to try it!",
        sources: [{ url: "https://example.com/news", label: "Example news page", official: true }], writer_note: "Checked against the official page." },
      { id: "v3a", post_id: "p3", channel: "whatsapp", n: 1, author: "writer@example.com", created_at: iso(-3),
        headlines: [{ en: "Demo: Your Reviews Already Know." }, { en: "Demo: Ask Your Reviews First." }, { en: "Demo: One Prompt Before You Rewrite." }],
        body: "Your reviews already say what buyers worry about.\n\nPaste them into Claude and ask for the top three worries.\n\nDrop a 👍 if you found this useful!", sources: [] },
      { id: "v3b", post_id: "p3", channel: "whatsapp", n: 2, author: "writer@example.com", created_at: iso(-0.5),
        headlines: [{ en: "Demo: Your Reviews Already Know.", pick: true }, { en: "Demo: Ask Your Reviews First." }, { en: "Demo: One Prompt Before You Rewrite." }],
        body: "Your reviews already say what buyers worry about.\n\n👉 Paste your last 50 reviews into Claude and ask: \"What are the three worries that come up most?\"\n\nWe tried it on a demo product: two of three worries were not in the listing.\n\nDrop a 👍 if you found this useful!", sources: [], writer_note: "Added the test result and a ready prompt." },
      { id: "v4", post_id: "p4", channel: "whatsapp", n: 1, author: "writer@example.com", created_at: iso(-1.5),
        headlines: [{ en: "Demo: Turn Reviews Into Bullets." }, { en: "Demo: A Skill for Bullets." }, { en: "Demo: Bullets From Buyers." }],
        body: "A Skill that reads your reviews and drafts bullets in your buyers' words.\n\nDrop a 👍 if you want it!", sources: [] },
      { id: "v8", post_id: "p8", channel: "whatsapp", n: 1, author: "owner@example.com", created_at: iso(-3),
        headlines: [{ en: "Demo: Last Week's Post." }], chosen: 0, body: "A demo post that already went out.\n\nDrop a 👍 if you found this useful!", sources: [] },
      { id: "v1e", post_id: "p1", channel: "email", n: 1, author: "writer@example.com", created_at: iso(-1.5),
        headlines: [{ en: "Demo subject line A" }, { en: "Demo subject line B" }], chosen: null,
        body: "Hi there,\n\nThis is the email version of the demo post.\n\nJay", sources: [] },
    ],
    notes: [
      { id: "n1", post_id: "p3", kind: "note", body: "Add a real test result so it is not just theory.", version_n: 1, status: "closed", closed_in: 2, author: "owner@example.com", created_at: iso(-2.5) },
      { id: "n2", post_id: "p3", kind: "note", body: "Give the prompt word for word.", version_n: 1, status: "closed", closed_in: 2, author: "owner@example.com", created_at: iso(-2.5) },
      { id: "n3", post_id: "p4", kind: "note", body: "The headline should say what the reader gets.", version_n: 1, status: "open", author: "owner@example.com", created_at: iso(-1) },
      { id: "n4", post_id: "p2", kind: "question", body: "Does the new tab show in your account? That decides one line in the post.", status: "open", author: "writer@example.com", created_at: iso(-0.2) },
      { id: "n5", post_id: "p2", kind: "team", body: "I can test this on my account tomorrow if useful.", status: "open", author: "ideas@example.com", created_at: iso(-0.1) },
    ],
    assets: [
      { id: "a1", post_id: "p1", path: "demo/p1-final.svg", filename: "ready-post-banner.png", mime: "image/svg+xml", size: 240000, stage: "final", status: "approved", author: "writer@example.com", created_at: iso(-1.5) },
      { id: "a2", post_id: "p3", path: "demo/p3-sketch.svg", filename: "reviews-sketch.png", mime: "image/svg+xml", size: 210000, stage: "sketch", status: "pending", author: "writer@example.com", created_at: iso(-0.5), note: "Sketch, polishing after your OK." },
    ],
  };
})();
