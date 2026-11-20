import { handle, cleanLink, readFilms, VAULT_OPEN, makeAskLimiter, makeToken, readToken, VAULT_PAGE, KIT_PAGE, MEMBER_LINK_DAYS, type VaultCard, BONUS_START, BONUS_END, BF_END, SKILL_PRICE_BF, SKILL_PRICE_FULL, type Deps, type Order } from "./handler.ts";
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const S = "cs_live_" + "a".repeat(40);
const BEFORE = BONUS_START - 3600; // an order placed before launch day: no bonus, as before
function world(qty = 5, paid = true, created = BEFORE, opts: { vault?: boolean; earlier?: boolean; paidAt?: number; vaultClaimed?: boolean; bonusOrder?: boolean; now?: number; member?: boolean | null; open?: boolean } = {}) {
  const o: Order = { paid, qty, email: "buyer@example.com", name: "Buyer", paymentIntent: "pi_1", metadata: { project: "christmas_video" }, created, paidAt: opts.paidAt ?? 0, vault: !!opts.vault };
  const vaultRecords: string[] = [], checkouts: string[] = [];
  const mails: string[] = [], mailsHtml: string[] = [];
  const memberMails: { to: string; subject: string; html: string }[] = [];
  const films: Record<string, VaultCard> = {}, skillSessions: Record<string, string> = {};
  const vaultCheckouts: { price: string; email: string; success: string; cancel: string }[] = [];
  const deps: Deps = {
    order: (id) => Promise.resolve(id === S ? { ...o, metadata: { ...o.metadata } } : null),
    saveMeta: (_id, p) => { Object.assign(o.metadata, p); return Promise.resolve(); },
    mail: (s, h) => { mails.push(s); mailsHtml.push(h); return Promise.resolve(true); },
    earlierFilmOrder: () => Promise.resolve(!!opts.earlier),
    vaultClaimed: (e) => Promise.resolve(!!opts.vaultClaimed || vaultRecords.includes(e)),
    vaultClaimOnce: (e, c) => { if (vaultRecords.includes(e)) return Promise.resolve(false); vaultRecords.push(e); films[e] = c; return Promise.resolve(true); },
    bonusOrder: () => Promise.resolve(!!opts.bonusOrder),
    skillCheckout: (price) => { checkouts.push(price); return Promise.resolve("https://checkout.stripe.com/c/pay/cs_test_x"); },
    now: () => opts.now ?? Math.floor(Date.now() / 1000),
    vaultOpen: opts.open ?? true,   // the claim rules are tested as they will run once the Vault opens
    linkSecret: "test-secret",
    vaultMember: () => Promise.resolve(opts.member === undefined ? null : opts.member),
    vaultFilm: (e) => Promise.resolve(films[e] || null),
    vaultSkillSession: (e) => Promise.resolve(skillSessions[e] || ""),
    vaultSkillCheckout: (price, email, success, cancel) => { vaultCheckouts.push({ price, email, success, cancel }); return Promise.resolve("https://checkout.stripe.com/c/pay/cs_live_vault"); },
    mailTo: (to, subject, html) => { memberMails.push({ to, subject, html }); return Promise.resolve(true); },
    askAllowed: makeAskLimiter(),
  };
  return { o, mails, mailsHtml, deps, vaultRecords, checkouts, memberMails, films, skillSessions, vaultCheckouts };
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

// ---- AI Vault gifts: the personal link from the member's inbox is the proof of membership ----
const NOW = Math.floor(Date.UTC(2026, 10, 25, 12, 0, 0) / 1000); // Wed 25.11, the episode week
const memberToken = (email = "dana@example.com", name = "Dana Cohen", x = NOW + 3600) =>
  makeToken("test-secret", { e: email, n: name, p: "member", x });
const approveToken = (email = "dana@example.com", name = "Dana Cohen") =>
  makeToken("test-secret", { e: email, n: name, p: "approve", x: NOW + 3600 });
const tokenIn = (html: string, key: "t" | "approve") => (html.match(new RegExp("#" + key + "=([A-Za-z0-9_.-]+)")) || [])[1] || "";
const film = { vault: "film", link: "b000000009", giver: "mom", receiver: "partner" };

Deno.test("vault token: signed, expires, one purpose, and a changed byte is refused", async () => {
  const t = await memberToken();
  const r = await readToken("test-secret", t, "member", NOW);
  assert(r?.e === "dana@example.com" && r?.n === "Dana Cohen", "reads back");
  assert(await readToken("other-secret", t, "member", NOW) === null, "other key");
  assert(await readToken("test-secret", t, "approve", NOW) === null, "member link is not an approve link");
  assert(await readToken("test-secret", await memberToken(undefined, undefined, NOW - 1), "member", NOW) === null, "expired");
  const [body, sig] = t.split(".");
  const forged = btoa(JSON.stringify({ e: "eve@example.com", n: "Eve", p: "member", x: NOW + 3600 })).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  assert(await readToken("test-secret", forged + "." + sig, "member", NOW) === null, "someone else's email under Dana's signature");
  assert(await readToken("test-secret", body + "." + sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A"), "member", NOW) === null, "changed signature");
  assert(await readToken("", t, "member", NOW) === null, "no secret, no link");
});

Deno.test("vault ask: a listed member gets the link in THEIR inbox only, never in the answer", async () => {
  const w = world(0, true, BEFORE, { member: true, now: NOW });
  const r = await handle(post({ vault: "ask", name: " Dana  Cohen ", email: " Dana@Example.com" }), w.deps);
  const text = await r.text();
  assert(r.status === 200 && JSON.parse(text).ok === true, text);
  assert(!/#t=|eyJ|"t":|test-secret/.test(text), "no link in the answer");
  assert(w.memberMails.length === 1 && w.memberMails[0].to === "dana@example.com", JSON.stringify(w.memberMails.map((m) => m.to)));
  assert(w.memberMails[0].html.includes(VAULT_PAGE + "#t="), "the mail holds the private link");
  const t = await readToken("test-secret", tokenIn(w.memberMails[0].html, "t"), "member", NOW);
  assert(t?.e === "dana@example.com" && t?.n === "Dana Cohen" && t.x === NOW + MEMBER_LINK_DAYS * 86400, JSON.stringify(t));
  assert(w.mails.length === 0, "Jay is not asked about a listed member");
});

Deno.test("vault ask: not on the list, or no list, goes to Jay; the answer is the same as for a member", async () => {
  const member = await (await handle(post({ vault: "ask", name: "Dana", email: "dana@example.com" }), world(0, true, BEFORE, { member: true, now: NOW }).deps)).text();
  for (const listed of [false, null]) {
    const w = world(0, true, BEFORE, { member: listed, now: NOW });
    const r = await handle(post({ vault: "ask", name: "Eve", email: "eve@example.com" }), w.deps);
    const text = await r.text();
    assert(r.status === 200 && text === member, "same answer, so the page never says who is a member: " + text);
    assert(w.memberMails.length === 0, "nothing goes to the asker before Jay approves");
    assert(w.mails.length === 1 && w.mails[0].includes("eve@example.com") && w.mails[0].startsWith("Vault check"), w.mails.join("|"));
    assert(w.mailsHtml[0].includes(listed === null ? "No member list" : "NOT on the member list"), "says why");
    const a = await readToken("test-secret", tokenIn(w.mailsHtml[0], "approve"), "approve", NOW);
    assert(a?.e === "eve@example.com", "approve link for that email");
  }
});

Deno.test("vault approve: Jay's button mails the member their link; a member link cannot approve", async () => {
  const w = world(0, true, BEFORE, { now: NOW });
  const r = await handle(post({ vault: "approve", t: await approveToken("eve@example.com", "Eve") }), w.deps);
  const j = await r.json();
  assert(r.status === 200 && j.email === "eve@example.com", JSON.stringify(j));
  assert(w.memberMails.length === 1 && w.memberMails[0].to === "eve@example.com", "sent to the approved email");
  const bad = await handle(post({ vault: "approve", t: await memberToken() }), w.deps);
  assert(bad.status === 400 && w.memberMails.length === 1, "a member link is not an approve link");
});

Deno.test("vault: the gifts need the private link; without it nothing is given", async () => {
  const w = world(0, true, BEFORE, { member: true, now: NOW });
  for (const body of [{ vault: "me" }, { vault: "skill" }, { ...film }, { vault: "skill", t: "x.y" }, { ...film, t: (await memberToken()).replace(/.$/, "Q") }]) {
    const r = await handle(post(body), w.deps);
    assert(r.status === 401, JSON.stringify(body) + " " + r.status);
  }
  assert(w.vaultCheckouts.length === 0 && w.vaultRecords.length === 0 && w.mails.length === 0, "nothing given");
  const old = await handle(post({ vault: true, name: "Dana", email: "dana@example.com", link: "B000000009", giver: "dad", receiver: "son" }), w.deps);
  assert(old.status === 403 && w.mails.length === 0, "the old one-card form is gone");
});

Deno.test("vault skill: a $0 checkout locked to the email in the link; once only, then the kit link", async () => {
  const w = world(0, true, BEFORE, { now: NOW });
  const t = await memberToken();
  const r = await handle(post({ vault: "skill", t, email: "eve@example.com" }), w.deps);
  const j = await r.json();
  assert(r.status === 200 && j.url.startsWith("https://checkout.stripe.com"), JSON.stringify(j));
  const c = w.vaultCheckouts[0];
  assert(c.email === "dana@example.com", "the body cannot change the email: " + c.email);
  assert(c.price === SKILL_PRICE_BF && c.success === VAULT_PAGE + "?k={CHECKOUT_SESSION_ID}" && c.cancel === VAULT_PAGE + "#t=" + t, JSON.stringify(c));
  w.skillSessions["dana@example.com"] = "cs_live_kit1";
  const again = await handle(post({ vault: "skill", t }), w.deps);
  const ja = await again.json();
  assert(again.status === 409 && ja.kit === KIT_PAGE + "cs_live_kit1" && w.vaultCheckouts.length === 1, JSON.stringify(ja));
  const late = world(0, true, BEFORE, { now: BF_END + 60 });
  await handle(post({ vault: "skill", t: await makeToken("test-secret", { e: "dana@example.com", n: "Dana", p: "member", x: BF_END + 3600 }) }), late.deps);
  assert(late.vaultCheckouts[0].price === SKILL_PRICE_FULL, "after Black Friday the $0 checkout is on the $299 price");
});

Deno.test("vault film: one per member, from the link's email, mailed to Jay as checked, recorded", async () => {
  const w = world(0, true, BEFORE, { now: NOW });
  const t = await memberToken();
  const r = await handle(post({ ...film, t, email: "eve@example.com" }), w.deps);
  const j = await r.json();
  assert(r.status === 200 && j.link === "https://www.amazon.com/dp/B000000009", JSON.stringify(j));
  assert(w.mails.length === 1 && w.mails[0].includes("Vault free film ready to make") && w.mails[0].includes("Mom to Husband (Dad)") && w.mails[0].includes("dana@example.com"), w.mails.join("|"));
  assert(w.mailsHtml[0].includes("Checked") && !w.mailsHtml[0].includes("Check first"), "no hand check left for Jay");
  assert(w.vaultRecords.join() === "dana@example.com" && w.films["dana@example.com"].name === "Dana Cohen", "recorded on Dana");
  const r2 = await handle(post({ ...film, t, link: "B000000010" }), w.deps);
  assert(r2.status === 409 && (await r2.json()).error === "claimed" && w.mails.length === 1, "second film refused");
  for (const bad of [{ link: "toy" }, { giver: "santa" }, { receiver: "dog" }]) {
    const b = await handle(post({ ...film, t: await memberToken("new@example.com"), ...bad }), w.deps);
    assert(b.status === 400, JSON.stringify(bad));
  }
});

Deno.test("vault film: never stacks with the public bonus film, and the bonus never stacks with it", async () => {
  const w = world(0, true, BEFORE, { now: NOW, bonusOrder: true });
  const r = await handle(post({ ...film, t: await memberToken() }), w.deps);
  assert(r.status === 409 && (await r.json()).error === "bonus" && w.mails.length === 0 && w.vaultRecords.length === 0, "refused");
  const g = await get(world(2, true, PAID_IN, { paidAt: PAID_IN, vaultClaimed: true }).deps);
  assert(g.qty === 2 && g.bonus === false, "a Vault film blocks the bonus: " + JSON.stringify(g));
});

Deno.test("vault film: claiming the Skill does not block the film, nor the film the Skill", async () => {
  const w = world(0, true, BEFORE, { now: NOW });
  const t = await memberToken();
  w.skillSessions["dana@example.com"] = "cs_live_kit1";
  assert((await handle(post({ ...film, t }), w.deps)).status === 200, "film after Skill");
  const w2 = world(0, true, BEFORE, { now: NOW });
  assert((await handle(post({ ...film, t }), w2.deps)).status === 200, "film first");
  assert((await handle(post({ vault: "skill", t }), w2.deps)).status === 200 && w2.vaultCheckouts.length === 1, "Skill after film");
});

Deno.test("vault me: what the member's page shows", async () => {
  const w = world(0, true, BEFORE, { now: NOW });
  const t = await memberToken();
  let j = await (await handle(post({ vault: "me", t }), w.deps)).json();
  assert(j.email === "dana@example.com" && j.name === "Dana Cohen" && j.skill.claimed === false && j.film.claimed === false && j.film.bonus === false, JSON.stringify(j));
  w.skillSessions["dana@example.com"] = "cs_live_kit1";
  await handle(post({ ...film, t }), w.deps);
  j = await (await handle(post({ vault: "me", t }), w.deps)).json();
  assert(j.skill.kit === KIT_PAGE + "cs_live_kit1" && j.film.claimed && j.film.link.endsWith("B000000009") && j.film.receiver === "partner", JSON.stringify(j));
  j = await (await handle(post({ vault: "me", t }), world(0, true, BEFORE, { now: NOW, bonusOrder: true }).deps)).json();
  assert(j.film.claimed === false && j.film.bonus === true, "the page can say the bonus film already covers it");
});

Deno.test("vault mails that do not go out are errors, never a silent success", async () => {
  const a = world(0, true, BEFORE, { member: true, now: NOW }); a.deps.mailTo = () => Promise.resolve(false);
  assert((await handle(post({ vault: "ask", name: "Dana", email: "dana@example.com" }), a.deps)).status === 502, "member link");
  const b = world(0, true, BEFORE, { member: null, now: NOW }); b.deps.mail = () => Promise.resolve(false);
  assert((await handle(post({ vault: "ask", name: "Eve", email: "eve@example.com" }), b.deps)).status === 502, "approval mail");
  const c = world(0, true, BEFORE, { now: NOW }); c.deps.mail = () => Promise.resolve(false);
  const fr = await handle(post({ ...film, t: await memberToken() }), c.deps);
  const fj = await fr.json();
  assert(fr.status === 200 && fj.notified === false && c.vaultRecords.length === 1, "film: recorded first, so it is on Jay's board though the mail failed " + JSON.stringify(fj));
});

Deno.test("vault closed (as deployed now): members are refused on the server; Jay's own addresses pass for tests", async () => {
  assert(VAULT_OPEN === false, "the deployed switch is closed until the episode");
  const w = world(1, true, BEFORE, { member: true, now: NOW });
  delete w.deps.vaultOpen;   // as deployed
  for (const body of [{ vault: "ask", name: "Dana", email: "dana@example.com" }, { vault: "me", t: await memberToken() },
    { vault: "skill", t: await memberToken() }, { ...film, t: await memberToken() }, { vault: "approve", t: await approveToken() }, { vault: true }]) {
    const r = await handle(post(body), w.deps);
    const j = await r.json();
    assert(r.status === 403 && j.error === "closed" && /next week/.test(j.message), JSON.stringify(body) + " " + JSON.stringify(j));
  }
  assert(w.mails.length === 0 && w.memberMails.length === 0 && w.vaultRecords.length === 0 && w.vaultCheckouts.length === 0, "nothing sent, made or stored");
  assert((await handle(post({ vault: "ask", name: "Jay", email: "info+vault@jaygptpro.com" }), w.deps)).status === 200, "Jay's test address passes");
  assert((await handle(post({ vault: "skill", t: await memberToken("info+vault@jaygptpro.com") }), w.deps)).status === 200, "and can take the Skill");
  // public orders still work while the Vault is closed
  const c = await handle(post({ s: S, n: 1, link: "B07S6K6B27", giver: "dad", receiver: "son" }), w.deps);
  assert(c.status === 200 && (await c.json()).ok === true, "a paid card still saves");
  assert((await handle(post({ checkout: "skill" }), w.deps)).status === 200, "the Skill checkout still opens");
});

// ---- from the independent review (20.11): each reproduced before the fix ----
Deno.test("review 1: Jay's approve mail has no reply-to, so replying never hands the asker the Approve button", async () => {
  const w = world(0, true, BEFORE, { member: null, now: NOW });
  const replyTo: string[] = [];
  w.deps.mail = (s, h, r) => { w.mails.push(s); w.mailsHtml.push(h); replyTo.push(r); return Promise.resolve(true); };
  await handle(post({ vault: "ask", name: "Eve (listed)", email: "eve@attacker.com" }), w.deps);
  assert(w.mails.length === 1 && !replyTo[0], "reply-to: " + replyTo[0]);
  assert(!w.mails[0].includes("Eve (listed)"), "the asker's name is not in the subject: " + w.mails[0]);
});
Deno.test("review 2: three film requests at the same moment give ONE film", async () => {
  const w = world(0, true, BEFORE, { now: NOW });
  const t = await memberToken();
  const rs = await Promise.all([1, 2, 3].map((i) => handle(post({ ...film, t, link: "B00000000" + i }), w.deps)));
  const ok = rs.filter((r) => r.status === 200).length;
  assert(ok === 1 && w.mails.length === 1 && w.vaultRecords.length === 1, `ok ${ok}, mails ${w.mails.length}, records ${w.vaultRecords.length}`);
});
Deno.test("review 2: a film that cannot be recorded is not mailed and not promised", async () => {
  const w = world(0, true, BEFORE, { now: NOW });
  w.deps.vaultClaimOnce = () => Promise.reject(new Error("stripe down"));
  let status = 0;
  try { status = (await handle(post({ ...film, t: await memberToken() }), w.deps)).status; } catch { status = 500; } // index.ts answers a throw with 500
  assert(status >= 500 && w.mails.length === 0, String(status));
});
Deno.test("review 2: a real Vault film claim then blocks the public bonus on a later order", async () => {
  const w = world(2, true, PAID_IN, { paidAt: PAID_IN, now: NOW });
  assert((await handle(post({ ...film, t: await memberToken("buyer@example.com") }), w.deps)).status === 200, "claimed");
  const g = await get(w.deps);
  assert(g.qty === 2 && g.bonus === false, JSON.stringify(g));
});
Deno.test("review 3: asking again and again sends one mail; the answer stays the same; no stranger's name in the member's mail", async () => {
  const w = world(0, true, BEFORE, { member: true, now: NOW });
  const a = await (await handle(post({ vault: "ask", name: "Idiot", email: "dana@example.com" }), w.deps)).text();
  for (let i = 0; i < 5; i++) {
    const b = await (await handle(post({ vault: "ask", name: "Idiot", email: "dana@example.com" }), w.deps)).text();
    assert(b === a, "same answer");
  }
  assert(w.memberMails.length === 1, "mails: " + w.memberMails.length);
  assert(!w.memberMails[0].html.includes("Idiot"), "greeting uses no typed name");
  const u = world(0, true, BEFORE, { member: null, now: NOW });
  for (let i = 0; i < 4; i++) await handle(post({ vault: "ask", name: "Eve", email: "eve@example.com" }), u.deps);
  assert(u.mails.length === 1, "Jay gets one approve mail per email, not four: " + u.mails.length);
});
Deno.test("review 3: the ask limiter: per email for 5 minutes, and a cap per hour", () => {
  const lim = makeAskLimiter(300, 3);
  assert(lim("a@x.com", 1000) && !lim("a@x.com", 1100) && lim("a@x.com", 1301), "per email");
  assert(lim("b@x.com", 1302) && lim("c@x.com", 1303) === false, "cap of 3 an hour (a twice, b)");
  assert(lim("c@x.com", 1000 + 3600), "a new hour");
});
