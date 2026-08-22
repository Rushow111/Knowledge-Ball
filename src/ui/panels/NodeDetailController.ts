import './NodeDetailPanel.css';
import {
  createProductionAuthClient,
  type KnowledgeRevalidationSnapshot,
  type PendingKnowledgeVoteSnapshot,
  type PendingVoteSide,
} from '../../auth/AuthClient';
import type { KnowledgeLineageMeta } from '../../domain/KnowledgeLineage';
import { lineageRoleFor } from '../../domain/KnowledgeLineage';
import type { KnowledgeNodeStatus, KnowledgeNodeType } from '../config/KnowledgeUiConfig';
import type { NodeDetailRelations } from './NodeDetailRelations';

export type NodeDetailAction = 'edit' | 'derive' | 'negate' | 'decompose' | 'merge' | 'resolve' | 'dispute';

export interface NodeDetailNode {
  id: string;
  title: string;
  type: KnowledgeNodeType;
  status: KnowledgeNodeStatus;
  reasoning: string;
  lineage?: KnowledgeLineageMeta;
}

export interface NodeDetailMetadata {
  contributor: string;
  createdAt: string;
  actorId: string;
}

export interface NodeDetailControllerOptions {
  getNodeById: (id: string) => NodeDetailNode | null;
  getMetadata: (id: string) => NodeDetailMetadata | null;
  getRelations: (id: string) => NodeDetailRelations;
  getScreenPosition: (id: string) => { x: number; y: number } | null;
  getActions: (id: string) => NodeDetailAction[];
  onAction: (id: string, action: NodeDetailAction) => void;
  onDetailNodeChange: (id: string | null) => void;
  onClose?: () => void;
}

const ACTION_LABEL: Readonly<Record<NodeDetailAction, string>> = Object.freeze({
  edit: '优化',
  derive: '基于此新增',
  negate: '提出对立观点',
  decompose: '分解',
  merge: '合并',
  resolve: '重新验证',
  dispute: '争议',
});
const PRIMARY_ACTION_HINT: Readonly<Partial<Record<NodeDetailAction, string>>> = Object.freeze({
  edit: '生成新版本，旧版本保留',
  negate: '提交另一种观点，不直接覆盖',
});
const LABEL_SWITCH_CLASS = 'node-detail-labels-off';
const VOTE_REFRESH_MS = 3_000;
let voteAccount: ReturnType<typeof createProductionAuthClient> | undefined;

function currentVoteAccount(): ReturnType<typeof createProductionAuthClient> {
  if (voteAccount !== undefined) return voteAccount;
  if (typeof window === 'undefined') return null;
  voteAccount = createProductionAuthClient();
  return voteAccount;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function displayEnergy(value: string): string {
  return value.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1');
}

function lineageStateMarkup(node: NodeDetailNode): string {
  const role = lineageRoleFor(node);
  let label = '当前版本';
  let detail = '这是当前使用的知识版本。优化或提出对立观点都会生成新球，不会原地覆盖它。';
  let tone = 'current';

  if (node.status === 'pending') {
    if (role === 'candidate-history') {
      label = '优化候选 · 等待验证';
      detail = '验证通过后它才会成为当前版本；判定前原来的当前版本保持不变。';
      tone = 'candidate-history';
    } else if (role === 'candidate-opposition') {
      label = '对立候选 · 等待验证';
      detail = '这是另一种观点。验证通过后才会切换当前观点；判定前原观点保持不变。';
      tone = 'candidate-opposition';
    } else {
      label = '新知识 · 等待验证';
      detail = '这条知识正在进行首次验证，通过后才会成为稳定知识。';
      tone = 'pending';
    }
  } else if (role === 'history') {
    label = node.status === 'disputed' ? '历史版本 · 重新验证中' : '历史版本';
    detail = node.status === 'disputed'
      ? '这个旧版本正在重新竞争当前版本，完成前当前版本不会被替换。'
      : '这是保留下来的旧版本。你可以发起重新验证，让它重新竞争当前版本。';
    tone = 'history';
  } else if (role === 'opposition') {
    label = node.status === 'disputed' ? '对立版本 · 重新验证中' : '对立版本';
    detail = node.status === 'disputed'
      ? '这个对立版本正在重新竞争当前版本，完成前当前版本不会被替换。'
      : '这是保留下来的对立观点。你可以发起重新验证，让它重新竞争当前版本。';
    tone = 'opposition';
  } else if (role === 'current' && node.status === 'disputed') {
    label = '当前版本 · 重新验证中';
    detail = '它依赖的前提版本已经变化，系统正在重新确认这条知识是否仍然成立。';
    tone = 'cascade';
  } else if (node.status === 'suspended') {
    label = '当前版本 · 已悬置';
    detail = '重新验证未通过，当前暂时悬置；历史记录仍然保留。';
    tone = 'suspended';
  }

  return `<div class="node-detail-state ${tone}" role="status"><strong>${label}</strong><span>${detail}</span></div>`;
}

function relationMarkup(relations: NodeDetailRelations): string {
  const render = (className: string, items: NodeDetailRelations[keyof NodeDetailRelations]) => {
    if (items.length === 0) return '';
    return `<div class="node-detail-relations ${className}">${items.map(item => `<span>${escapeHtml(item.title)}</span>`).join('')}</div>`;
  };
  return [
    render('left', relations.premises),
    render('top', relations.history),
    render('right', relations.conclusions),
    render('bottom', relations.opposition),
  ].join('');
}

export function formatNodeContributionTime(value: string | undefined | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date).replaceAll('/', '-');
}

export class NodeDetailController {
  private readonly getNodeById: NodeDetailControllerOptions['getNodeById'];
  private readonly getMetadata: NodeDetailControllerOptions['getMetadata'];
  private readonly getRelations: NodeDetailControllerOptions['getRelations'];
  private readonly getScreenPosition: NodeDetailControllerOptions['getScreenPosition'];
  private readonly getActions: NodeDetailControllerOptions['getActions'];
  private readonly onAction: NodeDetailControllerOptions['onAction'];
  private readonly onDetailNodeChange: NodeDetailControllerOptions['onDetailNodeChange'];
  private readonly onClose?: NodeDetailControllerOptions['onClose'];
  private readonly root: HTMLElement;
  private currentId: string | null = null;
  private positionFrame: number | null = null;
  private voteRefreshTimer: number | null = null;
  private voteRenderToken = 0;

  constructor(options: NodeDetailControllerOptions) {
    this.getNodeById = options.getNodeById;
    this.getMetadata = options.getMetadata;
    this.getRelations = options.getRelations;
    this.getScreenPosition = options.getScreenPosition;
    this.getActions = options.getActions;
    this.onAction = options.onAction;
    this.onDetailNodeChange = options.onDetailNodeChange;
    this.onClose = options.onClose;
    this.root = document.createElement('section');
    this.root.id = 'nodeDetailOverlay';
    this.root.setAttribute('aria-live', 'polite');
    document.body.appendChild(this.root);
    window.addEventListener('resize', this.positionCurrent, { passive: true });
  }

  isOpen(): boolean {
    return this.currentId !== null && this.root.classList.contains('open');
  }

  isOpenFor(id: string): boolean {
    return this.isOpen() && this.currentId === id;
  }

  open(id: string): void {
    const node = this.getNodeById(id);
    if (!node) return;
    this.currentId = id;
    this.setKnowledgeLabelsVisible(false);
    this.onDetailNodeChange(id);
    this.render(node);
    this.root.classList.add('open');
    this.positionCurrent();
    this.startPositionTracking();
  }

  refresh(id = this.currentId): void {
    if (!id || id !== this.currentId) return;
    const node = this.getNodeById(id);
    if (!node) {
      this.close();
      return;
    }
    this.render(node);
    this.positionCurrent();
  }

  close(): void {
    const wasOpen = this.currentId !== null || this.root.classList.contains('open');
    this.setKnowledgeLabelsVisible(true);
    this.clearVoteRefresh();
    this.voteRenderToken++;
    if (!wasOpen) return;
    this.currentId = null;
    this.root.classList.remove('open');
    this.root.innerHTML = '';
    this.root.removeAttribute('data-node-id');
    this.stopPositionTracking();
    this.onDetailNodeChange(null);
    this.onClose?.();
  }

  destroy(): void {
    this.close();
    window.removeEventListener('resize', this.positionCurrent);
    this.root.remove();
  }

  private render(node: NodeDetailNode): void {
    this.clearVoteRefresh();
    const token = ++this.voteRenderToken;
    const metadata = this.getMetadata(node.id);
    const contributor = metadata?.contributor || '—';
    const time = formatNodeContributionTime(metadata?.createdAt);
    const actions = this.getActions(node.id);
    const account = currentVoteAccount();
    const role = lineageRoleFor(node);
    const oldLineage = role === 'history' || role === 'opposition';
    const relations = this.getRelations(node.id);

    let interaction: string;
    if (node.status === 'pending') {
      // First-round node/candidate validation remains V2 and one energy.
      interaction = `
        <div class="node-detail-vote node-detail-interaction">
          <div class="node-detail-vote-title">验证这个候选</div>
          <div class="node-detail-vote-actions">
            <button type="button" class="node-detail-vote-button agree" data-vote-side="AGREE" disabled><span>同意</span><small>能量 −1</small></button>
            <button type="button" class="node-detail-vote-button disagree" data-vote-side="DISAGREE" disabled><span>反对</span><small>能量 −1</small></button>
          </div>
          <div class="node-detail-vote-status" role="status" aria-live="polite">${account ? '正在同步投票状态…' : '共享服务未配置，暂不能投票'}</div>
        </div>
      `;
    } else if (oldLineage && node.status === 'verified') {
      interaction = `
        <div class="node-detail-reactivation node-detail-interaction">
          <div class="node-detail-vote-title">让这个版本重新竞争当前版本</div>
          <div class="node-detail-vote-actions">
            <button type="button" class="node-detail-vote-button agree" data-reactivate-intent="1" ${account ? '' : 'disabled'}><span>发起重新验证</span><small>需要确认</small></button>
            <button type="button" class="node-detail-vote-button disagree" disabled><span>当前版本不变</span><small>无需操作</small></button>
          </div>
          <div class="node-detail-confirm" hidden>
            <div>确认让这个旧版本重新竞争当前版本？</div>
            <div class="node-detail-confirm-actions">
              <button type="button" data-reactivate-cancel>取消</button>
              <button type="button" data-reactivate-confirm>确认发起</button>
            </div>
          </div>
          <div class="node-detail-vote-status" role="status" aria-live="polite">${account ? '确认后进入重新验证；完成前当前版本不会被替换' : '共享服务未配置，暂不能重新验证'}</div>
        </div>
      `;
    } else if (oldLineage && node.status === 'disputed') {
      interaction = this.revalidationMarkup(null, account !== null);
    } else if (role === 'current' && node.status === 'disputed') {
      interaction = `
        <div class="node-detail-cascade-status node-detail-interaction" role="status">
          前提的当前版本已经变化，正在等待大家重新确认这条知识是否仍然成立。
        </div>
      `;
    } else {
      interaction = `
        <div class="node-detail-product-actions node-detail-interaction" aria-label="可执行操作">
          <div class="node-detail-action-title">继续完善这个知识</div>
          <div class="node-detail-primary-actions"></div>
          <button type="button" class="node-detail-more" aria-expanded="false">更多操作</button>
          <div class="node-detail-edit-menu" hidden></div>
        </div>
      `;
    }

    this.root.dataset.nodeId = node.id;
    delete this.root.dataset.voteCreator;
    delete this.root.dataset.revalidationInitiator;
    this.root.innerHTML = `
      ${relationMarkup(relations)}
      <button type="button" class="node-detail-close" aria-label="关闭知识节点详情">×</button>
      ${lineageStateMarkup(node)}
      <h2 class="node-detail-title">${escapeHtml(node.title)}</h2>
      <div class="node-detail-content">${escapeHtml(node.reasoning || '（未填写）')}</div>
      ${interaction}
      <div class="node-detail-meta">
        <span>贡献者 · <b>${escapeHtml(contributor)}</b></span>
        <span>时间 · <b>${escapeHtml(time)}</b></span>
      </div>
    `;

    this.root.querySelector<HTMLButtonElement>('.node-detail-close')?.addEventListener('click', () => this.close());

    if (node.status === 'pending') {
      void this.bindPendingVote(node.id, token, account, metadata?.actorId);
      return;
    }

    if (oldLineage && node.status === 'verified') {
      this.bindReactivation(node.id, token, account);
      return;
    }

    if (oldLineage && node.status === 'disputed') {
      void this.bindRevalidationVote(node.id, token, account);
      return;
    }

    if (role === 'current' && node.status === 'disputed') return;

    const primary = this.root.querySelector<HTMLElement>('.node-detail-primary-actions');
    const menu = this.root.querySelector<HTMLElement>('.node-detail-edit-menu');
    const moreButton = this.root.querySelector<HTMLButtonElement>('.node-detail-more');
    let secondaryCount = 0;

    const bindAction = (button: HTMLButtonElement, action: NodeDetailAction) => {
      button.dataset.nodeDetailAction = action;
      button.addEventListener('click', () => {
        const id = this.currentId;
        if (!id) return;
        this.close();
        this.onAction(id, action);
      });
    };

    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      if (action === 'edit' || action === 'negate') {
        button.className = `node-detail-primary-action ${action === 'edit' ? 'optimization' : 'opposition'}`;
        button.innerHTML = `<strong>${ACTION_LABEL[action]}</strong><small>${PRIMARY_ACTION_HINT[action] ?? ''}</small>`;
        bindAction(button, action);
        primary?.appendChild(button);
      } else {
        button.textContent = ACTION_LABEL[action];
        bindAction(button, action);
        menu?.appendChild(button);
        secondaryCount += 1;
      }
    }

    if (primary && primary.childElementCount === 0) primary.hidden = true;
    if (!moreButton || !menu) return;
    if (secondaryCount === 0) {
      moreButton.hidden = true;
      menu.hidden = true;
      return;
    }
    moreButton.addEventListener('click', () => {
      menu.hidden = !menu.hidden;
      moreButton.setAttribute('aria-expanded', String(!menu.hidden));
      moreButton.textContent = menu.hidden ? '更多操作' : '收起其他操作';
    });
  }

  private bindReactivation(
    nodeId: string,
    token: number,
    account: ReturnType<typeof createProductionAuthClient>,
  ): void {
    const intent = this.root.querySelector<HTMLButtonElement>('[data-reactivate-intent]');
    const confirm = this.root.querySelector<HTMLElement>('.node-detail-confirm');
    const cancel = this.root.querySelector<HTMLButtonElement>('[data-reactivate-cancel]');
    const submit = this.root.querySelector<HTMLButtonElement>('[data-reactivate-confirm]');
    const status = this.root.querySelector<HTMLElement>('.node-detail-vote-status');
    if (!account || !intent || !confirm || !submit) return;

    intent.addEventListener('click', () => { confirm.hidden = false; });
    cancel?.addEventListener('click', () => { confirm.hidden = true; });
    submit.addEventListener('click', async () => {
      if (!this.isCurrentVote(nodeId, token) || this.root.dataset.voteBusy === '1') return;
      this.root.dataset.voteBusy = '1';
      intent.disabled = true;
      submit.disabled = true;
      if (status) status.textContent = '正在启动重新验证…';
      try {
        const snapshot = await account.startKnowledgeRevalidation(nodeId);
        if (!this.isCurrentVote(nodeId, token)) return;
        this.root.dataset.revalidationInitiator = '1';
        this.showRevalidationSnapshot(snapshot, token, account);
        window.dispatchEvent(new CustomEvent('knowledge-ball:verdict-finalized', {
          detail: { nodeId, revalidationStarted: true },
        }));
      } catch (error) {
        if (!this.isCurrentVote(nodeId, token)) return;
        intent.disabled = false;
        submit.disabled = false;
        if (status) status.textContent = error instanceof Error ? `启动失败：${error.message}` : '重新验证启动失败';
      } finally {
        delete this.root.dataset.voteBusy;
      }
    });
  }

  private revalidationMarkup(snapshot: KnowledgeRevalidationSnapshot | null, configured: boolean): string {
    const stake = snapshot ? displayEnergy(snapshot.stake) : '…';
    return `
      <div class="node-detail-revalidation node-detail-interaction">
        <div class="node-detail-vote-title">重新验证这个旧版本</div>
        <div class="node-detail-vote-actions">
          <button type="button" class="node-detail-vote-button agree" data-revalidation-side="AGREE" disabled><span>同意</span><small>能量 −${stake}</small></button>
          <button type="button" class="node-detail-vote-button disagree" data-revalidation-side="DISAGREE" disabled><span>反对</span><small>能量 −${stake}</small></button>
        </div>
        <div class="node-detail-vote-status" role="status" aria-live="polite">${configured ? '正在同步重新验证状态…' : '共享服务未配置，暂不能投票'}</div>
      </div>
    `;
  }

  private async bindRevalidationVote(
    nodeId: string,
    token: number,
    account: ReturnType<typeof createProductionAuthClient>,
  ): Promise<void> {
    if (!account) return;
    try {
      const snapshot = await account.getKnowledgeRevalidation(nodeId);
      if (!this.isCurrentVote(nodeId, token)) return;
      this.showRevalidationSnapshot(snapshot, token, account);
    } catch (error) {
      if (!this.isCurrentVote(nodeId, token)) return;
      const status = this.root.querySelector<HTMLElement>('.node-detail-vote-status');
      if (status) status.textContent = error instanceof Error ? `同步失败：${error.message}` : '重新验证状态同步失败';
    }
  }

  private showRevalidationSnapshot(
    snapshot: KnowledgeRevalidationSnapshot,
    token: number,
    account: NonNullable<ReturnType<typeof createProductionAuthClient>>,
  ): void {
    const interaction = this.root.querySelector<HTMLElement>('.node-detail-interaction');
    if (!interaction) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = this.revalidationMarkup(snapshot, true);
    interaction.replaceWith(wrapper.firstElementChild!);

    const buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-revalidation-side]'));
    for (const button of buttons) {
      button.addEventListener('click', () => {
        const side = button.dataset.revalidationSide as PendingVoteSide | undefined;
        if (side === 'AGREE' || side === 'DISAGREE') void this.castRevalidationVote(snapshot.nodeId, side, token, account);
      });
    }
    this.applyRevalidationSnapshot(snapshot);
    if (snapshot.verdict === 'PENDING') this.scheduleRevalidationRefresh(snapshot.nodeId, token, account);
    else this.handleFinalizedRevalidation(snapshot);
  }

  private async refreshRevalidationVote(
    nodeId: string,
    token: number,
    account: NonNullable<ReturnType<typeof createProductionAuthClient>>,
  ): Promise<void> {
    if (!this.isCurrentVote(nodeId, token)) return;
    try {
      const snapshot = await account.getKnowledgeRevalidation(nodeId);
      if (!this.isCurrentVote(nodeId, token)) return;
      this.applyRevalidationSnapshot(snapshot);
      if (snapshot.verdict === 'PENDING') this.scheduleRevalidationRefresh(nodeId, token, account);
      else this.handleFinalizedRevalidation(snapshot);
    } catch (error) {
      if (!this.isCurrentVote(nodeId, token)) return;
      const status = this.root.querySelector<HTMLElement>('.node-detail-vote-status');
      if (status) status.textContent = error instanceof Error ? `同步失败：${error.message}` : '重新验证状态同步失败';
      if (document.visibilityState !== 'hidden') this.scheduleRevalidationRefresh(nodeId, token, account);
    }
  }

  private async castRevalidationVote(
    nodeId: string,
    side: PendingVoteSide,
    token: number,
    account: NonNullable<ReturnType<typeof createProductionAuthClient>>,
  ): Promise<void> {
    if (!this.isCurrentVote(nodeId, token) || this.root.dataset.voteBusy === '1') return;
    this.root.dataset.voteBusy = '1';
    this.clearVoteRefresh();
    const buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-revalidation-side]'));
    buttons.forEach(button => { button.disabled = true; });
    const status = this.root.querySelector<HTMLElement>('.node-detail-vote-status');
    if (status) status.textContent = `${side === 'AGREE' ? '同意' : '反对'}票提交中…`;
    try {
      const snapshot = await account.castKnowledgeRevalidationVote(nodeId, side);
      if (!this.isCurrentVote(nodeId, token)) return;
      this.applyRevalidationSnapshot(snapshot, true);
      if (snapshot.verdict === 'PENDING') this.scheduleRevalidationRefresh(nodeId, token, account);
      else this.handleFinalizedRevalidation(snapshot);
    } catch (error) {
      if (!this.isCurrentVote(nodeId, token)) return;
      if (status) status.textContent = error instanceof Error ? `投票失败：${error.message}` : '重新验证投票失败';
      buttons.forEach(button => { button.disabled = this.root.dataset.revalidationInitiator === '1'; });
      this.scheduleRevalidationRefresh(nodeId, token, account);
    } finally {
      delete this.root.dataset.voteBusy;
    }
  }

  private applyRevalidationSnapshot(snapshot: KnowledgeRevalidationSnapshot, justVoted = false): void {
    const open = snapshot.verdict === 'PENDING';
    const buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-revalidation-side]'));
    for (const button of buttons) {
      const side = button.dataset.revalidationSide as PendingVoteSide | undefined;
      button.querySelector('small')!.textContent = `能量 −${displayEnergy(snapshot.stake)}`;
      button.classList.toggle('active', Boolean(snapshot.mySide && side === snapshot.mySide));
      button.disabled = !open
        || snapshot.mySide !== null
        || this.root.dataset.revalidationInitiator === '1';
    }
    const status = this.root.querySelector<HTMLElement>('.node-detail-vote-status');
    if (!status) return;
    const gate = snapshot.accuracyGate === undefined ? '' : ` · 准确率≥${snapshot.accuracyGate}%`;
    const scope = snapshot.scope === 'LOCAL_10' ? '附近知识' : '全部用户';
    const tally = `同意 ${snapshot.agreeCount}/${snapshot.requiredVotes} · 反对 ${snapshot.disagreeCount}/${snapshot.requiredVotes}`;
    if (!open) {
      const reason = snapshot.closeReason === 'TIMEOUT' ? '时间到期' : '达到票数';
      status.textContent = `${snapshot.verdict === 'CORRECT' ? '旧版本重新成为当前版本' : '当前版本保持不变'} · ${reason} · ${tally}`;
      return;
    }
    if (this.root.dataset.revalidationInitiator === '1') {
      status.textContent = `已发起 · 第 ${snapshot.stage} 阶段 · ${scope}${gate} · ${tally}`;
      return;
    }
    if (snapshot.mySide) {
      status.textContent = `${justVoted ? '投票成功 · ' : ''}已投${snapshot.mySide === 'AGREE' ? '同意' : '反对'} · ${scope}${gate} · ${tally}`;
    } else {
      status.textContent = `第 ${snapshot.stage} 阶段 · ${scope}${gate} · ${tally}`;
    }
  }

  private handleFinalizedRevalidation(snapshot: KnowledgeRevalidationSnapshot): void {
    this.clearVoteRefresh();
    window.dispatchEvent(new CustomEvent('knowledge-ball:verdict-finalized', {
      detail: { nodeId: snapshot.nodeId, verdict: snapshot.verdict, revalidation: true },
    }));
  }

  private scheduleRevalidationRefresh(
    nodeId: string,
    token: number,
    account: NonNullable<ReturnType<typeof createProductionAuthClient>>,
  ): void {
    this.clearVoteRefresh();
    this.voteRefreshTimer = window.setTimeout(() => {
      this.voteRefreshTimer = null;
      void this.refreshRevalidationVote(nodeId, token, account);
    }, VOTE_REFRESH_MS);
  }

  private async bindPendingVote(
    nodeId: string,
    token: number,
    account: ReturnType<typeof createProductionAuthClient>,
    creatorActorId: string | undefined,
  ): Promise<void> {
    const buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-vote-side]'));
    if (!account) {
      buttons.forEach(button => { button.disabled = true; });
      return;
    }

    if (creatorActorId) {
      try {
        const actorId = await account.currentUserId();
        if (!this.isCurrentVote(nodeId, token)) return;
        if (actorId === creatorActorId) this.root.dataset.voteCreator = '1';
      } catch {
        if (!this.isCurrentVote(nodeId, token)) return;
        const status = this.root.querySelector<HTMLElement>('.node-detail-vote-status');
        if (status) status.textContent = '身份确认失败，暂不能投票';
        return;
      }
    }

    if (this.root.dataset.voteCreator !== '1') {
      buttons.forEach(button => button.addEventListener('click', () => {
        const side = button.dataset.voteSide as PendingVoteSide | undefined;
        if (side === 'AGREE' || side === 'DISAGREE') void this.castPendingVote(nodeId, side, token);
      }));
    }
    await this.refreshPendingVote(nodeId, token);
  }

  private async refreshPendingVote(nodeId: string, token: number): Promise<void> {
    const account = currentVoteAccount();
    if (!account || !this.isCurrentVote(nodeId, token)) return;
    try {
      const snapshot = await account.getPendingKnowledgeVote(nodeId);
      if (!this.isCurrentVote(nodeId, token)) return;
      this.applyVoteSnapshot(snapshot);
      if (snapshot.verdict === 'PENDING') this.scheduleVoteRefresh(nodeId, token);
      else this.handleFinalizedVote(snapshot);
    } catch (error) {
      if (!this.isCurrentVote(nodeId, token)) return;
      const status = this.root.querySelector<HTMLElement>('.node-detail-vote-status');
      if (status) status.textContent = error instanceof Error ? `同步失败：${error.message}` : '投票状态同步失败';
      if (document.visibilityState !== 'hidden') this.scheduleVoteRefresh(nodeId, token);
    }
  }

  private async castPendingVote(nodeId: string, side: PendingVoteSide, token: number): Promise<void> {
    const account = currentVoteAccount();
    if (!account || !this.isCurrentVote(nodeId, token) || this.root.dataset.voteBusy === '1') return;
    this.root.dataset.voteBusy = '1';
    this.clearVoteRefresh();
    const buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-vote-side]'));
    buttons.forEach(button => { button.disabled = true; });
    const status = this.root.querySelector<HTMLElement>('.node-detail-vote-status');
    if (status) status.textContent = `${side === 'AGREE' ? '同意' : '反对'}票提交中 · 能量 −1…`;
    try {
      const snapshot = await account.castPendingKnowledgeVote(nodeId, side);
      if (!this.isCurrentVote(nodeId, token)) return;
      this.applyVoteSnapshot(snapshot, true);
      if (snapshot.verdict === 'PENDING') this.scheduleVoteRefresh(nodeId, token);
      else this.handleFinalizedVote(snapshot);
    } catch (error) {
      if (!this.isCurrentVote(nodeId, token)) return;
      if (status) status.textContent = error instanceof Error ? `投票失败：${error.message}` : '投票失败';
      buttons.forEach(button => { button.disabled = false; });
      this.scheduleVoteRefresh(nodeId, token);
    } finally {
      delete this.root.dataset.voteBusy;
    }
  }

  private applyVoteSnapshot(snapshot: PendingKnowledgeVoteSnapshot, justVoted = false): void {
    const open = snapshot.verdict === 'PENDING';
    const buttons = Array.from(this.root.querySelectorAll<HTMLButtonElement>('[data-vote-side]'));
    for (const button of buttons) {
      const side = button.dataset.voteSide as PendingVoteSide | undefined;
      button.classList.toggle('active', Boolean(snapshot.mySide && side === snapshot.mySide));
      button.disabled = !open || snapshot.mySide !== null || this.root.dataset.voteCreator === '1';
    }
    const status = this.root.querySelector<HTMLElement>('.node-detail-vote-status');
    if (!status) return;
    const tally = `同意 ${snapshot.agreeCount}/${snapshot.requiredVotes} · 反对 ${snapshot.disagreeCount}/${snapshot.requiredVotes}`;
    if (!open) {
      const reason = snapshot.closeReason === 'TIMEOUT' ? '时间到期' : '达到票数';
      status.textContent = `${snapshot.verdict === 'CORRECT' ? '验证通过' : '验证未通过'} · ${reason} · ${tally}`;
      return;
    }
    if (this.root.dataset.voteCreator === '1') {
      status.textContent = `你是该知识的提交者，不能参与本轮投票 · ${tally}`;
      return;
    }
    if (snapshot.mySide) {
      status.textContent = `${justVoted ? '投票成功 · ' : ''}已投${snapshot.mySide === 'AGREE' ? '同意' : '反对'} · ${tally}`;
    } else {
      status.textContent = tally;
    }
  }

  private handleFinalizedVote(snapshot: PendingKnowledgeVoteSnapshot): void {
    if (this.root.dataset.finalizedVote === snapshot.nodeId) return;
    this.root.dataset.finalizedVote = snapshot.nodeId;
    this.clearVoteRefresh();
    window.dispatchEvent(new CustomEvent('knowledge-ball:verdict-finalized', {
      detail: { nodeId:snapshot.nodeId, verdict:snapshot.verdict },
    }));
  }

  private scheduleVoteRefresh(nodeId: string, token: number): void {
    this.clearVoteRefresh();
    this.voteRefreshTimer = window.setTimeout(() => {
      this.voteRefreshTimer = null;
      void this.refreshPendingVote(nodeId, token);
    }, VOTE_REFRESH_MS);
  }

  private clearVoteRefresh(): void {
    if (this.voteRefreshTimer !== null) window.clearTimeout(this.voteRefreshTimer);
    this.voteRefreshTimer = null;
  }

  private isCurrentVote(nodeId: string, token: number): boolean {
    return token === this.voteRenderToken
      && this.currentId === nodeId
      && this.root.dataset.nodeId === nodeId
      && this.root.isConnected;
  }

  private setKnowledgeLabelsVisible(visible: boolean): void {
    document.documentElement.classList.toggle(LABEL_SWITCH_CLASS, !visible);
  }

  private startPositionTracking(): void {
    this.stopPositionTracking();
    const tick = () => {
      if (!this.currentId || !this.root.classList.contains('open')) return;
      this.positionCurrent();
      this.positionFrame = requestAnimationFrame(tick);
    };
    this.positionFrame = requestAnimationFrame(tick);
  }

  private stopPositionTracking(): void {
    if (this.positionFrame !== null) cancelAnimationFrame(this.positionFrame);
    this.positionFrame = null;
  }

  private positionCurrent = (): void => {
    if (!this.currentId || !this.root.classList.contains('open')) return;
    const point = this.getScreenPosition(this.currentId);
    const halfWidth = Math.min(window.innerWidth * .30, 120);
    const halfHeight = 180;
    const x = Math.max(halfWidth + 6, Math.min(window.innerWidth - halfWidth - 6, point?.x ?? window.innerWidth / 2));
    const y = Math.max(halfHeight + 8, Math.min(window.innerHeight - halfHeight - 8, point?.y ?? window.innerHeight / 2));
    this.root.style.left = `${x}px`;
    this.root.style.top = `${y}px`;
  };
}
