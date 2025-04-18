import type { Knex } from 'knex';
import { Err, stringToHash } from '@nangohq/utils';
import { setTimeout } from 'node:timers/promises';
import type { Result } from '@nangohq/utils';
import { FleetError } from './errors.js';

export async function withPgLock<T>({
    db,
    lockKey,
    fn,
    onTimeout = async () => {},
    timeoutMs = 60000
}: {
    db: Knex;
    lockKey: string;
    fn: (db: Knex) => Promise<Result<T>>;
    onTimeout?: () => Promise<void>;
    timeoutMs?: number;
}): Promise<Result<T>> {
    let trx: Knex.Transaction | undefined = undefined;
    try {
        trx = await db.transaction();
        const { rows } = await trx.raw<{ rows: { lock: boolean }[] }>(`SELECT pg_try_advisory_xact_lock(?) as lock`, [stringToHash(lockKey)]);

        if (!rows?.[0]?.lock) {
            await trx.rollback();
            return Err(new FleetError('fleet_cannot_acquire_lock'));
        }

        const processingTimeout = async (): Promise<Result<T>> => {
            await setTimeout(timeoutMs);
            await onTimeout();
            return Err(new FleetError('fleet_lock_timeout'));
        };
        const res = await Promise.race([fn(trx), processingTimeout()]);
        await trx.commit();
        return res;
    } catch (err) {
        if (trx) {
            await trx.rollback();
        }
        return Err(new FleetError('fleet_lock_error', { cause: err }));
    }
}
