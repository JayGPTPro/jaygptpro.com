import { addBusinessHours, BF_VIDEO_PRODUCT, build, classify, handle, ilDay, readCards, readSent, sentPatch, sha256hex, KIT_OPEN_AT, LAUNCH, SKILL_PRODUCT, VIDEO_PRODUCT, type Deps } from "./handler.ts";
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const U = (y: number, mo: number, d: number, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h, mi) / 1000;

// deno-lint-ignore no-explicit-any
function session(o: Record<string, any> = {}) {
  const paidAt = o.paidAt ?? U(2026, 11, 20, 12, 29);
  return {
    id: o.id ?? "cs_live_" + Math.random().toString(36).slice(2),
    created: o.created ?? paidAt - 20,
    status: o.paid === false ? "open" : "complete",
    payment_status: o.paid === false ? "unpaid" : "paid",
    amount_total: o.amount ?? 9900, currency: o.currency ?? "usd", currency_conversion: o.conv ?? null,
    customer_details: { email: o.email ?? "buyer@example.com", name: "Buyer" },
    metadata: { project: "christmas_video", ...(o.meta || {}) },
    discounts: o.discounts ?? [],
    line_items: { data: [{ quantity: o.qty ?? 1, price: { product: o.skill ? SKILL_PRODUCT : VIDEO_PRODUCT } }] },
    payment_intent: o.paid === false ? (o.declined ? { id: "pi_x", last_payment_error: { message: "Your card was declined." } } : null)
      : { id: "pi_1", latest_charge: { created: paidAt, amount: o.chargeAmount ?? (o.amount ?? 9900), amount_refunded: o.refundedAmt ?? 0, refunded: !!o.refunded } },
  };
}
const card = (link: string, g = "dad", r = "son", at?: number) => at ? [link, g, r, at] : [link, g, r];

Deno.test("48 hours count business days only, Pacific time", () => {
  // Fri 20.11 04:29 PST -> Tue 24.11 04:29 PST: the weekend does not count.
  assert(addBusinessHours(U(2026, 11, 20, 12, 29), 48) === U(2026, 11, 24, 12, 29), "friday");
  // Wed 25.11 10:00 PST -> Fri 27.11 10:00 PST.
  assert(addBusinessHours(U(2026, 11, 25, 18), 48) === U(2026, 11, 27, 18), "midweek");
  // Saturday: the clock starts Monday 00:00 PST and ends Wednesday 00:00 PST.
  assert(addBusinessHours(U(2026, 11, 21, 15), 48) === U(2026, 11, 25, 8), "saturday");
  // Thu 20:00 PST: 4 h Thursday, 24 h Friday, weekend, 20 h Monday -> Mon 20:00 PST.
  assert(addBusinessHours(U(2026, 11, 27, 4), 48) === U(2026, 12, 1, 4), "thursday night");
});

Deno.test("a day is an Israel day", () => {
  assert(ilDay(U(2026, 11, 20, 21, 59)) === "2026-11-20", "23:59 Israel");
  assert(ilDay(U(2026, 11, 20, 22, 0)) === "2026-11-21", "00:00 Israel is the next day");
});

Deno.test("Jay's tests are marked: the test link, a TEST code, his own domain", () => {
  const promos = { promo_x: { code: "XMASTEST2", coupon: "c1" }, promo_k: { code: "KITTEST1", coupon: "c2" }, promo_v: { code: "VAULTJOE", coupon: "VAULT_FIRST_FILM" } };
  assert(classify(session({ meta: { test: "true" } }), promos)!.test.length === 1, "test link");
  assert(classify(session({ discounts: [{ coupon: null, promotion_code: "promo_x" }] }), promos)!.test[0] === "code XMASTEST2", "xmastest");
  assert(classify(session({ skill: true, discounts: [{ promotion_code: "promo_k" }] }), promos)!.test[0] === "code KITTEST1", "kittest");
  assert(classify(session({ email: "INFO@jaygptpro.com" }), promos)!.test.length === 1, "own domain");
  const real = classify(session({ discounts: [{ promotion_code: "promo_v" }] }), promos)!;
  assert(real.test.length === 0 && real.vaultCoupon, "a Vault coupon order is real, and marked Vault");
  assert(classify({ ...session(), metadata: {}, line_items: { data: [{ quantity: 1, price: { product: "prod_other" } }] } }, promos) === null, "not Christmas");
});

Deno.test("money is US dollars, also when the buyer saw shekels", () => {
  const o = classify(session({ currency: "ils", amount: 33756, conv: { amount_total: 9900, source_currency: "usd" } }), {})!;
  assert(o.usd === 9900, "converted back to USD");
  const r = classify(session({ amount: 9900, refundedAmt: 4950 }), {})!;
  assert(r.refunded === 4950 && !r.fullyRefunded, "half refunded");
});

Deno.test("cards: two per key, the save time when christmas-films writes one", () => {
  const meta = { films_01: JSON.stringify([card("https://www.amazon.com/dp/B07S6K6B27"), card("https://shop.example.com/x", "mom", "partner", 1795180000)]), films_02: JSON.stringify([null, null]) };
  const c = readCards(meta, 3);
  assert(c[0]!.asin === "B07S6K6B27" && c[0]!.savedAt === null, "first card");
  assert(c[1]!.asin === "" && c[1]!.savedAt === 1795180000 && c[1]!.receiver === "partner", "second card");
  assert(c[2] === null, "third not filled");
});

Deno.test("the board: sales per day, films with the bonus, deadlines, Skill, tests, checkouts", () => {
  const now = U(2026, 11, 21, 10);
  const s1 = session({ id: "cs_a", qty: 2, amount: 19800, paidAt: U(2026, 11, 20, 12), meta: { bonus: "1",
    films_01: JSON.stringify([card("https://www.amazon.com/dp/B000000001"), null]), films_02: JSON.stringify([card("https://www.amazon.com/dp/B000000003", "mom", "daughter", U(2026, 11, 20, 23)), null]) } });
  const s2 = session({ id: "cs_b", qty: 1, paidAt: U(2026, 11, 20, 22, 30), meta: { bonus: "0" } });            // 00:30 Israel, 21.11
  const s3 = session({ id: "cs_c", skill: true, amount: 19900, paidAt: U(2026, 11, 21, 9) });
  const s4 = session({ id: "cs_t", meta: { test: "true", bonus: "1" } });                                          // Jay's test
  const s5 = session({ id: "cs_r", refunded: true, paidAt: U(2026, 11, 20, 15) });                                 // refunded in full
  const s6 = session({ id: "cs_o", paid: false, created: U(2026, 11, 21, 8), declined: true });
  const s7 = session({ id: "cs_p", qty: 1, paidAt: U(2026, 11, 20, 13), meta: {} });                               // bonus not decided yet
  const b = build({ sessions: [s1, s2, s3, s4, s5, s6, s7], promos: {}, vault: [], now });

  const d20 = b.days.find((d) => d.day === "2026-11-20")!, d21 = b.days.find((d) => d.day === "2026-11-21")!;
  assert(d20.filmOrders === 2 && d20.filmsPaid === 3 && d20.bonusFilms === 1 && d20.filmUsd === 29700, "20.11: s1 + s7, refund and test left out");
  assert(d21.filmOrders === 1 && d21.skillOrders === 1 && d21.skillUsd === 19900, "21.11: s2 by Israel time, and the Skill");
  assert(b.totals.filmOrders === 3 && b.totals.bonusFilms === 1, "totals");
  assert(d21.opened === 3 && d21.paidOfOpened === 2, "21.11 by Israel time: s2, s3 paid, s6 opened and not paid");
  assert(d20.opened === 3 && d20.paidOfOpened === 3, "20.11: s1, s5 (refunded later), s7; the test is not counted");
  assert(b.unpaid.length === 1 && b.unpaid[0].failed === "Your card was declined.", "declined attempt shown");

  const a = b.films.filter((f) => f.order === "cs_a").sort((x, y) => x.n - y.n);
  assert(a.length === 3 && a[2].bonus && !a[0].bonus, "2 paid + the bonus as film 3");
  assert(a[0].clock === "payment" && a[0].deadline === addBusinessHours(U(2026, 11, 20, 12), 48), "no save time: counted from payment");
  assert(a[2].clock === "card" && a[2].deadline === addBusinessHours(U(2026, 11, 20, 23), 48), "save time: counted from the card");
  assert(a[1].card === null && a[1].deadline === null, "an empty card has no clock yet");
  assert(b.films[b.films.length - 1].deadline === null, "films without a card sort last");
  assert(b.films.some((f) => f.order === "cs_t" && f.test.length), "test films are listed, marked");
  assert(!b.films.some((f) => f.order === "cs_r"), "a refunded order has nothing to make");
  assert(b.films.find((f) => f.order === "cs_p")!.bonusUnknown, "bonus not decided yet is flagged");

  assert(b.skill.length === 1 && b.skill[0].beforeOpen && b.skill[0].paidAt < KIT_OPEN_AT, "Skill buyer waits for Sunday");
  const k = build({ sessions: [s3, session({ id: "cs_kt", skill: true, amount: 0, discounts: [{ promotion_code: "promo_k" }] })], promos: { promo_k: { code: "KITTEST1", coupon: "c" } }, vault: [], now });
  assert(k.skill.length === 2 && k.skill.find((x) => x.order === "cs_kt")!.test[0] === "code KITTEST1", "a Skill test is listed, marked");
  assert(k.totals.skillOrders === 1 && k.totals.skillUsd === 19900, "and stays out of the sales numbers");
  assert(b.tests.length === 1 && b.tests[0].why[0] === "marked test", "the test order is listed apart");
  assert(b.refunds.length === 1 && b.refunds[0].full, "the refund is listed");
  assert(b.days[0].day === ilDay(LAUNCH), "the table starts on launch day");
});

Deno.test("Vault claims come from the customer metadata", () => {
  const b = build({ sessions: [], promos: {}, now: U(2026, 11, 21), vault: [
    { email: "Member@Example.com", name: "Mem", created: 1, metadata: { xmas_vault: "1", xmas_vault_at: "2026-11-21T08:00:00.000Z", xmas_vault_link: "https://www.amazon.com/dp/B0BSP12239", xmas_vault_roles: "dad to toddler" } },
  ] });
  const v = b.vault[0];
  assert(v.email === "member@example.com" && v.asin === "B0BSP12239" && v.giver === "dad" && v.receiver === "toddler" && v.claimedAt === U(2026, 11, 21, 8), "claim");
});

Deno.test("the key: wrong or missing answers 401 and reads nothing from Stripe", async () => {
  let calls = 0;
  const deps: Deps = { sessions: () => { calls++; return Promise.resolve([]); }, promos: () => Promise.resolve({}), vault: () => Promise.resolve([]), now: () => 0, keyHash: await sha256hex("right-key"),
    sessionMeta: () => Promise.resolve(null), setSessionMeta: () => { calls++; return Promise.resolve(); }, customerMeta: () => Promise.resolve(null), setCustomerMeta: () => { calls++; return Promise.resolve(); } };
  const post = (body: string) => new Request("https://x/f", { method: "POST", body, headers: { origin: "https://jaygptpro.com" } });
  assert((await handle(post("wrong"), deps)).status === 401, "wrong key");
  assert((await handle(post("{}"), deps)).status === 401, "the deploy probe's garbage body");
  assert((await handle(post(""), deps)).status === 401, "empty");
  assert(calls === 0, "no Stripe call without the key");
  assert((await handle(new Request("https://x/f"), deps)).status === 405, "GET");
  assert((await handle(new Request("https://x/f", { method: "OPTIONS", headers: { origin: "https://jaygptpro.com" } }), deps)).status === 204, "preflight");
  const ok = await handle(post("right-key"), deps);
  assert(ok.status === 200 && calls === 1, "right key");
  assert(ok.headers.get("cache-control")!.includes("no-store"), "never cached");
  assert(ok.headers.get("access-control-allow-origin") === "https://jaygptpro.com", "cors");
});

Deno.test("a partner's orders are split out, and still counted in the totals", () => {
  const now = U(2026, 11, 23, 12);
  const s = [
    session({ meta: { partner: "p1" }, qty: 2, amount: 19800 }),                  // partner, 2 films
    session({ meta: { partner: "p1" }, skill: true, amount: 19900 }),             // partner, the Skill
    session({ meta: { partner: "p1" }, amount: 9900, refunded: true }),           // partner, refunded in full
    session({ meta: { partner: "p1", test: "true" } }),                           // partner test link
    session({ meta: { partner: "p1" }, paid: false }),                            // opened, not paid
    session({ amount: 9900 }),                                                        // Jay's own link
  ];
  const r = build({ sessions: s, promos: {}, vault: [], now });
  const p = r.partners.find((x) => x.name === "p1")!;
  assert(p.filmOrders === 1 && p.filmsPaid === 2 && p.filmUsd === 19800, "films: refunded and test orders drop out");
  assert(p.skillOrders === 1 && p.skillUsd === 19900, "skill");
  assert(p.refundedUsd === 9900, "the refund is shown");
  assert(p.opened === 4, "checkouts opened: the test link does not count");
  assert(p.orders.length === 3, "paid orders listed, the refunded one too");
  assert(r.totals.filmUsd === 19800 + 9900 && r.totals.skillUsd === 19900, "totals still hold every real order");
  assert(r.films.filter((f) => f.partner === "p1").length === 3, "his films are marked in the production list (2 paid + his test)");
  const empty = build({ sessions: [session({ amount: 9900 })], promos: {}, vault: [], now });
  assert(empty.partners.length === 1 && empty.partners[0].filmOrders === 0, "a known partner shows before the first order");
});

Deno.test("Vault free Skill claims: listed with the Vault, never a Skill sale, a checkout or a Sunday buyer", () => {
  const now = U(2026, 11, 27, 10);
  const claim = { ...session({ id: "cs_vs", skill: true, amount: 0, paidAt: U(2026, 11, 26, 9), email: "member@example.com", meta: { offer: "vault_skill" }, discounts: [{ coupon: "VAULT_FREE_SKILL", promotion_code: null }] }), payment_intent: null };
  const test = { ...session({ id: "cs_vt", skill: true, amount: 0, paidAt: U(2026, 11, 20, 14, 22), email: "info+vaulttest@jaygptpro.com", meta: { offer: "vault_skill", test: "true" } }), payment_intent: null };
  const open = session({ id: "cs_vo", skill: true, amount: 0, paid: false, created: U(2026, 11, 26, 8), meta: { offer: "vault_skill" } });
  const sale = session({ id: "cs_s", skill: true, amount: 19900, paidAt: U(2026, 11, 26, 11) });
  const b = build({ sessions: [claim, test, open, sale], promos: {}, vault: [], now });
  assert(b.vaultSkill.length === 2 && b.vaultSkill[0].order === "cs_vt" && b.vaultSkill[1].order === "cs_vs", "both claims listed, oldest first");
  assert(b.vaultSkill[1].kitUrl === "https://jaygptpro.com/christmas-video/kit/?s=cs_vs" && b.vaultSkill[1].claimedAt === U(2026, 11, 26, 9) - 20, "kit link and time (a $0 claim has no charge: the session's own time)");
  assert(b.vaultSkill[0].test[0] === "marked test", "the test claim is marked");
  assert(b.totals.skillOrders === 1 && b.totals.skillUsd === 19900, "only the real sale counts");
  assert(b.totals.opened === 1 && b.totals.paidOfOpened === 1 && b.unpaid.length === 0, "claims stay out of checkouts and conversion");
  assert(b.skill.length === 1 && b.skill[0].order === "cs_s", "claims are not Skill buyers");
  assert(!b.tests.some((x) => x.email.startsWith("info+vaulttest")) && b.testOpens === 0, "the Vault test shows with the Vault, not twice");
});

Deno.test("the Vault's one shared kit link is its own row, not a test and not a member", () => {
  const shared = { ...session({ id: "cs_vshared", skill: true, amount: 0, paidAt: U(2026, 11, 22, 10), email: "info+vault@jaygptpro.com", meta: { offer: "vault_skill", vault_shared: "1" } }), payment_intent: null };
  const b = build({ sessions: [shared], promos: {}, vault: [], now: U(2026, 11, 22, 12) });
  assert(b.vaultSkill.length === 1 && b.vaultSkill[0].shared && b.vaultSkill[0].test.length === 0, "shared row, not TEST");
  assert(b.totals.skillOrders === 0 && b.skill.length === 0 && b.tests.length === 0 && b.unpaid.length === 0, "no sale, no buyer, no test row");
});

Deno.test("sent marks: stored compactly, read back, overflow to a second key, old keys emptied", () => {
  const t0 = U(2026, 11, 22, 15);
  const p1 = sentPatch({}, { 2: t0, 1: t0 + 60 });
  assert(p1.sent === "1:" + (t0 + 60).toString(36) + ",2:" + t0.toString(36) && Object.keys(p1).length === 1, "one key, sorted");
  const back = readSent(p1);
  assert(back[1] === t0 + 60 && back[2] === t0, "read back");
  const many: Record<number, number> = {};
  for (let n = 1; n <= 60; n++) many[n] = t0 + n;
  const p2 = sentPatch({}, many);
  assert(p2.sent.length <= 500 && p2.sent2 && p2.sent2.length <= 500, "60 films fit in two keys");
  assert(Object.keys(readSent(p2)).length === 60, "all 60 read back");
  const p3 = sentPatch(p2, { 1: t0 });
  assert(p3.sent === "1:" + t0.toString(36) && p3.sent2 === "", "the unused second key is emptied (Stripe deletes it)");
  assert(Object.keys(readSent({ sent: "", project: "x", films_01: "[]" })).length === 0, "nothing marked");
});

Deno.test("the board shows each film's sent time from the order", () => {
  const s = session({ id: "cs_m", qty: 2, meta: { sent: "2:" + U(2026, 11, 22, 16).toString(36) } });
  const b = build({ sessions: [s], promos: {}, vault: [{ id: "cus_abcdef12", email: "m@example.com", metadata: { xmas_vault: "1", xmas_vault_sent: String(U(2026, 11, 22, 17)) } }], now: U(2026, 11, 22, 18) });
  const f = b.films.filter((x) => x.order === "cs_m").sort((a, c) => a.n - c.n);
  assert(f[0].sentAt === null && f[1].sentAt === U(2026, 11, 22, 16), "film 2 sent, film 1 not");
  assert(b.vault[0].id === "cus_abcdef12" && b.vault[0].sentAt === U(2026, 11, 22, 17), "Vault claim sent");
});

Deno.test("the sent mark: key-checked, Christmas orders only, sent keys only", async () => {
  const ORDER = "cs_live_" + "b".repeat(40), OTHER = "cs_live_" + "c".repeat(40);
  const writes: [string, Record<string, string>][] = [];
  const metas: Record<string, Record<string, string>> = { [ORDER]: { project: "christmas_video", films_01: "[]", sent: "1:" + (1795300000).toString(36) }, [OTHER]: { project: "donna" } };
  const deps: Deps = { sessions: () => Promise.resolve([]), promos: () => Promise.resolve({}), vault: () => Promise.resolve([]), now: () => 1795350000, keyHash: await sha256hex("right-key"),
    sessionMeta: (id) => Promise.resolve(metas[id] || null), setSessionMeta: (id, p) => { writes.push([id, p]); return Promise.resolve(); },
    customerMeta: (id) => Promise.resolve<Record<string, string> | null>(id === "cus_member1" ? { xmas_vault: "1" } : id === "cus_other12" ? {} : null), setCustomerMeta: (id, p) => { writes.push([id, p]); return Promise.resolve(); } };
  const post = (b: unknown) => new Request("https://x/f", { method: "POST", body: JSON.stringify(b) });
  assert((await handle(post({ k: "wrong", act: "sent", order: ORDER, n: 2 }), deps)).status === 401, "wrong key");
  assert((await handle(post({}), deps)).status === 401, "the deploy probe's {}");
  assert(writes.length === 0, "nothing written without the key");
  assert((await handle(post({ k: "right-key", act: "sent", order: OTHER, n: 1 }), deps)).status === 404, "not a Christmas order");
  assert((await handle(post({ k: "right-key", act: "sent", order: ORDER, n: 0 }), deps)).status === 400, "film 0");
  assert((await handle(post({ k: "right-key", act: "sent", order: "pi_123", n: 1 }), deps)).status === 400, "not an order id");
  assert((await handle(post({ k: "right-key", act: "delete", order: ORDER, n: 1 }), deps)).status === 400, "unknown action");
  assert(writes.length === 0, "refusals write nothing");
  const r = await handle(post({ k: "right-key", act: "sent", order: ORDER, n: 2 }), deps);
  assert(r.status === 200 && writes.length === 1 && writes[0][0] === ORDER, "marked");
  const m = readSent(writes[0][1]);
  assert(m[1] === 1795300000 && m[2] === 1795350000 && Object.keys(writes[0][1]).every((k) => /^sent\d*$/.test(k)), "keeps film 1, adds film 2, sent keys only");
  await handle(post({ k: "right-key", act: "unsent", order: ORDER, n: 1 }), deps);
  assert(Object.keys(readSent(writes[1][1])).length === 0, "unmarked");
  assert((await handle(post({ k: "right-key", act: "vault_sent", customer: "cus_other12" }), deps)).status === 404, "no Vault claim on that customer");
  assert((await handle(post({ k: "right-key", act: "vault_sent", customer: "cus_member1" }), deps)).status === 200 && writes[2][1].xmas_vault_sent === "1795350000", "Vault claim marked");
  await handle(post({ k: "right-key", act: "vault_unsent", customer: "cus_member1" }), deps);
  assert(writes[3][1].xmas_vault_sent === "", "Vault claim unmarked");
});

Deno.test("a Black Friday 1+1 cart: only its film's share counts, open carts are not orders, the film can be marked sent", async () => {
  const cart = (o: Record<string, any> = {}) => ({
    ...session({ amount: 49700, ...o }),
    metadata: { project: "bf11", items: "wonka,xmas", free: "xmas", courses: "wonka" },
    line_items: { data: [
      { quantity: 1, amount_total: 49700, price: { product: "prod_Vgptu7pxmb7d1I" } },
      { quantity: 1, amount_total: o.filmCents ?? 0, price: { product: BF_VIDEO_PRODUCT } },
    ] },
  });
  const free = classify(cart(), {})!;
  assert(free && free.kind === "film" && free.films === 1 && free.usd === 0, `free film counts $0, got ${JSON.stringify(free?.usd)}`);
  const paidFilm = classify({ ...cart({ amount: 59600, filmCents: 9900 }), line_items: { data: [
    { quantity: 1, amount_total: 49700, price: { product: "prod_Vgptu7pxmb7d1I" } },
    { quantity: 1, amount_total: 9900, price: { product: VIDEO_PRODUCT } },
  ] } }, {})!;
  assert(paidFilm.usd === 9900, `paid film counts its own $99, got ${paidFilm.usd}`);
  assert(classify(cart({ paid: false }), {}) === null, "an open Black Friday cart is not a Christmas checkout");
  const ORDER = "cs_live_" + "d".repeat(40);
  const writes: unknown[] = [];
  const deps: Deps = { sessions: () => Promise.resolve([]), promos: () => Promise.resolve({}), vault: () => Promise.resolve([]), now: () => 1795350000, keyHash: await sha256hex("k"),
    sessionMeta: () => Promise.resolve({ project: "bf11" }), setSessionMeta: (id, p) => { writes.push([id, p]); return Promise.resolve(); },
    customerMeta: () => Promise.resolve(null), setCustomerMeta: () => Promise.resolve() };
  const r = await handle(new Request("https://x/f", { method: "POST", body: JSON.stringify({ k: "k", act: "sent", order: ORDER, n: 1 }) }), deps);
  assert(r.status === 200 && writes.length === 1, `marked, got ${r.status}`);
});
