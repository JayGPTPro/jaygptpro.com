import { handle, cleanLink, readFilms, type Deps, type Order } from "./handler.ts";
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const S = "cs_live_" + "a".repeat(40);
function world(qty = 5, paid = true) {
  const o: Order = { paid, qty, email: "buyer@example.com", name: "Buyer", paymentIntent: "pi_1", metadata: { project: "christmas_video" } };
  const mails: string[] = [];
  const deps: Deps = {
    order: (id) => Promise.resolve(id === S ? { ...o, metadata: { ...o.metadata } } : null),
    saveMeta: (_id, p) => { Object.assign(o.metadata, p); return Promise.resolve(); },
    mail: (s) => { mails.push(s); return Promise.resolve(true); },
  };
  return { o, mails, deps };
}
const post = (b: unknown) => new Request("https://x/f", { method: "POST", body: JSON.stringify(b) });

Deno.test("amazon link is cut to the product page", () => {
  assert(cleanLink("https://www.amazon.com/Some-Name/dp/b0chs2vnhc/ref=sr_1_1?crid=XYZ&keywords=a") === "https://www.amazon.com/dp/B0CHS2VNHC", "asin");
  assert(cleanLink("amazon.com/dp/B0CHS2VNHC") === "https://amazon.com/dp/B0CHS2VNHC", "no scheme");
  assert(cleanLink("not a link") === "", "garbage");
  assert(cleanLink("javascript:alert(1)") === "", "scheme");
  assert(cleanLink("https://shop.example.com/p/" + "x".repeat(400) + "?a=1").length <= 190, "long");
});
Deno.test("five videos take five different cards and each is mailed", async () => {
  const w = world(5);
  const fams = [["mom", "son"], ["dad", "daughter"], ["mom", "partner"], ["dad", "partner"], ["dad", "son"]];
  for (let n = 1; n <= 5; n++) {
    const r = await handle(post({ s: S, n, link: `https://www.amazon.com/dp/B00000000${n}`, giver: fams[n - 1][0], receiver: fams[n - 1][1] }), w.deps);
    const j = await r.json(); assert(r.status === 200 && j.done === n && j.qty === 5, "save " + n + JSON.stringify(j));
  }
  const films = readFilms(w.o.metadata, 5);
  assert(films.length === 5 && films[2].giver === "mom" && films[2].receiver === "partner" && films[4].link.endsWith("5"), "read back");
  assert(w.mails.length === 5 && w.mails[2].includes("Mom to Husband (Dad)") && w.mails[3].includes("Dad to Wife (Mom)"), "mails " + w.mails.join("|"));
  const g = await (await handle(new Request("https://x/f?s=" + S), w.deps)).json();
  assert(g.qty === 5 && g.films.length === 5 && g.email === "bu***@example.com", "get");
});
Deno.test("saving card 2 keeps card 1, which shares its key", async () => {
  const w = world(2);
  await handle(post({ s: S, n: 1, link: "https://www.amazon.com/dp/B000000001", giver: "mom", receiver: "son" }), w.deps);
  await handle(post({ s: S, n: 2, link: "https://www.amazon.com/dp/B000000002", giver: "dad", receiver: "daughter" }), w.deps);
  const f = readFilms(w.o.metadata, 2);
  assert(f.length === 2 && f[0].giver === "mom" && f[1].giver === "dad", JSON.stringify(w.o.metadata));
});
Deno.test("a changed card is mailed as changed, an unchanged one is not mailed again", async () => {
  const w = world(1);
  const card = { s: S, n: 1, link: "https://www.amazon.com/dp/B000000001", giver: "mom", receiver: "son" };
  await handle(post(card), w.deps); await handle(post(card), w.deps);
  assert(w.mails.length === 1, "no second mail");
  await handle(post({ ...card, giver: "dad" }), w.deps);
  assert(w.mails.length === 2 && w.mails[1].includes("(changed)"), "changed");
});
Deno.test("refuses: card beyond what was bought, unpaid, unknown session, bad values", async () => {
  const ok = { s: S, n: 1, link: "https://www.amazon.com/dp/B000000001", giver: "mom", receiver: "son" };
  assert((await handle(post({ ...ok, n: 3 }), world(2).deps)).status === 400, "n>qty");
  assert((await handle(post(ok), world(2, false).deps)).status === 404, "unpaid");
  assert((await handle(post({ ...ok, s: "cs_live_" + "b".repeat(40) }), world(2).deps)).status === 404, "unknown");
  assert((await handle(post({ ...ok, s: "x" }), world(2).deps)).status === 400, "bad s");
  assert((await handle(post({ ...ok, giver: "santa" }), world(2).deps)).status === 400, "giver");
  assert((await handle(post({ ...ok, receiver: "dog" }), world(2).deps)).status === 400, "receiver");
  assert((await handle(post({ ...ok, link: "" }), world(2).deps)).status === 400, "link");
  assert((await handle(new Request("https://x/f?s=" + S), world(0).deps)).status === 404, "skill order has no cards");
});
Deno.test("fifty videos fit in Stripe's 50 keys of 500 characters", async () => {
  const w = world(50);
  for (let n = 1; n <= 50; n++) await handle(post({ s: S, n, link: "https://shop.example.com/" + "p".repeat(300), giver: "dad", receiver: "partner" }), w.deps);
  const keys = Object.keys(w.o.metadata);
  assert(keys.length <= 50 && Object.values(w.o.metadata).every((v) => v.length <= 500) && readFilms(w.o.metadata, 50).length === 50, keys.length + " keys");
});
Deno.test("a card whose mail failed says so", async () => {
  const w = world(1); w.deps.mail = () => Promise.resolve(false);
  const j = await (await handle(post({ s: S, n: 1, link: "https://www.amazon.com/dp/B000000001", giver: "mom", receiver: "son" }), w.deps)).json();
  assert(j.ok === true && j.notified === false, JSON.stringify(j));
});
