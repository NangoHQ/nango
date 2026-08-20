import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { claimSpendAlertNotification, markSpendAlertNotified, releaseSpendAlertNotification, userService } from '@nangohq/shared';
import { Err, getLogger, Ok, report } from '@nangohq/utils';

import { sendSpendAlertEmail } from '../helpers/email.js';

import type { DBTeam, Result } from '@nangohq/types';

const logger = getLogger('Server.SpendAlert');

export interface SpendAlertCrossing {
    /** The threshold that was crossed, in integer cents. */
    thresholdInCents: number;
    /** Start of the billing period the crossing happened in — half of the de-dup key. */
    timeframeStart: Date;
    /** End of that period, quoted in the email so the reader knows how long spend keeps accruing. */
    timeframeEnd: Date;
    /** Orb's subscription, used to read back the currency the threshold is denominated in. */
    subscriptionId: string;
}

/**
 * Emails the account's billing contacts that spend has crossed the threshold they set.
 *
 * Not run in a transaction: the claim has to be visible to a concurrent redelivery before the
 * emails go out, which is exactly what an open transaction would prevent.
 */
export async function notifySpendAlert({ team, crossing }: { team: DBTeam; crossing: SpendAlertCrossing }): Promise<Result<void>> {
    const key = { accountId: team.id, thresholdInCents: crossing.thresholdInCents, timeframeStart: crossing.timeframeStart };

    const claimed = await claimSpendAlertNotification(db.knex, key);
    if (claimed.isErr()) {
        return Err(claimed.error);
    }
    const claim = claimed.value;
    if (!claim) {
        logger.info(`Spend alert already notified for team "${team.id}"`);
        return Ok(undefined);
    }

    // Read the currency off the alert rather than the event: a real cost_exceeded delivery carries
    // no currency, and an amount printed without its symbol misstates what the customer owes.
    const alert = await billing.getSpendAlert(crossing.subscriptionId);
    if (alert.isErr()) {
        report(alert.error, { accountId: team.id });
    }
    const currency = alert.isOk() ? (alert.value?.currency ?? null) : null;

    const recipients = await getSpendAlertRecipients(team);
    if (recipients.length === 0) {
        // Nothing to send, but the crossing is still handled — releasing the claim would only make
        // every redelivery repeat this lookup to reach the same conclusion.
        logger.warning(`No spend alert recipients for team "${team.id}"`);
        return Ok(undefined);
    }

    const sent = await Promise.allSettled(
        recipients.map((email) =>
            sendSpendAlertEmail({
                email,
                accountName: team.name,
                thresholdInCents: crossing.thresholdInCents,
                currency,
                periodEnd: crossing.timeframeEnd
            })
        )
    );

    const failed = sent.filter((result) => result.status === 'rejected').length;
    if (failed === sent.length) {
        // Hand the claim back so Orb's retry can try again, and fail so that it does.
        const released = await releaseSpendAlertNotification(db.knex, claim);
        if (released.isErr()) {
            report(released.error);
        }
        return Err(new Error('failed_to_send_spend_alert_emails', { cause: { accountId: team.id } }));
    }

    if (failed > 0) {
        logger.warning(`Failed to send ${failed}/${sent.length} spend alert emails for team "${team.id}"`);
    }

    // Until this lands the claim is only leased, so a crash before here is retried rather than
    // swallowing the notification for the rest of the period.
    const marked = await markSpendAlertNotified(db.knex, claim);
    if (marked.isErr()) {
        report(marked.error);
    }

    return Ok(undefined);
}

/**
 * The billing contacts named on the Orb customer, plus the account's admins — matching what the
 * dashboard promises under the threshold. Orb is the source of truth for the invoicing addresses,
 * so a failure there costs us those recipients but not the admins.
 */
async function getSpendAlertRecipients(team: DBTeam): Promise<string[]> {
    const emails = new Set<string>();

    const customer = await billing.getCustomer(team.id);
    if (customer.isOk()) {
        emails.add(customer.value.invoicingDetails.email.toLowerCase());
        for (const additional of customer.value.invoicingDetails.additionalEmails) {
            emails.add(additional.toLowerCase());
        }
    } else {
        report(customer.error, { accountId: team.id });
    }

    for (const admin of await userService.getVerifiedActiveAdministratorsByAccountId(team.id)) {
        emails.add(admin.email.toLowerCase());
    }

    // A blank invoicing email is possible on an Orb customer; it would only bounce.
    return [...emails].filter(Boolean);
}
