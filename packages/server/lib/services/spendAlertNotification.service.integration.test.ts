import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { billing } from '@nangohq/billing';
import { multipleMigrations } from '@nangohq/database';
import { EmailClient } from '@nangohq/email';
import { seeders, userService } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { notifySpendAlert } from './spendAlertNotification.service.js';

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
        send = vi.spyOn(EmailClient.prototype, 'send').mockResolvedValue(undefined);
        return seed;
    }

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

    it('succeeds without sending when there is nobody to notify', async () => {
        await setup({ customer: Err(new Error('failed_to_get_customer')) });
        vi.spyOn(userService, 'getVerifiedActiveAdministratorsByAccountId').mockResolvedValue([]);

        const res = await notifySpendAlert({ team, crossing });

        expect(res.isOk()).toBe(true);
        expect(send).not.toHaveBeenCalled();
    });
});
