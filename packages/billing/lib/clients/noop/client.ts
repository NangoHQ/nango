import { Ok } from '@nangohq/utils';

import type {
    BillingClient,
    BillingCustomer,
    BillingEvent,
    BillingInvoicingDetails,
    BillingPlan,
    BillingSubscription,
    BillingUsageMetrics,
    DBTeam,
    GetBillingUsageOpts
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

/**
 * Stub billing client for local dev / self-hosted setups with no Orb configured.
 * Selected in index.ts when `ORB_API_KEY` is unset. Every call returns a benign
 * success so flows that touch billing (e.g. the billing-usage dashboard, which
 * still reads its actual numbers from ClickHouse) don't fail on the missing Orb
 * dependency. Deployed environments always set `ORB_API_KEY` and use OrbClient.
 */
function stubCustomer(accountId: number, details?: Pick<BillingInvoicingDetails, 'legalEntityName' | 'email'>): BillingCustomer {
    return {
        id: `local-customer-${accountId}`,
        invoicingDetails: {
            legalEntityName: details?.legalEntityName ?? `Local account ${accountId}`,
            email: details?.email ?? `account-${accountId}@local.nango.dev`,
            address: null,
            taxId: null
        },
        portalUrl: null
    };
}

export class NoopBillingClient implements BillingClient {
    ingest(_events: BillingEvent[]): Promise<Result<void>> {
        return Promise.resolve(Ok(undefined));
    }

    linkStripeToCustomer(_teamId: number, _customerId: string): Promise<Result<void>> {
        return Promise.resolve(Ok(undefined));
    }

    getOrCreateCustomer(accountId: number, defaultTo: Pick<BillingInvoicingDetails, 'legalEntityName' | 'email'>): Promise<Result<BillingCustomer>> {
        return Promise.resolve(Ok(stubCustomer(accountId, defaultTo)));
    }

    getCustomer(accountId: number): Promise<Result<BillingCustomer>> {
        return Promise.resolve(Ok(stubCustomer(accountId)));
    }

    putCustomer(accountId: number, invoicingDetails: BillingInvoicingDetails): Promise<Result<BillingCustomer>> {
        return Promise.resolve(Ok(stubCustomer(accountId, invoicingDetails)));
    }

    getSubscription(accountId: number): Promise<Result<BillingSubscription | null>> {
        return Promise.resolve(Ok({ id: `local-sub-${accountId}`, planExternalId: 'free' }));
    }

    createSubscription(team: DBTeam, planExternalId: string): Promise<Result<BillingSubscription>> {
        return Promise.resolve(Ok({ id: `local-sub-${team.id}`, planExternalId }));
    }

    getUsage(_subscriptionId: string, _opts?: GetBillingUsageOpts): Promise<Result<BillingUsageMetrics>> {
        return Promise.resolve(Ok({}));
    }

    upgrade(_opts: { subscriptionId: string; planExternalId: string }): Promise<Result<{ pendingChangeId: string; amountInCents: number | null }>> {
        return Promise.resolve(Ok({ pendingChangeId: 'local-pending-change', amountInCents: null }));
    }

    downgrade(_opts: { subscriptionId: string; planExternalId: string }): Promise<Result<void>> {
        return Promise.resolve(Ok(undefined));
    }

    applyPendingChanges(_opts: { pendingChangeId: string; paymentExternalId: string; amountCollected: string }): Promise<Result<BillingSubscription>> {
        return Promise.resolve(Ok({ id: 'local-sub', planExternalId: 'free' }));
    }

    cancelPendingChanges(_opts: { pendingChangeId: string }): Promise<Result<void>> {
        return Promise.resolve(Ok(undefined));
    }

    verifyWebhookSignature(_body: string, _headers: Record<string, unknown>, _secret: string): Result<true> {
        return Ok(true);
    }

    getPlanById(planId: string): Promise<Result<BillingPlan>> {
        return Promise.resolve(Ok({ id: planId, external_plan_id: planId }));
    }
}
