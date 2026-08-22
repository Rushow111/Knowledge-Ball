import { existsSync, readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { formatNodeContributionTime } from './NodeDetailController';

const detail = readFileSync('src/ui/panels/NodeDetailController.ts', 'utf8');
const lineageUi = readFileSync('src/ui/panels/NodeDetailLineageUi.ts', 'utf8');
const css = readFileSync('src/ui/panels/NodeDetailPanel.css', 'utf8');
const app = readFileSync('src/ui/app.ts', 'utf8');

assert.equal(existsSync('src/ui/panels/NodeDetailControllerLegacy.ts'), false, 'there must be one NodeDetailController implementation');
assert.equal(formatNodeContributionTime(undefined), '—');
assert.equal(formatNodeContributionTime('invalid'), '—');
assert.match(formatNodeContributionTime('2026-08-21T04:00:00.000Z'), /^2026-08-21\s/);

for (const text of ['贡献者 ·', '时间 ·', '当前版本', '优化候选 · 等待验证', '对立候选 · 等待验证', '历史版本', '对立版本']) {
  assert(detail.includes(text), `near-node detail must render product-facing state text: ${text}`);
}
assert(!detail.includes('>编辑<'), 'ordinary lineage actions must not be hidden behind a generic Edit entry');
assert(detail.includes('node-detail-primary-actions'), 'current knowledge must expose direct primary product actions');
assert(detail.includes("edit: '优化'"), 'optimization must use the product label');
assert(detail.includes("negate: '提出对立观点'"), 'opposition must use the product label');
assert(detail.includes('生成新版本，旧版本保留'), 'optimization must explain immutable version behavior before the user acts');
assert(detail.includes('提交另一种观点，不直接覆盖'), 'opposition must explain immutable viewpoint behavior before the user acts');
assert(detail.includes('dataNodeDetailAction') || detail.includes('nodeDetailAction'), 'direct actions must retain semantic action data rather than DOM text inference');
assert(detail.includes('更多操作'), 'secondary operations may remain behind one clearly named secondary control');
assert(!detail.includes('ORIGINAL_DESIGN_V1'), 'default user-facing node detail must not require protocol-version jargon');
assert(!detail.includes('NodeDetailControllerLegacy'), 'detail must not inherit from a copied legacy controller');
assert(!lineageUi.includes('relabelActions'), 'cascade helper must not rewrite ordinary detail action labels after render');
assert(!lineageUi.includes('data-node-detail-action="edit"') && !lineageUi.includes('data-node-detail-action="negate"'), 'cascade helper must not own ordinary edit/opposition presentation');

assert(detail.includes("node.status === 'pending'"), 'pending nodes must use the pending interaction branch');
assert(detail.includes('验证这个候选'), 'pending detail must explain what the vote is validating');
assert(detail.includes('data-vote-side="AGREE" disabled><span>同意</span><small>能量 −1</small>'), 'pending detail must expose the agree one-energy action');
assert(detail.includes('data-vote-side="DISAGREE" disabled><span>反对</span><small>能量 −1</small>'), 'pending detail must expose the disagree one-energy action');
assert(detail.includes('account.getPendingKnowledgeVote(nodeId)'), 'near-node vote controls must read authoritative vote state');
assert(detail.includes('account.castPendingKnowledgeVote(nodeId, side)'), 'near-node vote controls must reuse the real vote RPC');
assert(detail.includes("knowledge-ball:verdict-finalized"), 'finalization must reuse public graph reconciliation');
assert(detail.includes('VOTE_REFRESH_MS = 3_000'), 'vote tally must retain bounded prompt refresh cadence');
assert(app.includes('actorId: metadata.actorId'), 'near-node detail must receive authoritative creator actor id');
assert(detail.includes('await account.currentUserId()'), 'initial pending detail must compare current account with creator');
assert(detail.includes("this.root.dataset.voteCreator = '1'"), 'creator identity must lock first-round vote controls');
assert(detail.includes('你是该知识的提交者，不能参与本轮投票'), 'creator must see an explicit no-self-vote explanation');
assert(detail.includes("typeof window === 'undefined'"), 'vote client creation must stay browser-lazy');
assert(!detail.includes('const voteAccount = createProductionAuthClient()'), 'vote client must not initialize at module import time');
assert(!detail.includes('setInterval('), 'near-node voting must not add a permanent polling interval');

assert(detail.includes('让这个版本重新竞争当前版本'), 'old stable versions must explain the reactivation intent in product language');
assert(detail.includes('发起重新验证'), 'old stable versions must expose a clear revalidation entry');
assert(detail.includes('重新验证这个旧版本'), 'active old-version revalidation must use human language');
assert(detail.includes("snapshot.scope === 'LOCAL_10' ? '附近知识' : '全部用户'"), 'revalidation scope must be translated into human-facing language');

assert(lineageUi.includes('class NodeDetailLineageUi'), 'lineage detail enhancement must have one narrow owner');
assert(lineageUi.includes("node.status !== 'disputed' || lineageRoleFor(node) !== 'current'"), 'cascade UI must attach only to disputed current nodes');
assert(lineageUi.includes("snapshot.policyVersion !== 'ORIGINAL_DESIGN_V1'"), 'cascade implementation must still enforce the server-created V1 round internally');
assert(lineageUi.includes('data-cascade-vote-side="AGREE"'), 'cascade UI must expose agree');
assert(lineageUi.includes('data-cascade-vote-side="DISAGREE"'), 'cascade UI must expose disagree');
assert(lineageUi.includes('能量 −1'), 'cascade ordinary vote cost must remain one energy');
assert(lineageUi.includes('account.castPendingKnowledgeVote(nodeId, side)'), 'cascade must reuse the authoritative pending-vote RPC');
assert(lineageUi.includes('REFRESH_MS = 3_000'), 'cascade tally must refresh without a permanent interval');
assert(!lineageUi.includes('setInterval('), 'cascade must not add a permanent polling interval');
assert(app.includes('nodeDetailLineageUi?.open(id)') && app.includes('nodeDetailLineageUi?.refresh(currentPanelId)'), 'app must explicitly coordinate the narrow cascade enhancement with detail lifecycle');

assert(css.includes('.node-detail-state'), 'detail must visibly label lineage/product state');
assert(css.includes('.node-detail-primary-actions'), 'direct primary lineage actions must have an owned layout');
assert(css.includes('.node-detail-primary-action'), 'direct product actions must have dedicated styling');
assert(css.includes('min-height:52px'), 'primary product actions must be comfortably touchable');
assert(css.includes('.node-detail-more') && css.includes('min-height:44px'), 'secondary action disclosure must meet the 44px touch target');
assert(css.includes('.node-detail-vote-button') && css.includes('min-height:44px'), 'vote controls must meet the 44px touch target');
assert(css.includes('grid-template-columns:1fr 1fr'), 'paired primary/vote actions must remain side by side');
assert(css.includes('.node-detail-vote-button span{font-size:12px'), 'vote choice must remain the primary line');
assert(css.includes('.node-detail-vote-button small{font-size:9.5px'), 'energy cost must remain the smaller second line');

assert(detail.includes('node-detail-close'), 'detail must expose a top-right close control');
assert(css.includes('z-index:70'), 'near-node detail must render above WebGL canvas and labels');
assert(css.includes('width:min(58vw,220px)'), 'desktop detail surface must keep the approved narrow width');
assert(css.includes('min-height:330px'), 'desktop detail surface must keep the approved vertical-ellipse height');
assert(css.includes('border-radius:50% / 44%'), 'detail occlusion must keep the approved vertical-ellipse shape');
assert(css.includes('background:radial-gradient('), 'detail surface must keep radial occlusion');
assert(css.includes('rgba(3,5,18,.99) 0%'), 'detail occlusion must keep strong center mask');
assert(css.includes('justify-content:flex-start'), 'detail hierarchy must start near the top');
assert(css.includes('font:700 20px/1.38'), 'desktop node title must keep the 20px primary size');
assert(css.includes('font-size:16px'), 'desktop knowledge content must remain below title hierarchy');
assert(css.includes('.node-detail-title{font-size:19px;}'), 'mobile node title must use 19px');
assert(css.includes('.node-detail-content{max-height:116px;font-size:15px;}'), 'mobile knowledge content must remain readable');
assert(css.includes('margin-top:auto'), 'contributor/time metadata must stay at the bottom');
assert(css.includes('overflow-y:auto'), 'long knowledge content must scroll inside the fixed-size surface');
assert(css.includes('touch-action:pan-y'), 'mobile users must be able to vertically scroll long detail content');

assert(app.includes('if (!Capacitor.isNativePlatform())'), 'new near-node product behavior must remain web-only for now');
assert(app.includes('nodeDetail.open(id)'), 'ordinary-node path must open the near-node detail surface');
assert(app.includes("getMetadata: id =>"), 'detail must receive contributor/time metadata through production adapter');
assert(app.includes('panel.openNodePanel(id)') && app.includes('launchPanelAction'), 'large panel must remain the single editing surface behind direct detail actions');

assert(detail.includes("const LABEL_SWITCH_CLASS = 'node-detail-labels-off';"), 'detail must own one explicit knowledge-label visibility switch');
assert(detail.includes('this.setKnowledgeLabelsVisible(false);'), 'opening detail must switch all knowledge labels off');
assert(detail.includes('this.setKnowledgeLabelsVisible(true);'), 'closing detail must switch knowledge labels back on');
assert(css.includes('html.node-detail-labels-off .node-label'), 'detail label switch must target every knowledge-node label');
assert(css.includes('display:none!important'), 'detail label switch must override per-frame inline label visibility while active');

console.log('Near-node product completion regression tests passed');
