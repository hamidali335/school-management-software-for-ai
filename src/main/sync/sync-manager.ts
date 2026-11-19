import { SyncStatus, SyncState, NetworkState } from '../../shared/types';
import { getDatabase } from '../database/connection';
import { SyncEngine } from './sync-engine';
import { ISyncApiClient, HttpSyncApiClient } from './sync-api-client';
import { ConflictRecord } from './conflict-resolver';

import { getDefaultCloudApiBaseUrl } from '../config/endpoints';

export class SyncManager {
  private engine: SyncEngine | null = null;
  private networkState: NetworkState = 'online';

  private getEngine(): SyncEngine {
    if (!this.engine) {
      const db = getDatabase();
      this.engine = new SyncEngine(db);
      this.engine.setNetworkState(this.networkState);
    }
    return this.engine;
  }

  public setApiClient(client: ISyncApiClient): void {
    this.getEngine().setApiClient(client);
  }

  public getApiClient(): ISyncApiClient {
    return this.getEngine().getApiClient();
  }

  public getStatus(): SyncStatus {
    try {
      return this.getEngine().getStatus();
    } catch {
      return {
        state: 'error',
        network: this.networkState,
        lastSyncedAt: null,
        pendingChangesCount: 0,
        centralBackendUrl: getDefaultCloudApiBaseUrl(),
        schoolId: 'school_default',
        lastErrorMessage: 'Database connection not initialized',
      };
    }
  }

  public setNetworkState(state: NetworkState): void {
    this.networkState = state;
    if (this.engine) {
      this.engine.setNetworkState(state);
    }
  }

  public async triggerSync(): Promise<{
    success: boolean;
    syncedCount: number;
    uploadedCount?: number;
    downloadedCount?: number;
    conflictCount?: number;
    error?: string;
  }> {
    const res = await this.getEngine().triggerSync();
    return {
      success: res.success,
      syncedCount: res.uploadedCount + res.downloadedCount,
      uploadedCount: res.uploadedCount,
      downloadedCount: res.downloadedCount,
      conflictCount: res.conflictCount,
      error: res.error,
    };
  }

  public listConflicts(status?: 'unresolved' | 'resolved'): ConflictRecord[] {
    const schoolId = this.getStatus().schoolId;
    return this.getEngine().getConflictResolver().listConflicts(schoolId, status);
  }

  public resolveConflict(
    conflictId: string,
    strategy: 'local_wins' | 'remote_wins' | 'merged',
    resolvedBy: string,
    notes?: string,
    customPayload?: any
  ) {
    const schoolId = this.getStatus().schoolId;
    return this.getEngine().getConflictResolver().resolveConflict(schoolId, conflictId, strategy, resolvedBy, notes, customPayload);
  }

  public getSyncHistory(limit: number = 20): any[] {
    const schoolId = this.getStatus().schoolId;
    return this.getEngine().getSyncHistory(schoolId, limit);
  }

  public getRemoteBackendUrl(): string {
    return this.getStatus().centralBackendUrl;
  }

  public resetEngineForTesting(dbInstance?: any, client?: ISyncApiClient) {
    const db = dbInstance || getDatabase();
    this.engine = new SyncEngine(db, { apiClient: client });
    this.engine.setNetworkState(this.networkState);
  }
}

export const syncManagerInstance = new SyncManager();
