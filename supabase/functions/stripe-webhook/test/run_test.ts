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

console.log(`\n${fail === 0 ? 'ALL GREEN' : 'FAILURES'}: ${pass} passed, ${fail} failed\n`);
if (fail) Deno.exit(1);
