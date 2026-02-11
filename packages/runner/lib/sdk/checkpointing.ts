import { z } from 'zod';

import type { PersistClient } from '../clients/persist.js';
import type { Checkpoint } from '@nangohq/types';

type CheckpointState = {
    checkpoint: Checkpoint | null;
    version: number;
    deletedAt: string | null;
} | null;

export class Checkpointing {
    private persistClient: PersistClient;
    private environmentId: number;
    private nangoConnectionId: number;
    private key: string;

    public from: CheckpointState = null; // checkpoint at first checkpointing call
    public last: CheckpointState = null; // last saved checkpoint

    constructor(props: { persistClient: PersistClient; environmentId: number; nangoConnectionId: number; key: string }) {
        this.persistClient = props.persistClient;
        this.environmentId = props.environmentId;
        this.nangoConnectionId = props.nangoConnectionId;
        this.key = props.key;
    }

    public async getCheckpoint(): Promise<Checkpoint | null> {
        const res = await this.persistClient.getCheckpoint({
            environmentId: this.environmentId,
            nangoConnectionId: this.nangoConnectionId,
            key: this.key
        });

        this.last = res.isErr()
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

        if (!this.from) this.from = this.last;

        return this.last.deletedAt ? null : this.last.checkpoint;
    }

    public async saveCheckpoint(checkpoint: Checkpoint): Promise<void> {
        const { version } = await this.ensureVersion();

        const res = await this.persistClient.putCheckpoint({
            environmentId: this.environmentId,
            nangoConnectionId: this.nangoConnectionId,
            key: this.key,
            checkpoint,
            expectedVersion: version
        });
        if (res.isErr()) {
            throw new Error(`Error saving checkpoint: ${res.error.message}`, { cause: res.error });
        }
        this.last = {
            checkpoint: validateCheckpoint(res.value.checkpoint),
            version: res.value.version,
            deletedAt: null
        };
    }

    public async clearCheckpoint(): Promise<void> {
        const { version } = await this.ensureVersion();

        const res = await this.persistClient.deleteCheckpoint({
            environmentId: this.environmentId,
            nangoConnectionId: this.nangoConnectionId,
            key: this.key,
            expectedVersion: version
        });
        if (res.isErr()) {
            throw new Error(`Error deleting checkpoint: ${res.error.message}`, { cause: res.error });
        }
        this.last = null;
    }

    private async ensureVersion(): Promise<{ version: number }> {
        // If we haven't loaded the checkpoint yet, load it to get the version for optimistic locking.
        if (!this.last) {
            await this.getCheckpoint();
        }

        if (!this.last?.version) {
            throw new Error('Missing checkpoint version'); // defensive check - this should never happen
        }

        return { version: this.last.version };
    }
}

/*
 * The checkpoint can contain date strings.
 * This function recursively checks the checkpoint object and converts any string that is a valid datetime to a Date object.
 */
function validateCheckpoint(checkpoint: Checkpoint): Checkpoint {
    const validated: Checkpoint = {};
    for (const [key, value] of Object.entries(checkpoint)) {
        if (typeof value === 'string') {
            const parsed = z.string().datetime().safeParse(value);
            if (parsed.success) {
                validated[key] = new Date(value);
                continue;
            }
        }
        validated[key] = value;
    }
    return validated;
}
