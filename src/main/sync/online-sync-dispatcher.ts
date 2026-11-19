import Database from 'better-sqlite3';
import { ISyncApiClient } from './sync-api-client';
import { WriteCoordinator, DispatchMutationOptions, DispatchMutationResult } from './write-coordinator';
import { syncManagerInstance } from './sync-manager';

export { DispatchMutationOptions, DispatchMutationResult };

/**
 * OnlineSyncDispatcher delegates directly to WriteCoordinator, which enforces
 * strict one-time idempotency keys, durable pre-network outbox insertion,
 * provisional local mutation gating (ATTENDANCE & PAYMENT only), and typed error handling.
 */
export class OnlineSyncDispatcher {
  private coordinator: WriteCoordinator;

  constructor(private db: any, private apiClient?: ISyncApiClient) {
    this.coordinator = new WriteCoordinator(db, apiClient);
  }

  public async dispatchMutation<T>(options: DispatchMutationOptions<T>): Promise<DispatchMutationResult<T>> {
    const client = options.apiClient || this.apiClient;
    if (client) {
      (this.coordinator as any).apiClient = client;
    }
    return this.coordinator.dispatchMutation(options);
  }
}
