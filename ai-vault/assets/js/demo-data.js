/* AI VAULT demo data. Used only when VAULT_CONFIG is empty (demo mode).
   Lets the whole portal render before Supabase exists. */

window.VAULT_DEMO = (function () {
  var now = Date.now();
  var day = 86400000;

  var episodes = [
    { ep_number: 17, slug: "skills-for-claude-code", title: "Skills for Claude Code", guest_name: null, tags: ["Claude Code", "Automation"], duration_seconds: 4980, published_at: now - 20 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "Turn your best workflows into reusable skills your AI employee runs on command.", resources: [ { kind: "prompt", title: "Skill starter template" }, { kind: "link", title: "Skills documentation" }, { kind: "file", title: "Session slides (PDF)" } ], chapters: [ { title: "Why skills change everything", starts_at: 0 }, { title: "Anatomy of a skill", starts_at: 620 }, { title: "Live build: listing audit skill", starts_at: 1740 }, { title: "Testing and evals", starts_at: 3300 }, { title: "Q&A", starts_at: 4200 } ] },
    { ep_number: 16, slug: "claude-code-for-ecom", title: "Claude Code for eCom Sellers", guest_name: null, tags: ["Claude Code"], duration_seconds: 5400, published_at: now - 50 * day, updated_note: "Part 2 added", vimeo_id: "", vimeo_hash: "", description: "The most requested episode ever. Your first AI employee, working on your Amazon business.", resources: [ { kind: "prompt", title: "CLAUDE.md starter for sellers" }, { kind: "link", title: "Install guide" } ], chapters: [ { title: "Setup in 10 minutes", starts_at: 0 }, { title: "First real task", starts_at: 900 }, { title: "MCP connections", starts_at: 2400 } ] },
    { ep_number: 15, slug: "ai-prompts-masterclass", title: "AI Prompts That Sell: The Masterclass", guest_name: null, tags: ["Listings", "Research"], duration_seconds: 4200, published_at: now - 80 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "The exact prompt patterns behind listings, ads, and emails that convert.", resources: [ { kind: "prompt", title: "The 12 seller prompt patterns" } ], chapters: [] },
    { ep_number: 14, slug: "brand-apps-andrew", title: "Brand Apps with Andrew Erickson", guest_name: "Andrew Erickson", tags: ["Video", "Images"], duration_seconds: 4650, published_at: now - 110 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "Custom brand applications that multiply your creative output.", resources: [ { kind: "link", title: "Andrew's app stack" } ], chapters: [] },
    { ep_number: 13, slug: "voc-ai-reviews", title: "Review Mining with VOC AI", guest_name: null, tags: ["Research"], duration_seconds: 3900, published_at: now - 140 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "Turn thousands of reviews into product decisions in minutes.", resources: [ { kind: "link", title: "VOC AI setup" }, { kind: "prompt", title: "Review insight extraction prompt" } ], chapters: [] },
    { ep_number: 12, slug: "genspark-deep-dive", title: "GenSpark Deep Dive", guest_name: null, tags: ["Research", "Automation"], duration_seconds: 3600, published_at: now - 170 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "The AI research agent that does competitor homework for you.", resources: [], chapters: [] },
    { ep_number: 11, slug: "sourcing-china-ai", title: "Sourcing from China with AI", guest_name: "Alex Jurca", tags: ["Sourcing"], duration_seconds: 5100, published_at: now - 200 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "Supplier discovery, negotiation scripts, and QC checklists, all AI-assisted.", resources: [ { kind: "file", title: "Negotiation script pack" } ], chapters: [] },
    { ep_number: 10, slug: "n8n-automation", title: "n8n Automation for Amazon", guest_name: "Roded Yizhaky", tags: ["Automation"], duration_seconds: 4800, published_at: now - 230 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "Hands-off workflows connecting SP-API, Ads API, and your inbox.", resources: [ { kind: "link", title: "Workflow templates" } ], chapters: [] },
    { ep_number: 9, slug: "canva-ai-sellers", title: "Canva AI for Sellers", guest_name: "John Aspinall", tags: ["Images"], duration_seconds: 3700, published_at: now - 260 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "Fast, on-brand creatives without a designer.", resources: [], chapters: [] },
    { ep_number: 8, slug: "sora-lifestyle-videos", title: "Product Lifestyle Videos with Sora 2", guest_name: null, tags: ["Video"], duration_seconds: 4400, published_at: now - 290 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "Scroll-stopping lifestyle video from nothing but your product photos.", resources: [ { kind: "prompt", title: "Sora scene prompts" } ], chapters: [] },
    { ep_number: 7, slug: "ai-video-ads", title: "AI Video Ads: VEO 3 and Kling", guest_name: null, tags: ["Video"], duration_seconds: 4100, published_at: now - 320 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "15-second ads that used to cost $1,500, now $1.50.", resources: [], chapters: [] },
    { ep_number: 6, slug: "ai-review-loop", title: "The AI Review Loop", guest_name: "Andrew Erickson", tags: ["Research", "Listings"], duration_seconds: 4500, published_at: now - 350 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "A closed loop from reviews to listing fixes to ranking gains.", resources: [ { kind: "prompt", title: "Review loop prompts" } ], chapters: [] },
    { ep_number: 5, slug: "custom-gpts-ecom", title: "Build Custom GPTs for eCom Workflows", guest_name: null, tags: ["Automation"], duration_seconds: 4300, published_at: now - 380 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "Your knowledge, packaged into assistants your team actually uses.", resources: [], chapters: [] },
    { ep_number: 4, slug: "gemini-flash-image", title: "Gemini 2.5 Flash Image", guest_name: null, tags: ["Images"], duration_seconds: 3500, published_at: now - 410 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "The fastest way to production-grade product imagery.", resources: [], chapters: [] },
    { ep_number: 3, slug: "rufus-aeo-listings", title: "Writing Amazon Listings with AI: Rufus and AEO", guest_name: "Andre Queiroz", tags: ["Listings"], duration_seconds: 4700, published_at: now - 440 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "Listings optimized for the AI shopping assistant era.", resources: [ { kind: "prompt", title: "AEO listing prompts" } ], chapters: [] },
    { ep_number: 2, slug: "ambassador-challenge", title: "AI Ambassador Workflow: 5-Day Challenge", guest_name: null, tags: ["Automation", "Video"], duration_seconds: 5200, published_at: now - 470 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "The full 5-day system for AI brand ambassadors.", resources: [ { kind: "file", title: "Challenge workbook" } ], chapters: [] },
    { ep_number: 1, slug: "nano-banana-listing-images", title: "Create Full Listing Images with Nano Banana Pro", guest_name: "Michael Shackelford", tags: ["Images"], duration_seconds: 5600, published_at: now - 500 * day, updated_note: null, vimeo_id: "", vimeo_hash: "", description: "The most-liked session in Vault history. A complete listing image set, live.", resources: [ { kind: "prompt", title: "Listing image prompt system" }, { kind: "file", title: "Reference sheet template" } ], chapters: [] }
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
    next_session: {
      title: "AI Agents for Amazon Operations",
      guest_name: "Andrew Erickson",
      starts_at: now + 9 * day + 7200000,
      zoom_url: "#"
    },
    tags: ["All", "Images", "Listings", "Video", "Automation", "Claude Code", "Sourcing", "Research"]
  };
})();
