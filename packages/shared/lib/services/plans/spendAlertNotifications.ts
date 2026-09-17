import { v4 as uuid } from 'uuid';

import { Err, Ok, report } from '@nangohq/utils';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export const SPEND_ALERT_NOTIFICATIONS_TABLE = 'spend_alert_notifications';

// Matches Orb's webhook timestamp tolerance: shorter risks a double send, longer a longer silence after a crash.
export const SPEND_ALERT_CLAIM_LEASE_MINUTES = 5;

interface SpendAlertNotificationKey {
    accountId: number;
    thresholdInCents: number;
    /** Start of the billing period the crossing happened in, as Orb reported it. */
    timeframeStart: Date;
}

// Reissued on every takeover, so a worker that outlived its lease can't touch the row that replaced it.
export interface SpendAlertClaim {
    id: number;
    token: string;
}

/**
 * True only for the caller that holds the claim — this, not the webhook, is what makes "one
 * notification per threshold per period" true against Orb's at-least-once redelivery.
 *
 * A claim is only a lease until {@link markSpendAlertNotified} records the send, and is taken over
 * after {@link SPEND_ALERT_CLAIM_LEASE_MINUTES} if that never happens.
 */
export async function claimSpendAlertNotification(db: Knex, key: SpendAlertNotificationKey): Promise<Result<SpendAlertClaim | null>> {
    try {
        const token = uuid();
        // One statement so concurrent deliveries can't both win — the DO UPDATE only fires for a lapsed, unsent claim.
        const claimed = await db.raw(
            `insert into ?? (account_id, threshold_in_cents, timeframe_start, created_at, claim_token)
             values (?, ?, ?, now(), ?)
             on conflict (account_id, threshold_in_cents, timeframe_start)
             do update set created_at = now(), claim_token = excluded.claim_token
             where ??.notified_at is null
               and ??.created_at < now() - (? || ' minutes')::interval
             returning id, claim_token`,
            [
                SPEND_ALERT_NOTIFICATIONS_TABLE,
                key.accountId,
                key.thresholdInCents,
                key.timeframeStart,
                token,
                SPEND_ALERT_NOTIFICATIONS_TABLE,
                SPEND_ALERT_NOTIFICATIONS_TABLE,
                SPEND_ALERT_CLAIM_LEASE_MINUTES
            ]
        );

        const row = claimed.rows[0];
        return Ok(row ? { id: row.id, token: row.claim_token } : null);
    } catch (err) {
        return Err(new Error('failed_to_claim_spend_alert_notification', { cause: err }));
    }
}

/** Makes the claim permanent. Until this lands the claim is only leased. */
export async function markSpendAlertNotified(db: Knex, claim: SpendAlertClaim): Promise<Result<void>> {
    try {
        const affected = await db.from(SPEND_ALERT_NOTIFICATIONS_TABLE).where({ id: claim.id, claim_token: claim.token }).update({ notified_at: new Date() });
        if (affected === 0) {
            // Claim already replaced — a known lease tradeoff, not a failure. Reported for visibility.
            report(new Error('spend_alert_claim_already_replaced'), { claimId: claim.id });
        }

        return Ok(undefined);
    } catch (err) {
        return Err(new Error('failed_to_mark_spend_alert_notified', { cause: err }));
    }
}

// Lets a retry take the claim immediately rather than waiting out the lease; never removes one already marked sent.
export async function releaseSpendAlertNotification(db: Knex, claim: SpendAlertClaim): Promise<Result<void>> {
    try {
        await db.from(SPEND_ALERT_NOTIFICATIONS_TABLE).where({ id: claim.id, claim_token: claim.token }).whereNull('notified_at').delete();

        return Ok(undefined);
    } catch (err) {
        return Err(new Error('failed_to_release_spend_alert_notification', { cause: err }));
    }
}
