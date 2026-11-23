import { handle, cleanLink, readFilms, VAULT_OPEN, VAULT_OFFER, makeAskLimiter, vaultProductKey, type VaultCard, BONUS_START, BONUS_END, BF_END, SKILL_PRICE_BF, SKILL_PRICE_FULL, type Deps, type Order } from "./handler.ts";
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const S = "cs_live_" + "a".repeat(40);
const BEFORE = BONUS_START - 3600; // an order placed before launch day: no bonus, as before
function world(qty = 5, paid = true, created = BEFORE, opts: { vault?: boolean; earlier?: boolean; paidAt?: number; vaultClaimed?: boolean; bonusOrder?: boolean; now?: number; open?: boolean } = {}) {
  const o: Order = { paid, qty, email: "buyer@example.com", name: "Buyer", paymentIntent: "pi_1", metadata: { project: "christmas_video" }, created, paidAt: opts.paidAt ?? 0, vault: !!opts.vault };
  const vaultRecords: string[] = [], checkouts: string[] = [];
  const mails: string[] = [], mailsHtml: string[] = [], replyTo: string[] = [];
  const films: Record<string, VaultCard> = {};
  const deps: Deps = {
    order: (id) => Promise.resolve(id === S ? { ...o, metadata: { ...o.metadata } } : null),
    saveMeta: (_id, p) => { Object.assign(o.metadata, p); return Promise.resolve(); },
    mail: (s, h, r) => { mails.push(s); mailsHtml.push(h); replyTo.push(r); return Promise.resolve(true); },
    earlierFilmOrder: () => Promise.resolve(!!opts.earlier),
    vaultClaimed: (e) => Promise.resolve(!!opts.vaultClaimed || vaultRecords.includes(e)),
    vaultProductClaimed: (p) => Promise.resolve(Object.values(films).some((c) => c.product === p)),
    vaultClaimOnce: (e, c) => { if (vaultRecords.includes(e)) return Promise.resolve(false); vaultRecords.push(e); films[e] = c; return Promise.resolve(true); },
    bonusOrder: () => Promise.resolve(!!opts.bonusOrder),
    skillCheckout: (price) => { checkouts.push(price); return Promise.resolve("https://checkout.stripe.com/c/pay/cs_test_x"); },
    now: () => opts.now ?? Math.floor(Date.now() / 1000),
    vaultOpen: opts.open ?? true,   // the claim rules are tested as they will run once the Vault opens
    askAllowed: makeAskLimiter(),
  };
  return { o, mails, mailsHtml, replyTo, deps, vaultRecords, checkouts, films };
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


Deno.test("skill checkout: $199 until Black Friday ends, $299 from then, by the server's clock", async () => {
  const a = world(0, true, BEFORE, { now: BF_END - 1 });
  const ja = await (await handle(post({ checkout: "skill", ref: "fb_ad" }), a.deps)).json();
  assert(ja.ok && ja.price === 199 && a.checkouts[0] === SKILL_PRICE_BF && ja.url.startsWith("https://checkout.stripe.com"), JSON.stringify(ja));
  const b = world(0, true, BEFORE, { now: BF_END });
  const jb = await (await handle(post({ checkout: "skill" }), b.deps)).json();
  assert(jb.price === 299 && b.checkouts[0] === SKILL_PRICE_FULL, JSON.stringify(jb));
});

// ---- AI Vault gifts (open form, 22.11): the Vault's own kit code is the key, one film per email ----
const NOW = Math.floor(Date.UTC(2026, 10, 25, 12, 0, 0) / 1000); // Wed 25.11, the episode week
// The Vault kit: a paid $0 Skill session marked vault_skill. world(0) is a Skill-only session (no film cards).
const vaultKit = (opts: Parameters<typeof world>[3] = {}) => {
  const w = world(0, true, BEFORE, { now: NOW, ...opts });
  w.o.metadata.offer = VAULT_OFFER;
  return w;
};
const film = { vault: "film", s: S, name: "Dana Cohen", email: " Dana@Example.com ", link: "b000000009", giver: "mom", receiver: "partner" };

Deno.test("vault film: from the Vault kit link, recorded and mailed to Jay, link cleaned, email lowered", async () => {
  const w = vaultKit();
  const r = await handle(post(film), w.deps);
  const j = await r.json();
  assert(r.status === 200 && j.ok && j.link === "https://www.amazon.com/dp/B000000009", JSON.stringify(j));
  assert(w.vaultRecords.join() === "dana@example.com" && w.films["dana@example.com"].name === "Dana Cohen" && w.films["dana@example.com"].receiver === "partner", "recorded");
  assert(w.mails.length === 1 && w.mails[0].includes("Vault free film ready to make") && w.mails[0].includes("Mom to Husband (Dad)") && w.mails[0].includes("dana@example.com"), w.mails.join("|"));
  assert(w.mailsHtml[0].includes("not checked against a member list"), "Jay knows it is an open form");
});

Deno.test("vault film: without the Vault kit code nothing is given, even with a paid film order's code", async () => {
  for (const s of [undefined, "", "cs_live_nope", "cs_live_" + "b".repeat(40)]) {
    const w = vaultKit();
    const r = await handle(post({ ...film, s }), w.deps);
    assert(r.status === 403 && (await r.json()).error === "kit" && w.mails.length === 0 && w.vaultRecords.length === 0, String(s));
  }
  const paidFilmOrder = world(2, true, BEFORE, { now: NOW });   // a real order, but not the Vault kit
  const r = await handle(post(film), paidFilmOrder.deps);
  assert(r.status === 403 && paidFilmOrder.mails.length === 0, "a buyer's own order code does not open the Vault film");
  const unpaid = vaultKit(); unpaid.o.paid = false;
  assert((await handle(post(film), unpaid.deps)).status === 403, "an unpaid Vault checkout opens nothing");
});

Deno.test("vault film: one per email, even when three requests arrive at the same moment", async () => {
  const w = vaultKit();
  w.deps.askAllowed = () => true;   // the lock itself, not the limiter, must stop the extra two
  const rs = await Promise.all([1, 2, 3].map((i) => handle(post({ ...film, link: "B00000000" + i }), w.deps)));
  assert(rs.filter((r) => r.status === 200).length === 1 && w.mails.length === 1 && w.vaultRecords.length === 1, rs.map((r) => r.status).join());
  w.deps.askAllowed = makeAskLimiter(0);   // later, with the limiter's window over
  const again = await handle(post({ ...film, email: "DANA@example.com", link: "B000000010" }), w.deps);
  assert(again.status === 409 && (await again.json()).error === "claimed" && w.mails.length === 1, "second film refused");
});

Deno.test("vault film: never stacks with the public bonus film, and a Vault film blocks the bonus later", async () => {
  const w = vaultKit({ bonusOrder: true });
  const r = await handle(post(film), w.deps);
  assert(r.status === 409 && (await r.json()).error === "bonus" && w.mails.length === 0 && w.vaultRecords.length === 0, "refused");
  const k = vaultKit();
  assert((await handle(post({ ...film, email: "buyer@example.com" }), k.deps)).status === 200, "Vault film for the buyer's email");
  const order = world(2, true, PAID_IN, { paidAt: PAID_IN });
  order.deps.vaultClaimed = k.deps.vaultClaimed;
  const g = await get(order.deps);
  assert(g.qty === 2 && g.bonus === false, "no bonus on a later order: " + JSON.stringify(g));
});

Deno.test("vault film: refuses a missing name, a bad email, a bad link or roles, before touching Stripe", async () => {
  for (const bad of [{ name: "" }, { email: "dana" }, { link: "toy" }, { giver: "santa" }, { receiver: "dog" }]) {
    const w = vaultKit();
    let looked = false; w.deps.order = () => { looked = true; return Promise.resolve(null); };
    const r = await handle(post({ ...film, ...bad }), w.deps);
    assert(r.status === 400 && !looked, JSON.stringify(bad));
  }
});

Deno.test("vault film: Jay's mail has the member as reply-to; a failed mail still leaves the claim on the board", async () => {
  const w = vaultKit();
  await handle(post(film), w.deps);
  assert(w.replyTo[0] === "dana@example.com", "reply goes to the member");
  const f = vaultKit(); f.deps.mail = () => Promise.resolve(false);
  const r = await handle(post(film), f.deps);
  const j = await r.json();
  assert(r.status === 200 && j.notified === false && f.vaultRecords.length === 1, JSON.stringify(j));
  const x = vaultKit(); x.deps.vaultClaimOnce = () => Promise.reject(new Error("stripe down"));
  let status = 0;
  try { status = (await handle(post(film), x.deps)).status; } catch { status = 500; } // index.ts answers a throw with 500
  assert(status >= 500 && x.mails.length === 0, "a film that cannot be recorded is not mailed: " + status);
});

Deno.test("vault film: a flood of requests sends one mail per email, then a cap", async () => {
  const w = vaultKit();
  let lookups = 0; const order = w.deps.order; w.deps.order = (id) => { lookups++; return order(id); };
  const codes: number[] = [];
  for (let i = 0; i < 5; i++) codes.push((await handle(post(film), w.deps)).status);
  assert(w.mails.length === 1 && lookups === 1 && codes.slice(1).every((c) => c === 429), "repeats stop before Stripe: " + codes.join() + " lookups " + lookups);
  const lim = makeAskLimiter(300, 3);
  assert(lim("a@x.com", 1000) && !lim("a@x.com", 1100) && lim("a@x.com", 1301), "per email");
  assert(lim("b@x.com", 1302) && lim("c@x.com", 1303) === false, "cap of 3 an hour");
  assert(lim("c@x.com", 1000 + 3600), "a new hour");
});

Deno.test("vault closed (as deployed now): members are refused on the server; Jay's own addresses pass; public orders work", async () => {
  assert(VAULT_OPEN === false, "the deployed switch is closed until the episode");
  const w = vaultKit();
  delete w.deps.vaultOpen;   // as deployed
  for (const body of [film, { ...film, vault: true }, { ...film, vault: "ask" }, { ...film, vault: "skill" }]) {
    const r = await handle(post(body), w.deps);
    const j = await r.json();
    assert(r.status === 403 && j.error === "closed" && /next week/.test(j.message), JSON.stringify(body) + " " + JSON.stringify(j));
  }
  assert(w.mails.length === 0 && w.vaultRecords.length === 0, "nothing sent or stored");
  for (const fake of ["x@jaygptpro.com.evil.com", "x@evil-jaygptpro.com", "jaygptpro@example.com"]) {
    assert((await handle(post({ ...film, email: fake }), w.deps)).status === 403, "not Jay's: " + fake);
  }
  assert((await handle(post({ ...film, email: "info+vault@jaygptpro.com" }), w.deps)).status === 200, "Jay's test address passes");
  const c = world(1, true, BEFORE);
  delete c.deps.vaultOpen;
  const cr = await handle(post({ s: S, n: 1, link: "B07S6K6B27", giver: "dad", receiver: "son" }), c.deps);
  assert(cr.status === 200 && (await cr.json()).ok === true, "a paid card still saves");
  assert((await handle(post({ checkout: "skill" }), c.deps)).status === 200, "the Skill checkout still opens");
});

Deno.test("vault film: one free film per PRODUCT too, whatever email or link form asks for it", async () => {
  const w = vaultKit();
  w.deps.askAllowed = () => true;
  assert((await handle(post(film), w.deps)).status === 200, "first film for B000000009");
  for (const link of ["B000000009", "https://www.amazon.co.uk/Some-Name/dp/b000000009/ref=sr_1?x=1", "amazon.com/gp/product/B000000009"]) {
    const r = await handle(post({ ...film, email: "other" + link.length + "@example.com", link }), w.deps);
    const j = await r.json();
    assert(r.status === 409 && j.error === "product" && /another product/.test(j.message), link + " " + JSON.stringify(j));
  }
  assert(w.mails.length === 1 && w.vaultRecords.length === 1, "nothing more recorded or mailed");
  assert((await handle(post({ ...film, email: "new@example.com", link: "B000000010" }), w.deps)).status === 200, "another product is fine");
  assert(w.films["new@example.com"].product === "asin:B000000010", "the product key is recorded with the claim");
});
Deno.test("vault product key: the ASIN for Amazon, a short hash for other shops, safe for a search query", async () => {
  assert(await vaultProductKey("https://www.amazon.com/dp/B07S6K6B27") === "asin:B07S6K6B27", "amazon");
  assert(await vaultProductKey("https://www.amazon.de/dp/B07S6K6B27") === "asin:B07S6K6B27", "other marketplace, same product");
  const a = await vaultProductKey("https://shop.example.com/p/teddy-bear"), b = await vaultProductKey("https://SHOP.example.com/p/Teddy-Bear");
  assert(/^url:[0-9a-f]{24}$/.test(a) && a === b, a + " " + b);
  assert(a !== await vaultProductKey("https://shop.example.com/p/other"), "different products differ");
});
