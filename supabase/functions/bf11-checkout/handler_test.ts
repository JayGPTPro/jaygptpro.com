import { CATALOG, DONNA_ADDON_PRODUCT, DONNA_SOLO_PRODUCT, handle, OFFER_END, priceCart, sessionParams, type Deps } from "./handler.ts";
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }

const NOW = Date.UTC(2026, 10, 26, 15, 0, 0);
function world(now = NOW) {
  const forms: URLSearchParams[] = [];
  const deps: Deps = { now: () => now, createSession: (f) => { forms.push(f); return Promise.resolve({ url: "https://checkout.stripe.com/c/pay/cs_test" }); } };
  return { deps, forms };
}
const post = (body: unknown) => new Request("https://x/f", { method: "POST", body: JSON.stringify(body) });
const amounts = (f: URLSearchParams) => [...f.entries()].filter(([k]) => k.endsWith("[unit_amount]")).map(([, v]) => Number(v));

Deno.test("Donna + Wonka = $497, Donna free", () => {
  const c = priceCart(["donna", "wonka"]);
  assert(c.pay === 49700, `pay ${c.pay}`);
  assert(c.lines[0].id === "wonka" && !c.lines[0].free && c.lines[1].id === "donna" && c.lines[1].free, JSON.stringify(c.lines));
});

Deno.test("Vault + Wonka + Donna = $1,297 (Wonka free, Donna paid)", () => {
  const c = priceCart(["vault", "wonka", "donna"]);
  assert(c.pay === 129700, `pay ${c.pay}`);
  assert(c.lines.map((l) => `${l.id}:${l.free}`).join(" ") === "vault:false wonka:true donna:false", JSON.stringify(c.lines));
});

Deno.test("ties keep the page order: build, images, video", () => {
  const c = priceCart(["video", "images", "build"]);
  assert(c.lines.map((l) => l.id).join(",") === "build,images,video", c.lines.map((l) => l.id).join(","));
  assert(c.pay === 600000, `pay ${c.pay}`);
});

Deno.test("Donna rides on the Wonka cross-sell product only when Wonka is in the cart", () => {
  assert(priceCart(["donna", "wonka"]).lines.find((l) => l.id === "donna")!.product === DONNA_ADDON_PRODUCT, "with wonka");
  assert(priceCart(["donna", "vault"]).lines.find((l) => l.id === "donna")!.product === DONNA_SOLO_PRODUCT, "without wonka");
  assert(CATALOG.find((p) => p.id === "donna")!.product === DONNA_SOLO_PRODUCT, "catalog not mutated");
});

Deno.test("bad carts are refused", () => {
  for (const bad of [[], ["donna", "donna"], ["nope"], "donna", null, [1], [...CATALOG.map((p) => p.id), "gift"]]) {
    let threw = false;
    try { priceCart(bad); } catch { threw = true; }
    assert(threw, `accepted ${JSON.stringify(bad)}`);
  }
});

Deno.test("the session: $0 for free lines, metadata on session and payment, prices never from the browser", async () => {
  const { deps, forms } = world();
  const res = await handle(post({ items: ["donna", "wonka"], price: 1 }), deps);
  assert(res.status === 200, `status ${res.status}`);
  const f = forms[0];
  assert(JSON.stringify(amounts(f)) === "[49700,0]", JSON.stringify(amounts(f)));
  assert(f.get("metadata[project]") === "bf11" && f.get("payment_intent_data[metadata][project]") === "bf11", "project");
  assert(f.get("metadata[items]") === "wonka,donna" && f.get("metadata[free]") === "donna", f.toString());
  assert(f.get("metadata[courses]") === "donna,wonka" && f.get("payment_intent_data[metadata][courses]") === "donna,wonka", "courses");
  assert(f.get("mode") === "payment" && f.get("line_items[0][price_data][currency]") === "usd", "mode/currency");
  assert(String(f.get("success_url")).includes("{CHECKOUT_SESSION_ID}"), "success url");
});

Deno.test("a cart with no course says courses=none", async () => {
  const { deps, forms } = world();
  await handle(post({ items: ["vault", "call"] }), deps);
  assert(forms[0].get("metadata[courses]") === "none", String(forms[0].get("metadata[courses]")));
  assert(forms[0].get("metadata[free]") === "call", String(forms[0].get("metadata[free]")));
});

Deno.test("expiry: 30 min to 24 h, and never past the offer end unless that is under 30 min away", () => {
  const c = priceCart(["donna"]);
  const exp = (now: number) => Number(sessionParams(c, now).get("expires_at")) * 1000;
  assert(exp(NOW) - NOW <= 24 * 3600e3 && exp(NOW) - NOW >= 30 * 60e3, "normal");
  const late = OFFER_END - 3 * 3600e3;
  assert(exp(late) === OFFER_END, "closes at the end");
  const last = OFFER_END - 5 * 60e3;
  assert(exp(last) - last >= 30 * 60e3, "Stripe minimum");
});

Deno.test("after the offer ends: 410, no session", async () => {
  const { deps, forms } = world(OFFER_END);
  const res = await handle(post({ items: ["donna"] }), deps);
  assert(res.status === 410 && forms.length === 0, `status ${res.status}`);
});

Deno.test("garbage and the deploy probe: 400; GET: 405; OPTIONS: 204", async () => {
  const { deps } = world();
  assert((await handle(post({}), deps)).status === 400, "empty body");
  assert((await handle(post({}), world(OFFER_END + 86400e3).deps)).status === 400, "the probe after the offer: still 400");
  assert((await handle(new Request("https://x/f", { method: "POST", body: "not json" }), deps)).status === 400, "not json");
  assert((await handle(new Request("https://x/f"), deps)).status === 405, "GET");
  assert((await handle(new Request("https://x/f", { method: "OPTIONS" }), deps)).status === 204, "OPTIONS");
});

// The page's P array is what the buyer sees. Its prices must be the ones charged here.
Deno.test("prices match black-friday/index.html", async () => {
  let html = "";
  try { html = await Deno.readTextFile(new URL("../../../black-friday/index.html", import.meta.url)); } catch { /* page not in this checkout */ }
  if (!html) { console.log("  (black-friday/index.html not in this checkout, skipped)"); return; }
  const rows = [...html.matchAll(/\{\s*id:"(\w+)",[^\n]*?price:(\d+)/g)].map((m) => [m[1], Number(m[2]) * 100] as const);
  const page = rows.filter(([id]) => CATALOG.some((p) => p.id === id));
  assert(page.length === CATALOG.length, `page has ${page.length} products`);
  page.forEach(([id, cents], i) => {
    assert(CATALOG[i].id === id, `order: ${i} is ${id} on the page, ${CATALOG[i].id} here`);
    assert(CATALOG[i].price === cents, `${id}: page ${cents}, server ${CATALOG[i].price}`);
  });
});
