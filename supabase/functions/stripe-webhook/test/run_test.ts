// Runs the REAL stripe-webhook handler against a stubbed database.
// Scenarios cover the launch-day cases the audit flagged.
import { DB, LOG } from "./stub_supabase.ts";

// Match production: both secrets ARE set in the deployed environment.
Deno.env.set('FORM_SYNC_SECRET', 'test-form-secret');
Deno.env.set('STRIPE_SECRET_KEY', 'sk_test_stub');
Deno.env.set('SUPABASE_URL', 'https://stub.supabase.co');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'stub-service-key');

let handler: (r: Request) => Promise<Response>;
// capture the handler instead of starting a server
(Deno as any).serve = (h: any) => { handler = h; return { finished: Promise.resolve() } as any; };

// welcome function call: succeed unless the test says otherwise.
// stripeLineItems: what the Stripe line-items lookup returns ([] simulates a missing key
// or a failed call, which is the blind spot the guard has to survive).
export const sendState = { ok: true, calls: [] as any[], stripeLineItems: ['prod_UxhJATVn8CEfCT'] };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if (url.includes('/functions/v1/')) {
    sendState.calls.push({ url, body: JSON.parse(init?.body || '{}') });
    return new Response(JSON.stringify({ ok: sendState.ok }), { status: sendState.ok ? 200 : 502 });
  }
  if (url.includes('api.stripe.com')) {
    return new Response(JSON.stringify({ data: sendState.stripeLineItems.map(p => ({ price: { product: p } })) }), { status: 200 });
  }
  return realFetch(input, init);
}) as any;

await import("./index.ts");

const GOLDEN = 'prod_UxhJATVn8CEfCT';
const PLINK_GOLDEN = 'plink_1U1vCERqcDuiISNTjqJvj1P5';

function reset() {
  DB.allowed_emails = []; DB.stripe_customers = []; DB.bina_registrations = [];
  DB.rounds = [
    { id: 'wonka_r1', welcome_email_fn_slug: 'send-welcome-wonka', stripe_plink_full_price: PLINK_GOLDEN, stripe_plink_discounted: 'plink_1TxmiPRqcDuiISNTKsKrn7Lz', stripe_product_id: GOLDEN, start_date: '2026-09-01' },
    { id: 'round1', welcome_email_fn_slug: null, start_date: '2026-04-01' },
  ];
  LOG.length = 0; sendState.calls = []; sendState.ok = true;
  sendState.stripeLineItems = ['prod_UxhJATVn8CEfCT'];
}

const session = (email: string, amount = 69700) => ({
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_test_1', payment_intent: 'pi_test_1', amount_total: amount, currency: 'usd',
    customer_email: email, customer_details: { name: 'Test Buyer', email, phone: null, address: { country: 'US' } },
    customer: 'cus_test', payment_link: PLINK_GOLDEN } },
});

const post = (body: any) => handler(new Request('https://x/y', { method: 'POST', body: JSON.stringify(body) }));

let pass = 0, fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
}

// ---------------------------------------------------------------
console.log('\n1. Brand new buyer');
reset();
let res = await post(session('new@buyer.com'));
let row = DB.allowed_emails.find(r => r.email === 'new@buyer.com');
check('http 200', res.status === 200, `got ${res.status}`);
check("round = wonka_r1", row?.round === 'wonka_r1', JSON.stringify(row));
check('welcome sent once', sendState.calls.length === 1 && sendState.calls[0].url.includes('send-welcome-wonka'));

// ---------------------------------------------------------------
console.log('\n2. RETURNING Donna customer buys Wonka  <-- the launch-day case');
reset();
DB.allowed_emails.push({ email: 'donna@alum.com', round: 'round1', addon_donna: false,
  welcome_email_sent_at: '2026-04-02T00:00:00Z', stripe_payment_id: 'pi_old_donna' });
res = await post(session('donna@alum.com'));
row = DB.allowed_emails.find(r => r.email === 'donna@alum.com');
check('http 200', res.status === 200, `got ${res.status}`);
check('moved to wonka_r1 (portal would otherwise refuse them)', row?.round === 'wonka_r1', JSON.stringify(row));
check('Donna access preserved via addon_donna', row?.addon_donna === true, JSON.stringify(row));
check('welcome email actually sent', sendState.calls.length === 1, JSON.stringify(sendState.calls));
check('welcome timestamp re-stamped', !!row?.welcome_email_sent_at);

// ---------------------------------------------------------------
console.log('\n3. Stripe retries the SAME event (must not double-send)');
reset();
await post(session('retry@buyer.com'));
const afterFirst = sendState.calls.length;
await post(session('retry@buyer.com'));
check('first delivery sent one welcome', afterFirst === 1);
check('replay sent no second welcome', sendState.calls.length === 1, `calls=${sendState.calls.length}`);
check('still exactly one row', DB.allowed_emails.filter(r => r.email === 'retry@buyer.com').length === 1);

// ---------------------------------------------------------------
console.log('\n4. Welcome send fails -> claim released and Stripe told to retry');
reset();
sendState.ok = false;
res = await post(session('fails@buyer.com'));
row = DB.allowed_emails.find(r => r.email === 'fails@buyer.com');
check('http 500 so Stripe retries', res.status === 500, `got ${res.status}`);
check('claim released for the retry', (row?.welcome_email_sent_at ?? null) === null, JSON.stringify(row));
sendState.ok = true;
res = await post(session('fails@buyer.com'));
check('retry now delivers the welcome', sendState.calls.length === 2, `calls=${sendState.calls.length}`);
check('retry returns 200', res.status === 200, `got ${res.status}`);

// ---------------------------------------------------------------
console.log('\n5a. Wonka plink swapped in Stripe, rounds row stale (product still identifies it)');
reset();
DB.rounds = [{ id: 'wonka_r1', welcome_email_fn_slug: 'send-welcome-wonka', stripe_plink_full_price: null, stripe_plink_discounted: null, stripe_product_id: null, start_date: '2026-09-01' }];
let orphan: any = session('orphan@buyer.com');
orphan.data.object.payment_link = 'plink_brand_new_xyz';
res = await post(orphan);
row = DB.allowed_emails.find(r => r.email === 'orphan@buyer.com');
// the product fallback should RESCUE this, so resolving to wonka_r1 is the good outcome;
// refusing is the acceptable one. Landing in a Donna cohort is the failure.
check('rescued by the product route, or refused', row?.round === 'wonka_r1' || res.status === 500, `status=${res.status} row=${JSON.stringify(row)}`);
check('never written into a wk_ Donna cohort', !String(row?.round || '').startsWith('wk_'), JSON.stringify(row));

console.log('\n5b. Same, but the Stripe line-items call also fails (plink route must carry it)');
reset();
DB.rounds = [{ id: 'wonka_r1', welcome_email_fn_slug: 'send-welcome-wonka', stripe_plink_full_price: null, stripe_plink_discounted: null, stripe_product_id: null, start_date: '2026-09-01' }];
sendState.stripeLineItems = []; // simulates a missing key or a 5xx from Stripe
orphan = session('orphan2@buyer.com'); // arrives on the KNOWN Golden Ticket plink
res = await post(orphan);
row = DB.allowed_emails.find(r => r.email === 'orphan2@buyer.com');
check('still refused via the plink route', res.status === 500, `status=${res.status} row=${JSON.stringify(row)}`);
check('never written into a wk_ Donna cohort', !String(row?.round || '').startsWith('wk_'), JSON.stringify(row));

console.log('\n5c. A real Donna evergreen buyer must still work (no regression)');
reset();
const donna: any = session('evergreen@buyer.com', 9700);
donna.data.object.payment_link = 'plink_1TevFWRqcDuiISNTHnwIfuLq'; // known evergreen plink
res = await post(donna);
row = DB.allowed_emails.find(r => r.email === 'evergreen@buyer.com');
check('still lands in a wk_ cohort', String(row?.round || '').startsWith('wk_'), JSON.stringify(row));
check('http 200', res.status === 200, `got ${res.status}`);

// ---------------------------------------------------------------
console.log('\n6. A returning buyer with round=unknown gets no free Donna access');
reset();
DB.allowed_emails.push({ email: 'unk@buyer.com', round: 'unknown', addon_donna: false, welcome_email_sent_at: null, stripe_payment_id: null });
await post(session('unk@buyer.com'));
row = DB.allowed_emails.find(r => r.email === 'unk@buyer.com');
check('round = wonka_r1', row?.round === 'wonka_r1', JSON.stringify(row));
check('addon_donna stays false', row?.addon_donna !== true, JSON.stringify(row));


// ---------------------------------------------------------------
// THE PRIVATE TOUR, $2,999. Jay asked for this to be proven without a real
// purchase (11.8). Its plink is parked in stripe_plink_discounted, which is the
// column a discount link would normally own, so it is worth testing every route
// in on its own rather than assuming the Golden Ticket cases cover it.
const PRIVATE = 'prod_UxhOUOpgTAGC7q';
const PLINK_PRIVATE = 'plink_1TxmiPRqcDuiISNTKsKrn7Lz';
const tourSession = (email: string) => {
  const s: any = session(email, 299900);
  s.data.object.payment_link = PLINK_PRIVATE;
  return s;
};

console.log('\n7a. Private Tour, brand new buyer');
reset();
sendState.stripeLineItems = [PRIVATE];
res = await post(tourSession('tour@buyer.com'));
row = DB.allowed_emails.find(r => r.email === 'tour@buyer.com');
check('http 200', res.status === 200, `got ${res.status}`);
check('round = wonka_r1 (via the discounted column)', row?.round === 'wonka_r1', JSON.stringify(row));
check('marked paid', row?.customer_type === 'paid' || row?.stripe_payment_id, JSON.stringify(row));
check('Wonka welcome sent, not a Donna one', sendState.calls.length === 1 && sendState.calls[0].url.includes('send-welcome-wonka'), JSON.stringify(sendState.calls));
check('payment recorded at $2,999', DB.stripe_customers.some(c => c.email === 'tour@buyer.com' && c.amount_paid === 299900 && c.round === 'wonka_r1'), JSON.stringify(DB.stripe_customers));
check('not labelled TEST (that would revoke access)', !DB.stripe_customers.some(c => c.email === 'tour@buyer.com' && String(c.coupon_used).toUpperCase() === 'TEST'));
check('access not revoked', (row?.access_revoked_at ?? null) === null, JSON.stringify(row));

console.log('\n7b. Private Tour when the Stripe line-items call fails (plink must carry it)');
reset();
sendState.stripeLineItems = [];
res = await post(tourSession('tour2@buyer.com'));
row = DB.allowed_emails.find(r => r.email === 'tour2@buyer.com');
check('still resolves to wonka_r1', row?.round === 'wonka_r1', `status=${res.status} row=${JSON.stringify(row)}`);
check('never dropped into a Donna wk_ cohort', !String(row?.round || '').startsWith('wk_'), JSON.stringify(row));

console.log('\n7c. Private Tour bought by a RETURNING Donna member');
reset();
sendState.stripeLineItems = [PRIVATE];
DB.allowed_emails.push({ email: 'tour3@alum.com', round: 'round1', addon_donna: false,
  welcome_email_sent_at: '2026-04-02T00:00:00Z', stripe_payment_id: 'pi_old_donna' });
res = await post(tourSession('tour3@alum.com'));
row = DB.allowed_emails.find(r => r.email === 'tour3@alum.com');
check('moved to wonka_r1', row?.round === 'wonka_r1', JSON.stringify(row));
check('keeps Donna via addon_donna', row?.addon_donna === true, JSON.stringify(row));
check('welcome actually sent', sendState.calls.length === 1, JSON.stringify(sendState.calls));

console.log('\n7d. Private Tour with the rounds row stale (product route must rescue)');
reset();
sendState.stripeLineItems = [PRIVATE];
DB.rounds = [{ id: 'wonka_r1', welcome_email_fn_slug: 'send-welcome-wonka', stripe_plink_full_price: null, stripe_plink_discounted: null, stripe_product_id: null, start_date: '2026-09-01' }];
res = await post(tourSession('tour4@buyer.com'));
row = DB.allowed_emails.find(r => r.email === 'tour4@buyer.com');
check('rescued by FALLBACK_PRODUCT_TO_ROUND', row?.round === 'wonka_r1', `status=${res.status} row=${JSON.stringify(row)}`);
check('never dropped into a Donna wk_ cohort', !String(row?.round || '').startsWith('wk_'), JSON.stringify(row));


console.log('\n7e. Private Tour PLUS the $250 Donna cross-sell (both checkouts offer it)');
reset();
sendState.stripeLineItems = [PRIVATE, 'prod_UxhPy8Tfpeiwv6'];
const bundle: any = tourSession('tour5@buyer.com');
bundle.data.object.amount_total = 324900;             // 2999 + 250
res = await post(bundle);
row = DB.allowed_emails.find(r => r.email === 'tour5@buyer.com');
check('still round = wonka_r1, the add-on never decides the round', row?.round === 'wonka_r1', JSON.stringify(row));
check('Donna add-on granted', row?.addon_donna === true, JSON.stringify(row));
check('Wonka welcome, not a Donna one', sendState.calls.length === 1 && sendState.calls[0].url.includes('send-welcome-wonka'), JSON.stringify(sendState.calls));


// ---------------------------------------------------------------
// ALIAS BUYERS. Two real customers paid $497 on launch day and were refused at
// the gate (11.8): their paying address is an alias row whose primary_email points
// at another row, and BOTH portals follow that pointer. The money upgraded the
// alias; the gate kept reading a Donna round on the target.
console.log('\n8a. Buyer whose paying address is an alias for another row');
reset();
DB.allowed_emails.push({ email: 'alias@buyer.com', round: 'round2', addon_donna: false,
  primary_email: 'primary@buyer.com', welcome_email_sent_at: '2026-04-02T00:00:00Z', stripe_payment_id: 'pi_old' });
DB.allowed_emails.push({ email: 'primary@buyer.com', round: 'wk_2026_06_29', addon_donna: false,
  welcome_email_sent_at: '2026-04-02T00:00:00Z', stripe_payment_id: 'pi_old2' });
res = await post(session('alias@buyer.com'));
const aliasRow = DB.allowed_emails.find(r => r.email === 'alias@buyer.com');
const primaryRow = DB.allowed_emails.find(r => r.email === 'primary@buyer.com');
check('http 200', res.status === 200, `got ${res.status}`);
check('the row the GATE reads is on wonka_r1', primaryRow?.round === 'wonka_r1', JSON.stringify(primaryRow));
check('its Donna access is preserved', primaryRow?.addon_donna === true, JSON.stringify(primaryRow));
check('the alias row is upgraded too', aliasRow?.round === 'wonka_r1', JSON.stringify(aliasRow));
check('alias still points at the primary', aliasRow?.primary_email === 'primary@buyer.com', JSON.stringify(aliasRow));
check('welcome sent once', sendState.calls.length === 1, JSON.stringify(sendState.calls));

// EXPECTATION CHANGED with the cluster invariant, deliberately. It used to demand a
// 500 here, because back then the TARGET row decided access and a missing target
// meant the buyer was lost. Now the buyer's OWN row is made valid, and the portal
// falls back to it when the pointer leads nowhere, so a dangling pointer costs the
// customer nothing. Keeping the old 500 would make Stripe retry forever and light up
// the dashboard for somebody who is already inside.
console.log('\n8b. A dangling alias must not block the buyer');
reset();
DB.allowed_emails.push({ email: 'orphanalias@buyer.com', round: 'round2', addon_donna: false,
  primary_email: 'nobody@nowhere.com', welcome_email_sent_at: null, stripe_payment_id: null });
res = await post(session('orphanalias@buyer.com'));
row = DB.allowed_emails.find(r => r.email === 'orphanalias@buyer.com');
check('http 200', res.status === 200, `got ${res.status}`);
check('their own row is valid, which is all the gate reads', row?.round === 'wonka_r1', JSON.stringify(row));
check('Donna access preserved', row?.addon_donna === true, JSON.stringify(row));
check('welcome sent', sendState.calls.length === 1, JSON.stringify(sendState.calls));

console.log('\n8c. A normal buyer with no alias is untouched');
reset();
res = await post(session('plain@buyer.com'));
row = DB.allowed_emails.find(r => r.email === 'plain@buyer.com');
check('round = wonka_r1', row?.round === 'wonka_r1', JSON.stringify(row));
check('no stray addon_donna', row?.addon_donna !== true, JSON.stringify(row));


// ---------------------------------------------------------------
// THE CLUSTER INVARIANT. RLS ("Users can check their own email") means a portal
// reads exactly ONE row: the signed-in address. So every address a human can sign
// in with must be independently valid. Upgrading only the row that paid is what
// locked two real customers out on launch night.
console.log('\n9a. Buyer paid on the TARGET; the alias they sign in with must work too');
reset();
DB.allowed_emails.push({ email: 'payer@buyer.com', round: 'round2', addon_donna: false,
  welcome_email_sent_at: '2026-04-02T00:00:00Z', stripe_payment_id: 'pi_old' });
DB.allowed_emails.push({ email: 'signin@gmail.com', round: 'round2', addon_donna: false,
  primary_email: 'payer@buyer.com', welcome_email_sent_at: null, stripe_payment_id: null });
res = await post(session('payer@buyer.com'));
let payerRow = DB.allowed_emails.find(r => r.email === 'payer@buyer.com');
let signinRow = DB.allowed_emails.find(r => r.email === 'signin@gmail.com');
check('http 200', res.status === 200, `got ${res.status}`);
check('the row that paid is on wonka_r1', payerRow?.round === 'wonka_r1', JSON.stringify(payerRow));
check('the row they SIGN IN with is on wonka_r1', signinRow?.round === 'wonka_r1', JSON.stringify(signinRow));
check('the linked row keeps its Donna access', signinRow?.addon_donna === true, JSON.stringify(signinRow));
check('the linked row keeps its pointer', signinRow?.primary_email === 'payer@buyer.com', JSON.stringify(signinRow));
check('no welcome claim stolen from the linked row', (signinRow?.welcome_email_sent_at ?? null) === null, JSON.stringify(signinRow));

console.log('\n9b. Two aliases on one human: BOTH must open the door');
reset();
DB.allowed_emails.push({ email: 'hub@buyer.com', round: 'round1', addon_donna: false, welcome_email_sent_at: 'x', stripe_payment_id: 'pi_old' });
DB.allowed_emails.push({ email: 'a1@gmail.com', round: 'round1', addon_donna: false, primary_email: 'hub@buyer.com', welcome_email_sent_at: null });
DB.allowed_emails.push({ email: 'a2@gmail.com', round: 'round1', addon_donna: false, primary_email: 'hub@buyer.com', welcome_email_sent_at: null });
res = await post(session('a1@gmail.com'));
for (const e of ['hub@buyer.com', 'a1@gmail.com', 'a2@gmail.com']) {
  const r = DB.allowed_emails.find(x => x.email === e);
  check(`${e} enters`, r?.round === 'wonka_r1', JSON.stringify(r));
  check(`${e} keeps Donna`, r?.addon_donna === true, JSON.stringify(r));
}

console.log('\n9c. A brand new buyer who happens to be somebody\'s alias target');
reset();
DB.allowed_emails.push({ email: 'ghost@gmail.com', round: 'round2', addon_donna: false, primary_email: 'fresh@buyer.com', welcome_email_sent_at: null });
res = await post(session('fresh@buyer.com'));
check('the new buyer is in', DB.allowed_emails.find(r => r.email === 'fresh@buyer.com')?.round === 'wonka_r1');
check('and so is the row pointing at them', DB.allowed_emails.find(r => r.email === 'ghost@gmail.com')?.round === 'wonka_r1');

console.log('\n9d. A lone buyer with no links is untouched by any of this');
reset();
res = await post(session('lonely@buyer.com'));
row = DB.allowed_emails.find(r => r.email === 'lonely@buyer.com');
check('round = wonka_r1', row?.round === 'wonka_r1', JSON.stringify(row));
check('no stray Donna access', row?.addon_donna !== true, JSON.stringify(row));
check('exactly one row written', DB.allowed_emails.length === 1, JSON.stringify(DB.allowed_emails));

console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
if (fail) Deno.exit(1);
