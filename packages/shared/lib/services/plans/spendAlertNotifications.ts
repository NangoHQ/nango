import { Err, Ok } from '@nangohq/utils';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

export const SPEND_ALERT_NOTIFICATIONS_TABLE = 'spend_alert_notifications';

interface SpendAlertNotificationKey {
    accountId: number;
    thresholdInCents: number;
    /** Start of the billing period the crossing happened in, as Orb reported it. */
    timeframeStart: Date;
}

function toRow(key: SpendAlertNotificationKey) {
    return {
        account_id: key.accountId,
        threshold_in_cents: key.thresholdInCents,
        timeframe_start: key.timeframeStart
    };
}

/**
 * True only for the caller that inserted the row. Orb's webhook is at-least-once and retries on a
 * non-2xx, so this — not the webhook — is what makes "one notification per threshold per period" true.
 */
export async function claimSpendAlertNotification(db: Knex, key: SpendAlertNotificationKey): Promise<Result<boolean>> {
    try {
        const inserted = await db
            .from(SPEND_ALERT_NOTIFICATIONS_TABLE)
            .insert(toRow(key))
            .onConflict(['account_id', 'threshold_in_cents', 'timeframe_start'])
            .ignore()
            .returning('id');

        return Ok(inserted.length > 0);
    } catch (err) {
        return Err(new Error('failed_to_claim_spend_alert_notification', { cause: err }));
    }
}

/** Called only when the send failed; a claim left behind would silently swallow the notification. */
export async function releaseSpendAlertNotification(db: Knex, key: SpendAlertNotificationKey): Promise<Result<void>> {
    try {
        await db.from(SPEND_ALERT_NOTIFICATIONS_TABLE).where(toRow(key)).delete();

        return Ok(undefined);
    } catch (err) {
        return Err(new Error('failed_to_release_spend_alert_notification', { cause: err }));
    }
}
