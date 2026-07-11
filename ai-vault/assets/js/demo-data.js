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
    { position: 1, title: "Welcome to the Vault", duration_seconds: 300, body: "What is inside, how to use it, and your first 10 minutes." },
    { position: 2, title: "Your quick win: run your first prompt", duration_seconds: 480, body: "Take one Prompt Vault prompt and run it on your own listing. Today." },
    { position: 3, title: "The episode library, your way", duration_seconds: 360, body: "Find episodes by problem, not by date." },
    { position: 4, title: "The WhatsApp group", duration_seconds: 240, body: "Where the daily conversation happens and how to get help fast." },
    { position: 5, title: "Prompt Vault and AI Toolbox", duration_seconds: 420, body: "Your two external compartments and when to reach for each." },
    { position: 6, title: "Live sessions and replays", duration_seconds: 300, body: "How the monthly deep dives work and where replays land." },
    { position: 7, title: "Your quarterly 1-on-1", duration_seconds: 240, body: "You get a private strategy call with Jay every quarter. Book it." },
    { position: 8, title: "The seller AI stack", duration_seconds: 600, body: "The minimal set of tools worth your money right now." }
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
