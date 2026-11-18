import { handle, type Deps, type Order } from "./handler.ts";
function assert(c: unknown, m: string) { if (!c) throw new Error(m); }
const S = "cs_live_" + "b".repeat(40);
function world(o: Partial<Order> = {}) {
  const order: Order = { paid: true, skill: true, refunded: false, email: "buyer@example.com", name: "Dana Buyer", ...o };
  const signedAsked: string[][] = [];
  const deps: Deps = {
    order: (id) => Promise.resolve(id === S ? order : null),
    manifest: () => Promise.resolve({ version: "v1", kit: "v1/kit.zip", files: [{ p: "v1/m/a.mp4", size: 3, sha: "x" }, { p: "v1/m/b.wav", size: 4, sha: "y" }] }),
    sign: (paths) => { signedAsked.push(paths); return Promise.resolve(Object.fromEntries(paths.map((p) => [p, "https://signed/" + p]))); },
  };
  return { deps, signedAsked };
}
const get = (q: string) => new Request("https://x/f?" + q);

Deno.test("a paid Skill order gets the kit link, first name and masked email", async () => {
  const w = world();
  const r = await handle(get("s=" + S), w.deps); const j = await r.json();
  assert(r.status === 200 && j.kit === "https://signed/v1/kit.zip" && j.name === "Dana" && j.email === "bu***@example.com" && !j.files, JSON.stringify(j));
  assert(w.signedAsked[0].length === 1, "only the zip is signed without files=1");
});
Deno.test("files=1 adds every scene with its own signed link", async () => {
  const w = world();
  const j = await (await handle(get("files=1&s=" + S), w.deps)).json();
  assert(j.files.length === 2 && j.files[1].url === "https://signed/v1/m/b.wav" && j.files[1].sha === "y", JSON.stringify(j));
});
Deno.test("unknown, unpaid, video-only and refunded orders get nothing", async () => {
  for (const [o, code] of [[{ paid: false }, 404], [{ skill: false }, 404], [{ refunded: true }, 403]] as [Partial<Order>, number][]) {
    const w = world(o);
    const r = await handle(get("s=" + S), w.deps);
    assert(r.status === code && w.signedAsked.length === 0, JSON.stringify(o) + " " + r.status);
  }
  const r = await handle(get("s=cs_live_" + "c".repeat(40)), world().deps);
  assert(r.status === 404, "unknown session");
});
Deno.test("a malformed code is refused before Stripe is asked", async () => {
  let asked = 0;
  const w = world(); const d = { ...w.deps, order: (id: string) => { asked++; return w.deps.order(id); } };
  for (const q of ["s=", "s=abc", "s=pi_123456789012345678901234", "s=cs_live_" + "a".repeat(10) + "%2F..%2F"]) {
    const r = await handle(get(q), d); assert(r.status === 400, q);
  }
  assert(asked === 0, "stripe asked");
});
