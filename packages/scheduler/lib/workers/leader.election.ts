import type knex from 'knex';
import { Err, Ok } from '@nangohq/utils';
import type { Result } from '@nangohq/utils';

export const LEADER_LOCKS_TABLE = 'leader_locks';

export class LeaderElection {
    private readonly db: knex.Knex;
    private readonly leaderKey: string;
    public readonly leaseTimeoutMs: number;

    constructor({ db, leaderKey, leaseTimeoutMs }: { db: knex.Knex; leaderKey: string; leaseTimeoutMs: number }) {
        this.db = db;
        this.leaderKey = leaderKey;
        this.leaseTimeoutMs = leaseTimeoutMs;
    }

    private async acquire(nodeId: string): Promise<boolean> {
        // we use a single row table to store the leader lock
        // if no row exists, we insert a new row with the current node as the leader
        // if the current leader has not renewed its lease in time, we take over
        // if the current leader is the same as the node trying to acquire leadership, we renew the lease
        const res = await this.db
            .insert({
                key: this.leaderKey,
                node_id: nodeId,
                acquired_at: this.db.fn.now()
            })
            .into(LEADER_LOCKS_TABLE)
            .onConflict('key')
            .merge(['node_id', 'acquired_at'])
            .where(`${LEADER_LOCKS_TABLE}.acquired_at`, '<', this.db.raw(`CURRENT_TIMESTAMP - INTERVAL '${this.leaseTimeoutMs} milliseconds'`))
            .orWhere(`${LEADER_LOCKS_TABLE}.node_id`, '=', nodeId)
            .returning('*');
        return res.length > 0;
    }

    public async release(nodeId: string): Promise<void> {
        await this.db.from(LEADER_LOCKS_TABLE).where('key', this.leaderKey).andWhere('node_id', nodeId).delete();
    }

    public async elect(nodeId: string): Promise<Result<void>> {
        const acquired = await this.acquire(nodeId);
        return acquired ? Ok(undefined) : Err(new Error(`Node ${nodeId} failed to acquire leadership.`));
    }
}
