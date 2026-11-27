// The Posts | Reels split and "Turn into a reel" on the board (content-desk/board.js). No DOM, no database.
import { assertEquals } from "jsr:@std/assert@1";
import { channelFits, kindOk, reelFromPost, reelsOf, savedKind } from "../board.js";

const text = { id: "a", kind: "text", title: "Reviews into bullets", category: "tip" };
const reel = { id: "b", kind: "reel", title: "A reel", source_post_id: "a" };
const old = { id: "c", title: "A post from before migration 6" }; // no kind: a text post

Deno.test("board: the kind switch shows posts, reels or both", () => {
  const all = [text, reel, old];
  assertEquals(all.filter((p) => kindOk("text", p)).map((p) => p.id), ["a", "c"]);
  assertEquals(all.filter((p) => kindOk("reel", p)).map((p) => p.id), ["b"]);
  assertEquals(all.filter((p) => kindOk("all", p)).map((p) => p.id), ["a", "b", "c"]);
});

Deno.test("board: the saved choice comes back, anything else is All", () => {
  assertEquals([savedKind("reel"), savedKind("text"), savedKind("all")], ["reel", "text", "all"]);
  assertEquals([savedKind(null), savedKind("carousel"), savedKind("")], ["all", "all", "all"]);
});

Deno.test("board: a reel offers the reel channels, a post the text channels", () => {
  const chans = ["whatsapp", "email", "linkedin", "x", "facebook", "threads", "instagram", "tiktok", "youtube", "whatsapp_he"];
  assertEquals(chans.filter((c) => channelFits(reel, c)), ["whatsapp", "linkedin", "instagram", "tiktok", "youtube"]);
  assertEquals(chans.filter((c) => channelFits(text, c)), ["whatsapp", "email", "linkedin", "x", "facebook", "threads", "whatsapp_he"]);
  // a version already written always shows, so nothing disappears
  assertEquals(channelFits(text, "instagram", true), true);
});

Deno.test("board: Turn into a reel makes a reel idea with the post's title, linked back", () => {
  assertEquals(reelFromPost(text), { title: "Reviews into bullets", category: "tip", stage: "idea", status: "waiting", kind: "reel", source_post_id: "a" });
  assertEquals(reelsOf([text, reel, old], "a").map((p: { id: string }) => p.id), ["b"]);
  assertEquals(reelsOf([text, reel, old], "c"), []);
});
