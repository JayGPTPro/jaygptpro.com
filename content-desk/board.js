// Content Desk: the pure rules behind the Posts | Reels split, kept apart from the DOM so
// tests/board_test.ts can check them. desk.js imports these.

export const KINDS = ["text", "reel", "all"];
export const REEL_CHANNELS = ["instagram", "tiktok", "youtube", "linkedin"];
// the channels only a reel takes
export const REEL_ONLY = ["instagram", "tiktok", "youtube"];

export const isReel = (p) => !!p && p.kind === "reel";

// The viewer's saved choice, or All when it is missing or not one of the three.
export const savedKind = (v) => (KINDS.includes(v) ? v : "all");

// Does a post show under Posts, Reels or All?
export const kindOk = (kind, p) => kind === "all" || (kind === "reel" ? isReel(p) : !isReel(p));

// The channels a card offers: a reel gets the reel channels, a text post every other one.
// WhatsApp stays on both: it holds the first draft and the final, the steps that move a card.
// A channel that already has a version always shows, so nothing written disappears.
export const channelFits = (p, ch, hasVersion = false) =>
  ch === "whatsapp" || hasVersion || (isReel(p) ? REEL_CHANNELS.includes(ch) : !REEL_ONLY.includes(ch));

// The reels made from a post.
export const reelsOf = (posts, pid) => posts.filter((x) => x.source_post_id === pid);

// The new card "Turn into a reel" inserts: same title and category, linked back to the post.
export const reelFromPost = (p) => ({
  title: p.title, category: p.category, stage: "idea", status: "waiting", kind: "reel", source_post_id: p.id,
});
