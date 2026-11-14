// Made-up data for demo mode (?demo). Nothing here is a real draft.
(function () {
  const day = 86400000;
  const iso = (offsetDays) => new Date(Date.now() + offsetDays * day).toISOString();
  const local = (offsetDays) => {
    const d = new Date(Date.now() + offsetDays * day);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  // the next Sunday-to-Thursday day at least n days from today
  const workday = (n) => {
    for (let i = n; i < n + 7; i++) if (new Date(Date.now() + i * day).getDay() <= 4) return local(i);
    return local(n);
  };
  const sig = "Jay\n\n📲 Share this group with friends: https://chat.whatsapp.com/EXAMPLE";
  const banner = (a, b, text) =>
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="1200" height="675" fill="url(#g)"/><circle cx="980" cy="140" r="220" fill="#fff" opacity=".08"/><circle cx="160" cy="600" r="260" fill="#fff" opacity=".06"/><text x="90" y="380" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#fff">${text}</text></svg>`,
    );
  window.DESK_DEMO_IMAGE = banner("#2f68d8", "#8448a8", "Demo banner");
  window.DESK_DEMO_IMAGES = {
    "demo/ready1.svg": banner("#0c8f6f", "#2f68d8", "Reviews → Bullets"),
    "demo/ready2.svg": banner("#dc4a38", "#a9730f", "Weekend AI deals"),
    "demo/ready3.svg": banner("#1c2430", "#2f68d8", "One prompt, 3 worries"),
    "demo/final1.svg": banner("#8448a8", "#dc4a38", "New tool this week"),
    "demo/draft1.svg": banner("#5b6575", "#8b94a3", "Sketch"),
    "demo/pub1.svg": banner("#0c8f6f", "#0a7259", "Last week's tip"),
    "demo/pub2.svg": banner("#2f68d8", "#1c2430", "Listing check"),
    "demo/pub3.svg": banner("#a9730f", "#dc4a38", "Price test"),
  };
  const body = (s) => s + "\n\nDrop a 👍 if you found this useful!";

  window.DESK_DEMO_DATA = {
    team_members: [
      { email: "owner@example.com", name: "Jay (demo)", role: "owner", color: "#dc4a38", active: true },
      { email: "writer@example.com", name: "Writer (demo)", role: "writer", color: "#2f68d8", active: true },
      { email: "ideas@example.com", name: "Ideas (demo)", role: "writer", color: "#0c8f6f", active: true },
    ],
    settings: [
      { key: "signature", value: { text: sig } },
      { key: "cadence", value: { days: [0, 1, 2, 3, 4], email_per_week: 3 } },
    ],
    rules: [
      { id: "r1", body: "Always give at least 3 headline options.", source: "Demo rule", check_key: "headlines", sort: 1, active: true, created_at: iso(-30) },
      { id: "r2", body: "Make the reaction ask easy for everyone: “Drop a 👍 if you found this useful”.", source: "Demo rule", check_key: "cta", sort: 2, active: true, created_at: iso(-30) },
      { id: "r3", body: "Every number and date needs an official source.", source: "Demo rule", check_key: null, sort: 3, active: true, created_at: iso(-30) },
    ],
    posts: [
      // ideas
      { id: "i1", title: "Demo: a launch from yesterday sellers can try today", category: "news", stage: "idea", status: "waiting", hot: true, idea: "Something launched yesterday. Three steps to try it, and who it is for.", author: "ideas@example.com", score: 8, created_at: iso(-0.3), updated_at: iso(-0.3), queue_pos: 1 },
      { id: "i2", title: "Demo: a two-minute listing check", category: "tip", stage: "idea", status: "waiting", idea: "A check any seller can run on their own listing in two minutes.", author: "writer@example.com", score: 6, covered_before: "A similar post went out in March.", created_at: iso(-0.5), updated_at: iso(-0.5), queue_pos: 2 },
      { id: "i3", title: "Demo: a Skill that writes A+ modules", category: "skill", stage: "idea", status: "approved", idea: "A Skill that drafts A+ content from the listing and the reviews.", author: "writer@example.com", created_at: iso(-2), updated_at: iso(-1), queue_pos: 3 },
      { id: "i4", title: "Demo: a poll for the group", category: "other", stage: "idea", status: "rejected", skip_reason: "Not now, maybe after the next launch.", idea: "Ask the group what they want next.", author: "writer@example.com", created_at: iso(-7), updated_at: iso(-6), queue_pos: 4 },
      // first drafts
      { id: "d1", title: "Demo: ask your reviews first", category: "tip", stage: "draft", status: "waiting", idea: "A prompt that finds what buyers complain about.", author: "writer@example.com", created_at: iso(-4), updated_at: iso(-0.2), queue_pos: 5 },
      { id: "d2", title: "Demo: turn reviews into bullets", category: "skill", stage: "draft", status: "changes", idea: "A Skill that turns reviews into bullets.", author: "writer@example.com", created_at: iso(-5), updated_at: iso(-1), queue_pos: 6 },
      { id: "d3", title: "Demo: the price test", category: "tip", stage: "draft", status: "approved", idea: "How to test a price without losing the Buy Box.", author: "writer@example.com", created_at: iso(-6), updated_at: iso(-0.7), queue_pos: 7 },
      // final
      { id: "f1", title: "Demo: a new tool launched this week", category: "news", stage: "final", status: "waiting", hot: true, news_date: local(-2), tried_myself: false, idea: "A product launch from this week.", author: "writer@example.com", email_too: true, created_at: iso(-3), updated_at: iso(-0.1), queue_pos: 8 },
      // ready
      { id: "r1p", title: "Demo: reviews into bullets in one prompt", category: "tip", stage: "ready", status: "approved", pinned_date: workday(1), author: "writer@example.com", email_too: true, created_at: iso(-8), updated_at: iso(-1), queue_pos: 9 },
      { id: "r2p", title: "Demo: AI deals for the weekend", category: "deals", stage: "ready", status: "approved", pinned_date: workday(3), author: "writer@example.com", created_at: iso(-6), updated_at: iso(-1), queue_pos: 10 },
      { id: "r3p", title: "Demo: one prompt, three worries", category: "tip", stage: "ready", status: "approved", pinned_date: null, author: "owner@example.com", created_at: iso(-4), updated_at: iso(-0.4), queue_pos: 11 },
      // published
      { id: "p1", title: "Demo: last week's tip", category: "tip", stage: "published", status: "approved", author: "writer@example.com", published_at: iso(-2), reactions: 41, created_at: iso(-9), updated_at: iso(-2), queue_pos: 0 },
      { id: "p2", title: "Demo: the listing check", category: "tip", stage: "published", status: "approved", author: "owner@example.com", published_at: iso(-4), reactions: 27, created_at: iso(-12), updated_at: iso(-4), queue_pos: 0 },
      { id: "p3", title: "Demo: the price test, part one", category: "news", stage: "published", status: "approved", author: "writer@example.com", published_at: iso(-9), reactions: 33, created_at: iso(-15), updated_at: iso(-9), queue_pos: 0 },
    ],
    versions: [
      { id: "vd1a", post_id: "d1", channel: "whatsapp", n: 1, author: "writer@example.com", created_at: iso(-3),
        headlines: [{ en: "Demo: Your Reviews Already Know." }, { en: "Demo: Ask Your Reviews First." }, { en: "Demo: One Prompt Before You Rewrite." }],
        body: body("Your reviews already say what buyers worry about.\n\nPaste them into Claude and ask for the top three worries."), sources: [] },
      { id: "vd1b", post_id: "d1", channel: "whatsapp", n: 2, author: "writer@example.com", created_at: iso(-0.2),
        headlines: [{ en: "Demo: Your Reviews Already Know.", pick: true }, { en: "Demo: Ask Your Reviews First." }, { en: "Demo: One Prompt Before You Rewrite." }],
        body: body("Your reviews already say what buyers worry about.\n\n👉 Paste your last 50 reviews into Claude and ask: \"What are the three worries that come up most?\"\n\nWe tried it on a demo product: two of three worries were not in the listing."), sources: [], writer_note: "Added the test result and a ready prompt." },
      { id: "vd2", post_id: "d2", channel: "whatsapp", n: 1, author: "writer@example.com", created_at: iso(-1.5),
        headlines: [{ en: "Demo: Turn Reviews Into Bullets." }, { en: "Demo: A Skill for Bullets." }, { en: "Demo: Bullets From Buyers." }],
        body: body("A Skill that reads your reviews and drafts bullets in your buyers' words."), sources: [] },
      { id: "vd3", post_id: "d3", channel: "whatsapp", n: 1, author: "writer@example.com", created_at: iso(-1),
        headlines: [{ en: "Demo: Test a Price Without Losing the Buy Box." }, { en: "Demo: The Safe Price Test." }, { en: "Demo: Price Tests, Step by Step." }], chosen: 0,
        body: body("Before you change a price, run this three-step test."), sources: [] },
      { id: "vf1", post_id: "f1", channel: "whatsapp", n: 1, author: "writer@example.com", created_at: iso(-0.1),
        headlines: [{ en: "🚀 Demo: A New Tool Launched This Week.", pick: true }, { en: "Demo: The Tool Everyone Asked About." }, { en: "Demo: What Launched This Week." }],
        body: "A new tool launched this week. Here is what it does and who can use it.\n\n[Confirm before posting: is it live in your account?]\n\nDrop a 👍 if you're planning to try it!",
        sources: [{ url: "https://example.com/news", label: "Example news page", official: true }], writer_note: "Checked against the official page." },
      { id: "vr1", post_id: "r1p", channel: "whatsapp", n: 1, author: "writer@example.com", created_at: iso(-2),
        headlines: [{ en: "Demo: Reviews Into Bullets in One Prompt." }, { en: "Demo: Your Buyers Wrote Your Bullets." }, { en: "Demo: Steal From Your Reviews." }], chosen: 0,
        body: body("This is a demo post body. It is short and practical.\n\n👉 Paste this into Claude: \"Turn these reviews into five bullets in the buyers' own words.\""),
        sources: [{ url: "https://example.com/announcement", label: "Example announcement", official: true }] },
      { id: "vr1e", post_id: "r1p", channel: "email", n: 1, author: "writer@example.com", created_at: iso(-1.5),
        headlines: [{ en: "Your buyers already wrote your bullets" }, { en: "One prompt, five bullets" }, { en: "Steal this from your reviews" },
          { en: "Paste your reviews, get five bullets in their words.", kind: "preview" }, { en: "The prompt takes two minutes.", kind: "preview" }], chosen: null,
        body: '<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1c2430"><h1 style="font-size:22px">Your buyers already wrote your bullets</h1><p style="line-height:1.6">This is the email version of the demo post. Paste your reviews into Claude and ask for five bullets in the buyers\' own words.</p><p><a href="https://example.com" style="background:#0c8f6f;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Read the full post</a></p><p style="color:#8b94a3;font-size:13px">Jay</p></div>', sources: [] },
      { id: "vr2", post_id: "r2p", channel: "whatsapp", n: 1, author: "writer@example.com", created_at: iso(-2),
        headlines: [{ en: "Demo: AI Deals for the Weekend." }, { en: "Demo: Five Tools on Sale." }, { en: "Demo: Save on AI This Weekend." }], chosen: 1,
        body: body("Five AI tools are on sale this weekend. Here is which one is worth it for sellers."), sources: [] },
      { id: "vr3", post_id: "r3p", channel: "whatsapp", n: 1, author: "owner@example.com", created_at: iso(-0.5),
        headlines: [{ en: "Demo: One Prompt, Three Worries." }], chosen: 0,
        body: body("One prompt finds the three worries your listing does not answer."), sources: [] },
      { id: "vp1", post_id: "p1", channel: "whatsapp", n: 1, author: "writer@example.com", created_at: iso(-3), headlines: [{ en: "Demo: Last Week's Tip." }], chosen: 0, body: body("A demo post that already went out."), sources: [] },
      { id: "vp2", post_id: "p2", channel: "whatsapp", n: 1, author: "owner@example.com", created_at: iso(-5), headlines: [{ en: "Demo: The Two-Minute Listing Check." }], chosen: 0, body: body("Another demo post that went out."), sources: [] },
      { id: "vp3", post_id: "p3", channel: "whatsapp", n: 1, author: "writer@example.com", created_at: iso(-10), headlines: [{ en: "Demo: The Price Test, Part One." }], chosen: 0, body: body("A third demo post that went out."), sources: [] },
    ],
    notes: [
      { id: "n1", post_id: "d1", kind: "note", body: "Add a real test result so it is not just theory.", version_n: 1, status: "closed", closed_in: 2, author: "owner@example.com", created_at: iso(-2.5) },
      { id: "n2", post_id: "d1", kind: "note", body: "Give the prompt word for word.", version_n: 1, status: "closed", closed_in: 2, author: "owner@example.com", created_at: iso(-2.5) },
      { id: "n3", post_id: "d2", kind: "note", body: "The headline should say what the reader gets.", version_n: 1, status: "open", author: "owner@example.com", created_at: iso(-1) },
      { id: "n4", post_id: "f1", kind: "team", body: "Does the new tab show in your account? That decides one line in the post.", status: "open", author: "writer@example.com", created_at: iso(-0.2) },
      { id: "n5", post_id: "f1", kind: "team", body: "I can test this on my account tomorrow if useful.", status: "open", author: "ideas@example.com", created_at: iso(-0.1) },
    ],
    assets: [
      { id: "a1", post_id: "r1p", path: "demo/ready1.svg", filename: "reviews-bullets.png", mime: "image/svg+xml", size: 240000, stage: "final", status: "approved", author: "writer@example.com", created_at: iso(-1.5) },
      { id: "a2", post_id: "r2p", path: "demo/ready2.svg", filename: "weekend-deals.png", mime: "image/svg+xml", size: 210000, stage: "final", status: "approved", author: "writer@example.com", created_at: iso(-1.4) },
      { id: "a3", post_id: "r3p", path: "demo/ready3.svg", filename: "three-worries.png", mime: "image/svg+xml", size: 200000, stage: "final", status: "approved", author: "owner@example.com", created_at: iso(-0.4) },
      { id: "a4", post_id: "f1", path: "demo/final1.svg", filename: "new-tool-banner.png", mime: "image/svg+xml", size: 260000, stage: "final", status: "pending", author: "writer@example.com", created_at: iso(-0.1) },
      { id: "a5", post_id: "d1", path: "demo/draft1.svg", filename: "reviews-sketch.png", mime: "image/svg+xml", size: 180000, stage: "sketch", status: "pending", author: "writer@example.com", created_at: iso(-0.5) },
      { id: "a6", post_id: "p1", path: "demo/pub1.svg", filename: "last-week.png", mime: "image/svg+xml", size: 220000, stage: "final", status: "approved", author: "writer@example.com", created_at: iso(-3) },
      { id: "a7", post_id: "p2", path: "demo/pub2.svg", filename: "listing-check.png", mime: "image/svg+xml", size: 220000, stage: "final", status: "approved", author: "owner@example.com", created_at: iso(-5) },
      { id: "a8", post_id: "p3", path: "demo/pub3.svg", filename: "price-test.png", mime: "image/svg+xml", size: 220000, stage: "final", status: "approved", author: "writer@example.com", created_at: iso(-10) },
    ],
  };
})();
