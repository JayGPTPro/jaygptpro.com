// deno test supabase/functions/archive-api/test/
import { assertEquals } from "jsr:@std/assert@1";
import { type Decision, type Deps, handle, MAX_PER_VISITOR } from "../handler.ts";

function memory(): Deps & { rx: Map<string, string>; dec: Map<string, Decision> } {
  const rx = new Map<string, string>(); // "post|visitor" -> emoji
  const dec = new Map<string, Decision>();
  return {
    rx,
    dec,
    reactions: async () => {
      const out = new Map<string, number>();
      for (const [k, e] of rx) {
        const key = k.split("|")[0] + "|" + e;
        out.set(key, (out.get(key) || 0) + 1);
      }
      return [...out].map(([k, n]) => ({ post: k.split("|")[0], emoji: k.split("|")[1], n }));
    },
    decisions: async () => [...dec].map(([post, decision]) => ({ post, decision })),
    visitorCount: async (v) => [...rx.keys()].filter((k) => k.endsWith("|" + v)).length,
    setReaction: async (p, v, e) => void (e === null ? rx.delete(p + "|" + v) : rx.set(p + "|" + v, e)),
    setDecision: async (p, d) => void (d === null ? dec.delete(p) : dec.set(p, d)),
  };
}

const post = (body: unknown) => new Request("http://x/", { method: "POST", body: JSON.stringify(body) });
const POST_ID = "20261104173153";
const VISITOR = "abcdefghij0123456789";
// the real key is not in the repo; this test proves a wrong one is refused
const WRONG_KEY = "not-the-admin-key";

Deno.test("a reaction is stored, changed and taken back, one per visitor", async () => {
  const db = memory();
  assertEquals((await handle(post({ action: "react", post: POST_ID, visitor: VISITOR, emoji: "👍" }), db)).status, 200);
  await handle(post({ action: "react", post: POST_ID, visitor: VISITOR, emoji: "❤️" }), db);
  let state = await (await handle(new Request("http://x/"), db)).json();
  assertEquals(state.reactions, { [POST_ID]: { "❤️": 1 } });
  await handle(post({ action: "react", post: POST_ID, visitor: VISITOR, emoji: "" }), db);
  state = await (await handle(new Request("http://x/"), db)).json();
  assertEquals(state.reactions, {});
});

Deno.test("bad input is refused with 401", async () => {
  const db = memory();
  for (const body of [
    {},
    { action: "react", post: "1", visitor: VISITOR, emoji: "👍" },
    { action: "react", post: POST_ID, visitor: "x", emoji: "👍" },
    { action: "react", post: POST_ID, visitor: VISITOR, emoji: "<script>" },
    { action: "drop", post: POST_ID },
  ]) {
    assertEquals((await handle(post(body), db)).status, 401, JSON.stringify(body));
  }
  assertEquals((await handle(new Request("http://x/", { method: "POST", body: "not json" }), db)).status, 401);
  assertEquals(db.rx.size, 0);
});

Deno.test("hide and show need the admin key", async () => {
  const db = memory();
  assertEquals((await handle(post({ action: "hide", post: POST_ID }), db)).status, 401);
  assertEquals((await handle(post({ action: "hide", post: POST_ID, admin: WRONG_KEY }), db)).status, 401);
  assertEquals(db.dec.size, 0);
});

Deno.test("one visitor cannot react to more posts than the cap", async () => {
  const db = memory();
  for (let i = 0; i < MAX_PER_VISITOR; i++) db.rx.set(String(20260101000000 + i) + "|" + VISITOR, "👍");
  assertEquals((await handle(post({ action: "react", post: POST_ID, visitor: VISITOR, emoji: "👍" }), db)).status, 429);
  // taking one back still works at the cap
  assertEquals((await handle(post({ action: "react", post: "20260101000000", visitor: VISITOR, emoji: "" }), db)).status, 200);
});
