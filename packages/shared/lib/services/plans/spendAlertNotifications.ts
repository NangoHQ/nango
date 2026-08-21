import { v4 as uuid } from 'uuid';

import { Err, Ok } from '@nangohq/utils';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export const SPEND_ALERT_NOTIFICATIONS_TABLE = 'spend_alert_notifications';

/**
 * How long a claim stays another caller's before it can be taken over.
 *
 * Matches Orb's own webhook timestamp tolerance. Shorter and a slow send risks being notified
 * twice; longer and a crashed one stays silent for that much of the billing period.
 */
export const SPEND_ALERT_CLAIM_LEASE_MINUTES = 5;

interface SpendAlertNotificationKey {
    accountId: number;
    thresholdInCents: number;
    /** Start of the billing period the crossing happened in, as Orb reported it. */
    timeframeStart: Date;
}

/**
 * Proof that this caller still owns the claim. Reissued on every takeover, so a worker that
 * outlived its lease can neither mark nor release the row that replaced it.
 */
export interface SpendAlertClaim {
    id: number;
    token: string;
}

/**
 * True only for the caller that holds the claim. Orb's webhook is at-least-once and retries on a
 * non-2xx, so this — not the webhook — is what makes "one notification per threshold per period" true.
 *
 * A claim is only permanent once {@link markSpendAlertNotified} records the send. Until then it is a
 * lease: a claim whose process died mid-send is taken over after
 * {@link SPEND_ALERT_CLAIM_LEASE_MINUTES}, so a crash suppresses the alert for minutes rather than
 * for the rest of the billing period.
 */
export async function claimSpendAlertNotification(db: Knex, key: SpendAlertNotificationKey): Promise<Result<SpendAlertClaim | null>> {
    try {
        const token = uuid();
        // One statement so concurrent deliveries can't both win: the conflict target is the unique
        // index, and the DO UPDATE only fires for a lapsed, not-yet-sent claim.
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
        await db.from(SPEND_ALERT_NOTIFICATIONS_TABLE).where({ id: claim.id, claim_token: claim.token }).update({ notified_at: new Date() });

        return Ok(undefined);
    } catch (err) {
        return Err(new Error('failed_to_mark_spend_alert_notified', { cause: err }));
    }
}

/**
 * Hands the claim back after a failed send so a retry can take it immediately rather than waiting
 * out the lease. Only ever removes a claim that hasn't been marked sent.
 */
export async function releaseSpendAlertNotification(db: Knex, claim: SpendAlertClaim): Promise<Result<void>> {
    try {
        await db.from(SPEND_ALERT_NOTIFICATIONS_TABLE).where({ id: claim.id, claim_token: claim.token }).whereNull('notified_at').delete();

        return Ok(undefined);
    } catch (err) {
        return Err(new Error('failed_to_release_spend_alert_notification', { cause: err }));
    }
}
