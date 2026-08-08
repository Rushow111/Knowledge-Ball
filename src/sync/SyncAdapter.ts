export interface SyncBatch<TEvent> {
  events: TEvent[];
  cursor?: string;
}

/** The authenticated collaboration scope. Adapters must never infer this from event data. */
export interface SyncIdentity { subject: string; groupId: string; }
export interface IdentityProvider {
  identity(): Promise<SyncIdentity>;
  accessToken(): Promise<string>;
}

export interface SyncAdapter<TEvent> {
  pull(cursor?: string): Promise<SyncBatch<TEvent>>;
  push(events: TEvent[], cursor?: string): Promise<{ cursor?: string }>;
}
