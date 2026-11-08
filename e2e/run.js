/* End-to-end browser test used during development (40 checks).
 *
 *   # terminal 1: fake YouTube       cd backend && uvicorn tests.fake_youtube_server:app --port 8765
 *   # terminal 2: backend, FRESH db  YOUTUBE_API_KEY=fake YOUTUBE_API_BASE=http://127.0.0.1:8765/youtube/v3 \
 *   #                                DATABASE_URL=sqlite:///./e2e.db uvicorn app.main:app --port 8000
 *   # terminal 3: frontend           cd frontend && npm run build && npm start
 *   # then (needs `playwright` installed):  node e2e/run.js
 *
 * NOTE: the final step kills any process matching "uvicorn app.main" to test the backend-down state.
 */
const { chromium } = require('playwright');
const B = 'http://localhost:3000';
let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { (c ? pass++ : fail++); console.log((c ? 'PASS ' : 'FAIL ') + name + (c ? '' : '  ' + extra)); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message.slice(0, 150)));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 150)); });

  // 1 empty state
  await page.goto(B + '/', { waitUntil: 'networkidle' });
  ok(await page.getByText('Your creator database is empty').isVisible(), 'dashboard shows empty state on fresh DB');
  await page.getByRole('link', { name: /Start discovering/i }).first().click();
  await page.waitForURL('**/lead-generator');
  ok(true, 'hero CTA navigates to /lead-generator');

  // 2 validation
  await page.getByRole('button', { name: 'Generate leads' }).click();
  ok(await page.getByText('Add at least one keyword or niche.').isVisible(), 'generator validation: no keywords blocked');
  ok((await (await ctx.request.get(B + '/api/jobs')).json()).length === 0, 'no job was created by invalid submit');

  // 3 real job
  await page.getByLabel('Keywords', { exact: true }).fill('tech review');
  await page.getByLabel('Keywords', { exact: true }).press('Enter');
  await page.getByRole('button', { name: 'Niches' }).click();
  await page.getByRole('option', { name: 'Tech' }).click();
  await page.keyboard.press('Escape');
  await page.getByLabel('Number of leads requested').fill('6');
  await page.getByRole('button', { name: 'Generate leads' }).click();
  await page.getByText(/Current operation/i).waitFor({ timeout: 10000 });
  ok(true, 'job started: progress panel appears');
  const sawRunning = await page.getByText('Running', { exact: true }).first().waitFor({ timeout: 12000 }).then(() => true).catch(() => false);
  ok(sawRunning, 'status badge showed Running while job active');
  await page.getByText('Completed', { exact: true }).first().waitFor({ timeout: 90000 });
  ok(true, 'job reached Completed');
  const jobs = await (await ctx.request.get(B + '/api/jobs')).json();
  const j = jobs[0];
  ok(j.status === 'completed' && j.qualified > 0 && j.qualified <= 6 && j.channels_found >= j.unique_found && j.quota_used >= 100, `job counters real (qualified=${j.qualified}, found=${j.channels_found}, unique=${j.unique_found}, dup=${j.duplicates_removed}, quota=${j.quota_used})`, JSON.stringify(j).slice(0, 300));
  ok(j.quota_used === (await (await ctx.request.get(B + '/api/status')).json()).quota.used, 'job quota == quota ledger');

  // 4 results
  await page.getByRole('link', { name: /discovered creators/i }).click();
  await page.waitForURL('**/lead-database**');
  await page.waitForSelector('tbody tr input[type=checkbox]');
  const rows = await page.locator('tbody tr:has(input[type=checkbox])').count();
  ok(rows === j.qualified, `database shows exactly the job's creators (${rows}/${j.qualified})`);
  ok((await page.locator('span:text-is("Demo")').count()) === 0, 'no demo rows mixed into real results');

  // 5 drawer
  await page.locator('tbody tr:has(input[type=checkbox])').first().locator('td').nth(1).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByText(/Contact intelligence/).waitFor({ timeout: 8000 });
  ok(true, 'creator drawer opens with contact intelligence');
  const dlgText = await page.getByRole('dialog').innerText();
  ok(!/Verified deliverable/.test(dlgText) || false, 'no email shown as Verified deliverable automatically');
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  ok(true, 'drawer closes with Escape');

  // 6 campaigns page
  await page.goto(B + '/campaigns', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /New campaign/i }).first().click();
  await page.getByRole('button', { name: 'Create campaign' }).click();
  ok(await page.getByText('A campaign needs a name.').isVisible(), 'campaign form validation');
  await page.getByRole('dialog').getByRole('textbox').first().fill('E2E Campaign');
  await page.getByRole('button', { name: 'Create campaign' }).click();
  await page.getByText('E2E Campaign').first().waitFor();
  ok(true, 'campaign created and listed');

  // 7 DB: filters, sort, bulk, export, views
  await page.goto(B + '/lead-database', { waitUntil: 'networkidle' });
  await page.waitForSelector('tbody tr input[type=checkbox]');
  await page.getByRole('button', { name: /Filters/ }).click();
  await page.getByLabel('Public email').selectOption('yes');
  await page.waitForTimeout(700);
  const withEmail = await page.locator('tbody tr:has(input[type=checkbox])').count();
  const apiEmail = (await (await ctx.request.get(B + '/api/creators?has_email=true')).json()).total;
  ok(withEmail === apiEmail && withEmail > 0, `has-email filter matches API (${withEmail})`);
  await page.getByLabel('Public email').selectOption('');
  await page.getByLabel('Sort by').selectOption('subscribers:desc');
  await page.waitForTimeout(600);
  const subsTxt = await page.locator('tbody tr td:nth-child(3)').allInnerTexts();
  ok(subsTxt.length > 1, 'sort changes table without error');
  await page.locator('tbody tr input[type=checkbox]').nth(0).check();
  await page.locator('tbody tr input[type=checkbox]').nth(1).check();
  await page.getByLabel('Assign to campaign').selectOption({ label: 'E2E Campaign' });
  await page.getByText(/Assigned to campaign \(2\)/).waitFor({ timeout: 5000 });
  ok(true, 'bulk assign to campaign (2)');
  const camp = (await (await ctx.request.get(B + '/api/campaigns')).json()).find(c => c.name === 'E2E Campaign');
  ok(camp.leads === 2, 'campaign stats reflect 2 leads');
  await page.locator('tbody tr input[type=checkbox]').nth(0).check();
  await page.locator('tbody tr input[type=checkbox]').nth(1).check();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Export/ }).first().click()]);
  const csv = require('fs').readFileSync(await dl.path(), 'utf8');
  ok(csv.startsWith('channel,channel_url') && csv.trim().split('\n').length === 3, 'CSV export of 2 selected rows');
  await page.getByRole('button', { name: /Save view/i }).first().click();
  await page.getByLabel('View name').fill('E2E view');
  await page.getByRole('button', { name: 'Save view' }).last().click();
  await page.getByRole('button', { name: 'E2E view', exact: true }).waitFor();
  ok(true, 'saved view created');
  await page.getByLabel('Search creators').fill('zzzz-no-match');
  await page.getByText('No creators match these filters').waitFor();
  ok(true, 'empty search state');

  // 8 duplicate protection: rerun same search -> duplicates removed, no new dupes
  const before = (await (await ctx.request.get(B + '/api/creators?page_size=200')).json()).total;
  const r = await ctx.request.post(B + '/api/jobs', { data: { params: { keywords: ['tech review'], niches: ['Tech'], min_subscribers: 1000, limit: 6 } } });
  ok(r.status() === 201, 'API job create 201');
  const jid = (await r.json()).id;
  let jj; for (let i = 0; i < 80; i++) { jj = await (await ctx.request.get(B + '/api/jobs/' + jid)).json(); if (!['queued', 'running'].includes(jj.status)) break; await new Promise(r => setTimeout(r, 1000)); }
  const after = (await (await ctx.request.get(B + '/api/creators?page_size=200')).json());
  const ids = after.items.map(c => c.youtube_channel_id);
  ok(new Set(ids).size === ids.length, 'no duplicate channel IDs in database');
  ok(jj.duplicates_removed > 0, `repeat run removed duplicates (${jj.duplicates_removed})`);

  // 9 cancel
  const r2 = await ctx.request.post(B + '/api/jobs', { data: { params: { keywords: ['a', 'b', 'c'], countries: ['GB', 'US', 'DE'], mode: 'deep', min_subscribers: 0, limit: 100, max_quota_units: 5000 } } });
  const cj = (await r2.json()).id;
  await page.goto(B + '/discovery-engine', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Cancel job/ }).click({ timeout: 15000 });
  await page.getByText('Cancelled', { exact: true }).first().waitFor({ timeout: 30000 });
  ok(true, 'running job cancelled from UI');

  // 10 API key
  await page.goto(B + '/api-management', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Create key/ }).first().click();
  await page.getByPlaceholder('e.g. n8n production').fill('e2e key');
  await page.getByRole('dialog').getByRole('button', { name: 'Create key' }).click();
  const secret = await page.locator('code').filter({ hasText: /^clk_/ }).first().innerText();
  ok(/^clk_/.test(secret), 'API key shown once');
  const viaKey = await (await ctx.request.get(B + '/api/status', { headers: { 'X-API-Key': secret } })).status();
  ok(viaKey === 200, 'new API key authenticates');
  await page.getByRole('button', { name: /saved it/ }).click();
  await page.getByRole('button', { name: /Revoke e2e key/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revoke' }).click();
  await page.getByText('Revoked', { exact: true }).waitFor();
  ok((await ctx.request.get(B + '/api/status', { headers: { 'X-API-Key': secret } })).status() === 401, 'revoked key rejected');

  // 11 settings validation
  await page.goto(B + '/settings', { waitUntil: 'networkidle' });
  await page.getByLabel('Email').fill('not-an-email');
  ok(await page.getByText('Enter a valid email address.').isVisible(), 'settings email validation');
  ok(await page.getByRole('button', { name: 'Save profile' }).isDisabled(), 'save disabled while invalid');
  await page.getByLabel('Email').fill('ops@example.com');
  await page.getByLabel('Display name').fill('E2E Operator');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByText('Profile saved').waitFor();
  ok(true, 'settings saved');

  // 12 sidebar collapse
  const w0 = (await page.locator('aside[aria-label=Primary]').boundingBox()).width;
  await page.getByRole('button', { name: 'Collapse sidebar' }).click();
  await page.waitForTimeout(700);
  const w1 = (await page.locator('aside[aria-label=Primary]').boundingBox()).width;
  ok(w1 < w0 - 100, `sidebar collapses (${Math.round(w0)}→${Math.round(w1)})`);

  // 13 every nav link works
  await page.getByRole('button', { name: 'Expand sidebar' }).click();
  const hrefs = await page.locator('nav[aria-label="Main navigation"] a').evaluateAll(a => a.map(x => x.getAttribute('href')));
  ok(hrefs.length === 13, `13 nav items (${hrefs.length})`);
  for (const h of hrefs) { await page.goto(B + h, { waitUntil: 'networkidle' }); const t = await page.locator('h1').first().innerText(); if (!t) ok(false, 'nav ' + h); }
  ok(true, 'all nav destinations render an h1');

  // 14 mobile more-menu
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  await mp.goto(B + '/', { waitUntil: 'networkidle' });
  await mp.getByRole('button', { name: 'Open all sections' }).click();
  await mp.getByRole('dialog').getByRole('link', { name: /Analytics/ }).click();
  await mp.waitForURL('**/analytics');
  ok(true, 'mobile: More menu reaches Analytics');

  // 15 backend down => graceful error
  require('child_process').execSync("pkill -f '[u]vicorn app.main' || true");
  await new Promise(r => setTimeout(r, 1200));
  await page.goto(B + '/lead-database', { waitUntil: 'networkidle' });
  await page.getByRole('alert').first().waitFor({ timeout: 8000 });
  ok(true, 'backend down: error state with retry shown (no crash)');
  ok(await page.getByRole('button', { name: 'Retry' }).first().isVisible(), 'retry button present');

  const real = errs.filter(e => !/Failed to load resource|500|502|503|ECONN|net::/.test(e));
  ok(real.length === 0, 'no unexpected console/page errors', real.slice(0, 3).join(' | '));
  console.log(`\n${pass} passed, ${fail} failed`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('E2E CRASH', e.message.slice(0, 400)); process.exit(2); });
