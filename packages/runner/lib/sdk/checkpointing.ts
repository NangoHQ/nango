import { validateCheckpoint } from '@nangohq/runner-sdk';

import type { PersistClient } from '../clients/persist.js';
import type { Checkpoint, CheckpointRange } from '@nangohq/types';

type CheckpointState = {
    checkpoint: Checkpoint | null;
    version: number;
    deletedAt: string | null;
} | null;

export class Checkpointing {
    private persistClient: PersistClient;
    private environmentId: number;
    private nangoConnectionId: number;
    private rangeByKey = new Map<string, { from: CheckpointState; to: CheckpointState }>();

    constructor(props: { persistClient: PersistClient; environmentId: number; nangoConnectionId: number }) {
        this.persistClient = props.persistClient;
        this.environmentId = props.environmentId;
        this.nangoConnectionId = props.nangoConnectionId;
    }

    public getRange(key: string): CheckpointRange | null {
        const range = this.rangeByKey.get(key);
        if (!range) {
            return null;
        }
        return {
            from: range.from?.checkpoint && range.from?.deletedAt === null ? range.from.checkpoint : null,
            to: range.to?.checkpoint && range.to?.deletedAt === null ? range.to.checkpoint : null
        };
    }

    public async getCheckpoint<T = Checkpoint>(key: string): Promise<T | null> {
        const res = await this.persistClient.getCheckpoint({
            environmentId: this.environmentId,
            nangoConnectionId: this.nangoConnectionId,
            key
        });

        const current: CheckpointState = res.isErr()
            ? {
                  version: 1, // If no checkpoint, we initialize the version to 1 for optimistic locking on creation.
                  checkpoint: null,
                  deletedAt: null
              }
            : {
                  checkpoint: validateCheckpoint(res.value.checkpoint),
                  deletedAt: res.value.deletedAt,
                  version: res.value.version
              };

        const existing = this.rangeByKey.get(key);
        this.rangeByKey.set(key, { from: existing?.from ?? current, to: current });

        return current.deletedAt ? null : (current.checkpoint as T);
    }

    public async saveCheckpoint(key: string, checkpoint: Checkpoint): Promise<void> {
        const { version } = await this.ensureVersion(key);

        const res = await this.persistClient.putCheckpoint({
            environmentId: this.environmentId,
            nangoConnectionId: this.nangoConnectionId,
            key,
            checkpoint,
            expectedVersion: version
        });
        if (res.isErr()) {
            throw new Error(`Error saving checkpoint: ${res.error.message}`, { cause: res.error });
        }
        const existing = this.rangeByKey.get(key);
        this.rangeByKey.set(key, {
            from: existing?.from ?? null,
            to: {
                checkpoint: validateCheckpoint(res.value.checkpoint),
                version: res.value.version,
                deletedAt: null
            }
        });
    }

    public async clearCheckpoint(key: string): Promise<void> {
        const { version } = await this.ensureVersion(key);

        const res = await this.persistClient.deleteCheckpoint({
            environmentId: this.environmentId,
            nangoConnectionId: this.nangoConnectionId,
            key,
            expectedVersion: version
        });
        if (res.isErr()) {
            throw new Error(`Error deleting checkpoint: ${res.error.message}`, { cause: res.error });
        }
        const existing = this.rangeByKey.get(key);
        this.rangeByKey.set(key, { from: existing?.from ?? null, to: null });
    }

    private async ensureVersion(key: string): Promise<{ version: number }> {
        // If we haven't loaded the checkpoint yet, load it to get the version for optimistic locking.
        if (!this.rangeByKey.get(key)?.to) {
            await this.getCheckpoint(key);
        }

        const version = this.rangeByKey.get(key)?.to?.version;
        if (!version) {
            throw new Error('Missing checkpoint version'); // defensive check - this should never happen
        }

        return { version };
    }
}
