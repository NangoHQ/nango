import type { Knex } from 'knex';
import { Err, stringToHash } from '@nangohq/utils';
import { setTimeout } from 'node:timers/promises';
import type { Result } from '@nangohq/utils';
import { FleetError } from './errors.js';

export async function withPgLock({
    db,
    lockKey,
    fn,
    onTimeout = async () => {},
    timeoutMs = 60000
}: {
    db: Knex;
    lockKey: string;
    fn: () => Promise<Result<void>>;
    onTimeout?: () => Promise<void>;
    timeoutMs?: number;
}): Promise<Result<void>> {
    let trx: Knex.Transaction | undefined = undefined;
    try {
        trx = await db.transaction();
        const { rows } = await trx.raw<{ rows: { lock: boolean }[] }>(`SELECT pg_try_advisory_xact_lock(?) as lock`, [stringToHash(lockKey)]);

        if (!rows?.[0]?.lock) {
            await trx.rollback();
            return Err(new FleetError('fleet_cannot_acquire_lock'));
        }

        const processingTimeout = async (): Promise<Result<void>> => {
            await setTimeout(timeoutMs);
            await onTimeout();
            return Err(new FleetError('fleet_tick_timeout'));
        };
        const res = await Promise.race([fn(), processingTimeout()]);
        await trx.commit();
        return res;
    } catch (err) {
        if (trx) {
            await trx.rollback();
        }
        return Err(new FleetError('fleet_lock_error', { cause: err }));
    }
}
