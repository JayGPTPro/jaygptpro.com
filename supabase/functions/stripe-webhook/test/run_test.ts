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
export const sendState = { ok: true, addonOk: true, calls: [] as any[], stripeLineItems: ['prod_UxhJATVn8CEfCT'] };
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input);
  if (url.includes('/functions/v1/')) {
    sendState.calls.push({ url, body: JSON.parse(init?.body || '{}') });
    const okForThis = url.includes('donna-addon') ? sendState.addonOk : sendState.ok;
    return new Response(JSON.stringify({ ok: okForThis }), { status: okForThis ? 200 : 502 });
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
  LOG.length = 0; sendState.calls = []; sendState.ok = true; sendState.addonOk = true;
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
check('Wonka welcome, not a Donna one', sendState.calls.some(c => c.url.includes('send-welcome-wonka')) && !sendState.calls.some(c => c.url.includes('send-welcome-english')), JSON.stringify(sendState.calls.map(c => c.url)));
// this buyer DID pay for the cross-sell, so the second email is correct, not a leak
check('and the add-on email they paid for', sendState.calls.some(c => c.url.includes('donna-addon')), JSON.stringify(sendState.calls.map(c => c.url)));


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


// ---------------------------------------------------------------
// THE MONEY PATHS. Everything below was found by the 12.8 audit sweep.
const evergreenSession = (email: string, amount = 9700) => ({
  type: 'checkout.session.completed',
  data: { object: { id: 'cs_ever_1', payment_intent: 'pi_ever_1', amount_total: amount, currency: 'usd',
    payment_status: 'paid', customer_email: email,
    customer_details: { name: 'Repeat Buyer', email, phone: null, address: { country: 'US' } },
    customer: 'cus_ever', payment_link: 'plink_1TevFWRqcDuiISNTHnwIfuLq' } },
});

console.log('\n10a. A repeat customer buying a DONNA product gets a welcome and the right round');
reset();
DB.allowed_emails.push({ email: 'alum@buyer.com', round: 'round1', addon_donna: false,
  welcome_email_sent_at: '2026-04-02T00:00:00Z', stripe_payment_id: 'pi_old' });
res = await post(evergreenSession('alum@buyer.com'));
row = DB.allowed_emails.find(r => r.email === 'alum@buyer.com');
check('http 200', res.status === 200, `got ${res.status}`);
check('moved onto the cohort they just bought', String(row?.round || '').startsWith('wk_'), JSON.stringify(row));
check('welcome actually sent', sendState.calls.length === 1, JSON.stringify(sendState.calls));

console.log('\n10b. A WONKA ticket holder buying Donna keeps the bootcamp');
reset();
DB.allowed_emails.push({ email: 'wonkabuyer@x.com', round: 'wonka_r1', addon_donna: false,
  welcome_email_sent_at: '2026-08-11T00:00:00Z', stripe_payment_id: 'pi_wonka' });
res = await post(evergreenSession('wonkabuyer@x.com'));
row = DB.allowed_emails.find(r => r.email === 'wonkabuyer@x.com');
check('still holds wonka_r1', row?.round === 'wonka_r1', JSON.stringify(row));
check('gains Donna via addon_donna', row?.addon_donna === true, JSON.stringify(row));
check('welcome sent for the new purchase', sendState.calls.length === 1, JSON.stringify(sendState.calls));

console.log('\n10c. An unpaid checkout session grants nothing');
reset();
let unpaid: any = session('pending@buyer.com');
unpaid.data.object.payment_status = 'unpaid';
res = await post(unpaid);
check('http 200 but skipped', res.status === 200, `got ${res.status}`);
check('no access row written', !DB.allowed_emails.find(r => r.email === 'pending@buyer.com'), JSON.stringify(DB.allowed_emails));
check('no welcome sent', sendState.calls.length === 0);

console.log('\n10d. A thin payment_intent event must not blank the good row');
reset();
await post(session('thin@buyer.com'));
const before = DB.stripe_customers.find(r => r.id === 'pi_test_1');
res = await post({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_test_1', amount: 69700, currency: 'usd', customer: 'cus_test' } } });
const after = DB.stripe_customers.find(r => r.id === 'pi_test_1');
check('email survives', after?.email === 'thin@buyer.com', JSON.stringify(after));
check('round survives', after?.round === 'wonka_r1', JSON.stringify(after));

console.log('\n10e. Refunding Wonka revokes Wonka even when an old Donna payment exists');
reset();
DB.allowed_emails.push({ email: 'two@buyer.com', round: 'wonka_r1', addon_donna: true, welcome_email_sent_at: 'x', stripe_payment_id: 'pi_w' });
DB.stripe_customers.push({ id: 'pi_donna_old', email: 'two@buyer.com', amount_paid: 9700, refunded: false, coupon_used: 'FULL_PRICE', round: 'wk_2026_06_01' });
DB.stripe_customers.push({ id: 'pi_w', email: 'two@buyer.com', amount_paid: 69700, refunded: false, coupon_used: 'FULL_PRICE', round: 'wonka_r1' });
res = await post({ type: 'charge.refunded', data: { object: { id: 'ch_w', payment_intent: 'pi_w', amount: 69700, amount_refunded: 69700, refunded: true, currency: 'usd', created: 1786000000, billing_details: { email: 'two@buyer.com' }, refunds: { data: [{ created: 1786000000, reason: 'requested_by_customer' }] } } } });
row = DB.allowed_emails.find(r => r.email === 'two@buyer.com');
check('access revoked despite the live Donna payment', !!row?.access_revoked_at, JSON.stringify(row));

console.log('\n10f. Partial refunds accumulate instead of double counting');
reset();
DB.stripe_customers.push({ id: 'pi_p', email: 'part@buyer.com', amount_paid: 69700, refunded: false, refund_amount: 0, coupon_used: 'FULL_PRICE', round: 'wonka_r1' });
DB.allowed_emails.push({ email: 'part@buyer.com', round: 'wonka_r1', addon_donna: false, welcome_email_sent_at: 'x' });
const partial = (amt: number) => ({ type: 'refund.created', data: { object: { id: 'rf', payment_intent: 'pi_p', amount: amt, status: 'succeeded', created: 1786000000, reason: null } } });
await post(partial(23234)); await post(partial(23233));
let pay = DB.stripe_customers.find(r => r.id === 'pi_p');
check('two partials accumulate', pay?.refund_amount === 46467, JSON.stringify(pay));
check('not marked fully refunded yet', pay?.refunded === false, JSON.stringify(pay));
check('access still intact', !DB.allowed_emails.find(r => r.email === 'part@buyer.com')?.access_revoked_at);
await post(partial(23233));
pay = DB.stripe_customers.find(r => r.id === 'pi_p');
check('the third partial completes the refund', pay?.refunded === true, JSON.stringify(pay));
check('and now access goes', !!DB.allowed_emails.find(r => r.email === 'part@buyer.com')?.access_revoked_at);

console.log('\n10g. A chargeback pulls access when the funds are actually withdrawn');
reset();
DB.stripe_customers.push({ id: 'pi_cb', email: 'cb@buyer.com', amount_paid: 69700, refunded: false, coupon_used: 'FULL_PRICE', round: 'wonka_r1' });
DB.allowed_emails.push({ email: 'cb@buyer.com', round: 'wonka_r1', addon_donna: false, welcome_email_sent_at: 'x' });
await post({ type: 'charge.dispute.created', data: { object: { charge: 'pi_cb', payment_intent: 'pi_cb', status: 'needs_response', amount: 69700 } } });
check('an opened dispute alone does not revoke', !DB.allowed_emails.find(r => r.email === 'cb@buyer.com')?.access_revoked_at);
await post({ type: 'charge.dispute.funds_withdrawn', data: { object: { charge: 'pi_cb', payment_intent: 'pi_cb', status: 'lost', amount: 69700 } } });
check('losing the dispute revokes', !!DB.allowed_emails.find(r => r.email === 'cb@buyer.com')?.access_revoked_at);
await post({ type: 'charge.dispute.funds_reinstated', data: { object: { charge: 'pi_cb', payment_intent: 'pi_cb', status: 'won', amount: 69700 } } });
check('winning it back restores access', !DB.allowed_emails.find(r => r.email === 'cb@buyer.com')?.access_revoked_at);

console.log('\n10h. A refund never lands on the wrong payment');
reset();
DB.stripe_customers.push({ id: 'pi_first', email: 'multi@buyer.com', amount_paid: 9700, refunded: false, coupon_used: 'FULL_PRICE', round: 'round1', stripe_customer_id: 'cus_same' });
DB.stripe_customers.push({ id: 'pi_second', email: 'multi@buyer.com', amount_paid: 69700, refunded: false, coupon_used: 'FULL_PRICE', round: 'wonka_r1', stripe_customer_id: 'cus_same' });
DB.allowed_emails.push({ email: 'multi@buyer.com', round: 'wonka_r1', addon_donna: true, welcome_email_sent_at: 'x' });
await post({ type: 'charge.refunded', data: { object: { id: 'ch_2', payment_intent: 'pi_second', amount: 69700, amount_refunded: 69700, refunded: true, currency: 'usd', created: 1786000000, customer: 'cus_same', billing_details: { email: 'multi@buyer.com' }, refunds: { data: [{ created: 1786000000, reason: null }] } } } });
check('the refunded payment is the one flagged', DB.stripe_customers.find(r => r.id === 'pi_second')?.refunded === true);
check('the older payment is untouched', DB.stripe_customers.find(r => r.id === 'pi_first')?.refunded === false);

console.log('\n10i. A manual revocation is not undone by a later webhook');
reset();
DB.allowed_emails.push({ email: 'banned@buyer.com', round: 'round1', addon_donna: false, welcome_email_sent_at: 'x',
  access_revoked_at: '2026-05-01T00:00:00Z', access_revoked_reason: 'Chargeback abuse, revoked by Jay' });
DB.stripe_customers.push({ id: 'pi_b', email: 'banned@buyer.com', amount_paid: 9700, refunded: false, coupon_used: 'FULL_PRICE', round: 'round1' });
await post({ type: 'refund.created', data: { object: { id: 'rf2', payment_intent: 'pi_b', amount: 1, status: 'succeeded', created: 1786000000 } } });
row = DB.allowed_emails.find(r => r.email === 'banned@buyer.com');
check('hand-written revocation survives', !!row?.access_revoked_at, JSON.stringify(row));
check('and keeps its reason', String(row?.access_revoked_reason || '').includes('Jay'), JSON.stringify(row));


console.log('\n10j. A delayed payment grants access only when it clears');
reset();
let pend: any = session('slow@buyer.com');
pend.data.object.payment_status = 'unpaid';
await post(pend);
check('nothing granted while unpaid', !DB.allowed_emails.find(r => r.email === 'slow@buyer.com'));
let cleared: any = session('slow@buyer.com');
cleared.type = 'checkout.session.async_payment_succeeded';
cleared.data.object.payment_status = 'paid';
res = await post(cleared);
row = DB.allowed_emails.find(r => r.email === 'slow@buyer.com');
check('granted once it clears', row?.round === 'wonka_r1', JSON.stringify(row));
check('and the welcome goes out', sendState.calls.length === 1, JSON.stringify(sendState.calls));

console.log('\n10k. A failed delayed payment grants nothing and says so');
reset();
res = await post({ type: 'checkout.session.async_payment_failed', data: { object: { id: 'cs_failed' } } });
check('http 200', res.status === 200, `got ${res.status}`);
check('no row', DB.allowed_emails.length === 0, JSON.stringify(DB.allowed_emails));


// ---------------------------------------------------------------
// THE $250 CROSS-SELL. Its email must reach exactly the people who paid for it.
const ADDON = 'prod_UxhPy8Tfpeiwv6';
console.log('\n11a. A buyer who took the add-on gets BOTH emails');
reset();
sendState.stripeLineItems = ['prod_UxhJATVn8CEfCT', ADDON];
const withAddon: any = session('addon@buyer.com', 74700);
res = await post(withAddon);
row = DB.allowed_emails.find(r => r.email === 'addon@buyer.com');
check('http 200', res.status === 200, `got ${res.status}`);
check('addon_donna granted', row?.addon_donna === true, JSON.stringify(row));
check('the Wonka welcome went', sendState.calls.some(c => c.url.includes('send-welcome-wonka')), JSON.stringify(sendState.calls.map(c => c.url)));
check('the add-on welcome went too', sendState.calls.some(c => c.url.includes('donna-addon')), JSON.stringify(sendState.calls.map(c => c.url)));
check('and it carries the session id, so the callee can verify it', sendState.calls.find(c => c.url.includes('donna-addon'))?.body?.sessionId === 'cs_test_1', JSON.stringify(sendState.calls));

console.log('\n11b. A plain Golden Ticket buyer gets NOTHING about the Challenge');
reset();
sendState.stripeLineItems = ['prod_UxhJATVn8CEfCT'];
await post(session('plain2@buyer.com'));
check('no add-on email', !sendState.calls.some(c => c.url.includes('donna-addon')), JSON.stringify(sendState.calls.map(c => c.url)));

console.log('\n11c. A returning Donna member who buys Wonka gets addon_donna but NOT the email');
reset();
sendState.stripeLineItems = ['prod_UxhJATVn8CEfCT'];
DB.allowed_emails.push({ email: 'returning@buyer.com', round: 'round1', addon_donna: false, welcome_email_sent_at: 'x', stripe_payment_id: 'pi_old' });
await post(session('returning@buyer.com'));
row = DB.allowed_emails.find(r => r.email === 'returning@buyer.com');
check('addon_donna set to preserve their Donna access', row?.addon_donna === true, JSON.stringify(row));
check('but no add-on email, they never paid the $250', !sendState.calls.some(c => c.url.includes('donna-addon')), JSON.stringify(sendState.calls.map(c => c.url)));

console.log('\n11d. A failed add-on send makes Stripe retry');
reset();
sendState.stripeLineItems = ['prod_UxhJATVn8CEfCT', ADDON];
sendState.addonOk = false;
res = await post(session('addonfail@buyer.com', 74700));
check('http 500', res.status === 500, `got ${res.status}`);
sendState.addonOk = true;
res = await post(session('addonfail@buyer.com', 74700));
check('the retry delivers it', sendState.calls.filter(c => c.url.includes('donna-addon')).length === 2, JSON.stringify(sendState.calls.map(c => c.url)));
check('and does not send a second Wonka welcome', sendState.calls.filter(c => c.url.includes('send-welcome-wonka')).length === 1, JSON.stringify(sendState.calls.map(c => c.url)));

console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
if (fail) Deno.exit(1);
