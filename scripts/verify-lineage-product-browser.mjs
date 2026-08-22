import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const appPort = 4175;
const supabasePort = 4181;
const appOrigin = `http://127.0.0.1:${appPort}/Knowledge-Ball/`;
const supabaseOrigin = `http://127.0.0.1:${supabasePort}`;
const seedActor = '00000000-0000-0000-0000-000000000010';
const userA = '00000000-0000-0000-0000-0000000000a1';
const userB = '00000000-0000-0000-0000-0000000000b2';
const deadline = () => new Date(Date.now() + 720 * 60 * 60 * 1000).toISOString();

let sequence = 0;
const rows = [];
const tokenUsers = new Map();
let signupCount = 0;
let rejectNextAppend = false;
const pendingRounds = new Map();
const revalidationRounds = new Map();

function nodeCreated(id, title, premises = []) {
  return {
    id: `seed:${id}`,
    type: 'NodeCreated',
    scope: 'public',
    schemaVersion: 1,
    timestamp: Date.now() + sequence + 1,
    payload: {
      nodeId: id,
      title,
      nodeType: 'theorem',
      reasoning: `${title} · test fixture content`,
      premises,
      initialStatus: 'verified',
      source: 'import',
      declaredLayer: 'middle',
    },
  };
}

function appendEvent(envelope, actorId = seedActor) {
  sequence += 1;
  rows.push({ sequence, envelope, actor_id: actorId, created_at: new Date().toISOString() });
  return sequence;
}

appendEvent(nodeCreated('opt-base', 'Optimization Base'));
appendEvent(nodeCreated('downstream', 'Downstream Knowledge', ['opt-base']));
appendEvent(nodeCreated('fail-base', 'Failure Base'));
appendEvent(nodeCreated('opp-base', 'Opposition Base'));

function requestUser(request) {
  const auth = request.headers.authorization ?? '';
  return tokenUsers.get(auth.replace(/^Bearer\s+/i, '')) ?? seedActor;
}

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

function json(response, status = 200) {
  return { status, body: JSON.stringify(response) };
}

function rememberCandidateRound(event, actorId) {
  const nodeId = event?.type === 'KnowledgeAdded' && event.payload?.edit?.mode === 'atomic'
    ? event.payload.edit.node?.id
    : null;
  if (!nodeId || (!event.payload?.optimization && !event.payload?.opposition)) return;
  pendingRounds.set(nodeId, {
    nodeId,
    kind: 'INITIAL',
    creator: actorId,
    policyVersion: 'ORIGINAL_DESIGN_V2',
    topicId: event.payload.optimization?.topicId ?? event.payload.opposition?.topicId,
    proposal: event.payload.optimization ? 'optimization' : 'opposition',
    agree: 0,
    disagree: 0,
    votes: new Map(),
    verdict: 'PENDING',
    closeReason: null,
    deadline: deadline(),
  });
}

function pendingSnapshot(round, actorId) {
  return {
    node_id: round.nodeId,
    round_id: `round:${round.nodeId}`,
    agree_count: round.agree,
    disagree_count: round.disagree,
    required_votes: 1,
    my_side: round.votes.get(actorId) ?? null,
    my_balance: '100.000000',
    verdict: round.verdict,
    close_reason: round.closeReason,
    deadline: round.deadline,
    closed_at: round.verdict === 'PENDING' ? null : new Date().toISOString(),
    policy_version: round.policyVersion,
  };
}

function revalidationSnapshot(round, actorId) {
  return {
    node_id: round.nodeId,
    topic_id: round.topicId,
    round_id: round.roundId,
    round_no: 1,
    role_at_start: round.roleAtStart,
    stage: 0,
    stake: '1.000000',
    scope: 'GLOBAL',
    accuracy_gate: null,
    local_hop_limit: null,
    agree_count: round.agree,
    disagree_count: round.disagree,
    required_votes: 1,
    my_side: round.votes.get(actorId) ?? null,
    my_balance: '100.000000',
    verdict: round.verdict,
    close_reason: round.closeReason,
    deadline: round.deadline,
    closed_at: round.verdict === 'PENDING' ? null : new Date().toISOString(),
    policy_version: 'ORIGINAL_DESIGN_V1',
  };
}

function finalizeInitial(round, actorId, side) {
  if (round.verdict !== 'PENDING') return;
  round.votes.set(actorId, side);
  if (side === 'AGREE') round.agree += 1; else round.disagree += 1;
  round.verdict = side === 'AGREE' ? 'CORRECT' : 'INCORRECT';
  round.closeReason = 'THRESHOLD';
  appendEvent({
    id: `vote-verdict:${round.nodeId}`,
    type: 'KnowledgeVerdictFinalized',
    scope: 'public',
    schemaVersion: 1,
    timestamp: Date.now(),
    payload: {
      roundId: `round:${round.nodeId}`,
      nodeId: round.nodeId,
      verdict: round.verdict,
      closeReason: 'THRESHOLD',
      agreeCount: round.agree,
      disagreeCount: round.disagree,
      requiredVotes: 1,
      policyVersion: 'ORIGINAL_DESIGN_V2',
    },
  }, actorId);

  if (round.proposal === 'optimization' && round.topicId === 'opt-base' && round.verdict === 'CORRECT') {
    appendEvent({
      id: `cascade-start:${round.nodeId}`,
      type: 'KnowledgeStatusChanged',
      scope: 'public',
      schemaVersion: 1,
      timestamp: Date.now(),
      payload: { edit: { kind: 'status', nodeId: 'downstream', status: 'disputed', causeNodeId: 'opt-base' } },
    }, actorId);
    pendingRounds.set('downstream', {
      nodeId: 'downstream',
      kind: 'CASCADE',
      creator: null,
      policyVersion: 'ORIGINAL_DESIGN_V1',
      sourceNodeId: 'opt-base',
      agree: 0,
      disagree: 0,
      votes: new Map(),
      verdict: 'PENDING',
      closeReason: null,
      deadline: deadline(),
    });
  }
}

function finalizeCascade(round, actorId, side) {
  if (round.verdict !== 'PENDING') return;
  round.votes.set(actorId, side);
  if (side === 'AGREE') round.agree += 1; else round.disagree += 1;
  round.verdict = side === 'AGREE' ? 'CORRECT' : 'INCORRECT';
  round.closeReason = 'THRESHOLD';
  appendEvent({
    id: `cascade-result:${round.nodeId}`,
    type: 'KnowledgeStatusChanged',
    scope: 'public',
    schemaVersion: 1,
    timestamp: Date.now(),
    payload: {
      edit: {
        kind: 'status',
        nodeId: round.nodeId,
        status: side === 'AGREE' ? 'verified' : 'suspended',
        causeNodeId: round.sourceNodeId,
      },
    },
  }, actorId);
}

function startRevalidation(nodeId, actorId) {
  const round = {
    nodeId,
    topicId: 'opt-base',
    roundId: `revalidation:${nodeId}`,
    roleAtStart: 'history',
    initiator: actorId,
    agree: 0,
    disagree: 0,
    votes: new Map(),
    verdict: 'PENDING',
    closeReason: null,
    deadline: deadline(),
  };
  revalidationRounds.set(nodeId, round);
  appendEvent({
    id: `revalidation:start:${nodeId}`,
    type: 'KnowledgeRevalidationStarted',
    scope: 'public',
    schemaVersion: 1,
    timestamp: Date.now(),
    payload: {
      roundId: round.roundId,
      nodeId,
      topicId: round.topicId,
      roleAtStart: round.roleAtStart,
      stage: 0,
      stake: '1',
      scope: 'GLOBAL',
      requiredVotes: 1,
      deadline: round.deadline,
      policyVersion: 'ORIGINAL_DESIGN_V1',
    },
  }, actorId);
  return round;
}

function finalizeRevalidation(round, actorId, side) {
  if (round.verdict !== 'PENDING') return;
  round.votes.set(actorId, side);
  if (side === 'AGREE') round.agree += 1; else round.disagree += 1;
  round.verdict = side === 'AGREE' ? 'CORRECT' : 'INCORRECT';
  round.closeReason = 'THRESHOLD';
  appendEvent({
    id: `revalidation:finish:${round.nodeId}`,
    type: 'KnowledgeRevalidationFinalized',
    scope: 'public',
    schemaVersion: 1,
    timestamp: Date.now(),
    payload: {
      roundId: round.roundId,
      nodeId: round.nodeId,
      topicId: round.topicId,
      verdict: round.verdict,
      closeReason: 'THRESHOLD',
      agreeCount: round.agree,
      disagreeCount: round.disagree,
      requiredVotes: 1,
      stage: 0,
      policyVersion: 'ORIGINAL_DESIGN_V1',
    },
  }, actorId);
}

const mockSupabase = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', supabaseOrigin);
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Content-Type': 'application/json',
  };
  if (request.method === 'OPTIONS') {
    response.writeHead(204, headers);
    response.end();
    return;
  }

  let result;
  try {
    const actorId = requestUser(request);
    if (url.pathname === '/auth/v1/signup' && request.method === 'POST') {
      const id = signupCount++ === 0 ? userA : userB;
      const token = `token-${id}`;
      tokenUsers.set(token, id);
      result = json({ access_token: token, refresh_token: `refresh-${id}`, expires_in: 3600 });
    } else if (url.pathname === '/auth/v1/user' && request.method === 'GET') {
      result = json({ id: actorId });
    } else if (url.pathname === '/rest/v1/public_knowledge_events' && request.method === 'GET') {
      const after = Number((url.searchParams.get('sequence') ?? 'gt.0').replace('gt.', ''));
      const limit = Number(url.searchParams.get('limit') ?? 200);
      result = json(rows.filter(row => row.sequence > after).slice(0, limit));
    } else if (url.pathname === '/rest/v1/rpc/append_public_knowledge_events' && request.method === 'POST') {
      if (rejectNextAppend) {
        rejectNextAppend = false;
        result = json({ message: '服务器暂时无法保存，请稍后重试' }, 503);
      } else {
        const body = await requestBody(request);
        if (Number(body.expected_head) !== rows.length) {
          result = json({ code: 'KB409', message: 'head conflict', details: JSON.stringify({ current_head: rows.length }) }, 409);
        } else {
          const batch = Array.isArray(body.event_batch) ? body.event_batch : [];
          for (const event of batch) {
            if (!rows.some(row => row.envelope.id === event.id)) {
              appendEvent(event, actorId);
              rememberCandidateRound(event, actorId);
            }
          }
          result = json({ head: rows.length, acknowledged_event_ids: batch.map(event => event.id) });
        }
      }
    } else if (url.pathname === '/rest/v1/rpc/get_pending_knowledge_vote' && request.method === 'POST') {
      const body = await requestBody(request);
      const round = pendingRounds.get(body.target_node_id);
      result = round ? json(pendingSnapshot(round, actorId)) : json({ message: 'pending vote round not found' }, 400);
    } else if (url.pathname === '/rest/v1/rpc/cast_pending_knowledge_vote' && request.method === 'POST') {
      const body = await requestBody(request);
      const round = pendingRounds.get(body.target_node_id);
      if (!round) {
        result = json({ message: 'pending vote round not found' }, 400);
      } else {
        if (!round.votes.has(actorId)) {
          if (round.kind === 'CASCADE') finalizeCascade(round, actorId, body.vote_side);
          else if (round.creator === actorId) result = json({ message: '提交者不能参与本轮投票' }, 409);
          else finalizeInitial(round, actorId, body.vote_side);
        }
        if (!result) result = json(pendingSnapshot(round, actorId));
      }
    } else if (url.pathname === '/rest/v1/rpc/start_knowledge_revalidation' && request.method === 'POST') {
      const body = await requestBody(request);
      const round = revalidationRounds.get(body.target_node_id) ?? startRevalidation(body.target_node_id, actorId);
      result = json(revalidationSnapshot(round, actorId));
    } else if (url.pathname === '/rest/v1/rpc/get_knowledge_revalidation' && request.method === 'POST') {
      const body = await requestBody(request);
      const round = revalidationRounds.get(body.target_node_id);
      result = round ? json(revalidationSnapshot(round, actorId)) : json({ message: 'revalidation not found' }, 400);
    } else if (url.pathname === '/rest/v1/rpc/cast_knowledge_revalidation_vote' && request.method === 'POST') {
      const body = await requestBody(request);
      const round = revalidationRounds.get(body.target_node_id);
      if (!round) result = json({ message: 'revalidation not found' }, 400);
      else {
        if (!round.votes.has(actorId) && round.initiator !== actorId) finalizeRevalidation(round, actorId, body.vote_side);
        result = json(revalidationSnapshot(round, actorId));
      }
    } else if (url.pathname === '/rest/v1/rpc/ensure_anonymous_profile' && request.method === 'POST') {
      result = json(null);
    } else if (url.pathname === '/rest/v1/rpc/get_my_account' && request.method === 'POST') {
      result = json({
        username: null,
        display_name: null,
        avatar_url: null,
        bio: null,
        password_login_enabled: false,
        my_balance: '100.000000',
        total_energy: '200.000000',
        accuracy: 100,
      });
    } else if (url.pathname === '/rest/v1/rpc/get_my_personal_knowledge_states' && request.method === 'POST') {
      result = json([]);
    } else if (url.pathname === '/rest/v1/rpc/mark_my_knowledge_touched' && request.method === 'POST') {
      const body = await requestBody(request);
      result = json({ node_id: body.target_node_id, mastery: 'touched', version: 1, updated_at: new Date().toISOString() });
    } else if (url.pathname === '/rest/v1/rpc/get_public_contributor_profiles' && request.method === 'POST') {
      const body = await requestBody(request);
      result = json((body.actor_ids ?? []).map(id => ({ actor_id: id, contributor: id === userA ? 'User A' : id === userB ? 'User B' : 'Seed Author' })));
    } else if ((url.pathname === '/rest/v1/rpc/settle_expired_pending_knowledge_votes' || url.pathname === '/rest/v1/rpc/settle_expired_knowledge_revalidations') && request.method === 'POST') {
      result = json(0);
    } else {
      result = json({ message: `unhandled mock route ${request.method} ${url.pathname}` }, 404);
    }
  } catch (error) {
    result = json({ message: error instanceof Error ? error.message : String(error) }, 500);
  }

  response.writeHead(result.status, headers);
  response.end(result.body);
});

await new Promise((resolve, reject) => {
  mockSupabase.once('error', reject);
  mockSupabase.listen(supabasePort, '127.0.0.1', resolve);
});

const appServer = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(appPort)], {
  stdio: 'ignore',
  env: {
    ...process.env,
    VITE_SUPABASE_URL: supabaseOrigin,
    VITE_SUPABASE_PUBLISHABLE_KEY: 'mock-publishable-key',
  },
});

async function waitForApp() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      if ((await fetch(appOrigin)).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Vite product acceptance page did not become reachable');
}

async function preparePage(context) {
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(appOrigin, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.syncStatus === 'idle' && Boolean(window.__debug?.projection?.state?.nodesById?.['opt-base']));
  return { page, pageErrors };
}

async function openNode(page, id) {
  await page.evaluate(id => {
    window.__debug?.interaction?.setVisibilityMode?.('all');
    window.__debug?.scene?.focusNode?.(id);
    window.__debug?.scene?.start?.();
  }, id);
  await page.waitForTimeout(220);
  const point = await page.evaluate(id => {
    window.__debug?.scene?.stop?.();
    return window.__debug?.scene?.screenPositionForNode?.(id) ?? null;
  }, id);
  assert.ok(point && Number.isFinite(point.x) && Number.isFinite(point.y), `node ${id} must have a finite mobile position`);
  await page.touchscreen.tap(point.x, point.y);
  await page.locator(`#nodeDetailOverlay.open[data-node-id="${id}"]`).waitFor({ state: 'visible' });
}

async function assertViewport(page) {
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth }));
  assert.equal(viewport.width, 375, 'product acceptance must run at the requested 375px width');
  assert.ok(viewport.scrollWidth <= viewport.width, `page must not overflow horizontally (${viewport.scrollWidth} > ${viewport.width})`);
  for (const selector of ['.node-detail-close', '.node-detail-primary-action', '.node-detail-vote-button:not([disabled])']) {
    const boxes = await page.locator(selector).evaluateAll(elements => elements.filter(element => {
      const style = getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).map(element => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    }));
    for (const box of boxes) {
      assert.ok(box.width >= 44 || box.height >= 44, `${selector} must expose a 44px touch target`);
      assert.ok(box.x >= -1 && box.x + box.width <= viewport.width + 1, `${selector} must stay inside the horizontal mobile viewport`);
      assert.ok(box.y >= -1 && box.y + box.height <= viewport.height + 1, `${selector} must stay inside the vertical mobile viewport`);
    }
  }
}

async function submitCandidate(page, kind, targetId, title, description) {
  await openNode(page, targetId);
  const action = kind === 'optimization' ? 'edit' : 'negate';
  const button = page.locator(`[data-node-detail-action="${action}"]`);
  await button.waitFor({ state: 'visible' });
  assert.equal(await page.locator('.node-detail-more[aria-expanded="true"]').count(), 0, 'primary lineage action must be visible without opening More');
  await button.click();
  await page.locator('#lineageCandidateTitle').waitFor({ state: 'visible' });
  await page.locator('#lineageCandidateTitle').fill(title);
  await page.locator('#lineageCandidateDescription').fill(description);
  await page.locator('#submitLineageCandidate').click();
  await page.waitForFunction(text => document.querySelector('#toast')?.textContent?.includes(text), kind === 'optimization' ? '优化候选已提交' : '对立候选已提交');
  await page.waitForFunction(title => Object.values(window.__debug?.projection?.state?.nodesById ?? {}).some(node => node.title === title), title);
  return page.evaluate(title => Object.values(window.__debug?.projection?.state?.nodesById ?? {}).find(node => node.title === title)?.id ?? null, title);
}

async function votePending(page, nodeId, side) {
  await openNode(page, nodeId);
  await page.locator(`[data-vote-side="${side}"]`).waitFor({ state: 'visible' });
  await page.waitForFunction(side => !document.querySelector(`[data-vote-side="${side}"]`)?.disabled, side);
  await page.locator(`[data-vote-side="${side}"]`).click();
}

function publicNodeShape(node) {
  if (!node) return null;
  return {
    id: node.id,
    title: node.title,
    type: node.type,
    status: node.status,
    reasoning: node.reasoning,
    premises: node.premises,
    declaredLayer: node.declaredLayer,
    hidden: node.hidden,
    lineage: node.lineage,
  };
}

let browser;
try {
  await waitForApp();
  await mkdir('artifacts', { recursive: true });
  browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] });
  const mobile = { viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true };
  const contextA = await browser.newContext(mobile);
  const contextB = await browser.newContext(mobile);
  try {
    const { page: pageA, pageErrors: errorsA } = await preparePage(contextA);
    const { page: pageB, pageErrors: errorsB } = await preparePage(contextB);

    // The Current / Personal / All entry itself must be understandable and operable on mobile.
    const visibility = pageA.locator('#btnPersonal');
    await visibility.waitFor({ state: 'visible' });
    assert.equal(await visibility.textContent(), '当前');
    await visibility.click();
    assert.equal(await visibility.textContent(), '个人');
    await visibility.click();
    assert.equal(await visibility.textContent(), '全部');
    await visibility.click();
    assert.equal(await visibility.textContent(), '当前');

    // 1–3: discoverable direct entry and a complete real user path.
    await openNode(pageA, 'opt-base');
    await pageA.locator('.node-detail-state.current').waitFor({ state: 'visible' });
    assert.match(await pageA.locator('.node-detail-state.current').innerText(), /当前版本/);
    assert.equal(await pageA.locator('[data-node-detail-action="edit"]').isVisible(), true, 'optimization must be a direct visible action');
    assert.equal(await pageA.locator('[data-node-detail-action="negate"]').isVisible(), true, 'opposition must be a direct visible action');
    assert.equal(await pageA.locator('.node-detail-edit').count(), 0, 'generic Edit gate must not hide the primary lineage actions');
    await assertViewport(pageA);
    await pageA.screenshot({ path: 'artifacts/lineage-product-current.png', fullPage: true });
    await pageA.locator('.node-detail-close').click();

    // Optimization success -> pending candidate -> server verdict -> both already-open clients converge.
    const optCandidate = await submitCandidate(pageA, 'optimization', 'opt-base', 'Optimization Improved', 'A visibly improved immutable version');
    assert.ok(optCandidate, 'optimization candidate must be created through the real UI');
    await openNode(pageA, optCandidate);
    assert.match(await pageA.locator('.node-detail-state').innerText(), /优化候选 · 等待验证/);
    await pageA.screenshot({ path: 'artifacts/lineage-product-candidate.png', fullPage: true });
    await pageA.locator('.node-detail-close').click();
    await pageB.waitForFunction(id => Boolean(window.__debug?.projection?.state?.nodesById?.[id]), optCandidate);
    await votePending(pageB, optCandidate, 'AGREE');
    await pageA.waitForFunction(id => window.__debug?.projection?.state?.nodesById?.[id]?.lineage?.role === 'current', optCandidate);
    await pageB.waitForFunction(id => window.__debug?.projection?.state?.nodesById?.[id]?.lineage?.role === 'current', optCandidate);
    assert.equal(await pageA.evaluate(() => window.__debug?.projection?.state?.nodesById?.['opt-base']?.lineage?.role), 'history', 'successful optimization must preserve the old ball as history');

    // 6: hard reload must reconstruct the same authoritative result.
    await pageA.reload({ waitUntil: 'domcontentloaded' });
    await pageA.waitForFunction(id => window.__debug?.projection?.state?.nodesById?.[id]?.lineage?.role === 'current', optCandidate);
    assert.equal(await pageA.evaluate(() => window.__debug?.projection?.state?.nodesById?.['opt-base']?.lineage?.role), 'history');

    // Failed optimization keeps the old head, while the losing candidate becomes rejected audit state.
    const failedCandidate = await submitCandidate(pageA, 'optimization', 'fail-base', 'Failure Candidate', 'This candidate should lose its validation');
    await pageB.waitForFunction(id => Boolean(window.__debug?.projection?.state?.nodesById?.[id]), failedCandidate);
    await votePending(pageB, failedCandidate, 'DISAGREE');
    await pageA.waitForFunction(id => window.__debug?.projection?.state?.nodesById?.[id]?.lineage?.role === 'rejected', failedCandidate);
    assert.equal(await pageA.evaluate(() => window.__debug?.projection?.state?.nodesById?.['fail-base']?.lineage?.role ?? 'current'), 'current');

    // Opposition success uses the same visible path but keeps viewpoint semantics distinct.
    const oppositionCandidate = await submitCandidate(pageA, 'opposition', 'opp-base', 'Opposing Viewpoint', 'A distinct opposing claim');
    await pageB.waitForFunction(id => Boolean(window.__debug?.projection?.state?.nodesById?.[id]), oppositionCandidate);
    await votePending(pageB, oppositionCandidate, 'AGREE');
    await pageA.waitForFunction(id => window.__debug?.projection?.state?.nodesById?.[id]?.lineage?.role === 'current', oppositionCandidate);
    assert.equal(await pageA.evaluate(() => window.__debug?.projection?.state?.nodesById?.['opp-base']?.lineage?.role), 'opposition');

    // Old gray ball is visible in All and can complete the human revalidation path.
    await openNode(pageA, 'opt-base');
    assert.match(await pageA.locator('.node-detail-state').innerText(), /历史版本/);
    await pageA.screenshot({ path: 'artifacts/lineage-product-history.png', fullPage: true });
    await pageA.locator('[data-reactivate-intent]').click();
    await pageA.locator('[data-reactivate-confirm]').click();
    await pageB.waitForFunction(() => window.__debug?.projection?.state?.nodesById?.['opt-base']?.status === 'disputed');
    await openNode(pageB, 'opt-base');
    await pageB.locator('[data-revalidation-side="AGREE"]').waitFor({ state: 'visible' });
    await pageB.waitForFunction(() => !document.querySelector('[data-revalidation-side="AGREE"]')?.disabled);
    await pageB.locator('[data-revalidation-side="AGREE"]').click();
    await pageA.waitForFunction(() => window.__debug?.projection?.state?.nodesById?.['opt-base']?.lineage?.role === 'current');
    await pageB.waitForFunction(() => window.__debug?.projection?.state?.nodesById?.['opt-base']?.lineage?.role === 'current');

    // Cascade is a real visible pending state and settles through the ordinary one-energy vote RPC.
    await pageB.waitForFunction(() => window.__debug?.projection?.state?.nodesById?.downstream?.status === 'disputed');
    await openNode(pageB, 'downstream');
    await pageB.locator('.node-detail-cascade-vote').waitFor({ state: 'visible' });
    assert.match(await pageB.locator('.node-detail-state').innerText(), /当前版本 · 重新验证中/);
    await pageB.screenshot({ path: 'artifacts/lineage-product-cascade.png', fullPage: true });
    await pageB.locator('[data-cascade-vote-side="AGREE"]').click();
    await pageA.waitForFunction(() => window.__debug?.projection?.state?.nodesById?.downstream?.status === 'verified');

    // Explicit server failure stays visible and never creates local public truth.
    rejectNextAppend = true;
    await openNode(pageA, 'fail-base');
    await pageA.locator('[data-node-detail-action="edit"]').click();
    await pageA.locator('#lineageCandidateTitle').fill('Rejected Network Candidate');
    await pageA.locator('#lineageCandidateDescription').fill('Must not become a local public fact');
    await pageA.locator('#submitLineageCandidate').click();
    await pageA.waitForFunction(() => document.querySelector('#toast')?.textContent?.includes('操作失败'));
    assert.equal(await pageA.locator('#panel').evaluate(element => element.classList.contains('open')), true, 'failed candidate submission must keep the editing surface open');
    assert.equal(await pageA.evaluate(() => Object.values(window.__debug?.projection?.state?.nodesById ?? {}).some(node => node.title === 'Rejected Network Candidate')), false, 'failed server write must never become local public truth');

    await assertViewport(pageA);
    assert.deepEqual(errorsA, [], `page A unhandled browser errors:\n${errorsA.join('\n')}`);
    assert.deepEqual(errorsB, [], `page B unhandled browser errors:\n${errorsB.join('\n')}`);

    const finalA = await pageA.evaluate(() => ({
      cursor: window.__debug?.syncEngine?.currentCursor?.(),
      nodes: window.__debug?.projection?.state?.nodesById,
    }));
    await pageB.waitForFunction(cursor => window.__debug?.syncEngine?.currentCursor?.() === cursor, finalA.cursor);
    const finalB = await pageB.evaluate(() => ({
      cursor: window.__debug?.syncEngine?.currentCursor?.(),
      nodes: window.__debug?.projection?.state?.nodesById,
    }));
    assert.equal(finalA.cursor, finalB.cursor, 'already-open clients must converge to one authoritative cursor');
    for (const id of ['opt-base', optCandidate, 'fail-base', failedCandidate, 'opp-base', oppositionCandidate, 'downstream']) {
      assert.deepEqual(publicNodeShape(finalA.nodes[id]), publicNodeShape(finalB.nodes[id]), `both clients must project the same public state for ${id}`);
    }

    console.log('Knowledge Lineage product completion browser acceptance passed at 375px');
    console.log('Covered direct entry, success/failure, refresh, two-client convergence, opposition, old-version revalidation, cascade, errors, screenshots');
  } finally {
    await contextA.close();
    await contextB.close();
  }
} finally {
  if (browser) await browser.close();
  appServer.kill('SIGTERM');
  await new Promise(resolve => mockSupabase.close(resolve));
}
