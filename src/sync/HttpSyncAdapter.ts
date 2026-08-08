import type { DomainEvent } from '../event/Event';
import type { IdentityProvider, SyncAdapter, SyncBatch } from './SyncAdapter';

export class SyncAuthenticationError extends Error {}

/** HTTP transport; credentials and group membership stay outside the event domain. */
export class HttpSyncAdapter implements SyncAdapter<DomainEvent> {
  constructor(private readonly endpoint: string, private readonly identities: IdentityProvider) {}

  async pull(cursor?: string): Promise<SyncBatch<DomainEvent>> {
    const identity = await this.identities.identity();
    const query = new URLSearchParams({ group: identity.groupId });
    if (cursor) query.set('cursor', cursor);
    return this.request<SyncBatch<DomainEvent>>(`?${query}`);
  }

  async push(events: DomainEvent[], cursor?: string): Promise<{ cursor?: string }> {
    const identity = await this.identities.identity();
    return this.request('', { method: 'POST', body: JSON.stringify({ group: identity.groupId, cursor, events }) });
  }

  private async request<T>(suffix: string, init?: RequestInit): Promise<T> {
    const token = await this.identities.accessToken();
    if (!token) throw new SyncAuthenticationError('A sync access token is required');
    const response = await fetch(`${this.endpoint.replace(/\/$/, '')}${suffix}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...init?.headers },
    });
    if (response.status === 401 || response.status === 403) throw new SyncAuthenticationError(`Sync identity was rejected (${response.status})`);
    if (!response.ok) throw new Error(`Sync request failed (${response.status})`);
    return response.json() as Promise<T>;
  }
}
