import type {
    BillingClient,
    BillingCustomer,
    BillingInvoicingDetails,
    BillingOverdueInvoices,
    BillingPeriodCosts,
    BillingPlan,
    BillingSpendAlert,
    BillingSubscription,
    BillingUpcomingInvoice,
    BillingUsageMetrics,
    DBTeam,
    GetBillingUsageOpts,
    PlanChangeRequest
} from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export class Billing {
    client: BillingClient;

    constructor(client: BillingClient) {
        this.client = client;
    }

    async getCustomer(accountId: number): Promise<Result<BillingCustomer>> {
        return await this.client.getCustomer(accountId);
    }

    async getOrCreateCustomer(accountId: number, defaultTo: Pick<BillingInvoicingDetails, 'legalEntityName' | 'email'>): Promise<Result<BillingCustomer>> {
        return await this.client.getOrCreateCustomer(accountId, defaultTo);
    }

    async putCustomer(accountId: number, invoicingDetails: BillingInvoicingDetails): Promise<Result<BillingCustomer>> {
        return await this.client.putCustomer(accountId, invoicingDetails);
    }

    async linkStripeToCustomer(teamId: number, customerId: string): Promise<Result<void>> {
        return await this.client.linkStripeToCustomer(teamId, customerId);
    }

    async createSubscription(team: DBTeam, planExternalId: string): Promise<Result<BillingSubscription>> {
        return await this.client.createSubscription(team, planExternalId);
    }

    async getSubscription(accountId: number): Promise<Result<BillingSubscription>> {
        return await this.client.getSubscription(accountId);
    }

    async getOverdueInvoices(accountId: number): Promise<Result<BillingOverdueInvoices>> {
        return await this.client.getOverdueInvoices(accountId);
    }

    async getUpcomingInvoice(subscriptionId: string): Promise<Result<BillingUpcomingInvoice | null>> {
        return await this.client.getUpcomingInvoice(subscriptionId);
    }

    async getPeriodCosts(subscriptionId: string, timeframe?: { start: Date; end: Date }): Promise<Result<BillingPeriodCosts | null>> {
        return await this.client.getPeriodCosts(subscriptionId, timeframe);
    }

    async getSpendAlert(subscriptionId: string): Promise<Result<BillingSpendAlert | null>> {
        return await this.client.getSpendAlert(subscriptionId);
    }

    async setSpendAlert(subscriptionId: string, opts: { thresholdInCents: number }): Promise<Result<BillingSpendAlert>> {
        return await this.client.setSpendAlert(subscriptionId, opts);
    }

    async removeSpendAlert(subscriptionId: string): Promise<Result<void>> {
        return await this.client.removeSpendAlert(subscriptionId);
    }

    async getUsage(subscriptionId: string, opts?: GetBillingUsageOpts): Promise<Result<BillingUsageMetrics>> {
        return await this.client.getUsage(subscriptionId, opts);
    }

    async upgrade(opts: PlanChangeRequest): Promise<Result<{ pendingChangeId: string; amountInCents: number | null }>> {
        return await this.client.upgrade(opts);
    }

    async downgrade(opts: PlanChangeRequest): Promise<Result<void>> {
        return await this.client.downgrade(opts);
    }

    async startGrowthAddon(opts: { subscriptionId: string }): Promise<Result<{ priceIntervalId: string | null }>> {
        return await this.client.startGrowthAddon(opts);
    }

    async endGrowthAddon(opts: { subscriptionId: string; priceIntervalId: string }): Promise<Result<{ growthFeaturesEndsAt: Date | null }>> {
        return await this.client.endGrowthAddon(opts);
    }

    async getPlanById(planId: string): Promise<Result<BillingPlan>> {
        return await this.client.getPlanById(planId);
    }

    verifyWebhookSignature(body: string, headers: Record<string, unknown>, secret: string): Result<true> {
        return this.client.verifyWebhookSignature(body, headers, secret);
    }
}
