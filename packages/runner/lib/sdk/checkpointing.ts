import { validateCheckpoint } from '@nangohq/runner-sdk';

import type { PersistClient } from '../clients/persist.js';
import type { Checkpoint } from '@nangohq/types';

type CheckpointState = {
    checkpoint: Checkpoint | null;
    version: number;
    deletedAt: string | null;
} | null;

interface KeyState {
    from: CheckpointState;
    last: CheckpointState;
}

export class Checkpointing {
    private persistClient: PersistClient;
    private environmentId: number;
    private nangoConnectionId: number;
    private stateByKey = new Map<string, KeyState>();

    constructor(props: { persistClient: PersistClient; environmentId: number; nangoConnectionId: number }) {
        this.persistClient = props.persistClient;
        this.environmentId = props.environmentId;
        this.nangoConnectionId = props.nangoConnectionId;
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

        const existing = this.stateByKey.get(key);
        this.stateByKey.set(key, { from: existing?.from ?? current, last: current });

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
        const existing = this.stateByKey.get(key);
        this.stateByKey.set(key, {
            from: existing?.from ?? null,
            last: {
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
        const existing = this.stateByKey.get(key);
        this.stateByKey.set(key, { from: existing?.from ?? null, last: null });
    }

    private async ensureVersion(key: string): Promise<{ version: number }> {
        // If we haven't loaded the checkpoint yet, load it to get the version for optimistic locking.
        if (!this.stateByKey.get(key)?.last) {
            await this.getCheckpoint(key);
        }

        const version = this.stateByKey.get(key)?.last?.version;
        if (!version) {
            throw new Error('Missing checkpoint version'); // defensive check - this should never happen
        }

        return { version };
    }
}
