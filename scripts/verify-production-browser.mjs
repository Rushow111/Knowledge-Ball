import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const target = process.argv[2];
if (!target) throw new Error('Usage: node scripts/verify-production-browser.mjs <deployed-url>');

const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] });

try {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();

  const pageErrors = [];
  const consoleMessages = [];
  const supabaseRequests = [];
  const publicAppendRequests = [];
  const networkFailures = [];
  let signupStatus = null;
  let publicEventsStatus = null;

  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => consoleMessages.push(`${message.type()}: ${message.text()}`));
  page.on('request', request => {
    const url = request.url();
    if (url.includes('supabase.co')) supabaseRequests.push(`${request.method()} ${url}`);
    if (url.includes('/rest/v1/rpc/append_public_knowledge_events')) {
      publicAppendRequests.push(`${request.method()} ${url}`);
    }
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if (url.includes('supabase.co')) networkFailures.push(`${request.method()} ${url}: ${request.failure()?.errorText ?? 'request failed'}`);
  });
  page.on('response', response => {
    const url = response.url();
    if (url.includes('/auth/v1/signup')) signupStatus = response.status();
    if (url.includes('/rest/v1/public_knowledge_events')) publicEventsStatus = response.status();
  });

  await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.locator('#aiInput').waitFor({ state: 'visible', timeout: 20_000 });
  assert.equal(await page.locator('.ai-add').count(), 0, 'search bar must not expose the old add-node button');
  await page.waitForTimeout(8_000);

  const diagnostics = await page.evaluate(() => {
    const debug = window.__debug;
    const engine = debug?.syncEngine;
    return {
      datasetSyncStatus: document.documentElement.dataset.syncStatus ?? null,
      debugPresent: Boolean(debug),
      syncEnginePresent: Boolean(engine),
      engineStatus: typeof engine?.currentStatus === 'function' ? engine.currentStatus() : null,
      cursor: typeof engine?.currentCursor === 'function' ? engine.currentCursor() : null,
      pendingCount: typeof engine?.pendingCount === 'function' ? engine.pendingCount() : null,
      nodeCount: Object.keys(debug?.projection?.state?.nodesById ?? {}).length,
      modalClass: document.querySelector('#modalOverlay')?.className ?? null,
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });

  console.log('Production browser diagnostics:');
  console.log(JSON.stringify({ ...diagnostics, signupStatus, publicEventsStatus, supabaseRequests, networkFailures, pageErrors, consoleMessages }, null, 2));

  assert.equal(diagnostics.innerWidth, 375, 'deployed product smoke must run at the product-completion mobile width');
  assert.ok(diagnostics.scrollWidth <= diagnostics.innerWidth, 'deployed page must not overflow horizontally at 375px');
  assert.ok(diagnostics.datasetSyncStatus === 'idle' || diagnostics.datasetSyncStatus === 'conflict', `hosted sync did not become usable (status: ${diagnostics.datasetSyncStatus ?? 'missing'})`);
  assert.equal(signupStatus, 200, `anonymous Supabase signup did not succeed (status: ${signupStatus})`);
  assert.equal(publicEventsStatus, 200, `public event pull did not succeed (status: ${publicEventsStatus})`);
  assert.deepEqual(networkFailures, [], `Supabase network failures:\n${networkFailures.join('\n')}`);
  assert.deepEqual(pageErrors, [], `browser page errors:\n${pageErrors.join('\n')}`);
  assert.equal(diagnostics.pendingCount, 0, 'hosted startup must not enqueue demo events');
  assert.ok(diagnostics.nodeCount > 0, 'hosted public projection must contain knowledge nodes');
  assert.ok(diagnostics.cursor !== null, 'hosted public stream cursor must be available');

  const tappable = await page.evaluate(() => {
    const debug = window.__debug;
    const node = debug?.renderNodes?.find(candidate =>
      !['n1','n2','n16'].includes(candidate.id)
      && (candidate.lineage?.role ?? 'current') === 'current'
      && candidate.status === 'verified'
    ) ?? debug?.renderNodes?.find(candidate => (candidate.lineage?.role ?? 'current') === 'current');
    if (!node) return null;
    debug?.interaction?.setVisibilityMode?.('current');
    debug?.scene?.focusNode?.(node.id);
    debug?.scene?.start?.();
    return { id: node.id, title: node.title };
  });
  assert.ok(tappable, 'deployed scene must expose a current knowledge node for product smoke');
  await page.waitForTimeout(250);
  const point = await page.evaluate(id => {
    window.__debug?.scene?.stop?.();
    return window.__debug?.scene?.screenPositionForNode?.(id) ?? null;
  }, tappable.id);
  assert.ok(point && Number.isFinite(point.x) && Number.isFinite(point.y), 'deployed mobile raycast target coordinates must be finite');
  await page.touchscreen.tap(point.x, point.y);
  await page.locator(`#nodeDetailOverlay.open[data-node-id="${tappable.id}"]`).waitFor({ state: 'visible', timeout: 5_000 });

  // This is the post-deploy product gate: the production URL must expose the
  // actual human-facing lineage entry, not merely contain the underlying code.
  assert.equal(await page.locator('.node-detail-state.current').isVisible(), true, 'deployed current knowledge must identify itself as the current version');
  assert.match(await page.locator('.node-detail-state.current').innerText(), /当前版本/);
  assert.equal(await page.locator('[data-node-detail-action="edit"]').isVisible(), true, 'deployed optimization must be directly visible');
  assert.equal(await page.locator('[data-node-detail-action="negate"]').isVisible(), true, 'deployed opposition must be directly visible');
  assert.equal(await page.locator('.node-detail-edit').count(), 0, 'deployed lineage actions must not be hidden behind generic Edit');
  for (const selector of ['.node-detail-close', '[data-node-detail-action="edit"]', '[data-node-detail-action="negate"]']) {
    const box = await page.locator(selector).boundingBox();
    assert.ok(box, `${selector} must have a deployed mobile box`);
    assert.ok(box.width >= 44 || box.height >= 44, `${selector} must expose a 44px deployed touch target`);
    assert.ok(box.x >= -1 && box.x + box.width <= 376 && box.y >= -1 && box.y + box.height <= 813, `${selector} must stay inside the deployed 375px viewport`);
  }

  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/production-product-smoke.png', fullPage: true });

  // Open the real optimization flow but do not submit it. Production smoke must
  // remain read-only with respect to authoritative public knowledge.
  await page.locator('[data-node-detail-action="edit"]').click();
  await page.locator('#lineageCandidateTitle').waitFor({ state: 'visible', timeout: 5_000 });
  assert.ok((await page.locator('#lineageCandidateTitle').inputValue()).trim(), 'deployed optimization form must be initialized from the selected current node');
  await page.locator('#cancelLineageCandidate').click();
  await page.evaluate(() => window.__debug?.panel?.closeNodePanel?.());

  // Existing create entry remains smoke-tested without a public write.
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true })));
  await page.locator('#modalOverlay.show').waitFor({ state: 'visible', timeout: 5_000 });
  await page.locator('#modalCancel').click();
  await page.waitForFunction(() => !document.querySelector('#modalOverlay')?.classList.contains('show'));

  const personal = page.locator('#btnPersonal');
  if (await personal.count()) {
    assert.equal(await personal.textContent(), '当前');
    await personal.click(); assert.equal(await personal.textContent(), '个人');
    await personal.click(); assert.equal(await personal.textContent(), '全部');
    await personal.click(); assert.equal(await personal.textContent(), '当前');
  }

  assert.deepEqual(publicAppendRequests, [], 'production product smoke test must never call the public knowledge append RPC');

  console.log(`Read-only production product smoke test passed: ${target}`);
  console.log(`Supabase signup: ${signupStatus}; public event pull: ${publicEventsStatus}; authoritative public writes: 0`);
} finally {
  await browser.close();
}
