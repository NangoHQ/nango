import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { billing } from '@nangohq/billing';
import db, { multipleMigrations } from '@nangohq/database';
import { EmailClient } from '@nangohq/email';
import {
    claimSpendAlertNotification,
    seeders,
    SPEND_ALERT_CLAIM_LEASE_MINUTES,
    SPEND_ALERT_NOTIFICATIONS_TABLE,
    updatePlan,
    userService
} from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { clearSpendAlertOnPlanChange, notifySpendAlert } from './spendAlertNotification.service.js';

import type { DBTeam } from '@nangohq/types';

const crossing = {
    thresholdInCents: 5000,
    timeframeStart: new Date('2026-08-01T00:00:00.000Z'),
    timeframeEnd: new Date('2026-09-01T00:00:00.000Z'),
    subscriptionId: 'orb_sub_test'
};

function stubCustomer(email: string, additionalEmails: string[] = []) {
    return Ok({
        id: 'orb_cus_1',
        portalUrl: null,
        invoicingDetails: { legalEntityName: 'Acme', email, additionalEmails, address: null, taxId: null }
    });
}

/** Recipients of every `send` call so far, in the order they were emailed. */
function recipientsOf(send: any): string[] {
    return (send.mock.calls as string[][]).map((call) => call[0]!);
}

describe('notifySpendAlert', () => {
    let team: DBTeam;
    let send: any;

    beforeAll(async () => {
        await multipleMigrations();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    async function setup({ customer = stubCustomer('billing@acme.com') }: { customer?: ReturnType<typeof stubCustomer> | ReturnType<typeof Err> } = {}) {
        const seed = await seeders.seedAccountEnvAndUser();
        team = seed.account;
        vi.spyOn(billing, 'getCustomer').mockResolvedValue(customer as any);
        // The currency comes from the alert, not the event — a real delivery carries none.
        vi.spyOn(billing, 'getSpendAlert').mockResolvedValue(Ok({ id: 'alert_1', thresholdInCents: 5000, currency: 'USD' }) as any);
        // A silently failed update would test the seeded default plan instead and pass for the wrong reason.
        const updated = await updatePlan(db.knex, { id: seed.plan.id, name: 'growth-v2' });
        if (updated.isErr()) {
            throw updated.error;
        }
        send = vi.spyOn(EmailClient.prototype, 'send').mockResolvedValue(undefined);
        return seed;
    }

    it('stays quiet when the plan no longer gets spend alerts', async () => {
        // The alert outlives a move off a spend plan, and the dashboard hides the section, so
        // emailing would be the one thing the customer cannot stop.
        const seed = await setup();
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([]);
        const updated = await updatePlan(db.knex, { id: seed.plan.id, name: 'enterprise' });
        if (updated.isErr()) {
            throw updated.error;
        }

        const res = await notifySpendAlert({ team, crossing });

        expect(res.isOk()).toBe(true);
        expect(send).not.toHaveBeenCalled();
    });

    it('stays quiet for a crossing that is not the configured threshold', async () => {
        // Listing by subscription also returns plan-level alerts we neither own nor can clear.
        await setup();
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([]);

        const res = await notifySpendAlert({ team, crossing: { ...crossing, thresholdInCents: 999900 } });

        expect(res.isOk()).toBe(true);
        expect(send).not.toHaveBeenCalled();
    });

    it('emails the billing contacts and the account admins, once each', async () => {
        const seed = await setup({ customer: stubCustomer('billing@acme.com', ['ap@acme.com']) });
        // The seeded user is an admin, and is also listed as a billing contact — one email, not two.
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([
            { ...seed.user, email: 'BILLING@acme.com' } as any,
            { ...seed.user, email: 'admin@acme.com' } as any
        ]);

        const res = await notifySpendAlert({ team, crossing });

        expect(res.isOk()).toBe(true);
        expect(recipientsOf(send).sort()).toEqual(['admin@acme.com', 'ap@acme.com', 'billing@acme.com']);
    });

    it('states the threshold in the subject', async () => {
        await setup();
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([]);

        await notifySpendAlert({ team, crossing });

        expect(send.mock.calls[0][1]).toContain('$50.00');
    });

    it('sends nothing on a redelivery of the same crossing', async () => {
        await setup();
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([]);

        const first = await notifySpendAlert({ team, crossing });
        const second = await notifySpendAlert({ team, crossing });

        expect(first.isOk()).toBe(true);
        expect(second.isOk()).toBe(true);
        expect(send).toHaveBeenCalledTimes(1);
    });

    it('stays quiet after a lapsed lease, because the send was recorded', async () => {
        await setup();
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([]);

        await notifySpendAlert({ team, crossing });
        await db.knex
            .from(SPEND_ALERT_NOTIFICATIONS_TABLE)
            .where({ account_id: team.id })
            .update({ created_at: new Date(Date.now() - (SPEND_ALERT_CLAIM_LEASE_MINUTES + 1) * 60 * 1000) });

        await notifySpendAlert({ team, crossing });

        expect(send).toHaveBeenCalledTimes(1);
    });

    it('retries a delivery abandoned mid-send once the lease lapses', async () => {
        await setup();
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([]);

        await claimSpendAlertNotification(db.knex, {
            accountId: team.id,
            thresholdInCents: crossing.thresholdInCents,
            timeframeStart: crossing.timeframeStart
        });
        await db.knex
            .from(SPEND_ALERT_NOTIFICATIONS_TABLE)
            .where({ account_id: team.id })
            .update({ created_at: new Date(Date.now() - (SPEND_ALERT_CLAIM_LEASE_MINUTES + 1) * 60 * 1000) });

        await notifySpendAlert({ team, crossing });

        expect(send).toHaveBeenCalledTimes(1);
    });

    it('sends again for the next billing period', async () => {
        await setup();
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([]);

        await notifySpendAlert({ team, crossing });
        await notifySpendAlert({ team, crossing: { ...crossing, timeframeStart: new Date('2026-09-01T00:00:00.000Z') } });

        expect(send).toHaveBeenCalledTimes(2);
    });

    it('still emails the admins when Orb cannot be read', async () => {
        await setup({ customer: Err(new Error('failed_to_get_customer')) });
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([{ email: 'admin@acme.com' } as any]);

        const res = await notifySpendAlert({ team, crossing });

        expect(res.isOk()).toBe(true);
        expect(recipientsOf(send)).toEqual(['admin@acme.com']);
    });

    it('releases the claim when every send fails, so a retry can send', async () => {
        await setup();
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([]);
        send.mockRejectedValue(new Error('smtp down'));

        const failed = await notifySpendAlert({ team, crossing });
        expect(failed.isErr()).toBe(true);

        send.mockResolvedValue(undefined);
        const retried = await notifySpendAlert({ team, crossing });

        expect(retried.isOk()).toBe(true);
        expect(recipientsOf(send)).toEqual(['billing@acme.com', 'billing@acme.com']);
    });

    it('keeps the claim when only some sends fail', async () => {
        await setup({ customer: stubCustomer('billing@acme.com', ['ap@acme.com']) });
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([]);
        send.mockRejectedValueOnce(new Error('smtp down')).mockResolvedValue(undefined);

        const res = await notifySpendAlert({ team, crossing });
        expect(res.isOk()).toBe(true);

        // A partial failure is not worth re-emailing everyone who did receive it.
        send.mockClear();
        await notifySpendAlert({ team, crossing });
        expect(send).not.toHaveBeenCalled();
    });

    it('succeeds without sending when nobody is confirmed to notify', async () => {
        await setup({ customer: stubCustomer('') });
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([]);

        const res = await notifySpendAlert({ team, crossing });

        expect(res.isOk()).toBe(true);
        expect(send).not.toHaveBeenCalled();
    });

    it('retries rather than marking done when the recipient lookup failed', async () => {
        await setup({ customer: Err(new Error('failed_to_get_customer')) });
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([]);

        const res = await notifySpendAlert({ team, crossing });

        expect(res.isErr()).toBe(true);
        expect(send).not.toHaveBeenCalled();
        // The claim was handed back, so Orb's retry can try again.
        const rows = await db.knex.from(SPEND_ALERT_NOTIFICATIONS_TABLE).where({ account_id: team.id });
        expect(rows).toHaveLength(0);
    });
});

describe('clearSpendAlertOnPlanChange', () => {
    beforeAll(async () => {
        await multipleMigrations();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('removes the threshold, since it was chosen against the old plan', async () => {
        const remove = vi.spyOn(billing, 'removeSpendAlert').mockResolvedValue(Ok(undefined));

        await clearSpendAlertOnPlanChange({ accountId: 1, subscriptionId: 'orb_sub_1' });

        expect(remove).toHaveBeenCalledWith('orb_sub_1');
    });

    it('does not throw when Orb refuses, so a committed plan change is not retried', async () => {
        vi.spyOn(billing, 'removeSpendAlert').mockResolvedValue(Err(new Error('failed_to_remove_spend_alert')));

        await expect(clearSpendAlertOnPlanChange({ accountId: 1, subscriptionId: 'orb_sub_1' })).resolves.toBeUndefined();
    });
});
