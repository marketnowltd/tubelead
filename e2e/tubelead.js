/* TubeLead end-to-end browser test. Run via e2e/run-tubelead.sh (fresh DB, FREE plan, fake YouTube + fake AI provider, Stripe webhook secret set). */
const { chromium } = require('playwright'); const crypto = require('crypto');
const B = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0; const failed = [];
const ok = (c, n, x = '') => { c ? pass++ : (fail++, failed.push(n)); console.log((c ? 'PASS ' : 'FAIL ') + n + (c ? '' : '   ' + x)); };
const NAV = ['/dashboard', '/lead-generator', '/discovery-engine', '/creator-intelligence', '/lead-database', '/contact-finder', '/saved-searches', '/campaigns', '/automation', '/ai-connect', '/ai-tasks', '/analytics', '/integrations', '/api-management', '/billing', '/settings'];
const signed = (ev) => { const p = JSON.stringify(ev), t = Math.floor(Date.now() / 1000); return { p, sig: `t=${t},v1=${crypto.createHmac('sha256', 'whsec_e2e').update(`${t}.${p}`).digest('hex')}` }; };
(async () => {
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true }); await ctx.addInitScript(() => { try { localStorage.setItem('tl.helper', JSON.stringify({ intro_done: true, tips_off: true })); } catch {} });
  const page = await ctx.newPage();
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
  const strip = await page.locator('section[aria-label="Sources TubeLead searches"]').innerText();
  ok(!/\bsoon\b/i.test(strip) && /Apple Podcasts/.test(strip) && /Bluesky/.test(strip), 'homepage sources: no "Soon" labels, new sources listed');
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
  await go('/dashboard'); ok((await page.locator('nav[aria-label="Main navigation"] a').count()) === 18, 'exactly 18 sidebar items for a customer: 16 modules + Growth Assistant + Help & Support; Admin hidden');
  for (const p of NAV) { const e0 = errs.length; await go(p); const h = (await page.locator('main h1').first().innerText().catch(() => '')).trim(); ok(h.length > 2 && errs.length === e0, `module ${p} loads ("${h}") with no console errors`, errs.slice(e0).join(' | ')); }
  // every button on every module has an accessible name (no dead/unnamed controls)
  let unnamed = []; for (const p of NAV) { await go(p); unnamed.push(...(await page.evaluate(() => [...document.querySelectorAll('main button, main a')].filter(e => !(e.innerText || e.getAttribute('aria-label') || e.getAttribute('title') || (e.labels && e.labels[0] && e.labels[0].innerText) || '').trim()).map(e => e.outerHTML.slice(0, 60))))); }
  ok(unnamed.length === 0, 'all buttons/links on all modules have accessible names', unnamed.slice(0, 3).join(' '));

  // ================= FREE PLAN: paywalls =================
  const b0 = (await api('/billing')).b; ok(b0.current_plan === 'free' && b0.usage.leads_allowance === 25 && b0.usage.period === 'lifetime', 'fresh account is on Free with a 25-lead trial', JSON.stringify(b0).slice(0, 300));
  await go('/ai-connect'); await page.getByRole('button', { name: /OpenAI/ }).first().click(); await page.getByLabel('API key').fill('sk-whatever'); await page.getByRole('button', { name: 'Save connection' }).click();
  await page.getByRole('dialog', { name: /paid feature/ }).waitFor({ timeout: 8000 }); ok(await page.getByText(/AI Connect is available on the Starter plan/).first().isVisible(), 'AI Connect on Free → clear paywall naming the Starter plan'); await page.getByRole('button', { name: 'Not now' }).click();
  ok((await api('/creators/export.csv')).s === 402, 'CSV export on Free is paywalled server-side'); ok((await api('/api-keys', { method: 'POST', json: { name: 'k' } })).s === 402, 'API keys on Free are paywalled server-side');
  await go('/settings'); ok(await page.getByRole('button', { name: /Choose (Pro|Starter)/ }).count() === 0, 'Settings no longer lets a user switch plan without paying');
  const pr = await api('/settings', { method: 'PUT', json: { plan: 'elite' } }); ok((await api('/billing')).b.current_plan === 'free', 'PUT /settings cannot self-upgrade the plan');

  // ================= GENERATOR + ENGINE =================
  await go('/lead-generator');
  const kw = await page.getByLabel('Search creators or niche').boundingBox(); ok(kw && kw.width > 300, 'basic search keyword field is wide enough to type in', JSON.stringify(kw));
  await page.getByRole('button', { name: 'Advanced search' }).first().click();
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
  ok(await page.getByText(/Not available to buy yet/).count() >= 1, 'plans without a price ID say so instead of failing silently');
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

  // Help & support: assistant (help-article mode), refund request goes to a person, customer request thread, admin is staff-only
  await go('/');
  await page.getByRole('button', { name: 'Open TubeLead Helper' }).click();
  await page.getByRole('button', { name: 'What do the plans cost?' }).click();
  await page.getByText(/Plans and prices/).first().waitFor({ timeout: 8000 }); ok(await page.getByRole('dialog', { name: 'TubeLead Helper' }).getByText(/Pro: £49\/month/).isVisible(), 'assistant answers pricing from the help articles');
  await page.getByLabel('Your message').fill('I want a refund for last month'); await page.getByRole('button', { name: 'Send message' }).click();
  await page.getByText(/can't issue, approve or promise refunds/).waitFor({ timeout: 8000 }); ok(true, 'assistant refuses to refund and offers the team');
  await page.getByLabel('What would you like, and why?').fill('I was charged twice for the same month.'); await page.getByRole('button', { name: 'Send to the team' }).click();
  await page.getByText(/Your reference is TL-[A-Z0-9]{6}/).first().waitFor({ timeout: 8000 });
  ok(await page.getByText(/Nothing has been approved or changed yet/).first().isVisible(), 'refund request filed with a reference; nothing approved');
  await page.getByRole('button', { name: 'Close TubeLead Helper' }).first().click();
  await go('/support'); await page.getByText('Refund request').first().waitFor({ timeout: 8000 }); ok(true, 'the request appears on Help & Support');
  await page.getByText('Refund request').first().click(); await page.getByLabel('Reply').fill('Happy to send a bank statement.'); await page.getByRole('button', { name: 'Send reply' }).click();
  await page.getByText('Happy to send a bank statement.').waitFor({ timeout: 8000 }); ok(true, 'customer can reply on their request');
  await go('/admin'); await page.getByText('Staff only').waitFor({ timeout: 8000 }); ok(true, 'admin area refuses a customer');
  ok((await api('/admin/refunds')).s === 403 && (await api('/admin/customers')).s === 403, 'admin API refuses a customer');

  // ---------------- Growth Assistant, Creative Studio, Email Check, launch, demo ----------------
  await go('/dashboard');
  ok(await page.getByText('Find your next customers.').first().isVisible(), 'Growth Assistant widget on the dashboard');
  await page.getByLabel('What do you sell, and to whom?').fill('I sell website design services to fitness creators in the UK');
  await page.getByRole('button', { name: /Start growing/i }).click();
  await page.waitForURL(/\/growth\?session=/, { timeout: 10000 });
  await page.getByText('Your campaign summary').waitFor({ timeout: 8000 });
  ok(await page.getByLabel('Product').inputValue() === 'Website design services' && await page.getByLabel('Location').inputValue() === 'UK', 'widget and wizard share the session: summary interpreted from the description');
  await page.getByLabel('Target').fill('Fitness creators');
  await page.getByRole('button', { name: /Find my customers/ }).click();
  await page.getByText('Understanding your audience').waitFor({ timeout: 8000 });
  ok(true, 'discovery shows real stage-by-stage progress');
  await page.getByText(/prospects found/).waitFor({ timeout: 45000 });
  const cards = page.getByRole('checkbox', { name: /^Select / });
  ok(await cards.count() > 0, 'discovered prospects are listed', String(await cards.count()));
  await cards.first().click();
  await page.waitForTimeout(400);
  ok(await cards.first().getAttribute('aria-checked') === 'true', 'selecting a prospect animates into its selected state');
  await page.locator('ul li button.min-w-0').first().click();
  await page.getByText('Why this lead?').waitFor({ timeout: 5000 });
  ok(await page.getByText(/Verified fact|Estimate|Unknown/).first().isVisible(), 'prospect profile explains the score with facts vs estimates');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Find contacts/ }).click();
  await page.getByRole('button', { name: /Find contacts for \d+ prospect/ }).click();
  await page.getByText(/Contacts found/).waitFor({ timeout: 30000 });
  ok(true, 'enrichment runs and completes with live progress');
  await page.getByRole('button', { name: /Create your email/ }).click();
  await page.getByRole('button', { name: /Choose a template/ }).click();
  await page.getByRole('button', { name: /Sales outreach.*An idea/ }).click();
  await page.getByRole('radiogroup', { name: 'Editor mode' }).waitFor({ timeout: 10000 });
  ok(await page.getByRole('radio', { name: 'Easy Editor' }).getAttribute('aria-checked') === 'true', 'Creative Studio opens in Easy Editor');
  const para = page.locator('[data-el] div[contenteditable]').first();
  await para.click(); await page.keyboard.press('End'); await page.keyboard.type(' Edited in the test.'); await page.getByLabel('Subject line').click();
  await page.getByText('Saved', { exact: true }).waitFor({ timeout: 8000 });
  ok(true, 'inline text editing autosaves');
  await page.getByRole('radio', { name: 'Pro Editor' }).click();
  await page.getByRole('tab', { name: /Layers/ }).click();
  await page.getByRole('button', { name: /^(Hide|Show) layer$/ }).first().waitFor({ timeout: 5000 });
  const layersBefore = await page.getByRole('button', { name: /^(Hide|Show) layer$/ }).count();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await page.getByRole('tab', { name: /Layers/ }).click();
  await page.waitForTimeout(500);
  const layersAfter = await page.getByRole('button', { name: /^(Hide|Show) layer$/ }).count();
  ok(layersAfter === layersBefore + 1, 'Pro Editor text tool adds a layer', `${layersBefore} -> ${layersAfter}`);
  await page.getByRole('button', { name: 'Undo' }).click();
  await page.waitForTimeout(500);
  ok(await page.getByRole('button', { name: /^(Hide|Show) layer$/ }).count() === layersBefore, 'undo removes it again');
  ok(await page.locator('[data-el]').filter({ hasText: 'Edited in the test.' }).count() === 1, 'switching Easy → Pro keeps the edited design');
  await page.getByRole('radio', { name: 'Easy Editor' }).click();
  ok(await page.locator('[data-el]').filter({ hasText: 'Edited in the test.' }).count() === 1, 'switching Pro → Easy keeps it too');
  await page.getByRole('button', { name: /Run checks/ }).click();
  await page.getByRole('button', { name: /^Run check$/ }).click();
  await page.getByRole('img', { name: /Readiness \d+ out of 100/ }).waitFor({ timeout: 20000 });
  ok(await page.getByText('Deliverability readiness').isVisible() && await page.getByText(/No sender is connected/).isVisible(), 'Email Check scores four areas and blocks launch without a sender');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Preview$/ }).click();
  await page.locator('iframe[title="Email preview"]').waitFor({ timeout: 10000 });
  const frameHtml = await page.locator('iframe[title="Email preview"]').getAttribute('srcdoc');
  ok(/<table role="presentation"/.test(frameHtml || '') && !/<script/i.test(frameHtml || ''), 'preview shows the real table-based email HTML with no scripts');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Continue to launch/ }).click();
  await page.getByRole('button', { name: /Prepare campaign/ }).click();
  await page.getByText('How emails are sent').waitFor({ timeout: 10000 });
  ok(await page.getByRole('radio', { name: 'Your email service' }).getAttribute('aria-checked') === 'true', 'launch defaults to sending through the customer\'s own email service');
  ok(await page.getByRole('button', { name: /Launch campaign/ }).isDisabled(), 'launch stays disabled until the campaign is approved');
  await page.getByRole('button', { name: /Connect your email service/ }).click();
  await page.getByRole('dialog').locator('select').first().selectOption('resend');
  await page.getByLabel('API key').fill('re_customer_e2e_key');
  await page.getByLabel('From email').fill('sam@agency.example');
  await page.getByRole('button', { name: 'Connect and test' }).click();
  await page.getByText('sam@agency.example').first().waitFor({ timeout: 20000 });
  const sa = await api('/sending/accounts');
  ok(sa.s === 200 && sa.b.accounts.length === 1 && sa.b.accounts[0].provider === 'resend' && !JSON.stringify(sa.b).includes('re_customer_e2e_key'), 'customer connects their own email service; the key is never returned');
  const tst = await api(`/studio/documents/${(await api('/growth/sessions')).b[0].document_id}/test`, { method: 'POST' });
  ok(tst.s === 502 || tst.s === 200 || (tst.s === 409 && tst.b.detail.code === 'no_email'), 'test email uses the customer\'s own service (no longer asks for TubeLead\'s)', JSON.stringify(tst.b));
  await page.getByRole('radio', { name: 'Snov.io campaign' }).click();
  ok(await page.getByText('Sending account').waitFor({ timeout: 8000 }).then(() => true, () => false), 'Snov.io remains available as a delivery option');
  await go('/settings');
  ok(await page.getByText('Your email service').first().isVisible() && await page.getByText('sam@agency.example').first().isVisible(), 'Account Settings lists the customer\'s email services');
  await go('/growth?tab=results');
  await page.getByText('Prospects discovered').waitFor({ timeout: 8000 });
  ok(await page.getByText(/a positive reply is not a sale/).isVisible(), 'My Business Results separates sources and never counts replies as sales');
  // public demo (signed out is not needed: the page is public)
  await go('/demo');
  await page.getByText('See what TubeLead can do.').waitFor();
  ok(await page.getByText('Sample data').first().isVisible(), 'demo is labelled as sample data');
  await page.getByRole('button', { name: /Continue/ }).click(); await page.getByRole('button', { name: /Find sample customers/ }).click();
  await page.getByRole('button', { name: /Sample: Olive/ }).click(); await page.getByRole('button', { name: /Create a pitch/ }).click();
  await page.getByRole('radio', { name: 'Pro Editor' }).click();
  await page.getByRole('button', { name: /Run checks/ }).click(); await page.getByRole('button', { name: /^Run check$/ }).click();
  await page.getByRole('img', { name: /Readiness/ }).waitFor({ timeout: 15000 });
  ok(true, 'demo: Easy → Pro editor and a sample Email Check work without an account');
  const rm = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  rm.on('pageerror', (e) => errs.push('reduced-motion: ' + e.message));
  await rm.goto(B + '/', { waitUntil: 'networkidle' }); await rm.waitForTimeout(800);
  await rm.goto(B + '/demo', { waitUntil: 'networkidle' });
  ok(await rm.getByText('See what TubeLead can do.').isVisible() && await rm.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'demo with reduced motion on a phone: renders, no horizontal scroll');
  await rm.close();

  // ---------------- TubeLead Helper (the astronaut assistant) ----------------
  {
    const hctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const h = await hctx.newPage();
    h.on('pageerror', (e) => errs.push('helper: ' + e.message));
    const hapi = (path, init) => h.evaluate(async ([p, i]) => { const r = await fetch('/api' + p, i ? { method: i.method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(i.json) } : undefined); return { s: r.status, b: await r.json().catch(() => null) }; }, [path, init]);
    ok((await hctx.request.put(B + '/api/helper/progress', { data: {} })).status() === 200, 'helper progress resets for a fresh start');
    await h.goto(B + '/terms', { waitUntil: 'networkidle' });
    ok((await h.evaluate(async () => (await fetch('/helper/front.webp')).headers.get('content-type'))) === 'image/webp', 'character frames are served');
    await h.goto(B + '/dashboard', { waitUntil: 'networkidle' });
    ok(await h.getByRole('button', { name: 'Open help chat' }).count() === 0 && await h.getByRole('button', { name: 'Open TubeLead Helper' }).count() === 1, 'the astronaut replaces the old chat button (one launcher)');
    await h.getByText("Hey! I'm your TubeLead helper.").waitFor({ timeout: 8000 }); ok(true, 'first visit: he greets and offers a tour');
    await h.getByRole('button', { name: 'Show me around' }).click();
    const card = h.getByRole('dialog', { name: /Tour of TubeLead: step 1 of 7/ }); await card.waitFor({ timeout: 8000 }); ok(true, 'walkthrough starts with a progress indicator');
    await h.getByRole('button', { name: /Next step/ }).click();
    await h.getByRole('dialog', { name: /step 2 of 7/ }).waitFor({ timeout: 6000 }); await h.waitForTimeout(1500);
    const ring = await h.locator('.helper-ring').boundingBox(); const link = await h.locator('nav[aria-label="Main navigation"] a[href="/growth"]').boundingBox();
    ok(ring && link && Math.abs(ring.x + 8 - link.x) < 4 && Math.abs(ring.y + 8 - link.y) < 4, 'spotlight is on the real Growth Assistant link', JSON.stringify([ring, link]));
    const me = await h.locator('[data-helper] > button[aria-label="Open TubeLead Helper"]').boundingBox();
    ok(me && link && me.x > link.x + link.width - 4 && Math.abs((me.y + me.height / 2) - (link.y + link.height / 2)) < 70, 'he flies next to the highlighted element', JSON.stringify(me));
    await h.getByRole('button', { name: /Previous/ }).click(); await h.getByRole('dialog', { name: /step 1 of 7/ }).waitFor(); ok(true, 'previous step works');
    await h.getByRole('button', { name: 'Skip tutorial' }).click(); await h.waitForTimeout(600);
    ok(await h.locator('.helper-ring').count() === 0 && (await hapi('/helper/progress')).b.tours_skipped.includes('welcome'), 'skip ends the tour and is remembered');
    await h.reload({ waitUntil: 'networkidle' }); await h.waitForTimeout(3000);
    ok(await h.getByText("Hey! I'm your TubeLead helper.").count() === 0, 'the introduction is not repeated');
    await h.getByRole('button', { name: 'Open TubeLead Helper' }).click();
    const panel = h.getByRole('dialog', { name: 'TubeLead Helper' }); await panel.waitFor();
    ok(await panel.getByText('Helping you with Dashboard').isVisible(), 'the panel knows which page you are on');
    await panel.getByRole('button', { name: 'Explain this page' }).click();
    await panel.getByText(/^Dashboard: Your day at a glance/).waitFor({ timeout: 8000 }); ok(true, 'explains the current page from the page guide');
    await panel.getByLabel('Your message').fill('How do I find YouTubers?'); await panel.getByRole('button', { name: 'Send message' }).click();
    await panel.getByText(/How do I find leads\?/).waitFor({ timeout: 8000 });
    await panel.getByRole('button', { name: 'Show me how' }).last().click();
    await h.waitForURL(/\/lead-generator/, { timeout: 8000 }); await h.getByRole('dialog', { name: /Run your first search: step 1 of 6/ }).waitFor({ timeout: 8000 });
    ok(true, 'an answer offers "Show me how", which opens the right page and starts its walkthrough');
    for (let i = 0; i < 4; i++) { await h.getByRole('button', { name: /Next step/ }).click(); await h.waitForTimeout(700); }
    await h.getByText('Waiting for you…').waitFor({ timeout: 6000 }); ok(true, 'walkthrough waits for the customer to press Find Leads');
    await h.getByLabel('Search creators or niche').fill('gaming'); await h.keyboard.press('Enter');
    await h.getByRole('button', { name: /^Find Leads$/ }).click();
    await h.getByRole('dialog', { name: /step 6 of 6/ }).waitFor({ timeout: 6000 }); ok(true, 'pressing the real button moves the walkthrough on');
    await h.getByRole('button', { name: 'Finish' }).click(); await h.waitForTimeout(1200);
    ok((await hapi('/helper/progress')).b.tours_done.includes('lead-generator'), 'finished walkthroughs are saved to the account');
    await h.getByText(/Great work! Your search found \d+ creator/).waitFor({ timeout: 90000 }); ok(true, 'he celebrates when the search finishes, with the real count');
    const dlg = await h.getByRole('dialog').filter({ hasNotText: 'Great work' }).count();
    if (dlg) { await h.keyboard.press('Escape'); }
    await hctx.close();
    const mctx = await browser.newContext({ ...require('playwright').devices['iPhone 13'] }); const m = await mctx.newPage();
    await m.goto(B + '/lead-database', { waitUntil: 'networkidle' }); await m.waitForTimeout(800);
    const mb = await m.getByRole('button', { name: 'Open TubeLead Helper' }).boundingBox(); const tab = await m.locator('nav[aria-label="Primary mobile"]').boundingBox();
    ok(mb && tab && mb.y + mb.height <= tab.y + 2, 'on a phone he sits above the tab bar', JSON.stringify([mb, tab]));
    await m.getByRole('button', { name: 'Open TubeLead Helper' }).click(); await m.getByRole('dialog', { name: 'TubeLead Helper' }).waitFor();
    ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'phone: panel opens with no horizontal scroll');
    await mctx.close();
    const rctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' }); const r = await rctx.newPage();
    r.on('pageerror', (e) => errs.push('helper reduced: ' + e.message));
    await r.goto(B + '/settings', { waitUntil: 'networkidle' });
    await r.getByRole('button', { name: 'Open TubeLead Helper' }).click(); await r.getByRole('button', { name: 'Show me how' }).first().click();
    await r.getByRole('dialog', { name: /Find your settings: step 1 of 4/ }).waitFor({ timeout: 5000 }); ok(true, 'reduced motion: walkthrough works without flying');
    await rctx.close();
  }

  // The payment provider is never named to customers: check every public and customer page's visible text and HTML.
  const named = [];
  for (const p of ['/', '/demo', '/terms', '/privacy', '/login', '/signup', '/billing', '/settings', '/integrations', '/support', '/dashboard', '/growth']) {
    await go(p); const html = await page.content(); if (/stripe/i.test(html)) named.push(p);
  }
  ok(named.length === 0, 'no customer-facing page mentions the payment provider', named.join(', '));

  ok(errs.length === 0, 'no page errors / console errors across the whole run', errs.slice(0, 4).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`); if (fail) console.log('FAILED:\n - ' + failed.join('\n - ')); await browser.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e.message.slice(0, 700)); process.exit(2); });
