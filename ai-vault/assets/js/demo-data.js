/* AI VAULT demo data. Used only when VAULT_CONFIG is empty (demo mode).
   Lets the whole portal render before Supabase exists.
   Episode titles, dates, guests, descriptions, likes, and resources are the REAL
   23 episodes from the current Circle space (captured 2026-07-16, see
   AI VAULT/docs/research/circle-episodes-raw.md). Durations are estimates until
   the real videos are uploaded. All demo videos point at a sample Vimeo video;
   real episodes replace them via the admin. */

window.VAULT_DEMO = (function () {
  var now = Date.now();
  var day = 86400000;
  var V = "1191120191"; // sample public Vimeo video for the demo
  var IMG = "/ai-vault/assets/img/";

  function ep(n, slug, title, guest, tags, thumb, mins, dateStr, likes, desc, resources, chapters, updated) {
    return {
      ep_number: n, slug: slug, title: title, guest_name: guest, tags: tags,
      thumbnail_url: IMG + thumb, duration_seconds: mins * 60,
      published_at: new Date(dateStr + "T12:00:00").getTime(), likes: likes, updated_note: updated || null,
      vimeo_id: V, vimeo_hash: "", description: desc,
      resources: resources || [], chapters: chapters || []
    };
  }

  var episodes = [
    ep(23, "brand-book-product-inserts", "Brand Book & Product Inserts with Claude Code", "Tomer Rabinovich", ["Claude Code"], "thumb-claude.jpg", 75, "2026-06-25", 2,
      "Tomer Rabinovich builds a brand book Claude can actually use, then turns it into product inserts customers scan: QR flows, landing pages, and follow-up done right.",
      [{ kind: "file", title: "Brand Book Builder skill" }, { kind: "file", title: "Insert Creator skill" }, { kind: "link", title: "Claude Design", url: "https://claude.ai/design" }, { kind: "link", title: "Tomer's 5 Day Customer Challenge", url: "https://jointopdog.com/5day-customer-challenge" }]),
    ep(22, "claude-code-meets-amazon", "Claude Code Meets Amazon", null, ["Claude Code"], "thumb-claude.jpg", 90, "2026-05-21", 11,
      "The direct follow up to the Claude Code session, deep into Amazon: SQP funnel diagnostics, market basket analysis, competitor gold mining, IDQ audits, and the skills Jay runs on his own brand.",
      [{ kind: "link", title: "Episode resources, skills, and install instructions", url: "https://jaygptpro.com/claude-code-amazon/" }, { kind: "link", title: "AI Vault custom skills, one line install", url: "https://github.com/JayGPTPro/aivault-amazon-skills" }, { kind: "link", title: "49 free Amazon skills (nexscope)", url: "https://github.com/nexscope-ai/Amazon-Skills" }]),
    ep(21, "claude-code-next-level", "Claude Code: The Next Level of AI", null, ["Claude Code", "Automation"], "thumb-claude.jpg", 120, "2026-04-14", 9,
      "From installation to building custom eCommerce tools to a fully autonomous AI employee. The massive live session that closes the gap between chatting with AI and building systems.",
      [{ kind: "link", title: "Jay's custom instructions and guide", url: "https://jaygptpro.com/custom-ai-instructions.html" }, { kind: "link", title: "The full hacks library", url: "https://jaygptpro.com/daily-claude-hacks" }, { kind: "link", title: "Amazon Landing Page skill", url: "https://jaygptpro.com/claude/amazon-landing-page-skill.html" }]),
    ep(20, "powerful-ai-prompts", "The Secrets Behind Powerful AI Prompts", null, ["Research"], "dial-macro.jpg", 70, "2026-03-12", 13,
      "The Architect Method: a 6 step system for building prompts that work again and again, demoed live from scratch on a real Amazon product.",
      [{ kind: "link", title: "The Prompt Vault", url: "https://prompt.jaygptpro.com" }, { kind: "prompt", title: "Deep Amazon Product Analysis prompt" }]),
    ep(19, "brand-app-vibe-coding", "Build Your Brand App with Vibe Coding", "Andrew Erickson", ["Automation"], "thumb-automation.jpg", 80, "2026-02-12", 5,
      "Why interactive utilities are replacing static PDFs, and how to build and publish a working brand app in an afternoon without traditional coding.",
      [{ kind: "prompt", title: "Andrew's prompt guide" }, { kind: "file", title: "Shopify integration SOP" }], null, "Part 2 added"),
    ep(18, "ai-ambassador-challenge", "The Full AI Ambassador Workflow: 5-Day Challenge", null, ["Video"], "thumb-video.jpg", 87, "2026-01-08", 17,
      "Five days, one AI brand ambassador: brand DNA, casting, identity lock, a custom content agent, and a finished vertical UGC video.",
      [{ kind: "link", title: "Prompts and checklists, day by day", url: "https://jaygptpro.com/ai-ambassador-challenge.html" }, { kind: "link", title: "Bonus: CapCut editing walkthrough", url: "https://www.youtube.com/watch?v=keMgxb42hDw" }]),
    ep(17, "nano-banana-pro-listing-images", "Live Workshop: Create Full Listing Images with Nano Banana Pro", "Michael Shackelford", ["Images"], "thumb-images.jpg", 93, "2025-12-04", 21,
      "The most liked session in Vault history. A complete Amazon listing image set built live: main images, lifestyle scenes, infographics, and a one click Christmas version.",
      [{ kind: "link", title: "Jay's prompt pack from the workshop", url: "https://jaygptpro.com/amazon-listing-images.html" }, { kind: "link", title: "Nano Banana Pro inside AI Studio", url: "https://aistudio.google.com" }]),
    ep(16, "rufus-aeo-listings", "Writing Amazon Listings with AI: Optimized for Rufus and AEO", null, ["Listings"], "thumb-listings.jpg", 78, "2025-11-06", 13,
      "A three step workflow for listings that speak to humans, rank for SEO, and make sense to Rufus and ChatGPT: review analysis, keyword research, listing generation.",
      [{ kind: "prompt", title: "Prompt pack with all three prompts" }]),
    ep(15, "sourcing-china-ai", "The 4-Step AI Framework for Sourcing from China", "Alex Jurca", ["Sourcing"], "thumb-sourcing.jpg", 85, "2025-10-23", 3,
      "Source smarter, safer, and faster: supplier discovery beyond Alibaba, AI vetting prompts that score risk, compliance validation, and spotting trending products first.",
      [{ kind: "file", title: "Full presentation with all prompts" }]),
    ep(14, "ai-product-ideation", "AI Product Ideation with Andrew Erickson", "Andrew Erickson", ["Research"], "dial-macro.jpg", 65, "2025-10-16", 7,
      "Keyword intent clusters, the 80 20 innovation rule, and a custom GPT that turns Amazon data into ten differentiated product ideas.",
      [{ kind: "link", title: "Product Dev GPT", url: "https://chatgpt.com/g/g-68a316448ee08191bd7105697b19f45a-product-dev-gpt" }]),
    ep(13, "sora-2-deep-dive", "Deep Dive into Sora 2, the Next Gen Video Creation Tool", null, ["Video"], "thumb-video.jpg", 68, "2025-10-09", 4,
      "Everything sellers need to start making real product videos with Sora 2, from first signup to the finished, watermark free clip.",
      [{ kind: "prompt", title: "The two Sora prompts from the episode" }, { kind: "link", title: "Sora 2", url: "https://sora.com" }]),
    ep(12, "canva-ai-secrets", "The Canva AI Secrets That Every Seller Should Know", "John Aspinall", ["Images"], "thumb-images.jpg", 62, "2025-09-30", 10,
      "Magic Background Remover, Magic Eraser, Magic Edit, seasonal visuals without a designer, and the VEO 3 integration.",
      [{ kind: "link", title: "Canva", url: "https://www.canva.com" }]),
    ep(11, "community-live-session", "Let's Talk AI Together: Community Live Session", null, ["Community"], "dial-macro.jpg", 60, "2025-09-25", 6,
      "Member introductions, live polls, the Nano Banana prompt library reveal, a new tools spotlight, and the book club launch.",
      [{ kind: "link", title: "Nano Banana prompt library", url: "https://promptaivault.lovable.app/" }]),
    ep(10, "n8n-automation", "Intro to Automation with n8n", "Roded Yizhaky", ["Automation"], "thumb-automation.jpg", 50, "2025-09-18", 5,
      "Your first real automation, built step by step: invoices pulled from Gmail and saved to Drive automatically.",
      [{ kind: "file", title: "The workflow JSON from the episode" }],
      [{ title: "Intro and meet Roded", starts_at: 0 }, { title: "What is n8n and why it matters", starts_at: 190 }, { title: "Gmail and Drive credentials", starts_at: 460 }, { title: "Building the Gmail trigger", starts_at: 860 }, { title: "Filters and expressions", starts_at: 1170 }, { title: "Saving files to Google Drive", starts_at: 1560 }, { title: "First workflow test", starts_at: 1950 }, { title: "Expanding to more use cases", starts_at: 2220 }, { title: "FAQs and next steps", starts_at: 2520 }]),
    ep(9, "product-lifestyle-video", "Live Workshop: Create a Full Product Lifestyle Video with AI", null, ["Video"], "thumb-video.jpg", 120, "2025-09-11", 8,
      "The videos that used to cost thousands, made for a few dollars: scene planning from reviews, AI images, cinematic motion, and the final edit.",
      [{ kind: "prompt", title: "Ready to use video prompts", url: "https://jaygptpro.com/product-video-prompts.html" }]),
    ep(8, "nano-banana-deep-dive", "A Deep Dive into Gemini 2.5 Flash Image (Nano Banana)", "Michael Shackelford", ["Images"], "thumb-images.jpg", 70, "2025-08-28", 12,
      "The fastest, most accurate AI image editor so far: consistent products across angles, text replacement, prop swaps, and brand level consistency."),
    ep(7, "ai-review-loop", "AI Review Loop with Andrew Erickson", "Andrew Erickson", ["Automation"], "thumb-automation.jpg", 75, "2025-08-21", 11,
      "One AI critiques another: n8n flows that generate, judge, and refine content from a B plus to an A plus result.",
      [{ kind: "file", title: "The n8n flow from the episode" }]),
    ep(6, "smarter-video-ads", "Smarter Video Ads with AI", null, ["Video"], "thumb-video.jpg", 55, "2025-08-14", 8,
      "One smart prompt plus VEO 3: keyword matching video ads for Sponsored Brand Video campaigns that lift CTR without editing or outsourcing.",
      [{ kind: "prompt", title: "VEO 3 Master Specialist prompt", url: "https://jaygptpro.com/veo3-master-specialist.html" }]),
    ep(5, "genspark-deep-dive", "A Deep Dive into GenSpark", null, ["Research", "Automation"], "dial-macro.jpg", 60, "2025-08-07", 9,
      "While ChatGPT gives you guidance, GenSpark completes tasks: slides, sheets, docs, images, videos, and the Super Agent workflow that runs it all."),
    ep(4, "custom-gpts-ecom", "Build Custom GPTs for eCom Workflows", null, ["Automation"], "thumb-automation.jpg", 72, "2025-07-31", 11,
      "Why custom GPTs beat regular chats for recurring tasks, and the six building blocks of every great one: identity, context, tone, process, rules, knowledge.",
      [{ kind: "link", title: "Custom GPT Architect", url: "https://chatgpt.com/g/g-6888d7adb23c81918ed9ac5a5265bc25-custom-gpt-architect" }]),
    ep(3, "voc-ai-reviews", "Master Reviews with VOC AI", null, ["Research"], "dial-macro.jpg", 65, "2025-07-24", 7,
      "Analyze up to 30 ASINs and 50,000 reviews, spot trends, optimize listings, and trigger removal cases for bad reviews with a click.",
      [{ kind: "link", title: "VOC AI", url: "https://insight.voc.ai/" }]),
    ep(2, "listing-images-that-convert", "Create Listing Images That Convert", null, ["Images"], "thumb-images.jpg", 70, "2025-07-21", 7,
      "A step by step workshop for planning, generating, and designing product images that drive conversions.",
      [{ kind: "prompt", title: "The image prompts", url: "https://jaygptpro.com/product-image-prompts.html" }]),
    ep(1, "deep-product-analysis", "Deep Product Analysis with 2 AI Prompts", null, ["Research"], "dial-macro.jpg", 55, "2025-07-14", 9,
      "Turn Amazon reviews into a clear map of buyer avatars, pain points, and purchase drivers.",
      [{ kind: "prompt", title: "The analysis prompts", url: "https://jaygptpro.com/analysis-prompts.html" }])
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
    /* real cadence: monthly episode on a Thursday evening IDT, mastermind on the
       first Wednesday at 12pm EST (dates from the Circle calendar, 2026-07-16) */
    sessions: [
      { kind: "episode", title: "Monthly AI Episode: July", guest_name: null, starts_at: new Date("2026-07-30T21:00:00+03:00").getTime(), zoom_url: "#" },
      { kind: "mastermind", title: "Monthly Mastermind", guest_name: null, starts_at: new Date("2026-08-05T12:00:00-04:00").getTime(), zoom_url: "#" },
      { kind: "episode", title: "Monthly AI Episode: August", guest_name: null, starts_at: new Date("2026-08-27T21:00:00+03:00").getTime(), zoom_url: null }
    ],
    consultations: [
      { quarter: "Q1 2026", status: "done", scheduled_for: null },
      { quarter: "Q2 2026", status: "done", scheduled_for: null },
      { quarter: "Q3 2026", status: "booked", scheduled_for: now + 13 * day + 5400000 },
      { quarter: "Q4 2026", status: "available", scheduled_for: null }
    ],
    member_counter: { base: 213, base_date: "2026-07-11", days_per_member: 2 },
    tags: ["All", "Images", "Listings", "Video", "Automation", "Claude Code", "Sourcing", "Research", "Community"]
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
