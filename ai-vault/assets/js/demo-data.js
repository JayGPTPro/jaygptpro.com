/* AI VAULT demo data. Used only when VAULT_CONFIG is empty (demo mode).
   Lets the whole portal render before Supabase exists.
   All demo videos point at a sample Vimeo video; real episodes replace them via the admin. */

window.VAULT_DEMO = (function () {
  var now = Date.now();
  var day = 86400000;
  var V = "1191120191"; // sample public Vimeo video for the demo
  var IMG = "/ai-vault/assets/img/";

  function ep(n, slug, title, guest, tags, thumb, mins, daysAgo, likes, desc, resources, chapters, updated) {
    return {
      ep_number: n, slug: slug, title: title, guest_name: guest, tags: tags,
      thumbnail_url: IMG + thumb, duration_seconds: mins * 60,
      published_at: now - daysAgo * day, likes: likes, updated_note: updated || null,
      vimeo_id: V, vimeo_hash: "", description: desc,
      resources: resources || [], chapters: chapters || []
    };
  }

  var episodes = [
    ep(17, "skills-for-claude-code", "Skills for Claude Code", null, ["Claude Code", "Automation"], "thumb-claude.jpg", 83, 20, 24,
      "Turn your best workflows into reusable skills your AI employee runs on command.",
      [{ kind: "prompt", title: "Skill starter template" }, { kind: "link", title: "Skills documentation", url: "https://docs.claude.com" }, { kind: "file", title: "Session slides (PDF)" }],
      [{ title: "Why skills change everything", starts_at: 0 }, { title: "Anatomy of a skill", starts_at: 620 }, { title: "Live build: listing audit skill", starts_at: 1740 }, { title: "Testing and evals", starts_at: 3300 }, { title: "Q&A", starts_at: 4200 }]),
    ep(16, "claude-code-for-ecom", "Claude Code for eCom Sellers", null, ["Claude Code"], "thumb-claude.jpg", 90, 50, 31,
      "The most requested episode ever. Your first AI employee, working on your Amazon business.",
      [{ kind: "prompt", title: "CLAUDE.md starter for sellers" }, { kind: "link", title: "Install guide", url: "https://claude.com/claude-code" }],
      [{ title: "Setup in 10 minutes", starts_at: 0 }, { title: "First real task", starts_at: 900 }, { title: "MCP connections", starts_at: 2400 }], "Part 2 added"),
    ep(15, "ai-prompts-masterclass", "AI Prompts That Sell: The Masterclass", null, ["Listings", "Research"], "thumb-listings.jpg", 70, 80, 14,
      "The exact prompt patterns behind listings, ads, and emails that convert.",
      [{ kind: "prompt", title: "The 12 seller prompt patterns" }]),
    ep(14, "brand-apps-andrew", "Brand Apps with Andrew Erickson", "Andrew Erickson", ["Video", "Images"], "thumb-video.jpg", 78, 110, 11,
      "Custom brand applications that multiply your creative output.",
      [{ kind: "link", title: "Andrew's app stack", url: "https://jaygptpro.com/ai-toolbox" }]),
    ep(13, "voc-ai-reviews", "Review Mining with VOC AI", null, ["Research"], "dial-macro.jpg", 65, 140, 9,
      "Turn thousands of reviews into product decisions in minutes.",
      [{ kind: "link", title: "VOC AI setup", url: "https://www.voc.ai" }, { kind: "prompt", title: "Review insight extraction prompt" }]),
    ep(12, "genspark-deep-dive", "GenSpark Deep Dive", null, ["Research", "Automation"], "dial-macro.jpg", 60, 170, 8,
      "The AI research agent that does competitor homework for you."),
    ep(11, "sourcing-china-ai", "Sourcing from China with AI", "Alex Jurca", ["Sourcing"], "thumb-sourcing.jpg", 85, 200, 12,
      "Supplier discovery, negotiation scripts, and QC checklists, all AI-assisted.",
      [{ kind: "file", title: "Negotiation script pack" }]),
    ep(10, "n8n-automation", "n8n Automation for Amazon", "Roded Yizhaky", ["Automation"], "thumb-automation.jpg", 80, 230, 13,
      "Hands-off workflows connecting SP-API, Ads API, and your inbox.",
      [{ kind: "link", title: "Workflow templates", url: "https://n8n.io" }]),
    ep(9, "canva-ai-sellers", "Canva AI for Sellers", "John Aspinall", ["Images"], "thumb-images.jpg", 62, 260, 7,
      "Fast, on-brand creatives without a designer."),
    ep(8, "sora-lifestyle-videos", "Product Lifestyle Videos with Sora 2", null, ["Video"], "thumb-video.jpg", 74, 290, 15,
      "Scroll-stopping lifestyle video from nothing but your product photos.",
      [{ kind: "prompt", title: "Sora scene prompts" }]),
    ep(7, "ai-video-ads", "AI Video Ads: VEO 3 and Kling", null, ["Video"], "thumb-video.jpg", 68, 320, 11,
      "15-second ads that used to cost $1,500, now $1.50."),
    ep(6, "ai-review-loop", "The AI Review Loop", "Andrew Erickson", ["Research", "Listings"], "dial-macro.jpg", 75, 350, 10,
      "A closed loop from reviews to listing fixes to ranking gains.",
      [{ kind: "prompt", title: "Review loop prompts" }]),
    ep(5, "custom-gpts-ecom", "Build Custom GPTs for eCom Workflows", null, ["Automation"], "thumb-automation.jpg", 72, 380, 10,
      "Your knowledge, packaged into assistants your team actually uses."),
    ep(4, "gemini-flash-image", "Gemini 2.5 Flash Image", null, ["Images"], "thumb-images.jpg", 58, 410, 10,
      "The fastest way to production-grade product imagery."),
    ep(3, "rufus-aeo-listings", "Writing Amazon Listings with AI: Rufus and AEO", "Andre Queiroz", ["Listings"], "thumb-listings.jpg", 78, 440, 13,
      "Listings optimized for the AI shopping assistant era.",
      [{ kind: "prompt", title: "AEO listing prompts" }]),
    ep(2, "ambassador-challenge", "AI Ambassador Workflow: 5-Day Challenge", null, ["Automation", "Video"], "thumb-video.jpg", 87, 470, 16,
      "The full 5-day system for AI brand ambassadors.",
      [{ kind: "file", title: "Challenge workbook" }]),
    ep(1, "nano-banana-listing-images", "Create Full Listing Images with Nano Banana Pro", "Michael Shackelford", ["Images"], "thumb-images.jpg", 93, 500, 19,
      "The most-liked session in Vault history. A complete listing image set, live.",
      [{ kind: "prompt", title: "Listing image prompt system" }, { kind: "file", title: "Reference sheet template" }])
  ];

  var lessons = [
    { position: 1, title: "Welcome to the Vault", body: "What is inside, how to use it, and your first 10 minutes. Watch the newest episode when you are done here.", cta: "See the latest episode", link: "/ai-vault/episodes.html" },
    { position: 2, title: "Your quick win: run your first prompt", body: "Open the Prompt Vault, grab one prompt, and run it on your own listing. Right now. This is the ten-minute win.", cta: "Open the Prompt Vault", link: "https://prompt.jaygptpro.com" },
    { position: 3, title: "Find episodes by your problem", body: "The library is tagged by problem, not by date. Filter to what you are stuck on and start there.", cta: "Browse AI Episodes", link: "/ai-vault/episodes.html" },
    { position: 4, title: "Join the WhatsApp group", body: "This is where the daily conversation happens and where you get help fastest. Join and say hi.", cta: "Join the group", link: "/ai-vault/whatsapp.html" },
    { position: 5, title: "The AI Toolbox", body: "The curated set of tools worth your money right now, kept current. Bookmark it.", cta: "Open the AI Toolbox", link: "https://jaygptpro.com/ai-toolbox" },
    { position: 6, title: "Live sessions and masterminds", body: "One deep dive and one mastermind every month. Add the next one to your calendar so you do not miss it.", cta: "See what is upcoming", link: "/ai-vault/live.html" },
    { position: 7, title: "Claim your quarterly 1-on-1", body: "A private strategy call with Jay, a $400 session, included every quarter. It expires if you do not use it.", cta: "Book your call", link: "/ai-vault/consultation.html" },
    { position: 8, title: "The Buying Club", body: "Member pricing on the tools you already pay for. Most members save more than the membership costs.", cta: "See member deals", link: "/ai-vault/tools.html" }
  ];

  return {
    member: {
      name: "Demo Member",
      email: "demo@example.com",
      avatar_url: "",
      member_number: 42,
      member_since: "2025-09-21",
      plan: "Monthly, $100",
      status: "active",
      is_admin: true,
      first_login: !localStorage.getItem("vault_seen_door")
    },
    episodes: episodes,
    lessons: lessons,
    sessions: [
      { kind: "episode", title: "AI Agents for Amazon Operations", guest_name: "Andrew Erickson", starts_at: now + 9 * day + 7200000, zoom_url: "#" },
      { kind: "mastermind", title: "Monthly Mastermind", guest_name: null, starts_at: now + 16 * day + 3600000, zoom_url: "#" },
      { kind: "episode", title: "Q3 AI Stack Refresh", guest_name: null, starts_at: now + 40 * day, zoom_url: null }
    ],
    consultations: [
      { quarter: "Q1 2026", status: "done", scheduled_for: null },
      { quarter: "Q2 2026", status: "done", scheduled_for: null },
      { quarter: "Q3 2026", status: "booked", scheduled_for: now + 13 * day + 5400000 },
      { quarter: "Q4 2026", status: "available", scheduled_for: null }
    ],
    member_counter: { base: 213, base_date: "2026-07-11", days_per_member: 2 },
    tags: ["All", "Images", "Listings", "Video", "Automation", "Claude Code", "Sourcing", "Research"]
  };
})();

/* round 3: demo challenge (started 2 days ago, day 3 unlocked today) */
window.VAULT_DEMO.challenge = (function () {
  var now = Date.now(), day = 86400000;
  return {
    slug: "ai-ambassador-challenge",
    title: "AI Ambassador 5-Day Challenge",
    description: "Five days, one AI brand ambassador for your store. Photos, voice, video, and a full content week, built by you.",
    hero_url: "/ai-vault/assets/img/dial-macro.jpg",
    status: "active",
    starts_at: now - 2 * day - 3600000,
    days: [
      { day_number: 1, title: "Design your ambassador", body: "Pick the face, the vibe, and the name. Generate 10 candidate portraits with the reference workflow and lock your favorite.\n- Run the ambassador portrait prompt\n- Generate 10 options\n- Lock ONE and save the reference set", vimeo_id: "1191120191", vimeo_hash: "" },
      { day_number: 2, title: "Give them a voice", body: "Clone a voice, write the tone guide, and produce your first 30-second intro clip.\n- Pick a voice\n- Write 5 tone rules\n- Render the intro clip", vimeo_id: "1191120191", vimeo_hash: "" },
      { day_number: 3, title: "First product video", body: "Your ambassador presents YOUR product. One 20-second clip, product in hand.\n- Prep the product reference images\n- Generate the scene\n- Lip-sync the script", vimeo_id: "1191120191", vimeo_hash: "" },
      { day_number: 4, title: "The content week", body: "Batch 7 posts in one sitting: 3 videos, 4 stills, all on brand.\n- Run the batch workflow\n- Schedule across the week", vimeo_id: "1191120191", vimeo_hash: "" },
      { day_number: 5, title: "Ship it + measure", body: "Publish, track, and decide what the ambassador does next month.\n- Publish the first 3 pieces\n- Set up the tracking sheet\n- Post your results in the WhatsApp group", vimeo_id: "1191120191", vimeo_hash: "" }
    ]
  };
})();

/* round 5: community QA, WhatsApp groups, programs catalog, member deals */
window.VAULT_DEMO.whatsapp = {
  updates_url: "https://chat.whatsapp.com/FWEhjKesDrvAP8wugfVbIs",
  community_url: ""  /* private group, admin approval. Jay pastes the invite link here (or in the DB) */
};

window.VAULT_DEMO.qa = (function () {
  var now = Date.now(), day = 86400000;
  return [
    { id: "q1", author: "Tal", created_at: now - 1 * day,
      body: "AI keeps deforming my product in lifestyle images. I tried maybe 20 times, the handle comes out melted every single time. What is the workflow?",
      replies: [
        { author: "Andrew", created_at: now - 1 * day + 3600000, body: "Reference sheet first, always. Lock a clean product reference set (4 angles, white bg), then generate scenes AROUND the reference. The Nano Banana episode covers the exact flow." },
        { author: "Jay", created_at: now - 1 * day + 7200000, body: "What Andrew said. Episode: Create Full Listing Images with Nano Banana Pro, minute 29 is your exact case. Bring it to the next Mastermind if it still fights you." }
      ] },
    { id: "q2", author: "Jason", created_at: now - 3 * day,
      body: "Helium 10 review export broke again this week. Anyone has a working alternative for pulling all reviews of an ASIN?",
      replies: [
        { author: "Michael", created_at: now - 3 * day + 5400000, body: "The scraper tool from the Review Mining episode still works, I pulled 4k reviews yesterday. Check the resources under that episode." }
      ] },
    { id: "q3", author: "Jona", created_at: now - 6 * day,
      body: "Is it safe to connect Claude Code to my Seller Central account? Worried about it touching live listings.",
      replies: [
        { author: "Roded", created_at: now - 6 * day + 4000000, body: "Use read-only SP-API keys for the first month. It can analyze everything and change nothing. That is how I run it for clients." },
        { author: "Jay", created_at: now - 5 * day, body: "Roded nailed it. Read-only first, write access only for flows you tested. The Claude Code episode has the exact key setup." }
      ] }
  ];
})();

window.VAULT_DEMO.programs = [
  { slug: "ai-ambassador-challenge", title: "AI Ambassador 5-Day Challenge", kind: "challenge", badge: "free_members",
    description: "Five days, one AI brand ambassador for your store. Photos, voice, video, and a full content week.",
    price_note: "Free for Vault members", coupon: "", url: "/ai-vault/challenges.html",
    image_url: "/ai-vault/assets/img/thumb-video.jpg" },
  { slug: "claude-code-challenge", title: "Your First AI Hire: Claude Code 5-Day Challenge", kind: "challenge", badge: "member_deal",
    description: "Build your first AI employee with Donna. The famous 5-day challenge, live cohort format.",
    price_note: "Special Vault member price", coupon: "VAULT-CC", url: "https://jaygptpro.com/claude-code-challenge-join",
    image_url: "/ai-vault/assets/img/thumb-claude.jpg" }
];

window.VAULT_DEMO.deals = [
  { name: "Genrupt", category: "AI Creative", deal_note: "$30/mo off + credit bonus", coupon: "JAY20", monthly_saving: 30, conditional: true, url: "https://genrupt.com",
    description: "Amazon listing images, A+ content, and product videos generated from an ASIN. Jay uses it on real accounts." },
  { name: "Top Dog Community", category: "Communities & Coaching", deal_note: "$100/mo off, while you're a Vault member", coupon: "VAULT-TD", monthly_saving: 100, conditional: true, url: "https://topdog.community",
    description: "Tomer's high-ticket seller community. Your Vault discount holds for as long as your membership is active." },
  { name: "Helium 10", category: "Research & Analytics", deal_note: "20% off every month", coupon: "VAULT20", monthly_saving: 40, conditional: true, url: "https://helium10.com",
    description: "The research, keyword, and operations suite most members already pay for. Member rate stacks monthly." },
  { name: "A2X Accounting", category: "Finance & Ops", deal_note: "2 months free", coupon: "VAULTA2X", monthly_saving: 0, conditional: false, url: "https://a2xaccounting.com",
    description: "Automated Amazon and Shopify bookkeeping into QuickBooks or Xero. Clean books without the manual work." }
];

/* round 8: testimonials for the join page.
   THESE ARE PLACEHOLDERS. Replace with real, approved member quotes before a public push. */
window.VAULT_DEMO.testimonials = [
  { quote: "Saved me about $2k on Fiverr and another $500 a month on tools I stopped needing. The listing image workflow paid for a year of membership in a week.", name: "A Vault member", role: "Amazon seller, US" },
  { quote: "I am not technical and I was worried I would fall behind. Every session gives me something I actually use the same day. This is really high level.", name: "A Vault member", role: "eCom seller, Israel" },
  { quote: "The community alone is worth it. I post a problem at night and by morning Jay or one of the experts has answered it.", name: "A Vault member", role: "Amazon seller, Romania" }
];
