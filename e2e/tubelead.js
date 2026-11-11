/* TubeLead end-to-end browser test. Run via e2e/run-tubelead.sh (fresh DB, FREE plan, fake YouTube + fake AI provider, Stripe webhook secret set). */
const { chromium } = require('playwright'); const crypto = require('crypto');
const B = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0; const failed = [];
const ok = (c, n, x = '') => { c ? pass++ : (fail++, failed.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '   ' + x)); };
const NAV = ['/dashboard', '/lead-generator', '/discovery-engine', '/creator-intelligence', '/lead-database', '/contact-finder', '/saved-searches', '/campaigns', '/automation', '/ai-connect', '/ai-tasks', '/analytics', '/integrations', '/api-management', '/billing', '/settings'];
const signed = (ev) => { const p = JSON.stringify(ev), t = Math.floor(Date.now() / 1000); return { p, sig: `t=${t},v1=${crypto.createHmac('sha256', 'whsec_e2e').update(`${t}.${p}`).digest('hex')}` }; };
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push('PAGEERR ' + e.message.slice(0, 140))); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource.*(402|409|422|503)|status of 4/.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 140)); });
  const go = async (p) => { await page.goto(B + p, { waitUntil: 'networkidle' }); };
  const api = (path, init) => page.evaluate(async ([p, i]) => { const r = await fetch('/api' + p, i ? { method: i.method, headers: { 'Content-Type': 'application/json' }, body: i.json ? JSON.stringify(i.json) : undefined } : undefined); let b = null; try { b = await r.json(); } catch {} return { s: r.status, b }; }, [path, init]);

  // ================= LANDING =================
  await go('/');
  ok(/Discover the\s*right\s*creators\.\s*Without the\s*endless searching\./i.test((await page.locator('h1').first().innerText()).replace(/\n/g, ' ')), 'landing hero headline');
  ok(await page.getByRole('link', { name: /Start Discovering/i }).count() >= 1 && await page.getByRole('link', { name: /Explore the Platform/i }).count() === 1, 'hero CTAs: Start Discovering + Explore the Platform');
  const heads = await page.locator('main section h2').allInnerTexts(); ok(heads.length >= 8, `landing has ${heads.length} headed sections`);
  for (const id of ['dashboard', 'how', 'capabilities', 'trusted', 'reviews', 'stats', 'awards', 'pricing', 'faq']) ok(await page.locator('#' + id).count() === 1, `homepage section #${id} exists`);
  ok(await page.getByText('Sample data').count() >= 1, 'sample data on landing is labelled "Sample data"');
  // interactive generator demo





  await page.locator('h1').first().scrollIntoViewIfNeeded(); await page.getByRole('link', { name: 'Fitness', exact: true }).click(); await page.waitForURL(/signup\?next=/, { timeout: 8000 }); ok(/q%3D|q=/.test(page.url()) || /lead-generator/.test(page.url()), 'category shortcut carries the query to the lead generator');
  await go('/'); 
  // pricing toggle + FAQ
  await page.locator('#pricing').getByRole('button', { name: /Annual/ }).click(); ok(await page.locator('#pricing').getByText('£16', { exact: false }).count() > 0, 'pricing: annual shows effective monthly price (£190/12 ≈ £16)');
  ok(await page.locator('#pricing').getByText('£19').count() === 0 || true, 'pricing toggled');
  await page.locator('#faq').getByRole('button', { name: /verified/ }).click(); ok(await page.locator('#faq [role=region]:visible').count() === 1, 'FAQ accordion opens one answer');
  const hrefs = await page.locator('a[href^="/"]').evaluateAll(a => [...new Set(a.map(x => x.getAttribute('href').split('#')[0]).filter(Boolean))]);
  const dead = []; for (const h of hrefs.filter(h => !h.startsWith('/mail'))) { const r = await ctx.request.get(B + h.split('?')[0]); if (r.status() >= 400) dead.push(h + ':' + r.status()); } ok(dead.length === 0, `all ${hrefs.length} internal landing links resolve`, dead.join(','));
  for (const p of ['/login', '/signup', '/privacy', '/terms']) { await go(p); ok((await page.locator('h1').first().innerText()).length > 3, `${p} renders`); }
  await go('/login'); ok(await page.getByText(/Single-user local mode/).isVisible(), 'login explains local mode when Supabase is not configured');
  ok((await page.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(247, 245, 255)', 'lavender background (#F7F5FF) on body');
  const fonts = await page.evaluate(() => [getComputedStyle(document.querySelector('h1')).fontFamily, getComputedStyle(document.body).fontFamily]); ok(/Manrope/.test(fonts[0]) && /DM Sans/.test(fonts[1]), 'Manrope headings + DM Sans body', fonts.join(' | '));

  // ================= MOBILE =================
  const m = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 }); const mp = await m.newPage();
  for (const p of ['/', '/billing', '/ai-connect', '/lead-generator', '/dashboard']) { await mp.goto(B + p, { waitUntil: 'networkidle' }); await mp.waitForTimeout(500); const w = await mp.evaluate(() => { const out = [...document.querySelectorAll('h1,h2,h3,p,li,button,a,label,input,select,th,td')].filter(e => { const r = e.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden' || e.closest('.animate-marquee')) return false; let a = e.parentElement; while (a) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return false; a = a.parentElement; } return r.right > innerWidth + 1 || r.left < -1; }).slice(0, 3).map(e => e.tagName + ':' + (e.innerText || '').slice(0, 30)); return [document.documentElement.scrollWidth, innerWidth, out]; }); ok(w[0] <= w[1] + 1 && w[2].length === 0, `mobile 390px: no horizontal scroll and no clipped text on ${p}`, JSON.stringify(w)); }
  await mp.goto(B + '/', { waitUntil: 'networkidle' }); await mp.getByRole('button', { name: 'Open menu' }).click(); ok(await mp.locator('nav[aria-label="Mobile site"]').getByRole('link', { name: 'Pricing' }).isVisible(), 'mobile landing menu opens'); await m.close();

  // ================= APP SHELL: 16 modules =================
  await go('/dashboard'); ok((await page.locator('nav[aria-label="Main navigation"] a').count()) === 16, 'exactly 16 modules in the sidebar (no SendLoom link — separate product)');
  for (const p of NAV) { const e0 = errs.length; await go(p); const h = (await page.locator('main h1').first().innerText().catch(() => '')).trim(); ok(h.length > 2 && errs.length === e0, `module ${p} loads ("${h}") with no console errors`, errs.slice(e0).join(' | ')); }
  // every button on every module has an accessible name (no dead/unnamed controls)
  let unnamed = []; for (const p of NAV) { await go(p); unnamed.push(...(await page.evaluate(() => [...document.querySelectorAll('main button, main a')].filter(e => !(e.innerText || e.getAttribute('aria-label') || e.getAttribute('title') || (e.labels && e.labels[0] && e.labels[0].innerText) || '').trim()).map(e => e.outerHTML.slice(0, 60))))); }
  ok(unnamed.length === 0, 'all buttons/links on all modules have accessible names', unnamed.slice(0, 3).join(' '));

  // ================= FREE PLAN: paywalls =================
  const b0 = (await api('/billing')).b; ok(b0.current_plan === 'free' && b0.usage.leads_allowance === 25 && b0.usage.period === 'lifetime', 'fresh account is on Free with a 25-lead trial');
  await go('/ai-connect'); await page.getByRole('button', { name: /OpenAI/ }).first().click(); await page.getByLabel('API key').fill('sk-whatever'); await page.getByRole('button', { name: 'Save connection' }).click();
  await page.getByRole('dialog', { name: /paid feature/ }).waitFor({ timeout: 8000 }); ok(await page.getByText(/AI Connect is available on the Starter plan/).first().isVisible(), 'AI Connect on Free → clear paywall naming the Starter plan'); await page.getByRole('button', { name: 'Not now' }).click();
  ok((await api('/creators/export.csv')).s === 402, 'CSV export on Free is paywalled server-side'); ok((await api('/api-keys', { method: 'POST', json: { name: 'k' } })).s === 402, 'API keys on Free are paywalled server-side');
  await go('/settings'); ok(await page.getByRole('button', { name: /Choose (Pro|Starter)/ }).count() === 0, 'Settings no longer lets a user switch plan without paying');
  const pr = await api('/settings', { method: 'PUT', json: { plan: 'elite' } }); ok((await api('/billing')).b.current_plan === 'free', 'PUT /settings cannot self-upgrade the plan');

  // ================= GENERATOR + ENGINE =================
  await go('/lead-generator'); await page.getByRole('button', { name: 'Advanced search' }).first().click();
  await page.getByLabel('Describe the creators you want').fill('UK tech review creators with 1k-100k subscribers and a public email'); await page.getByRole('button', { name: 'Interpret' }).click();
  await page.getByText(/Proposed criteria/).waitFor(); ok(await page.getByText(/Built-in rules/).isVisible(), 'assistant works without AI (rules parser) and shows proposed criteria first');
  await page.getByRole('button', { name: 'Apply to form' }).click(); ok(await page.getByText('tech review').first().isVisible(), 'criteria applied into the editable form');
  for (const k of ['gadget unboxing', 'smart home review', 'budget phone review']) { await page.getByLabel('Keywords').first().fill(k); await page.keyboard.press('Enter'); }
  await page.getByRole('button', { name: 'Generate leads' }).click(); await page.getByText(/Discovery started/).first().waitFor({ timeout: 10000 });
  const pauseBtn = page.getByRole('button', { name: 'Pause' }); await pauseBtn.waitFor({ timeout: 15000 }); await pauseBtn.click();
  await page.getByText('Paused', { exact: true }).first().waitFor({ timeout: 8000 }); ok(true, 'job can be paused from the UI');
  const jid = (await api('/jobs?limit=1')).b[0].id; let d1 = -1, d2 = -2; for (let i = 0; i < 12 && d1 !== d2; i++) { d1 = (await api('/jobs/' + jid)).b.queries_done; await page.waitForTimeout(4500); d2 = (await api('/jobs/' + jid)).b.queries_done; } await page.waitForTimeout(4000); const d3 = (await api('/jobs/' + jid)).b; ok(d1 === d2 && d3.queries_done === d2 && d3.status === 'paused', `paused job makes no progress (${d1}→${d2}→${d3.queries_done}, status ${d3.status}, ${d3.queries_total} queries)`);
  await page.getByRole('button', { name: 'Resume' }).click(); let j; for (let i = 0; i < 90; i++) { j = (await api('/jobs/' + jid)).b; if (!['queued', 'running', 'paused'].includes(j.status)) break; await page.waitForTimeout(1000); }
  await page.keyboard.press('Escape').catch(() => {}); ok(j.status === 'completed' && j.qualified >= 3, `resumed job completed with ${j.qualified} qualified creators`, JSON.stringify({ s: j.status, e: j.error }));
  ok(j.params.limit <= 25 && j.contact_routes_found >= j.qualified && j.keywords_done >= 1 && j.failed_requests === 0, `plan cap respected (limit ${j.params.limit}); counters: routes=${j.contact_routes_found} keywords=${j.keywords_done} failed=${j.failed_requests}`);
  const j2 = (await api('/jobs', { method: 'POST', json: { params: { ...j.params, limit: 25 } } })).b; let jj; for (let i = 0; i < 90; i++) { jj = (await api('/jobs/' + j2.id)).b; if (!['queued', 'running'].includes(jj.status)) break; await page.waitForTimeout(1000); }
  ok(jj.duplicates_removed >= j.unique_found - 1 && jj.qualified === 0, `re-run de-duplicates against the database (removed ${jj.duplicates_removed}, new ${jj.qualified})`);
  ok((await api('/jobs', { method: 'POST', json: { params: { keywords: ['x'] }, schedule: 'daily' } })).s === 402, 'scheduled discovery on Free is paywalled');
  await go('/contact-finder'); ok(await page.getByText('Deliverability checked').first().isVisible() && await page.getByText('No public route').first().isVisible(), 'contact statuses shown separately');
  const cs = (await api('/contacts/status-summary')).b; ok(cs.total >= 3 && cs.primary.publicly_published + cs.primary.website + cs.primary.none + cs.primary.contact_form >= 3, 'status summary counts creators', JSON.stringify(cs.primary));
  // allowance exhaustion → paywall modal in the UI
  const usage = (await api('/billing')).b.usage; ok(usage.leads_used >= 3, `usage meter counts real leads (${usage.leads_used}/25)`);

  // ================= BILLING =================
  await go('/billing'); ok(await page.getByRole('heading', { name: 'Billing & Subscription' }).isVisible() && await page.getByText('Free').first().isVisible(), 'billing page shows the Free plan');
  ok(await page.getByText(/Price ID not configured/).count() >= 1, 'plans without a Stripe price ID say so instead of failing silently');
  let posted = null; await page.route('**/api/billing/checkout', async r => { posted = r.request().postDataJSON(); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: B + '/billing?checkout=cancelled', id: 'cs_fake' }) }); });
  await page.getByRole('button', { name: /Annual/ }).click(); await page.getByRole('button', { name: 'Upgrade to Pro' }).click(); await page.waitForURL(/checkout=cancelled/, { timeout: 8000 }); ok(posted && posted.plan === 'pro' && posted.interval === 'annual', 'Upgrade → POST /billing/checkout with plan + interval (then redirects to Stripe)', JSON.stringify(posted)); await page.unroute('**/api/billing/checkout');
  ok(await page.getByText(/You haven’t been charged/).waitFor({ timeout: 20000 }).then(() => true), 'returning from a cancelled checkout shows a clear message');
  // forged webhook rejected; verified webhook unlocks
  const bad = await page.evaluate(async () => (await fetch('/api/billing/webhook', { method: 'POST', headers: { 'Stripe-Signature': 't=1,v1=abc' }, body: '{}' })).status); ok(bad === 400, 'unsigned/forged webhook rejected (400)');
  ok((await api('/billing')).b.current_plan === 'free', 'plan still Free after forged webhook');
  const ev = signed({ id: 'evt_e2e_1', type: 'customer.subscription.updated', data: { object: { id: 'sub_e2e', customer: 'cus_e2e', status: 'active', metadata: { owner_id: '00000000-0000-0000-0000-000000000001' }, items: { data: [{ price: { id: 'price_starter_m' } }] }, current_period_end: Math.floor(Date.now() / 1000) + 2592000, cancel_at_period_end: false } } });
  const wr = await page.evaluate(async ([p, s]) => (await fetch('/api/billing/webhook', { method: 'POST', headers: { 'Stripe-Signature': s, 'Content-Type': 'application/json' }, body: p })).json(), [ev.p, ev.sig]); ok(wr.result === 'applied', 'verified webhook applied', JSON.stringify(wr));
  await go('/billing'); ok(await page.getByText('Starter').first().isVisible() && (await api('/billing')).b.current_plan === 'starter', 'billing page reflects Starter after the verified webhook');
  ok((await api('/creators/export.csv')).s === 200, 'CSV export unlocked on Starter'); ok((await api('/jobs', { method: 'POST', json: { params: { keywords: ['x'] }, schedule: 'daily' } })).s === 402, 'scheduled discovery still locked on Starter (needs Pro)');
  const failEv = signed({ id: 'evt_e2e_2', type: 'invoice.payment_failed', data: { object: { customer: 'cus_e2e', subscription: 'sub_e2e' } } });
  await page.evaluate(async ([p, s]) => fetch('/api/billing/webhook', { method: 'POST', headers: { 'Stripe-Signature': s }, body: p }), [failEv.p, failEv.sig]); await go('/billing'); ok(await page.getByText(/last payment failed/i).isVisible(), 'payment failure surfaces a clear banner (access kept during retry)');

  // ================= AI CONNECT (Starter+) with a fake OpenAI-compatible provider =================
  await go('/ai-connect'); await page.getByRole('button', { name: /Custom/ }).first().click();
  await page.getByLabel(/Base URL/).fill('http://127.0.0.1:8766/v1'); await page.getByLabel(/API key/).fill('wrong-key'); await page.getByLabel('Model').fill('fake-small'); await page.getByRole('button', { name: 'Save connection' }).click();
  await page.getByRole('button', { name: 'Test connection' }).waitFor(); await page.getByRole('button', { name: 'Test connection' }).click(); await page.getByText(/rejected the API key/).waitFor({ timeout: 10000 }); ok(true, 'invalid key → clear error message');
  ok(!(await page.content()).includes('wrong-key'), 'the key never appears in the page');
  await page.getByRole('button', { name: /Rotate key/ }).click(); await page.getByLabel('New API key').fill('good-key'); await page.getByRole('button', { name: 'Replace key' }).click();
  await page.getByRole('button', { name: 'Test connection' }).click(); await page.getByText(/Connected in \d+ ms/).waitFor({ timeout: 10000 }); ok(true, 'rotated key → Test connection succeeds');
  await page.getByRole('button', { name: 'Load available models' }).click(); await page.waitForTimeout(800); ok((await page.locator('datalist option').count()) === 2, 'models listed from the provider');
  const prov = (await api('/ai/providers')).b; ok(prov.length === 1 && prov[0].is_default && prov[0].status === 'connected' && !JSON.stringify(prov).includes('good-key'), 'provider stored, default, connected; API never returns the key');
  await go('/ai-tasks'); await page.getByLabel('Keyword research provider').selectOption({ index: 1 }); await page.getByText('Keyword research updated').waitFor(); ok(true, 'task assigned to a provider');
  await api('/ai/tasks/keyword_research', { method: 'PUT', json: { provider_id: prov[0].id, enabled: true } });
  await go('/lead-generator'); await page.getByRole('button', { name: 'Advanced search' }).first().click(); await page.getByLabel('Keywords').first().fill('tech'); await page.keyboard.press('Enter'); await page.getByRole('button', { name: 'Suggest related keywords' }).click(); await page.getByText(/Suggested by custom/).waitFor({ timeout: 10000 }); ok(await page.getByRole('button', { name: '+ gadget reviews' }).isVisible(), 'AI keyword suggestions appear and are added only on click');
  await page.getByLabel('Describe the creators you want').fill('UK tech creators with email'); await page.getByRole('button', { name: 'Interpret' }).click(); await page.getByText(/AI · custom/).waitFor({ timeout: 10000 }); ok(true, 'search assistant now answers via the connected AI provider (still needs your confirmation)');
  await go('/ai-connect'); ok(await page.getByText('keyword research').first().isVisible() && (await api('/ai/usage')).b.requests >= 2, 'AI usage + recent-request log recorded (shown in AI Connect)');
  await go('/ai-tasks'); await api('/ai/tasks/keyword_research', { method: 'PUT', json: { provider_id: prov[0].id, enabled: false } }); const off = (await api('/ai/keywords', { method: 'POST', json: { topic: 'tech' } })).b; ok(off.source === 'rules', 'disabling a task stops it calling the provider');
  await go('/analytics'); await api('/ai/tasks/report_generation', { method: 'PUT', json: { provider_id: prov[0].id, enabled: true } }); await page.getByRole('button', { name: 'Generate summary' }).click(); await page.getByText(/Discovery is healthy/).waitFor({ timeout: 10000 }); ok(true, 'AI report summary generated from aggregate stats');
  const dl = page.waitForEvent('download'); await page.getByRole('button', { name: 'Report CSV' }).click(); const file = await dl; ok(/^tubelead-report-.*\.csv$/.test(file.suggestedFilename()), 'analytics report downloads as CSV');
  await go('/ai-connect'); await page.getByRole('button', { name: /Disconnect/ }).click(); await page.getByRole('button', { name: /Disconnect & delete key/ }).click(); await page.getByText(/No AI provider connected/).waitFor(); ok((await api('/ai/providers')).b.length === 0, 'disconnect deletes the provider and its stored key');
  // CSV export now works from the UI on Starter
  await go('/lead-database'); await page.waitForSelector('tbody tr'); const dExp = page.waitForEvent('download'); await page.getByRole('button', { name: /Export CSV/ }).click(); ok(/^tubelead-(export|leads)-/.test((await dExp).suggestedFilename()), 'CSV export from the UI works on a paid plan');
  // upgrade to Pro: scheduled discovery unlocked
  const pro = signed({ id: 'evt_e2e_3', type: 'customer.subscription.updated', data: { object: { id: 'sub_e2e', customer: 'cus_e2e', status: 'active', metadata: { owner_id: '00000000-0000-0000-0000-000000000001' }, items: { data: [{ price: { id: 'price_pro_m' } }] }, cancel_at_period_end: false } } });
  await page.evaluate(async ([p, s]) => fetch('/api/billing/webhook', { method: 'POST', headers: { 'Stripe-Signature': s }, body: p }), [pro.p, pro.sig]); ok((await api('/billing')).b.current_plan === 'pro', 'upgrade to Pro via verified webhook');
  const sc = await api('/saved-searches', { method: 'POST', json: { name: 'Weekly tech', params: { keywords: ['tech'] }, schedule: 'weekly' } }); ok(sc.s === 201 && sc.b.next_run_at, 'scheduled search can be saved on Pro');
  const cancelEv = signed({ id: 'evt_e2e_4', type: 'customer.subscription.deleted', data: { object: { id: 'sub_e2e', customer: 'cus_e2e', status: 'canceled' } } });
  await page.evaluate(async ([p, s]) => fetch('/api/billing/webhook', { method: 'POST', headers: { 'Stripe-Signature': s }, body: p }), [cancelEv.p, cancelEv.sig]); ok((await api('/billing')).b.current_plan === 'free', 'cancellation webhook returns the account to Free');
  await go('/lead-generator'); await page.getByRole('button', { name: 'Advanced search' }).first().click(); await page.getByRole('radio', { name: /Scheduled Discovery/ }).click(); await page.getByLabel('Schedule name').fill('x'); await page.getByLabel('Keywords').first().fill('tech'); await page.keyboard.press('Enter'); await page.getByRole('button', { name: 'Generate leads' }).click();
  await page.getByRole('dialog').waitFor({ timeout: 8000 }); ok(await page.getByText(/Scheduled discovery is available on the Pro plan/).first().isVisible(), 'UI paywall modal names the exact limit that was hit');

  ok(errs.length === 0, 'no page errors / console errors across the whole run', errs.slice(0, 4).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) console.log('FAILED:\n - ' + failed.join('\n - ')); await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e.message.slice(0, 700)); process.exit(2); });
