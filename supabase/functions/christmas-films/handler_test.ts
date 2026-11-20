import { handle, cleanLink, readFilms, BONUS_START, BONUS_END, BF_END, SKILL_PRICE_BF, SKILL_PRICE_FULL, type Deps, type Order } from "./handler.ts";
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const S = "cs_live_" + "a".repeat(40);
const BEFORE = BONUS_START - 3600; // an order placed before launch day: no bonus, as before
function world(qty = 5, paid = true, created = BEFORE, opts: { vault?: boolean; earlier?: boolean; paidAt?: number; vaultClaimed?: boolean; bonusOrder?: boolean; now?: number } = {}) {
  const o: Order = { paid, qty, email: "buyer@example.com", name: "Buyer", paymentIntent: "pi_1", metadata: { project: "christmas_video" }, created, paidAt: opts.paidAt ?? 0, vault: !!opts.vault };
  const vaultRecords: string[] = [], checkouts: string[] = [];
  const mails: string[] = [];
  const deps: Deps = {
    order: (id) => Promise.resolve(id === S ? { ...o, metadata: { ...o.metadata } } : null),
    saveMeta: (_id, p) => { Object.assign(o.metadata, p); return Promise.resolve(); },
    mail: (s) => { mails.push(s); return Promise.resolve(true); },
    earlierFilmOrder: () => Promise.resolve(!!opts.earlier),
    vaultClaimed: (e) => Promise.resolve(!!opts.vaultClaimed || vaultRecords.includes(e)),
    vaultRecord: (e) => { vaultRecords.push(e); return Promise.resolve(); },
    bonusOrder: () => Promise.resolve(!!opts.bonusOrder),
    skillCheckout: (price) => { checkouts.push(price); return Promise.resolve("https://checkout.stripe.com/c/pay/cs_test_x"); },
    now: () => opts.now ?? Math.floor(Date.now() / 1000),
  };
  return { o, mails, deps, vaultRecords, checkouts };
}
const post = (b: unknown) => new Request("https://x/f", { method: "POST", body: JSON.stringify(b) });

Deno.test("amazon link is cut to the product page", () => {
  assert(cleanLink("https://www.amazon.com/Some-Name/dp/b0chs2vnhc/ref=sr_1_1?crid=XYZ&keywords=a") === "https://www.amazon.com/dp/B0CHS2VNHC", "asin");
  assert(cleanLink("amazon.com/dp/B0CHS2VNHC") === "https://amazon.com/dp/B0CHS2VNHC", "no scheme");
  assert(cleanLink("not a link") === "", "garbage");
  assert(cleanLink("javascript:alert(1)") === "", "scheme");
  assert(cleanLink("https://shop.example.com/p/" + "x".repeat(400) + "?a=1").length <= 190, "long");
});
Deno.test("a bare ASIN and every Amazon link form become the product page", () => {
  const D = "https://www.amazon.com/dp/B07S6K6B27";
  assert(cleanLink("B07S6K6B27") === D, "bare");
  assert(cleanLink("  b07s6k6b27 ") === D, "bare, lower case, spaces");
  assert(cleanLink("0316769487") === "https://www.amazon.com/dp/0316769487", "isbn asin");
  assert(cleanLink("031676948X") === "https://www.amazon.com/dp/031676948X", "isbn asin with X");
  assert(cleanLink("https://www.amazon.com/gp/product/B07S6K6B27/ref=ppx_yo_dt_b?ie=UTF8&psc=1") === D, "gp/product");
  assert(cleanLink("https://www.amazon.com/gp/aw/d/B07S6K6B27?th=1") === D, "gp/aw/d");
  assert(cleanLink("https://www.Amazon.com/Kids-Toy-Long-Name-Here/dp/B07S6K6B27/ref=sr_1_3?crid=2ABC&dib=eyJ2IjoiMSJ9." + "x".repeat(600) + "&keywords=toy&qid=1&sr=8-3&th=1") === D, "very long link");
  assert(cleanLink("https://www.amazon.com/dp/B07S6K6B27#customerReviews") === D, "hash");
  assert(cleanLink("https://www.amazon.co.uk/o/ASIN/B07S6K6B27") === "https://www.amazon.co.uk/dp/B07S6K6B27", "o/ASIN, other market");
  assert(cleanLink("https://www.amazon.com/s?k=toy&asin=B07S6K6B27") === D, "asin query");
  assert(cleanLink("https://amzn.to/3abcXYZ") === "https://amzn.to/3abcXYZ", "short link kept");
  assert(cleanLink("B07S6K6B2") === "", "nine characters is not an ASIN");
  assert(cleanLink("https://www.amazon.com/dp/B07S6K6B27") === D, "already clean stays the same");
});
Deno.test("a card saved with a bare ASIN, and a short link followed to its ASIN", async () => {
  const w = world(2);
  const r = await handle(post({ s: S, n: 1, link: "B07S6K6B27", giver: "dad", receiver: "son" }), w.deps);
  const j = await r.json();
  assert(r.status === 200 && j.link === "https://www.amazon.com/dp/B07S6K6B27", "bare asin saved " + JSON.stringify(j));
  w.deps.resolveShort = (u) => Promise.resolve(u === "https://a.co/d/abc123" ? "https://www.amazon.com/Toy/dp/B0D4YZRK2M?ref=x" : u);
  const r2 = await handle(post({ s: S, n: 2, link: "https://a.co/d/abc123", giver: "mom", receiver: "toddler" }), w.deps);
  const j2 = await r2.json();
  assert(r2.status === 200 && j2.link === "https://www.amazon.com/dp/B0D4YZRK2M", "short followed " + JSON.stringify(j2));
  w.deps.resolveShort = () => Promise.reject(new Error("offline"));
  const r3 = await handle(post({ s: S, n: 2, link: "amzn.to/3abc", giver: "mom", receiver: "toddler" }), w.deps);
  assert((await r3.json()).link === "https://amzn.to/3abc", "short kept when it cannot be followed");
  const bad = await (await handle(post({ s: S, n: 1, link: "toy", giver: "dad", receiver: "son" }), w.deps)).json();
  assert(bad.error === "link" && /ASIN/.test(bad.message), "error names the ASIN");
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

const IN = BONUS_START + 5 * 3600; // Thursday 19.11, 05:00 PST
const get = async (deps: Deps) => await (await handle(new Request("https://x/f?s=" + S), deps)).json();
Deno.test("bonus: one film bought on launch day gives two cards", async () => {
  const w = world(1, true, IN);
  const g = await get(w.deps);
  assert(g.qty === 2 && g.paid === 1 && g.bonus === true, JSON.stringify(g));
  assert(w.o.metadata.bonus === "1", "frozen");
  const r = await handle(post({ s: S, n: 2, link: "https://www.amazon.com/dp/B000000002", giver: "dad", receiver: "son" }), w.deps);
  assert(r.status === 200 && w.mails[0].includes("2 of 2 (free bonus)"), w.mails.join("|"));
});
Deno.test("bonus: five films bought give exactly six cards, never more", async () => {
  const w = world(5, true, IN);
  const g = await get(w.deps); assert(g.qty === 6 && g.bonus === true, JSON.stringify(g));
  assert((await handle(post({ s: S, n: 7, link: "https://www.amazon.com/dp/B000000007", giver: "dad", receiver: "son" }), w.deps)).status === 400, "no 7th card");
});
Deno.test("bonus: the same customer's second order that day gets none", async () => {
  const g = await get(world(3, true, IN, { earlier: true }).deps);
  assert(g.qty === 3 && g.bonus === false, JSON.stringify(g));
});
Deno.test("bonus: ends at midnight PST, not a second later", async () => {
  assert((await get(world(1, true, BONUS_END - 1).deps)).qty === 2, "23:59:59 PST");
  assert((await get(world(1, true, BONUS_END).deps)).qty === 1, "00:00 PST Friday");
  assert((await get(world(1, true, BONUS_START - 1).deps)).qty === 1, "Wednesday");
});
Deno.test("bonus: a Vault free-film order does not stack with it", async () => {
  const g = await get(world(1, true, IN, { vault: true }).deps);
  assert(g.qty === 1 && g.bonus === false, JSON.stringify(g));
});
Deno.test("bonus: once given it stays, even if asked again later", async () => {
  const w = world(2, true, IN);
  await get(w.deps);
  w.deps.earlierFilmOrder = () => Promise.resolve(true); // a later look must not take it away
  assert((await get(w.deps)).qty === 3, "stays");
});
Deno.test("bonus: a Skill-only order still has no cards", async () => {
  assert((await handle(new Request("https://x/f?s=" + S), world(0, true, IN).deps)).status === 404, "skill");
});

Deno.test("vault: a member's claim is mailed to Jay with the Vault email, nothing is stored", async () => {
  const w = world(0);
  const r = await handle(post({ vault: true, name: "Dana", email: "Dana@Example.com ", link: "https://www.amazon.com/x/dp/b000000009?ref=1", giver: "mom", receiver: "partner" }), w.deps);
  const j = await r.json();
  assert(r.status === 200 && j.ok === true && j.link === "https://www.amazon.com/dp/B000000009", JSON.stringify(j));
  assert(w.mails.length === 1 && w.mails[0].includes("Vault free film claim") && w.mails[0].includes("dana@example.com") && w.mails[0].includes("Mom to Husband (Dad)"), w.mails.join("|"));
  assert(Object.keys(w.o.metadata).length === 1, "no Stripe write");
});
Deno.test("vault: refuses a claim without a name, a real email, a link or the roles", async () => {
  const ok = { vault: true, name: "Dana", email: "dana@example.com", link: "https://www.amazon.com/dp/B000000009", giver: "dad", receiver: "son" };
  for (const bad of [{ name: "" }, { email: "dana" }, { link: "" }, { giver: "santa" }, { receiver: "dog" }]) {
    const r = await handle(post({ ...ok, ...bad }), world(0).deps);
    assert(r.status === 400, JSON.stringify(bad));
  }
});
Deno.test("vault: a mail that does not go out is an error the member sees", async () => {
  const w = world(0); w.deps.mail = () => Promise.resolve(false);
  const r = await handle(post({ vault: true, name: "Dana", email: "dana@example.com", link: "https://www.amazon.com/dp/B000000009", giver: "dad", receiver: "son" }), w.deps);
  assert(r.status === 502, String(r.status));
});

Deno.test("toddler: a card for a toddler is saved and mailed as Toddler", async () => {
  const w = world(1);
  const r = await handle(post({ s: S, n: 1, link: "https://www.amazon.com/dp/B0BSP12239", giver: "dad", receiver: "toddler" }), w.deps);
  assert(r.status === 200 && w.mails[0].includes("Dad to Toddler"), w.mails.join("|"));
  assert(readFilms(w.o.metadata, 1)[0].receiver === "toddler", "stored");
});

const PAID_IN = BONUS_START + 86400 * 2; // Saturday 21.11
Deno.test("bonus: judged by the moment of payment, not the moment the checkout opened", async () => {
  assert((await get(world(1, true, BONUS_START - 600, { paidAt: BONUS_START + 60 }).deps)).qty === 2, "opened before, paid inside");
  assert((await get(world(1, true, BONUS_END - 600, { paidAt: BONUS_END + 60 }).deps)).qty === 1, "opened inside, paid after Monday midnight");
  assert((await get(world(1, true, PAID_IN, { paidAt: PAID_IN }).deps)).qty === 2, "Saturday");
});
Deno.test("bonus: kept when the cards are filled after the deadline", async () => {
  const w = world(3, true, PAID_IN, { paidAt: PAID_IN });
  await get(w.deps);                       // the webhook asks at payment: the bonus is written to the order
  w.o.paidAt = 0; w.o.created = BONUS_END + 86400 * 5; // even if the order looked like a late one now
  const r = await handle(post({ s: S, n: 4, link: "https://www.amazon.com/dp/B000000004", giver: "mom", receiver: "son" }), w.deps);
  assert(r.status === 200 && w.mails[0].includes("4 of 4 (free bonus)"), w.mails.join("|"));
});
Deno.test("bonus: a customer who took the Vault free film gets no bonus on a purchase", async () => {
  const g = await get(world(2, true, PAID_IN, { paidAt: PAID_IN, vaultClaimed: true }).deps);
  assert(g.qty === 2 && g.bonus === false, JSON.stringify(g));
});
const vault = { vault: true, name: "Dana", email: "dana@example.com", link: "https://www.amazon.com/dp/B000000009", giver: "dad", receiver: "son" };
Deno.test("vault: exactly one free film per email, the second claim is refused", async () => {
  const w = world(0);
  assert((await handle(post(vault), w.deps)).status === 200, "first");
  assert(w.vaultRecords.length === 1 && w.vaultRecords[0] === "dana@example.com", "recorded");
  const r2 = await handle(post({ ...vault, email: "DANA@example.com" }), w.deps);
  assert(r2.status === 409 && (await r2.json()).error === "claimed", "second");
  assert(w.mails.length === 1, "Jay mailed once");
});
Deno.test("vault: refused for a customer whose order already has a bonus film (no stacking)", async () => {
  const w = world(0, true, BEFORE, { bonusOrder: true });
  const r = await handle(post(vault), w.deps);
  assert(r.status === 409 && (await r.json()).error === "bonus" && w.mails.length === 0 && w.vaultRecords.length === 0, "refused");
});
Deno.test("skill checkout: $199 until Black Friday ends, $299 from then, by the server's clock", async () => {
  const a = world(0, true, BEFORE, { now: BF_END - 1 });
  const ja = await (await handle(post({ checkout: "skill", ref: "fb_ad" }), a.deps)).json();
  assert(ja.ok && ja.price === 199 && a.checkouts[0] === SKILL_PRICE_BF && ja.url.startsWith("https://checkout.stripe.com"), JSON.stringify(ja));
  const b = world(0, true, BEFORE, { now: BF_END });
  const jb = await (await handle(post({ checkout: "skill" }), b.deps)).json();
  assert(jb.price === 299 && b.checkouts[0] === SKILL_PRICE_FULL, JSON.stringify(jb));
});
