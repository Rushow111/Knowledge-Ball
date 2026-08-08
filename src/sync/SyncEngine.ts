import type { DomainEvent } from '../event/Event';
import type { EventStore } from '../event/EventStore';
import type { SyncAdapter } from './SyncAdapter';

export type ConflictResolver<TEvent> = (events: readonly TEvent[]) => TEvent[];

/** Stable ordering makes last-write-wins projections converge on every client. */
export const resolveDomainEventConflicts: ConflictResolver<DomainEvent> = events => {
  const unique = new Map<string, DomainEvent>();
  for (const event of events) unique.set(event.id, event);
  return [...unique.values()].sort((left, right) =>
    left.timestamp - right.timestamp || left.id.localeCompare(right.id)
  );
};

export class SyncEngine<TState> {
  private cursor: string | undefined;

  constructor(
    private readonly store: EventStore<TState>,
    private readonly adapter: SyncAdapter<DomainEvent>,
    private readonly resolveConflicts: ConflictResolver<DomainEvent> = resolveDomainEventConflicts
  ) {}

  async sync(): Promise<void> {
    const remote = await this.adapter.pull(this.cursor);
    for (const event of this.resolveConflicts(remote.events)) this.store.append(event);
    const result = await this.adapter.push(this.resolveConflicts(this.store.allEvents()), remote.cursor ?? this.cursor);
    this.cursor = result.cursor ?? remote.cursor ?? this.cursor;
  }
}
