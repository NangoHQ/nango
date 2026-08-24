import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { claimSpendAlertNotification, getPlan, markSpendAlertNotified, releaseSpendAlertNotification, userService } from '@nangohq/shared';
import { Err, getLogger, Ok, report } from '@nangohq/utils';

import { sendSpendAlertEmail } from '../helpers/email.js';
import { isSpendPlan } from '../utils/spendPlans.js';

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
    // A plan can leave the allowlist while its Orb alert stays behind, with no way for the
    // dashboard to clear it, so a stale crossing here is silently dropped rather than emailed.
    const plan = await getPlan(db.knex, { accountId: team.id });
    if (plan.isErr()) {
        return Err(plan.error);
    }
    if (!isSpendPlan(plan.value)) {
        logger.info(`Spend alert crossing on a non-spend plan for team "${team.id}"`);
        return Ok(undefined);
    }

    // Orb's alert list for a subscription also carries plan-level alerts we neither own nor can
    // edit, so a crossing is only ours if it matches the threshold the account actually set. Also
    // the currency: a real cost_exceeded delivery carries none, and an amount printed without its
    // symbol misstates what the customer owes.
    const alert = await billing.getSpendAlert(crossing.subscriptionId);
    if (alert.isErr()) {
        return Err(alert.error);
    }
    if (alert.value?.thresholdInCents !== crossing.thresholdInCents) {
        logger.info(`Spend alert crossing does not match the configured threshold for team "${team.id}"`);
        return Ok(undefined);
    }
    const currency = alert.value.currency;

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

    const { recipients, complete } = await getSpendAlertRecipients(team);
    // Reachable: every admin can be unverified or deactivated while the invoicing email is blank.
    if (recipients.length === 0) {
        if (!complete) {
            // An empty list we couldn't confirm isn't the same as nobody to tell, so hand the claim
            // back and let Orb retry rather than marking the crossing done.
            const released = await releaseSpendAlertNotification(db.knex, claim);
            if (released.isErr()) {
                report(released.error);
            }
            return Err(new Error('failed_to_resolve_spend_alert_recipients', { cause: { accountId: team.id } }));
        }

        // Marked rather than released: there is nobody to tell, and that won't change within the
        // period, so a redelivery should not redo this lookup to reach the same conclusion.
        logger.warning(`No spend alert recipients for team "${team.id}"`);
        const marked = await markSpendAlertNotified(db.knex, claim);
        if (marked.isErr()) {
            report(marked.error);
        }
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

    const failures = sent.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
    if (failures.length === sent.length) {
        // Hand the claim back so Orb's retry can try again, and fail so that it does.
        const released = await releaseSpendAlertNotification(db.knex, claim);
        if (released.isErr()) {
            report(released.error);
        }
        return Err(new Error('failed_to_send_spend_alert_emails', { cause: { accountId: team.id } }));
    }

    if (failures.length > 0) {
        logger.warning(`Failed to send ${failures.length}/${sent.length} spend alert emails for team "${team.id}"`);
        for (const reason of failures) {
            report(new Error('failed_to_send_spend_alert_email', { cause: reason }), { accountId: team.id });
        }
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
 * The billing contacts named on the Orb customer, plus the account's admins — the people with
 * billing responsibility or account authority. `complete` is false when Orb couldn't be read, so an
 * empty result can be told apart from a confirmed absence of anyone to notify.
 */
async function getSpendAlertRecipients(team: DBTeam): Promise<{ recipients: string[]; complete: boolean }> {
    const emails = new Set<string>();

    const customer = await billing.getCustomer(team.id);
    if (customer.isOk()) {
        // Orb's own type declares this non-null, but an API boundary is exactly where a runtime
        // value can defy its declared type.
        if (customer.value.invoicingDetails.email) {
            emails.add(customer.value.invoicingDetails.email.toLowerCase());
        }
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
    return { recipients: [...emails].filter(Boolean), complete: customer.isOk() };
}

/**
 * Clears the account's spend threshold after a plan change — a threshold chosen against one plan's
 * pricing is meaningless against another's, in either direction.
 *
 * Never fails the caller: the plan change has already committed, and retrying to fix a leftover
 * alert would be a worse trade than leaving it.
 */
export async function clearSpendAlertOnPlanChange({ accountId, subscriptionId }: { accountId: number; subscriptionId: string }): Promise<void> {
    const removed = await billing.removeSpendAlert(subscriptionId);
    if (removed.isErr()) {
        report(removed.error, { accountId });
    }
}
